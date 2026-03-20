function createControlAckController({ controlAckAnalyticsService }) {
  if (!controlAckAnalyticsService) {
    throw new Error('controlAckAnalyticsService is required')
  }

  async function getOverview(req, res) {
    try {
      const { hours, bucket } = req.query || {}
      const overview = await controlAckAnalyticsService.getControlAckOverview({
        hours,
        bucket
      })
      res.json(overview)
    } catch (error) {
      console.error('[controlAckController] Error fetching control ack overview:', error.message)
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to load control ack overview.' })
    }
  }

  return {
    getOverview
  }
}

module.exports = {
  createControlAckController
}
