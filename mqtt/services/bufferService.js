function getGatewaySnapshotList(handler) {
    if (!handler.nodeBuffer || handler.nodeBuffer.size === 0) {
        return [];
    }

    const snapshots = [];
    for (const [gatewayId, buffer] of handler.nodeBuffer.entries()) {
        const snapshot = handler.buildGatewaySnapshot(gatewayId, buffer);
        if (snapshot) {
            snapshots.push(snapshot);
        }
    }
    return snapshots;
}

function emitGatewayUpdate(handler, gatewayInfo, nodes = null) {
    if (!handler.sseService || !gatewayInfo) {
        return;
    }

    const gatewayId = gatewayInfo.id ? String(gatewayInfo.id) : null;
    if (!gatewayId) {
        return;
    }

    const payload = {
        id: gatewayId,
        name: gatewayInfo.name,
        ip: gatewayInfo.ip || null,
        mac: gatewayInfo.mac || null,
        status: handler.normalizeOnlineStatus(gatewayInfo.status),
        registered: handler.isGatewayRegistered(gatewayId),
        last_seen: handler.formatTimestampForSse(gatewayInfo.lastSeen),
    };

    const nodeList = nodes && typeof nodes === 'object'
        ? Object.values(nodes)
              .map((node) => handler.buildNodeSsePayload(gatewayId, node))
              .filter(Boolean)
        : [];
    if (nodeList.length > 0) {
        payload.nodes = nodeList;
    }

    handler.sseService.sendGatewayUpdate(payload);
}

function emitBufferedGatewayUpdates(handler) {
    if (!handler.nodeBuffer || handler.nodeBuffer.size === 0) {
        return;
    }

    const whitelistService = handler.getWhitelistService();
    for (const [gatewayId, buffer] of handler.nodeBuffer.entries()) {
        if (!buffer || !buffer.gateway_info) {
            continue;
        }

        buffer.gateway_info.id = buffer.gateway_info.id || gatewayId;
        buffer.gateway_info.status = whitelistService.getGatewayStatus(gatewayId);
        buffer.gateway_info.registered = handler.isGatewayRegistered(gatewayId);

        if (buffer.nodes && typeof buffer.nodes === 'object') {
            for (const [nodeId, nodeData] of Object.entries(buffer.nodes)) {
                if (!nodeData || typeof nodeData !== 'object') {
                    continue;
                }
                nodeData.id = nodeData.id || nodeId;
                nodeData.status = handler.normalizeOnlineStatus(nodeData.status);
                nodeData.registered = handler.isNodeRegisteredForGateway(gatewayId, nodeData.id);
            }
        }

        emitGatewayUpdate(handler, buffer.gateway_info, buffer.nodes);
    }
}

module.exports = {
    getGatewaySnapshotList,
    emitGatewayUpdate,
    emitBufferedGatewayUpdates,
};
