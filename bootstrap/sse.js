const SSEGatewayService = require('../services/gatewaySseService')
const ControlQueueSseService = require('../services/controlQueueSseService')

const createSseService = (app) => {
  const sseGatewayService = new SSEGatewayService()
  const controlQueueSseService = new ControlQueueSseService()
  sseGatewayService.registerRoute(app)
  controlQueueSseService.registerRoute(app)
  return {
    sseGatewayService,
    controlQueueSseService
  }
}

module.exports = {
  createSseService
}
