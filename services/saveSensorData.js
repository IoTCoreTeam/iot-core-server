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

        if (db) {
            const sensorCollectionName = config?.SENSOR_COLLECTION_NAME || 'sensor_readings';
            await db.collection(sensorCollectionName).insertMany(documents);
        }

        nodeBuffer.delete(gatewayId);
    } catch (error) {
        console.error('Failed to save buffered data:', error.message);
    }
}

module.exports = {
    saveSensorData,
};
