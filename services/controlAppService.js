function createControlService({ controlCommandService }) {
  if (!controlCommandService) {
    throw new Error('controlCommandService is required')
  }

  const enqueueCommand = (payload = {}) => {
    return controlCommandService.enqueue(payload)
  }

  const commandDevice = (body = {}, device) => {
    return controlCommandService.enqueue({
      gateway_id: body.gateway_id,
      node_id: body.node_id,
      action_type: body.action_type ?? null,
      device,
      state: body.state,
      value: body.value,
      delayMs: body.delayMs
    })
  }

  const health = () => ({
    queued: controlCommandService.size(),
    processing: controlCommandService.isProcessing()
  })

  return {
    enqueueCommand,
    commandDevice,
    health
  }
}

module.exports = {
  createControlService
}
