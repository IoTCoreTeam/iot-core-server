function parseGPS(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }
    return null;
}

function resolveGPSLocation(gps, fallback = {}) {
    const parsedGPS = parseGPS(gps);
    const lat = Number(
        parsedGPS?.lat ??
        parsedGPS?.latitude ??
        fallback.lat ??
        fallback.latitude
    );
    const lng = Number(
        parsedGPS?.lng ??
        parsedGPS?.longitude ??
        fallback.lng ??
        fallback.longitude
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }
    return { lat, lng };
}

function normalizeConnectedNodes(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item).trim()).filter(Boolean);
            }
        } catch (error) {
            // ignore parse error, fallback to CSV split
        }
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
}

async function handleNodeHeartbeat(payload, client) {
    try {
        console.log("handleNodeHeartbeat: " + payload);
        const data = JSON.parse(payload);
        const {
            gateway_id,
            gateway_name,
            gatewayName,
            gateway_ip,
            gateway_mac,
            node_id,
            node_name,
            nodeName,
            node_ip,
            node_mac,
            status,
            uptime,
            heartbeat_seq,
            gateway_timestamp,
            sensor_rssi,
            node_type,
            nodeType,
            controller_states,
            gps,
            lat,
            lng,
            latitude,
            longitude,
            connected_nodes,
            connectedNodes,
        } = data;
        const reportedNodeType =
            (typeof node_type === 'string' && node_type.trim()) ||
            (typeof nodeType === 'string' && nodeType.trim()) ||
            '';
        const resolvedNodeType = this.resolveNodeType(reportedNodeType);
        const location = resolveGPSLocation(gps, { lat, lng, latitude, longitude });
        const resolvedConnectedNodes = normalizeConnectedNodes(connected_nodes ?? connectedNodes);
        const resolvedGatewayName =
            (typeof gateway_name === 'string' && gateway_name.trim()) ||
            (typeof gatewayName === 'string' && gatewayName.trim()) ||
            null;
        const resolvedNodeName =
            (typeof node_name === 'string' && node_name.trim()) ||
            (typeof nodeName === 'string' && nodeName.trim()) ||
            null;

        const whitelistService = this.getWhitelistService();
        const gatewayRegistered = this.isGatewayRegistered(gateway_id);
        if (!gatewayRegistered) {
            console.log(`Node heartbeat from non-whitelisted gateway: ${gateway_id}`);
        }

        const isNodeAllowed = this.isNodeRegisteredForGateway(gateway_id, node_id);
        const isInsideManagedArea = whitelistService.isNodeInsideManagedArea(
            node_id,
            location?.lat,
            location?.lng
        );

        if (!isNodeAllowed) {
            console.log(`Node heartbeat not whitelisted for gateway ${gateway_id}: ${node_id} type=${resolvedNodeType}`);
        }

        const lastSeen = this.normalizeTimestamp(gateway_timestamp) || new Date();
        const normalizedNodeStatus = this.normalizeOnlineStatus(status);

        if (!this.nodeHeartbeatStatus.has(gateway_id)) {
            this.nodeHeartbeatStatus.set(gateway_id, new Map());
        }
        this.nodeHeartbeatStatus.get(gateway_id).set(node_id, {
            lastSeen,
            uptime: uptime ?? null,
            seq: heartbeat_seq ?? null,
            type: resolvedNodeType,
            status: normalizedNodeStatus,
            ip: node_ip || null,
            mac: node_mac || null,
            name: resolvedNodeName,
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
            inside_map: isInsideManagedArea,
        });

        const previousGatewayNetworkInfo = this.gatewayNetworkInfo.get(gateway_id) || {};
        const currentGatewayNetworkInfo = {
            ip: gateway_ip || previousGatewayNetworkInfo.ip || null,
            mac: gateway_mac || previousGatewayNetworkInfo.mac || null,
        };
        this.gatewayNetworkInfo.set(gateway_id, currentGatewayNetworkInfo);

        if (!this.nodeBuffer.has(gateway_id)) {
            this.nodeBuffer.set(gateway_id, {
                gateway_info: {
                    id: gateway_id,
                    name: resolvedGatewayName || 'Main Gateway',
                    ip: currentGatewayNetworkInfo.ip,
                    mac: currentGatewayNetworkInfo.mac,
                    status: whitelistService.getGatewayStatus(gateway_id),
                    registered: gatewayRegistered,
                    lastSeen,
                },
                nodes: {},
                timer: null,
            });
        }

        const buffer = this.nodeBuffer.get(gateway_id);
        if (resolvedGatewayName) {
            buffer.gateway_info.name = resolvedGatewayName;
        } else {
            buffer.gateway_info.name = buffer.gateway_info.name || 'Main Gateway';
        }
        buffer.gateway_info.lastSeen = lastSeen;
        if (gateway_ip) {
            buffer.gateway_info.ip = gateway_ip;
        }
        if (gateway_mac) {
            buffer.gateway_info.mac = gateway_mac;
        }
        if (!buffer.gateway_info.ip && currentGatewayNetworkInfo.ip) {
            buffer.gateway_info.ip = currentGatewayNetworkInfo.ip;
        }
        if (!buffer.gateway_info.mac && currentGatewayNetworkInfo.mac) {
            buffer.gateway_info.mac = currentGatewayNetworkInfo.mac;
        }
        buffer.gateway_info.status = whitelistService.getGatewayStatus(gateway_id);
        buffer.gateway_info.registered = gatewayRegistered;

        if (node_id) {
            const existingNode = buffer.nodes[node_id] || {};
            const controllerDevices = Array.isArray(controller_states)
                ? controller_states
                      .map((item) => {
                          if (!item || typeof item !== 'object') {
                              return null;
                          }
                          const deviceId = item.device || item.id || null;
                          if (!deviceId) {
                              return null;
                          }
                          return {
                              id: `${node_id}-${deviceId}`,
                              type: item.kind || item.type || 'digital',
                              name: deviceId,
                              value: item.state ?? item.value ?? null,
                              status: item.state ?? item.value ?? null,
                              timestamp: lastSeen,
                          };
                      })
                      .filter(Boolean)
                : null;
            buffer.nodes[node_id] = {
                ...existingNode,
                id: node_id,
                name: resolvedNodeName || existingNode.name || node_id,
                ip: node_ip || existingNode.ip || null,
                mac: node_mac || existingNode.mac || null,
                status: normalizedNodeStatus,
                registered: isNodeAllowed,
                node_type: resolvedNodeType,
                last_seen: lastSeen,
                rssi: sensor_rssi ?? existingNode.rssi ?? null,
                lat: location?.lat ?? existingNode.lat ?? null,
                lng: location?.lng ?? existingNode.lng ?? null,
                inside_map: isInsideManagedArea,
                devices: controllerDevices || (Array.isArray(existingNode.devices) ? existingNode.devices : []),
                connected_nodes: resolvedConnectedNodes.length > 0
                    ? resolvedConnectedNodes
                    : (Array.isArray(existingNode.connected_nodes) ? existingNode.connected_nodes : []),
            };
        }

        this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
        this.logNodeHeartbeatSummary();
    } catch (error) {
        console.error('Node heartbeat error:', error.message);
    }
}

module.exports = handleNodeHeartbeat;
