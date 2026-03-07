const express = require('express')

function createMetricDataRoute(controller) {
  const router = express.Router()

  router.get('/query', controller.fetchMetricData)
  router.get('/metric-limit/:metric', controller.fetchMetricLimit)

  return router
}

module.exports = {
  createMetricDataRoute
}
