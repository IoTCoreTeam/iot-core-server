const net = require('net')
const aedes = require('aedes')()

const MQTTHandlers = require('../mqtt/mqttHandle')
const ControlQueueService = require('../services/controlQueueService')
const ControlResponseWaiterService = require('../services/controlResponseWaiterService')

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

const createMqttStack = ({ env, deviceWhitelistService, getDb, sseGatewayService }) => {
  const rateLimiters = new Map()

  const getRateLimiter = (clientId) => {
    if (!rateLimiters.has(clientId)) {
      rateLimiters.set(clientId, new RateLimiter(100, 60000))
    }
    return rateLimiters.get(clientId)
  }

  const controlResponseWaiter = new ControlResponseWaiterService({
    defaultTimeoutMs: Number(env.CONTROL_RESPONSE_TIMEOUT_MS || 15000)
  })

  const mqttHandlers = new MQTTHandlers({
    deviceWhitelist: deviceWhitelistService,
    rateLimiters,
    getRateLimiter,
    db: getDb,
    aedes,
    config: env,
    sseService: sseGatewayService,
    controlResponseWaiter
  })

  aedes.on('client', (client) => mqttHandlers.onClientConnected(client))
  aedes.on('clientDisconnect', (client) => mqttHandlers.onClientDisconnected(client))
  aedes.on('subscribe', (subs, client) => mqttHandlers.onSubscribe(subs, client))
  aedes.on('publish', (packet, client) => mqttHandlers.onPublish(packet, client))
  aedes.on('clientError', (client, err) => mqttHandlers.onClientError(client, err))
  aedes.on('connectionError', (client, err) => mqttHandlers.onConnectionError(client, err))

  const controlQueueService = new ControlQueueService({
    aedes,
    deviceWhitelist: deviceWhitelistService,
    config: env,
    controlResponseWaiter
  })

  const mqttServer = net.createServer(aedes.handle)
  const MQTT_PORT = 1883
  const WHITELIST_SYNC_INTERVAL_MS = Number(env.WHITELIST_SYNC_INTERVAL_MS || 30000)
  const HEARTBEAT_CHECK_INTERVAL_MS = Number(env.HEARTBEAT_CHECK_INTERVAL_MS || 5000)
  let whitelistSyncTimer = null
  let heartbeatCheckTimer = null

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

  const registerWhitelistRefreshListener = () => {
    deviceWhitelistService.setWhitelistRefreshListener((snapshot, meta = {}) => {
      const source = meta && meta.source ? meta.source : 'poll'
      console.log(`[whitelist-sync] immediate publish after ${source}`)
      return publishGatewayWhitelists(snapshot)
    })
  }

  const startWhitelistSyncLoop = () => {
    if (whitelistSyncTimer) {
      return
    }
    whitelistSyncTimer = setInterval(() => {
      publishGatewayWhitelists(deviceWhitelistService.getWhitelistSnapshot()).catch((error) => {
        console.error('[whitelist-sync] periodic publish failed:', error.message)
      })
    }, WHITELIST_SYNC_INTERVAL_MS)
  }

  const startHeartbeatCheckLoop = () => {
    if (heartbeatCheckTimer) {
      return
    }
    heartbeatCheckTimer = setInterval(() => {
      try {
        mqttHandlers.markHeartbeatTimeouts(new Date())
      } catch (error) {
        console.error('[heartbeat-check] failed:', error.message)
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS)
  }

  return {
    aedes,
    mqttHandlers,
    mqttServer,
    controlQueueService,
    publishGatewayWhitelists,
    registerWhitelistRefreshListener,
    startWhitelistSyncLoop,
    startHeartbeatCheckLoop,
    MQTT_PORT
  }
}

module.exports = {
  createMqttStack
}
