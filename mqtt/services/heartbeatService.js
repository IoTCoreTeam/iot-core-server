function markHeartbeatTimeouts(handler, now = new Date()) {
    if (!handler.nodeBuffer || handler.nodeBuffer.size === 0) {
        return false;
    }

    let changed = false;
    const whitelistService = handler.getWhitelistService();

    for (const [gatewayId, buffer] of handler.nodeBuffer.entries()) {
        if (!buffer || !buffer.gateway_info) {
            continue;
        }

        const gatewayLastSeen = handler.normalizeTimestamp(buffer.gateway_info.lastSeen || buffer.gateway_info.last_seen);
        const gatewayStale = gatewayLastSeen
            ? now.getTime() - gatewayLastSeen.getTime() > handler.HEARTBEAT_TIMEOUT_MS
            : false;

        if (gatewayStale && buffer.gateway_info.status !== 'offline') {
            buffer.gateway_info.status = 'offline';
            if (typeof whitelistService.setGatewayStatus === 'function' && gatewayId) {
                whitelistService.setGatewayStatus(String(gatewayId), 'offline');
            }
            changed = true;
        }

        if (buffer.nodes && typeof buffer.nodes === 'object') {
            for (const [nodeId, nodeData] of Object.entries(buffer.nodes)) {
                if (!nodeData || typeof nodeData !== 'object') {
                    continue;
                }
                const nodeLastSeen = handler.normalizeTimestamp(nodeData.last_seen || nodeData.lastSeen);
                const nodeStale = nodeLastSeen
                    ? now.getTime() - nodeLastSeen.getTime() > handler.HEARTBEAT_TIMEOUT_MS
                    : false;
                if (nodeStale && nodeData.status !== 'offline') {
                    nodeData.status = 'offline';
                    changed = true;
                }
            }
        }

        if (changed) {
            buffer.gateway_info.id = buffer.gateway_info.id || gatewayId;
            handler.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
        }
    }

    return changed;
}

function logNodeHeartbeatSummary(handler) {
    const now = Date.now();
    if (now - handler.lastHeartbeatSummaryAt < handler.HEARTBEAT_SUMMARY_INTERVAL) {
        return;
    }
    handler.lastHeartbeatSummaryAt = now;

    console.log("\n[Node Heartbeat Summary]");
    if (handler.nodeHeartbeatStatus.size === 0) {
        console.log("  No node heartbeats received yet");
        return;
    }

    handler.nodeHeartbeatStatus.forEach((nodesMap, gatewayId) => {
        const entries = [];
        nodesMap.forEach((info, nodeId) => {
            const nodeType = info.type || handler.resolveNodeType(nodeId);
            const lastSeen = info.lastSeen instanceof Date
                ? info.lastSeen.toISOString()
                : "n/a";
            const uptime = info.uptime !== null && info.uptime !== undefined
                ? `${info.uptime}s`
                : "n/a";
            const seq = info.seq !== null && info.seq !== undefined
                ? info.seq
                : "n/a";
            entries.push(`${nodeId} type=${nodeType} lastSeen=${lastSeen} uptime=${uptime} seq=${seq}`);
        });
        const summary = entries.length ? entries.join(" | ") : "no nodes";
        console.log(`  ${gatewayId}: ${summary}`);
    });
}

module.exports = {
    markHeartbeatTimeouts,
    logNodeHeartbeatSummary,
};
