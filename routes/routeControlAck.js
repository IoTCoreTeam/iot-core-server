const express = require('express')

function createControlAckRoute(controller) {
  const router = express.Router()

  router.get('/overview', controller.getOverview)
  router.get('/query', controller.queryRows)
  router.get('/controller-executions', controller.getControllerExecutions)

  return router
}

module.exports = {
  createControlAckRoute
}
