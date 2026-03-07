function createSensorController({ metricDataService }) {
  if (!metricDataService) {
    throw new Error('metricDataService is required')
  }

  async function fetchMetricData(req, res) {
    try {
      const metrics = await metricDataService.getMetricData(req.query)
      res.json(metrics)
    } catch (error) {
      console.error('[sensorController] Error fetching metric data:', error.message)
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message })
    }
  }

  async function fetchMetricLimit(req, res) {
    try {
      const { metric } = req.params
      const response = metricDataService.getMetricLimit(metric)
      res.json(response)
    } catch (error) {
      console.error('[sensorController] Error fetching metric limit:', error.message)
      res.status(500).json({ success: false, message: 'Metric limit error' })
    }
  }

  return {
    fetchMetricData,
    fetchMetricLimit
  }
}

module.exports = {
  createSensorController
}
