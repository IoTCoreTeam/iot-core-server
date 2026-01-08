const express = require('express')
const { fetchMetricData } = require('../controllers/sensorController')

const routeMetricData = express.Router()

routeMetricData.get('/query', fetchMetricData)

module.exports = {
  routeMetricData
}
