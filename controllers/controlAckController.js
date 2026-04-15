function createControlAckController({ controlAckAnalyticsService, controlAckQueryService }) {
  if (!controlAckAnalyticsService) {
    throw new Error('controlAckAnalyticsService is required')
  }
  if (!controlAckQueryService) {
    throw new Error('controlAckQueryService is required')
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

  async function queryRows(req, res) {
    try {
      const rows = await controlAckQueryService.getControlAckRows(req.query || {})
      res.json(rows)
    } catch (error) {
      console.error('[controlAckController] Error querying control ack rows:', error.message)
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to query control ack rows.' })
    }
  }

  async function getControllerExecutions(req, res) {
    try {
      const { node_id: nodeId, hours, bucket } = req.query || {}
      const data = await controlAckAnalyticsService.getControllerExecutionStats({
        nodeId,
        hours,
        bucket
      })
      res.json(data)
    } catch (error) {
      console.error('[controlAckController] Error fetching controller executions:', error.message)
      const status = error.statusCode || 500
      res.status(status).json({ error: error.message || 'Failed to load controller execution stats.' })
    }
  }

  return {
    getOverview,
    queryRows,
    getControllerExecutions
  }
}

module.exports = {
  createControlAckController
}
