const deviceWhiteList = require('../../services/deviceWhitelistService');

async function handleControlAck(payload, topic) {
    try {
        const data = JSON.parse(payload);
        const gatewayId = data.gateway_id;
        const nodeId = data.node_id;

        if (!deviceWhiteList.isGatewayAllowed(gatewayId)) {
            console.log('Control ACK from non-whitelisted gateway: ', gatewayId);
            return;
        }

        if (nodeId) {
            const isNodeAllowed = typeof deviceWhiteList.isNodeAllowedForGateway === 'function'
                ? deviceWhiteList.isNodeAllowedForGateway(gatewayId, nodeId)
                : deviceWhiteList.isNodeAllowed(nodeId);
            if (!isNodeAllowed) {
                console.log(`Control ACK from non-whitelisted node ${nodeId} on gateway ${gatewayId}`);
                return;
            }
        }

        console.log(
            `Control ACK: gateway=${gatewayId} node=${nodeId || 'n/a'} device=${data.device || 'n/a'} state=${data.state || 'n/a'} status=${data.status || 'n/a'}`
        );

        if (this.db) {
            const controlAckCollectionName = this.config?.CONTROL_ACK_COLLECTION_NAME || 'control_acks';
            await this.db.collection(controlAckCollectionName).insertOne({
                ...data,
                topic,
                received_at: new Date(),
            });
        }
    } catch (error) {
        console.error('Control ACK error:', error.message);
    }
}

module.exports = handleControlAck;
