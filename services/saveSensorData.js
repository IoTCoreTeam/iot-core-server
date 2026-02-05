const deviceWhiteList = require('./deviceWhiteList');

async function saveSensorData({ gatewayId, nodeBuffer, db, config, documents }) {
    try {
        if (!nodeBuffer.has(gatewayId)) {
            return;
        }

        const buffer = nodeBuffer.get(gatewayId);

        if (buffer.timer) {
            clearTimeout(buffer.timer);
            buffer.timer = null;
        }

        const gatewayStatus = deviceWhiteList.getGatewayStatus(gatewayId);
        if (gatewayStatus !== 'online' || buffer.gateway_info.registered !== true) {
            nodeBuffer.delete(gatewayId);
            return;
        }

        if (!documents.length) {
            nodeBuffer.delete(gatewayId);
            return;
        }

        const whitelistedDocs = documents.filter((doc) => {
            const nodeId = doc?.node_id ?? doc?.nodeId ?? null;
            if (!nodeId) {
                return false;
            }
            if (typeof deviceWhiteList.isNodeAllowedForGateway === 'function') {
                return deviceWhiteList.isNodeAllowedForGateway(gatewayId, nodeId);
            }
            return deviceWhiteList.isNodeAllowed(nodeId);
        });

        if (!whitelistedDocs.length) {
            nodeBuffer.delete(gatewayId);
            return;
        }

        if (db) {
            const sensorCollectionName = config?.SENSOR_COLLECTION_NAME || 'sensor_readings';
            await db.collection(sensorCollectionName).insertMany(whitelistedDocs);
        }

        nodeBuffer.delete(gatewayId);
    } catch (error) {
        console.error('Failed to save buffered data:', error.message);
    }
}

module.exports = {
    saveSensorData,
};
