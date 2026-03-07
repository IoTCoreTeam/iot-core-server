const SSEGatewayService = require('../services/gatewaySseService')

const createSseService = (app) => {
  const sseGatewayService = new SSEGatewayService()
  sseGatewayService.registerRoute(app)
  return sseGatewayService
}

module.exports = {
  createSseService
}
