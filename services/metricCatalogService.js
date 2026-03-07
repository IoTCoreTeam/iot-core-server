const { getMetricNodes } = require('./metricNodeMapService')
const { metrics } = require('../config/metrics')

const listMetrics = () => metrics

module.exports = {
  listMetrics,
  getMetricNodes
}
