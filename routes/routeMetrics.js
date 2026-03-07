const express = require('express')

function createMetricsRoute(controller) {
  const router = express.Router()

  router.get('/', controller.listMetrics)
  router.get('/nodes', controller.fetchMetricNodes)

  return router
}

module.exports = {
  createMetricsRoute
}
