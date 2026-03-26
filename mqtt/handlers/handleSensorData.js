const { saveSensorData } = require('../../services/sensorDataSaveService');

async function handleSensorData(payload, client) {
    try {
        const espData = JSON.parse(payload);
        const {
            gateway_id, gateway_name, gateway_ip, gateway_mac,
            node_id, node_name, node_ip, node_mac,
            sensors,
            gateway_timestamp,
            sensor_rssi
        } = espData;
        const {
            sensor_id,
            temperature,
            humidity,
            light,
            rain,
            soil,
        } = espData;

        const whitelistService = this.getWhitelistService();
        const isRegistered = this.isGatewayRegistered(gateway_id);
        const isNodeRegistered = this.isNodeRegisteredForGateway(gateway_id, node_id);
        if (!isRegistered) {
            console.log(`Sensor data from non-whitelisted gateway: ${gateway_id}`);
            return;
        }
        if (!isNodeRegistered) {
            console.log(`Sensor data from non-whitelisted node ${node_id} on gateway ${gateway_id}`);
            return;
        }
        const readingTime = this.normalizeTimestamp(gateway_timestamp) || new Date();
        const resolvedGatewayName =
            typeof gateway_name === 'string' && gateway_name.trim()
                ? gateway_name.trim()
                : null;
        const resolvedNodeName =
            typeof node_name === 'string' && node_name.trim()
                ? node_name.trim()
                : null;
        const derivedSensors = [
            {
                id: `${sensor_id}-temp`,
                type: 'temperature',
                name: 'Temperature',
                value: temperature,
                unit: 'C',
            },
            {
                id: `${sensor_id}-humi`,
                type: 'humidity',
                name: 'Humidity',
                value: humidity,
                unit: '%',
            },
            {
                id: `${sensor_id}-light`,
                type: 'light',
                name: 'Light',
                value: light?.percent,
                unit: light?.unit,
                raw: light?.raw,
            },
            {
                id: `${sensor_id}-rain`,
                type: 'rain',
                name: 'Rain',
                value: rain?.percent,
                unit: rain?.unit,
                raw: rain?.raw,
            },
            {
                id: `${sensor_id}-soil`,
                type: 'soil',
                name: 'Soil',
                value: soil?.percent,
                unit: soil?.unit,
                raw: soil?.raw,
            },
        ].filter(sensor => sensor.value !== undefined && sensor.value !== null);

        const filteredSensors = (sensors && sensors.length > 0)
            ? sensors
            : derivedSensors;

        if (gateway_id) {
            whitelistService.setGatewayStatus(gateway_id, 'online');
        }

        const limiter = this.getRateLimiter(gateway_id);
        if (!limiter.consume(1)) {
            return;
        }

        const devices = [];
        if (filteredSensors && Array.isArray(filteredSensors)) {
            filteredSensors.forEach(sensor => {
                const device = {
                    id: sensor.id,
                    type: sensor.type,
                    name: sensor.name,
                    value: sensor.value,
                    unit: sensor.unit,
                    timestamp: readingTime,
                };

                if (sensor.raw !== undefined) {
                    device.raw = sensor.raw;
                }
                if (sensor.status !== undefined) {
                    device.status = sensor.status;
                }

                devices.push(device);
            });
        }

        const gatewayNetworkInfo = this.gatewayNetworkInfo.get(gateway_id) || {};
        if (!this.nodeBuffer.has(gateway_id)) {
            this.nodeBuffer.set(gateway_id, {
                gateway_info: {
                    id: gateway_id,
                    name: resolvedGatewayName || 'Main Gateway',
                    ip: gateway_ip || gatewayNetworkInfo.ip || null,
                    mac: gateway_mac || gatewayNetworkInfo.mac || null,
                    status: whitelistService.getGatewayStatus(gateway_id),
                    registered: isRegistered,
                    lastSeen: readingTime,
                },
                nodes: {},
                timer: null,
            });
        }

        const buffer = this.nodeBuffer.get(gateway_id);
        const existingNode = buffer.nodes[node_id] || {};
        const heartbeatNodeInfo = this.nodeHeartbeatStatus.get(gateway_id)?.get(node_id) || {};
        const nodeData = {
            id: node_id,
            name:
                resolvedNodeName ||
                existingNode.name ||
                heartbeatNodeInfo.name ||
                `Environmental Node ${node_id === 'node-001' ? '#1' : '#2'}`,
            ip: node_ip || existingNode.ip || heartbeatNodeInfo.ip || null,
            mac: node_mac || existingNode.mac || heartbeatNodeInfo.mac || null,
            lat: existingNode.lat ?? heartbeatNodeInfo.lat ?? null,
            lng: existingNode.lng ?? heartbeatNodeInfo.lng ?? null,
            inside_map: existingNode.inside_map ?? heartbeatNodeInfo.inside_map ?? null,
            status: 'online',
            registered: isNodeRegistered,
            last_seen: readingTime,
            rssi: sensor_rssi,
            devices,
        };

        buffer.nodes[node_id] = nodeData;
        buffer.gateway_info.lastSeen = readingTime;
        if (resolvedGatewayName) {
            buffer.gateway_info.name = resolvedGatewayName;
        } else {
            buffer.gateway_info.name = buffer.gateway_info.name || 'Main Gateway';
        }
        if (gateway_ip) {
            buffer.gateway_info.ip = gateway_ip;
        }
        if (gateway_mac) {
            buffer.gateway_info.mac = gateway_mac;
        }
        if (!buffer.gateway_info.ip && gatewayNetworkInfo.ip) {
            buffer.gateway_info.ip = gatewayNetworkInfo.ip;
        }
        if (!buffer.gateway_info.mac && gatewayNetworkInfo.mac) {
            buffer.gateway_info.mac = gatewayNetworkInfo.mac;
        }
        buffer.gateway_info.status = whitelistService.getGatewayStatus(gateway_id);
        buffer.gateway_info.registered = isRegistered;

        if (gateway_ip || gateway_mac) {
            this.gatewayNetworkInfo.set(gateway_id, {
                ip: gateway_ip || gatewayNetworkInfo.ip || null,
                mac: gateway_mac || gatewayNetworkInfo.mac || null,
            });
        }

        this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);

        if (buffer.timer) {
            clearTimeout(buffer.timer);
            buffer.timer = null;
        }

        const receivedAt = new Date();
        const documents = (nodeData.devices || []).map((device) => ({
            gateway_id,
            node_id: nodeData.id,
            sensor_id: device.id,
            metric: device.type,
            value: device.value,
            unit: device.unit,
            timestamp: device.timestamp || receivedAt,
            ...(device.raw !== undefined ? { raw: device.raw } : {}),
            ...(device.status !== undefined ? { status: device.status } : {}),
        }));

        await saveSensorData({
            gatewayId: gateway_id,
            nodeBuffer: this.nodeBuffer,
            db: this.db,
            config: this.config,
            documents,
        });
    } catch (error) {
        console.error('Failed to handle sensor data:', error.message);
        console.error('Stack:', error.stack);
    }
}

module.exports = handleSensorData;
