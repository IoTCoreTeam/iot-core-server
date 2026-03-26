const { createHttpServer } = require('./bootstrap/http')
const { createSseService } = require('./bootstrap/sse')
const { attachSocket } = require('./bootstrap/socket')
const { registerRoutes } = require('./bootstrap/routes')
const { createMqttStack } = require('./bootstrap/mqtt')

const { createControlController } = require('./controllers/controlController')
const { createDeviceStatusController } = require('./controllers/deviceStatusController')
const { createMetricController } = require('./controllers/metricController')
const { createSensorController } = require('./controllers/sensorController')
const { createWhitelistController } = require('./controllers/whitelistController')
const { createControlAckController } = require('./controllers/controlAckController')
const { connect, close, getDb } = require('./config/db')
const env = require('./config/env')
const deviceWhitelistService = require('./services/deviceWhitelistService')
const { createControlService } = require('./services/controlAppService')
const { createDeviceStatusService } = require('./services/deviceStatusAppService')
const metricService = require('./services/metricCatalogService')
const metricDataService = require('./services/metricQueryService')
const { createWhitelistService } = require('./services/whitelistSyncService')
const controlAckAnalyticsService = require('./services/controlAckAnalyticsService')
const controlAckQueryService = require('./services/controlAckQueryService')

const { app, server } = createHttpServer()
const { sseGatewayService, controlQueueSseService } = createSseService(app)
attachSocket(server)

const {
  mqttHandlers,
  mqttServer,
  controlQueueService,
  publishGatewayWhitelists,
  registerWhitelistRefreshListener,
  startWhitelistSyncLoop,
  startHeartbeatCheckLoop,
  MQTT_PORT
} = createMqttStack({
  env,
  deviceWhitelistService,
  getDb,
  sseGatewayService,
  controlQueueSseService
})

const controlService = createControlService({ controlCommandService: controlQueueService })
const deviceStatusService = createDeviceStatusService({
  mqttHandlers,
  controlCommandService: controlQueueService
})
const whitelistService = createWhitelistService({
  deviceWhiteListService: deviceWhitelistService,
  onWhitelistUpdated: publishGatewayWhitelists
})

const controlController = createControlController({ controlService })
const deviceStatusController = createDeviceStatusController({ deviceStatusService })
const metricController = createMetricController({ metricService })
const sensorController = createSensorController({ metricDataService })
const whitelistController = createWhitelistController({ whitelistService })
const controlAckController = createControlAckController({
  controlAckAnalyticsService,
  controlAckQueryService
})

registerRoutes(app, {
  controlController,
  deviceStatusController,
  metricController,
  sensorController,
  whitelistController,
  controlAckController
})

registerWhitelistRefreshListener()

const port = Number(env.APP_PORT || 8017)
const host = env.APP_HOST || '0.0.0.0'

const startServer = async () => {
  try {
    await connect()
    await publishGatewayWhitelists(deviceWhitelistService.getWhitelistSnapshot())
    startWhitelistSyncLoop()
    startHeartbeatCheckLoop()

    server.listen(port, host, () => {
      console.log(`HTTP/WebSocket server listening on http://${host}:${port}`)
    })

    mqttServer.listen(MQTT_PORT, () => {
      console.log(`MQTT broker listening on port ${MQTT_PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    await close()
    process.exit(1)
  }
}

startServer()
