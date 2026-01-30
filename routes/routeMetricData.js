const express = require('express')
const { fetchMetricData, fetchMetricLimit } = require('../controllers/sensorController')

const routeMetricData = express.Router()

routeMetricData.get('/query', fetchMetricData)
routeMetricData.get('/metric-limit/:metric', fetchMetricLimit)

module.exports = {
  routeMetricData
}
