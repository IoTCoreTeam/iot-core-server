const express = require('express')

function createControlAckRoute(controller) {
  const router = express.Router()

  router.get('/overview', controller.getOverview)

  return router
}

module.exports = {
  createControlAckRoute
}
