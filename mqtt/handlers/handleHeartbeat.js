async function handleHeartbeat(payload, client) {
    console.log("handleHeartbeat: " + payload);
    try {
        const data = JSON.parse(payload);
        const {
            gateway_id,
            gateway_ip,
            gateway_mac,
            ip,
            mac,
            ip_address,
            mac_address,
            status,
            uptime,
            timestamp
        } = data;
        if (!gateway_id) {
            console.log("Heartbeat ignored: missing gateway_id");
            return;
        }

        const normalizedStatus =
            typeof status === 'string' &&
            status.trim().toLowerCase() === 'online'
                ? 'online'
                : 'inactive';
        const whitelistService = this.getWhitelistService();
        const registered = this.isGatewayRegistered(gateway_id);
        if (!registered) {
            console.log(`Heartbeat from non-whitelisted gateway: ${gateway_id}`);
        }

        whitelistService.setGatewayStatus(gateway_id, normalizedStatus);
        const lastSeen = this.normalizeTimestamp(timestamp) || new Date();
        const resolvedGatewayIp = gateway_ip || ip || ip_address || null;
        const resolvedGatewayMac = gateway_mac || mac || mac_address || null;

        const previousGatewayNetworkInfo = this.gatewayNetworkInfo.get(gateway_id) || {};
        const currentGatewayNetworkInfo = {
            ip: resolvedGatewayIp || previousGatewayNetworkInfo.ip || null,
            mac: resolvedGatewayMac || previousGatewayNetworkInfo.mac || null,
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
                    registered,
                    lastSeen,
                },
                nodes: {},
                timer: null,
            });
        }

        const buffer = this.nodeBuffer.get(gateway_id);
        buffer.gateway_info.id = gateway_id;
        buffer.gateway_info.name = buffer.gateway_info.name || 'Main Gateway';
        if (resolvedGatewayIp) {
            buffer.gateway_info.ip = resolvedGatewayIp;
        } else if (!buffer.gateway_info.ip) {
            buffer.gateway_info.ip = currentGatewayNetworkInfo.ip;
        }
        if (resolvedGatewayMac) {
            buffer.gateway_info.mac = resolvedGatewayMac;
        } else if (!buffer.gateway_info.mac) {
            buffer.gateway_info.mac = currentGatewayNetworkInfo.mac;
        }
        buffer.gateway_info.status = whitelistService.getGatewayStatus(gateway_id);
        buffer.gateway_info.registered = registered;
        buffer.gateway_info.lastSeen = lastSeen;

        this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
        console.log(`Heartbeat: ${gateway_id} (${normalizedStatus}) registered=${registered}`);

    } catch (error) {
        console.error("Heartbeat error:", error.message);
    }
}

module.exports = handleHeartbeat;
