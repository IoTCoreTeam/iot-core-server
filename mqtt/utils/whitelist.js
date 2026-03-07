const deviceWhiteList = require('../../services/deviceWhitelistService');

function getWhitelistService(handler) {
    return handler.deviceWhitelist || deviceWhiteList;
}

function isGatewayRegistered(handler, gatewayId) {
    if (!gatewayId) {
        return false;
    }
    return getWhitelistService(handler).isGatewayAllowed(String(gatewayId));
}

function isNodeRegisteredForGateway(handler, gatewayId, nodeId) {
    if (!nodeId) {
        return false;
    }
    const whitelistService = getWhitelistService(handler);
    if (typeof whitelistService.isNodeAllowedForGateway === 'function') {
        return whitelistService.isNodeAllowedForGateway(gatewayId, nodeId);
    }
    return whitelistService.isNodeAllowed(nodeId);
}

module.exports = {
    getWhitelistService,
    isGatewayRegistered,
    isNodeRegisteredForGateway,
};
