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
const MQTTHandlers = require('./mqtt/mqttHandle')

// Rate limiter class
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = []
  }

  consume(count = 1) {
    const now = Date.now()
    this.requests = this.requests.filter((timestamp) => now - timestamp < this.windowMs)

    if (this.requests.length + count <= this.maxRequests) {
      for (let i = 0; i < count; i++) {
        this.requests.push(now)
      }
      return true
    }
    return false
  }
}

// Express + Socket.IO setup
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  next()
})

app.get('/health', (_req, res) => { res.json({ status: 'ok' }) })

app.use('/v1/sensors', routeMetricData)
app.use('/v1/whitelist', whiteListRouter)

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id)

  socket.on('REQUEST_DEVICE_STATUS', () => {
    try {
      const snapshot = deviceWhiteList.getWhitelistSnapshot()
      socket.emit('DEVICE_STATUS_UPDATE', {
        gateways: [],
        nodes: [],
        devices: {
          activeRegistered: []
        }
      })
    } catch (error) {
      console.error('Error handling REQUEST_DEVICE_STATUS:', error)
    }
  })

  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id)
  })
})

// MQTT Broker Setup
const rateLimiters = new Map()
const getRateLimiter = (clientId) => {
  if (!rateLimiters.has(clientId)) {
    rateLimiters.set(clientId, new RateLimiter(100, 60000)) // 100 requests per minute
  }
  return rateLimiters.get(clientId)
}

const mqttHandlers = new MQTTHandlers({
  deviceWhitelist: deviceWhiteList,
  rateLimiters,
  getRateLimiter,
  db: getDb,
  aedes,
  config: env
})

aedes.on('client', (client) => mqttHandlers.onClientConnected(client))
aedes.on('clientDisconnect', (client) => mqttHandlers.onClientDisconnected(client))
aedes.on('subscribe', (subscriptions, client) => mqttHandlers.onSubscribe(subscriptions, client))
aedes.on('publish', async (packet, client) => await mqttHandlers.onPublish(packet, client))
aedes.on('clientError', (client, error) => mqttHandlers.onClientError(client, error))
aedes.on('connectionError', (client, error) => mqttHandlers.onConnectionError(client, error))

// MQTT TCP Server
const mqttServer = net.createServer(aedes.handle)
const MQTT_PORT = 1883

const port = Number(env.APP_PORT || 8017)
const host = env.APP_HOST || '0.0.0.0'

const startServer = async () => {
  try {
    await connect()

    // Start HTTP server
    server.listen(port, host, () => {
      console.log(`✓ HTTP/WebSocket server listening on http://${host}:${port}`)
    })

    // Start MQTT broker
    mqttServer.listen(MQTT_PORT, () => {
      console.log(`✓ MQTT broker listening on port ${MQTT_PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    await close()
    process.exit(1)
  }
}

startServer()
