function normalizeOnlineStatus(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'online'
        ? 'online'
        : 'offline';
}

function resolveNodeType(nodeType) {
    const typeKey = typeof nodeType === 'string'
        ? nodeType
        : String(nodeType || '');
    const normalized = typeKey.trim().toLowerCase();
    if (normalized === 'node-control' || normalized === 'controller' || normalized === 'control') {
        return 'node-control';
    }
    if (normalized === 'node-sensor' || normalized === 'sensor') {
        return 'node-sensor';
    }
    return 'node';
}

module.exports = {
    normalizeOnlineStatus,
    resolveNodeType,
};
