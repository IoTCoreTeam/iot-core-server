const express = require('express')
const http = require('http')
const net = require('net')
const { Server } = require('socket.io')
const aedes = require('aedes')()

const { routeMetricData } = require('./routes/routeMetricData')
const { router: whiteListRouter } = require('./routes/routeWhiteList')
const { connect, close, getDb } = require('./config/db')
const env = require('./config/env')
const deviceWhiteList = require('./services/deviceWhiteList')
const SSEGatewayService = require('./services/sseGatewayService')
const MQTTHandlers = require('./mqtt/mqttHandle')

/* =========================
   Rate Limiter
========================= */
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = []
  }

  consume(count = 1) {
    const now = Date.now()
    this.requests = this.requests.filter(ts => now - ts < this.windowMs)

    if (this.requests.length + count <= this.maxRequests) {
      for (let i = 0; i < count; i++) this.requests.push(now)
      return true
    }
    return false
  }
}

/* =========================
   Express + HTTP
========================= */
const app = express()
const server = http.createServer(app)

/* ---------- Body ---------- */
app.use(express.json())

/* ---------- CORS (SAFE WAY – Node 22 compatible) ---------- */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')

  // ⬅️ Handle OPTIONS globally (KHÔNG dùng app.options)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})

/* ---------- Health ---------- */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/* ---------- API Routes ---------- */
app.use('/v1/sensors', routeMetricData)
app.use('/v1/whitelist', whiteListRouter)

/* ---------- SSE ---------- */
const sseGatewayService = new SSEGatewayService()
sseGatewayService.registerRoute(app)


/* =========================
   Socket.IO
========================= */
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id)

  socket.on('REQUEST_DEVICE_STATUS', () => {
    try {
      socket.emit('DEVICE_STATUS_UPDATE', {
        gateways: [],
        nodes: [],
        devices: {
          activeRegistered: []
        }
      })
    } catch (err) {
      console.error('REQUEST_DEVICE_STATUS error:', err)
    }
  })

  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id)
  })
})

/* =========================
   MQTT Broker
========================= */
const rateLimiters = new Map()

const getRateLimiter = (clientId) => {
  if (!rateLimiters.has(clientId)) {
    rateLimiters.set(clientId, new RateLimiter(100, 60000))
  }
  return rateLimiters.get(clientId)
}

const mqttHandlers = new MQTTHandlers({
  deviceWhitelist: deviceWhiteList,
  rateLimiters,
  getRateLimiter,
  db: getDb,
  aedes,
  config: env,
  sseService: sseGatewayService
})

aedes.on('client', (client) => mqttHandlers.onClientConnected(client))
aedes.on('clientDisconnect', (client) => mqttHandlers.onClientDisconnected(client))
aedes.on('subscribe', (subs, client) => mqttHandlers.onSubscribe(subs, client))
aedes.on('publish', (packet, client) => mqttHandlers.onPublish(packet, client))
aedes.on('clientError', (client, err) => mqttHandlers.onClientError(client, err))
aedes.on('connectionError', (client, err) => mqttHandlers.onConnectionError(client, err))

/* ---------- MQTT TCP ---------- */
const mqttServer = net.createServer(aedes.handle)
const MQTT_PORT = 1883

/* =========================
   Start Server
========================= */
const port = Number(env.APP_PORT || 8017)
const host = env.APP_HOST || '0.0.0.0'

const startServer = async () => {
  try {
    await connect()

    server.listen(port, host, () => {
      console.log(`✓ HTTP/WebSocket server listening on http://${host}:${port}`)
    })

    mqttServer.listen(MQTT_PORT, () => {
      console.log(`✓ MQTT broker listening on port ${MQTT_PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    await close()
    process.exit(1)
  }
}

startServer()
