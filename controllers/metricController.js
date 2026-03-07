function createMetricController({ metricService }) {
  if (!metricService) {
    throw new Error('metricService is required')
  }

  async function listMetrics(_req, res) {
    const data = metricService.listMetrics()
    return res.json(data)
  }

  async function fetchMetricNodes(_req, res) {
    try {
      const data = await metricService.getMetricNodes()
      res.json({ data })
    } catch (error) {
      console.error('[metricController] Error fetching metric nodes:', error.message)
      res.status(500).json({ error: 'Failed to load metric nodes' })
    }
  }

  return {
    listMetrics,
    fetchMetricNodes
  }
}

module.exports = {
  createMetricController
}
