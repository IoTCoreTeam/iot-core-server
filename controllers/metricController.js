const { getMetricNodes } = require('../services/metricNodeService')

async function fetchMetricNodes(_req, res) {
  try {
    const data = await getMetricNodes()
    res.json({ data })
  } catch (error) {
    console.error('[metricController] Error fetching metric nodes:', error.message)
    res.status(500).json({ error: 'Failed to load metric nodes' })
  }
}

module.exports = {
  fetchMetricNodes
}
