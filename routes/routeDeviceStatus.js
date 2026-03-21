const express = require('express')

function createDeviceStatusRoute(controller, { authorizeRead, authorizeWrite } = {}) {
  const router = express.Router()

  const allowRead = authorizeRead || ((_req, _res, next) => next())
  const allowWrite = authorizeWrite || ((_req, _res, next) => next())

  router.get('/', allowRead, controller.getStatus)
  router.post('/ensure-off', allowWrite, controller.ensureAllDigitalOff)

  return router
}

module.exports = {
  createDeviceStatusRoute
}
