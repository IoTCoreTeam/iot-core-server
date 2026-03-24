const deviceWhiteList = require('../../services/deviceWhitelistService')

async function handleControllerStatusEvent(payload, topic) {
  try {
    const data = JSON.parse(payload)
    const gatewayId = data.gateway_id
    const nodeId = data.node_id

    if (!deviceWhiteList.isGatewayAllowed(gatewayId)) {
      console.log('Controller status event from non-whitelisted gateway:', gatewayId)
      return
    }

    const isNodeAllowed = typeof deviceWhiteList.isNodeAllowedForGateway === 'function'
      ? deviceWhiteList.isNodeAllowedForGateway(gatewayId, nodeId)
      : deviceWhiteList.isNodeAllowed(nodeId)

    if (!isNodeAllowed) {
      console.log(`Controller status event from non-whitelisted node ${nodeId} on gateway ${gatewayId}`)
      return
    }

    const eventData = {
      ...data,
      topic,
      received_at: new Date(),
      // Normalize to control log schema (ACK v2 from status-event).
      device: data.command_device ?? null,
      state: data.command_state ?? null,
      status: data.command_result ?? 'unknown',
      timestamp: data.gateway_timestamp ?? null,
      command_exec_ms: Number.isFinite(Number(data.command_exec_ms))
        ? Number(data.command_exec_ms)
        : null
    }

    let resolution = null
    if (this.controlResponseWaiter) {
      resolution = this.controlResponseWaiter.resolveFromStatusEvent(eventData)
      if (!resolution?.matched) {
        console.log(
          `Controller status event has no pending waiter: gateway=${gatewayId} node=${nodeId} device=${data.command_device || 'n/a'} state=${data.command_state || 'n/a'}`
        )
      }
    }

    if (resolution?.matched) {
      const correlation = resolution.correlation || {}
      eventData.requested_at = correlation.requested_at ?? null
      eventData.requested_at_ms = correlation.requested_at_ms ?? null
      eventData.response_deadline_at = correlation.response_deadline_at ?? null
    }

    if (this.db) {
      const controlAckCollectionName = this.config?.CONTROL_ACK_COLLECTION_NAME || 'control_acks'
      await this.db.collection(controlAckCollectionName).insertOne(eventData)
    }
  } catch (error) {
    console.error('Controller status event error:', error.message)
  }
}

module.exports = handleControllerStatusEvent
