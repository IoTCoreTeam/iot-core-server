const { getMetricData } = require('./sensorQueryService')

const getMetricLimit = (metric) => ({
  success: true,
  data: null,
  metric: metric || null,
  message: 'Metric limit not configured'
})

module.exports = {
  getMetricData,
  getMetricLimit
}
