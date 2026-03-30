const { normalizeOnlineStatus, resolveNodeType } = require('./status');
const { formatTimestampForSse } = require('./time');
const { isNodeRegisteredForGateway } = require('./whitelist');

function buildNodeSsePayload(handler, gatewayId, nodeData) {
    if (!nodeData || !nodeData.id) {
        return null;
    }
    const nodeId = String(nodeData.id);
    const nodeType = resolveNodeType(nodeData.node_type ?? nodeData.type);

    return {
        id: nodeId,
        node_id: nodeId,
        gateway_id: gatewayId || null,
        name: (typeof nodeData.name === 'string' && nodeData.name.trim().length > 0)
            ? nodeData.name
            : nodeId,
        ip: nodeData.ip || null,
        mac: nodeData.mac || null,
        lat: typeof nodeData.lat === 'number' ? nodeData.lat : null,
        lng: typeof nodeData.lng === 'number' ? nodeData.lng : null,
        heading_deg: typeof nodeData.heading_deg === 'number' ? nodeData.heading_deg : null,
        heading_cardinal:
            typeof nodeData.heading_cardinal === 'string' ? nodeData.heading_cardinal : null,
        head_lat: typeof nodeData.head_lat === 'number' ? nodeData.head_lat : null,
        head_lng: typeof nodeData.head_lng === 'number' ? nodeData.head_lng : null,
        status: normalizeOnlineStatus(nodeData.status),
        registered: isNodeRegisteredForGateway(handler, gatewayId, nodeId),
        inside_map: typeof nodeData.inside_map === 'boolean' ? nodeData.inside_map : null,
        last_seen: formatTimestampForSse(nodeData.last_seen),
        node_type: nodeType,
        devices: Array.isArray(nodeData.devices) ? nodeData.devices : [],
        connected_nodes: Array.isArray(nodeData.connected_nodes) ? nodeData.connected_nodes : [],
    };
}

function buildGatewaySnapshot(handler, gatewayId, buffer) {
    if (!buffer) {
        return null;
    }

    const gatewayInfo = buffer.gateway_info || {};
    const resolvedGatewayId = gatewayInfo.id ? String(gatewayInfo.id) : gatewayId ? String(gatewayId) : null;
    if (!resolvedGatewayId) {
        return null;
    }

    const payload = {
        id: resolvedGatewayId,
        name: gatewayInfo.name,
        ip: gatewayInfo.ip || null,
        mac: gatewayInfo.mac || null,
        status: normalizeOnlineStatus(gatewayInfo.status),
        registered: handler.isGatewayRegistered(resolvedGatewayId),
        last_seen: formatTimestampForSse(gatewayInfo.lastSeen),
    };

    const nodes = buffer.nodes && typeof buffer.nodes === 'object'
        ? Object.values(buffer.nodes)
              .map((node) => buildNodeSsePayload(handler, resolvedGatewayId, node))
              .filter(Boolean)
        : [];

    if (nodes.length > 0) {
        payload.nodes = nodes;
    }

    return payload;
}

module.exports = {
    buildNodeSsePayload,
    buildGatewaySnapshot,
};
