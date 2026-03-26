function createWorkflowEventController({ controlQueueSseService }) {
  if (!controlQueueSseService) {
    throw new Error('controlQueueSseService is required')
  }

  function pushStatus(req, res) {
    try {
      const payload = req.body || {}
      controlQueueSseService.sendWorkflowStatus({
        type: 'workflow_status',
        status: payload.status || null,
        run_id: payload.run_id ?? null,
        workflow_id: payload.workflow_id ?? null,
        ts: payload.ts || new Date().toISOString(),
        source: payload.source || 'backend',
        error: payload.error ?? null,
        meta: payload.meta ?? null,
      })

      return res.json({
        success: true,
        message: 'Workflow status event accepted',
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to push workflow status event',
      })
    }
  }

  return {
    pushStatus,
  }
}

module.exports = {
  createWorkflowEventController,
}
