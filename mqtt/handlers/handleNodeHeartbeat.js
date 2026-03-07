async function handleNodeHeartbeat(payload, client) {
    try {
        const data = JSON.parse(payload);
        const {
            gateway_id,
            gateway_ip,
            gateway_mac,
            node_id,
            node_ip,
            node_mac,
            status,
            uptime,
            heartbeat_seq,
            gateway_timestamp,
            sensor_rssi,
            controller_states,
        } = data;
        const nodeType = this.resolveNodeType(node_id);

        const whitelistService = this.getWhitelistService();
        const gatewayRegistered = this.isGatewayRegistered(gateway_id);
        if (!gatewayRegistered) {
            console.log(`Node heartbeat from non-whitelisted gateway: ${gateway_id}`);
        }

        const isNodeAllowed = this.isNodeRegisteredForGateway(gateway_id, node_id);

        if (!isNodeAllowed) {
            console.log(`Node heartbeat not whitelisted for gateway ${gateway_id}: ${node_id} type=${nodeType}`);
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
            type: nodeType,
            status: normalizedNodeStatus,
            ip: node_ip || null,
            mac: node_mac || null,
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
                    name: 'Main Gateway',
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
                name: existingNode.name || node_id,
                ip: node_ip || existingNode.ip || null,
                mac: node_mac || existingNode.mac || null,
                status: normalizedNodeStatus,
                registered: isNodeAllowed,
                node_type: nodeType,
                last_seen: lastSeen,
                rssi: sensor_rssi ?? existingNode.rssi ?? null,
                devices: controllerDevices || (Array.isArray(existingNode.devices) ? existingNode.devices : []),
            };
        }

        this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
        this.logNodeHeartbeatSummary();
    } catch (error) {
        console.error('Node heartbeat error:', error.message);
    }
}

module.exports = handleNodeHeartbeat;
