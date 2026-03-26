const express = require('express')

function createWorkflowEventRoute(controller, { authenticate, authorizeWrite } = {}) {
  const router = express.Router()

  const requireAuth = authenticate || ((_req, _res, next) => next())
  const allowWrite = authorizeWrite || ((_req, _res, next) => next())

  router.post('/status', requireAuth, allowWrite, controller.pushStatus)

  return router
}

module.exports = {
  createWorkflowEventRoute,
}
