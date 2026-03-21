const express = require('express')

function createControlRoute(controller, { authenticate, authorizeWrite } = {}) {
  const router = express.Router()

  const requireAuth = authenticate || ((_req, _res, next) => next())
  const allowWrite = authorizeWrite || ((_req, _res, next) => next())

  router.get('/health', controller.health)
  router.post('/enqueue', requireAuth, allowWrite, controller.enqueueCommand)
  router.post('/pump', requireAuth, allowWrite, controller.commandPump)
  router.post('/light', requireAuth, allowWrite, controller.commandLight)

  return router
}

module.exports = {
  createControlRoute
}
