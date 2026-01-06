const express = require('express')
const { getMetricData } = require('../services/sensorService')

const routeMetricData = express.Router()

routeMetricData.get('/query', async (req, res) => {
  try {
    const metrics = await getMetricData(req.query)
    res.json(metrics)
  } catch (error) {
    console.error('[routeMetricData] Error fetching metric data:', error.message)
    const status = error.statusCode || 500
    res.status(status).json({ error: error.message })
  }
})

module.exports = {
  routeMetricData
}
