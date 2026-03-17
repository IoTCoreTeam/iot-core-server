function createWhitelistService({ deviceWhiteListService, onWhitelistUpdated } = {}) {
  if (!deviceWhiteListService) {
    throw new Error('deviceWhiteListService is required')
  }

  const getSnapshot = () => deviceWhiteListService.getWhitelistSnapshot()

  const overrideWhitelist = async (payload = {}) => {
    const { gateways, nodes, gateway_nodes, node_controllers, node_sensors, node_managed_areas } = payload

    deviceWhiteListService.overrideWhitelist({
      gateways,
      nodes,
      gateway_nodes,
      node_controllers,
      node_sensors,
      node_managed_areas
    })

    const snapshot = deviceWhiteListService.getWhitelistSnapshot()
    let warning = null

    if (typeof onWhitelistUpdated === 'function') {
      try {
        await onWhitelistUpdated(snapshot)
      } catch (error) {
        warning = error?.message || 'Failed to publish whitelist to gateways'
      }
    }

    return {
      snapshot,
      warning
    }
  }

  return {
    getSnapshot,
    overrideWhitelist
  }
}

module.exports = {
  createWhitelistService
}
