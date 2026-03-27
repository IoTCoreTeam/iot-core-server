function createControlService({ controlCommandService }) {
  if (!controlCommandService) {
    throw new Error('controlCommandService is required')
  }

  const enqueueCommand = async (payload = {}) => {
    return controlCommandService.enqueue(payload)
  }

  const commandDevice = async (body = {}, device) => {
    return controlCommandService.enqueue({
      gateway_id: body.gateway_id,
      node_id: body.node_id,
      action_type: body.action_type ?? null,
      device,
      state: body.state,
      value: body.value,
      command_payload: body.command_payload ?? body.command ?? null,
      json_command_id: body.json_command_id ?? null,
      json_command_name: body.json_command_name ?? null,
      delayMs: body.delayMs,
      wait_for_response: body.wait_for_response,
      response_timeout_ms: body.response_timeout_ms
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
