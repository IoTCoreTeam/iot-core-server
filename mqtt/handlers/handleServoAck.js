const deviceWhiteList = require('../../services/deviceWhitelistService');

async function handleServoAck(payload, client) {
    try {
        const data = JSON.parse(payload);
        if (!deviceWhiteList.isGatewayAllowed(data.gateway_id)) {
            console.log('Servo ACK from non-whitelisted gateway: ', data.gateway_id);
            return;
        }

        if (!deviceWhiteList.isSensorAllowed(data.device_id)) {
            console.log('Servo ACK for non-whitelisted sensor: ', data.device_id);
            return;
        }

        console.log('Servo ACK: ', data.device_id, ' -> ', data.status);

        if (this.db) {
            const servoAckCollectionName = this.config?.SERVO_ACK_COLLECTION_NAME || 'servo_acks';
            await this.db.collection(servoAckCollectionName).insertOne({
                ...data,
                timestamp: new Date(data.timestamp),
                received_at: new Date()
            });
        }
    } catch (error) {
        console.error('Servo ACK error:', error.message);
    }
}

module.exports = handleServoAck;
