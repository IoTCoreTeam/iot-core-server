const express = require('express')
const http = require('http')
const net = require('net')
const { Server } = require('socket.io')
const aedes = require('aedes')()

const { routeMetricData } = require('./routes/routeMetricData')
const { createWhitelistRouter } = require('./routes/routeWhiteList')
const { createControlRoute } = require('./routes/routeControl')
const { createControlController } = require('./controllers/controlController')
const { connect, close, getDb } = require('./config/db')
const env = require('./config/env')
const deviceWhiteList = require('./services/deviceWhiteList')
const SSEGatewayService = require('./services/sseGatewayService')
const ControlCommandService = require('./services/controlCommandService')
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

const controlCommandService = new ControlCommandService({
  aedes,
  deviceWhitelist: deviceWhiteList,
  config: env,
})
const controlController = createControlController({ controlCommandService })
const routeControl = createControlRoute(controlController)

const publishAedesPacket = (packet) =>
  new Promise((resolve, reject) => {
    aedes.publish(packet, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

const publishGatewayWhitelists = async (snapshot) => {
  const gatewayNodes =
    snapshot && snapshot.gateway_nodes && typeof snapshot.gateway_nodes === 'object'
      ? snapshot.gateway_nodes
      : {}
  const gatewayIds = new Set()

  const gateways = Array.isArray(snapshot?.gateways) ? snapshot.gateways : []
  for (const gateway of gateways) {
    const gatewayId =
      typeof gateway === 'string'
        ? gateway
        : gateway && gateway.id
          ? String(gateway.id)
          : null
    if (gatewayId) {
      gatewayIds.add(gatewayId)
    }
  }
  for (const gatewayId of Object.keys(gatewayNodes)) {
    gatewayIds.add(String(gatewayId))
  }

  let publishedCount = 0
  for (const gatewayId of gatewayIds) {
    const nodes = Array.isArray(gatewayNodes[gatewayId])
      ? gatewayNodes[gatewayId].map((nodeId) => String(nodeId))
      : []
    const payload = JSON.stringify({
      type: 'gateway_whitelist',
      gateway_id: gatewayId,
      nodes,
      updated_at: new Date().toISOString(),
    })

    await publishAedesPacket({
      topic: `esp32/whitelist/${gatewayId}`,
      payload: Buffer.from(payload),
      qos: 1,
      retain: true,
    })
    publishedCount += 1
  }

  console.log(`[whitelist-sync] published gateway whitelists: ${publishedCount}`)
  mqttHandlers.emitBufferedGatewayUpdates()
}

const whiteListRouter = createWhitelistRouter({
  deviceWhiteListService: deviceWhiteList,
  onWhitelistUpdated: publishGatewayWhitelists,
})

/* ---------- API Routes ---------- */
app.use('/v1/sensors', routeMetricData)
app.use('/v1/whitelist', whiteListRouter)
app.use('/v1/control', routeControl)

aedes.on('client', (client) => mqttHandlers.onClientConnected(client))
aedes.on('clientDisconnect', (client) => mqttHandlers.onClientDisconnected(client))
aedes.on('subscribe', (subs, client) => mqttHandlers.onSubscribe(subs, client))
aedes.on('publish', (packet, client) => mqttHandlers.onPublish(packet, client))
aedes.on('clientError', (client, err) => mqttHandlers.onClientError(client, err))
aedes.on('connectionError', (client, err) => mqttHandlers.onConnectionError(client, err))

/* ---------- MQTT TCP ---------- */
const mqttServer = net.createServer(aedes.handle)
const MQTT_PORT = 1883
const WHITELIST_SYNC_INTERVAL_MS = Number(env.WHITELIST_SYNC_INTERVAL_MS || 30000)
let whitelistSyncTimer = null

const startWhitelistSyncLoop = () => {
  if (whitelistSyncTimer) {
    return
  }
  whitelistSyncTimer = setInterval(() => {
    publishGatewayWhitelists(deviceWhiteList.getWhitelistSnapshot()).catch((error) => {
      console.error('[whitelist-sync] periodic publish failed:', error.message)
    })
  }, WHITELIST_SYNC_INTERVAL_MS)
}

/* =========================
   Start Server
========================= */
const port = Number(env.APP_PORT || 8017)
const host = env.APP_HOST || '0.0.0.0'

const startServer = async () => {
  try {
    await connect()
    await publishGatewayWhitelists(deviceWhiteList.getWhitelistSnapshot())
    startWhitelistSyncLoop()

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
