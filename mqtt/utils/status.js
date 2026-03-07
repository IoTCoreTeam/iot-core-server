function normalizeOnlineStatus(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'online'
        ? 'online'
        : 'offline';
}

function resolveNodeType(nodeId) {
    const nodeKey = typeof nodeId === 'string'
        ? nodeId
        : String(nodeId || '');
    const lowerNodeId = nodeKey.toLowerCase();
    if (lowerNodeId.includes('control')) {
        return 'node-control';
    }
    if (lowerNodeId.includes('sensor')) {
        return 'node-sensor';
    }
    return 'node';
}

module.exports = {
    normalizeOnlineStatus,
    resolveNodeType,
};
