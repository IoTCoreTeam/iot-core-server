const deviceWhiteList = require('./deviceWhitelistService')

async function saveSensorData({ gatewayId, nodeBuffer, db, config, documents }) {
  if (!db || !documents || documents.length === 0) {
    return
  }

  const collectionName = config?.SENSOR_COLLECTION_NAME || 'sensors'

  try {
    if (gatewayId) {
      const gatewayStatus = deviceWhiteList.getGatewayStatus(gatewayId)
      if (gatewayStatus === 'offline') {
        deviceWhiteList.setGatewayStatus(gatewayId, 'online')
      }
    }

    await db.collection(collectionName).insertMany(documents)
  } catch (error) {
    console.error('Failed to save sensor data:', error.message)
  }
}

module.exports = {
  saveSensorData,
}
