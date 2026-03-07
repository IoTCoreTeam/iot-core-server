const express = require('express')

function createDeviceStatusRoute(controller) {
  const router = express.Router()

  router.get('/', controller.getStatus)
  router.post('/ensure-off', controller.ensureAllDigitalOff)

  return router
}

module.exports = {
  createDeviceStatusRoute
}
