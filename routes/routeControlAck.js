const express = require('express')

function createControlAckRoute(controller) {
  const router = express.Router()

  router.get('/overview', controller.getOverview)
  router.get('/query', controller.queryRows)

  return router
}

module.exports = {
  createControlAckRoute
}
