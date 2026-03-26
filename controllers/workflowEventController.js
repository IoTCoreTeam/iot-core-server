function createWorkflowEventController({ controlQueueSseService, controlQueueService }) {
  if (!controlQueueSseService) {
    throw new Error('controlQueueSseService is required')
  }
  if (!controlQueueService) {
    throw new Error('controlQueueService is required')
  }

  const terminalWorkflowStatuses = new Set(['workflow_failed', 'workflow_stopped'])

  function pushStatus(req, res) {
    try {
      const payload = req.body || {}
      const status = payload.status || null
      const runId = payload.run_id ?? null
      const workflowId = payload.workflow_id ?? null
      const errorMessage = payload.error ?? null

      if (terminalWorkflowStatuses.has(String(status))) {
        const reason =
          errorMessage ||
          (status === 'workflow_stopped'
            ? 'Workflow stopped by backend'
            : 'Workflow failed by backend')

        controlQueueService.cancelWorkflow({
          runId,
          workflowId,
          reason
        })
      }

      controlQueueSseService.sendWorkflowStatus({
        type: 'workflow_status',
        status,
        run_id: runId,
        workflow_id: workflowId,
        ts: payload.ts || new Date().toISOString(),
        source: payload.source || 'backend',
        error: errorMessage,
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
