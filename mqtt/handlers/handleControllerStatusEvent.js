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
      received_at: new Date()
    }

    if (this.db) {
      const controlAckCollectionName = this.config?.CONTROL_ACK_COLLECTION_NAME || 'control_acks'
      await this.db.collection(controlAckCollectionName).insertOne(eventData)
    }

    if (this.controlResponseWaiter) {
      const resolved = this.controlResponseWaiter.resolveFromStatusEvent(eventData)
      if (!resolved) {
        console.log(
          `Controller status event has no pending waiter: gateway=${gatewayId} node=${nodeId} device=${data.command_device || 'n/a'} state=${data.command_state || 'n/a'}`
        )
      }
    }
  } catch (error) {
    console.error('Controller status event error:', error.message)
  }
}

module.exports = handleControllerStatusEvent
