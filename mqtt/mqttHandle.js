// ═══════════════════════════════════════════════════════════════
// handlers/mqttHandlers.js - Xử lý 4 sensors riêng biệt
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');
const deviceWhiteList = require('../services/deviceWhiteList');
const { saveSensorData } = require('../services/saveSensorData');

class MQTTHandlers {
    constructor(dependencies) {
        this.deviceWhitelist = dependencies.deviceWhitelist;
        this.rateLimiters = dependencies.rateLimiters;
        this.getRateLimiter = dependencies.getRateLimiter;
        this.dbGetter = dependencies.db;
        this.aedes = dependencies.aedes;
        this.config = dependencies.config;
        this.sseService = dependencies.sseService;

        this.nodeBuffer = new Map();
        this.BUFFER_TIMEOUT = 10000;
        this.nodeHeartbeatStatus = new Map();
        this.gatewayNetworkInfo = new Map();
        this.HEARTBEAT_SUMMARY_INTERVAL = 30000;
        this.lastHeartbeatSummaryAt = 0;
    }

    get db() {
        return this.dbGetter();
    }

    onClientConnected(client) {
        console.log(`\n[MQTT] Gateway Connected: ${client.id}`);
    }

    onClientDisconnected(client) {
        console.log(`\n[MQTT] Gateway Disconnected: ${client.id}`);
    }

    onSubscribe(subscriptions, client) {
        console.log(`\n[MQTT] ${client.id} subscribed to:`);
        subscriptions.forEach(sub => {
            console.log(`  - ${sub.topic}`);
        });
    }

    async onPublish(packet, client) {
        if (!client || packet.topic.startsWith('$SYS')) {
            return;
        }

        const topic = packet.topic;
        const payload = packet.payload.toString();

        if (topic === 'esp32/sensors/data') {
            await this.handleSensorData(payload, client);
        } else if (topic === 'esp32/heartbeat') {
            await this.handleHeartbeat(payload, client);
        } else if (topic === 'esp32/nodes/heartbeat' || topic === 'esp32/controllers/heartbeat') {
            await this.handleNodeHeartbeat(payload, client);
        } else if (topic === 'esp32/servo/ack') {
            await this.handleServoAck(payload, client);
        } else if (topic === 'esp32/control/ack' || topic === 'esp32/actuator/ack') {
            await this.handleControlAck(payload, topic);
        }
    }

    normalizeTimestamp(value) {
        if (!value) {
            return null;
        }
        if (value instanceof Date) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        if (typeof value === 'number') {
            if (value > 1e12) {
                const parsed = new Date(value);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            }
        }
        return null;
    }

    getWhitelistService() {
        return this.deviceWhitelist || deviceWhiteList;
    }

    isGatewayRegistered(gatewayId) {
        if (!gatewayId) {
            return false;
        }
        return this.getWhitelistService().isGatewayAllowed(String(gatewayId));
    }

    isNodeRegisteredForGateway(gatewayId, nodeId) {
        if (!nodeId) {
            return false;
        }
        const whitelistService = this.getWhitelistService();
        if (typeof whitelistService.isNodeAllowedForGateway === 'function') {
            return whitelistService.isNodeAllowedForGateway(gatewayId, nodeId);
        }
        return whitelistService.isNodeAllowed(nodeId);
    }

    normalizeOnlineStatus(value) {
        return typeof value === 'string' && value.trim().toLowerCase() === 'online'
            ? 'online'
            : 'offline';
    }

    formatLocalIso(value) {
        const pad = (num, len = 2) => String(num).padStart(len, '0');
        const year = value.getFullYear();
        const month = pad(value.getMonth() + 1);
        const day = pad(value.getDate());
        const hour = pad(value.getHours());
        const minute = pad(value.getMinutes());
        const second = pad(value.getSeconds());
        const ms = pad(value.getMilliseconds(), 3);
        const offsetMinutes = -value.getTimezoneOffset();
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const absOffset = Math.abs(offsetMinutes);
        const offsetHour = pad(Math.floor(absOffset / 60));
        const offsetMinute = pad(absOffset % 60);

        return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}${sign}${offsetHour}:${offsetMinute}`;
    }

    formatTimestampForSse(value) {
        const parsed = this.normalizeTimestamp(value);
        return parsed ? this.formatLocalIso(parsed) : null;
    }

    resolveNodeType(nodeId) {
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

    buildNodeSsePayload(gatewayId, nodeData) {
        if (!nodeData || !nodeData.id) {
            return null;
        }
        const nodeId = String(nodeData.id);
        const nodeType = this.resolveNodeType(nodeId);

        return {
            id: nodeId,
            node_id: nodeId,
            gateway_id: gatewayId || null,
            name: (typeof nodeData.name === 'string' && nodeData.name.trim().length > 0)
                ? nodeData.name
                : nodeId,
            ip: nodeData.ip || null,
            mac: nodeData.mac || null,
            status: this.normalizeOnlineStatus(nodeData.status),
            registered: this.isNodeRegisteredForGateway(gatewayId, nodeId),
            last_seen: this.formatTimestampForSse(nodeData.last_seen),
            node_type: nodeType,
        };
    }

    emitGatewayUpdate(gatewayInfo, nodes = null) {
        if (!this.sseService || !gatewayInfo) {
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
            status: this.normalizeOnlineStatus(gatewayInfo.status),
            registered: this.isGatewayRegistered(gatewayId),
            lastSeen: this.formatTimestampForSse(gatewayInfo.lastSeen),
        };

        const nodeList = nodes && typeof nodes === 'object'
            ? Object.values(nodes)
                  .map((node) => this.buildNodeSsePayload(gatewayId, node))
                  .filter(Boolean)
            : [];
        if (nodeList.length > 0) {
            payload.nodes = nodeList;
        }

        this.sseService.sendGatewayUpdate(payload);
    }

    emitBufferedGatewayUpdates() {
        if (!this.nodeBuffer || this.nodeBuffer.size === 0) {
            return;
        }

        const whitelistService = this.getWhitelistService();
        for (const [gatewayId, buffer] of this.nodeBuffer.entries()) {
            if (!buffer || !buffer.gateway_info) {
                continue;
            }

            buffer.gateway_info.id = buffer.gateway_info.id || gatewayId;
            buffer.gateway_info.status = whitelistService.getGatewayStatus(gatewayId);
            buffer.gateway_info.registered = this.isGatewayRegistered(gatewayId);

            if (buffer.nodes && typeof buffer.nodes === 'object') {
                for (const [nodeId, nodeData] of Object.entries(buffer.nodes)) {
                    if (!nodeData || typeof nodeData !== 'object') {
                        continue;
                    }
                    nodeData.id = nodeData.id || nodeId;
                    nodeData.status = this.normalizeOnlineStatus(nodeData.status);
                    nodeData.registered = this.isNodeRegisteredForGateway(gatewayId, nodeData.id);
                }
            }

            this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SENSOR DATA HANDLER - 4 sensors riêng biệt
    // ═══════════════════════════════════════════════════════════════

    async handleSensorData(payload, client) {
        try {
            const espData = JSON.parse(payload);
            const {
                gateway_id, gateway_ip, gateway_mac,
                node_id, node_ip, node_mac,
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
            const readingTime = this.normalizeTimestamp(gateway_timestamp) || new Date();
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
                        name: 'Main Gateway',
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
                name: existingNode.name || `Environmental Node ${node_id === 'node-001' ? '#1' : '#2'}`,
                ip: node_ip || existingNode.ip || heartbeatNodeInfo.ip || null,
                mac: node_mac || existingNode.mac || heartbeatNodeInfo.mac || null,
                status: 'online',
                registered: this.isNodeRegisteredForGateway(gateway_id, node_id),
                last_seen: readingTime,
                rssi: sensor_rssi,
                devices,
            };

            buffer.nodes[node_id] = nodeData;
            buffer.gateway_info.lastSeen = readingTime;
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

    async handleHeartbeat(payload, client) {
        console.log("handleHeartbeat: " + payload);
        try {
            const data = JSON.parse(payload);
            const { gateway_id, gateway_ip, gateway_mac, status, uptime, timestamp } = data;
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
            if (gateway_ip) {
                buffer.gateway_info.ip = gateway_ip;
            } else if (!buffer.gateway_info.ip) {
                buffer.gateway_info.ip = currentGatewayNetworkInfo.ip;
            }
            if (gateway_mac) {
                buffer.gateway_info.mac = gateway_mac;
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

    logNodeHeartbeatSummary() {
        const now = Date.now();
        if (now - this.lastHeartbeatSummaryAt < this.HEARTBEAT_SUMMARY_INTERVAL) {
            return;
        }
        this.lastHeartbeatSummaryAt = now;

        console.log("\n[Node Heartbeat Summary]");
        if (this.nodeHeartbeatStatus.size === 0) {
            console.log("  No node heartbeats received yet");
            return;
        }

        this.nodeHeartbeatStatus.forEach((nodesMap, gatewayId) => {
            const entries = [];
            nodesMap.forEach((info, nodeId) => {
                const nodeType = info.type || this.resolveNodeType(nodeId);
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

    async handleNodeHeartbeat(payload, client) {
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
                    devices: Array.isArray(existingNode.devices) ? existingNode.devices : [],
                };
            }

            this.emitGatewayUpdate(buffer.gateway_info, buffer.nodes);
            this.logNodeHeartbeatSummary();
        } catch (error) {
            console.error('Node heartbeat error:', error.message);
        }
    }

    async handleServoAck(payload, client) {
        try {
            const data = JSON.parse(payload);
            if (!deviceWhiteList.isGatewayAllowed(data.gateway_id)) {
                console.log('Servo ACK from non-whitelisted gateway: ', data.gateway_id);
                return;
            }

            if (!deviceWhiteList.isSensorAllowed(data.device_id)) {
                console.log('Servo ACK for non-whitelisted sensor: ', data.device_id);
                return;
            }

            console.log('Servo ACK: ', data.device_id, ' -> ', data.status);

            if (this.db) {
                const servoAckCollectionName = this.config?.SERVO_ACK_COLLECTION_NAME || 'servo_acks';
                await this.db.collection(servoAckCollectionName).insertOne({
                    ...data,
                    timestamp: new Date(data.timestamp),
                    received_at: new Date()
                });
            }
        } catch (error) {
            console.error('Servo ACK error:', error.message);
        }
    }

    async handleControlAck(payload, topic) {
        try {
            const data = JSON.parse(payload);
            const gatewayId = data.gateway_id;
            const nodeId = data.node_id;

            if (!deviceWhiteList.isGatewayAllowed(gatewayId)) {
                console.log('Control ACK from non-whitelisted gateway: ', gatewayId);
                return;
            }

            if (nodeId) {
                const isNodeAllowed = typeof deviceWhiteList.isNodeAllowedForGateway === 'function'
                    ? deviceWhiteList.isNodeAllowedForGateway(gatewayId, nodeId)
                    : deviceWhiteList.isNodeAllowed(nodeId);
                if (!isNodeAllowed) {
                    console.log(`Control ACK from non-whitelisted node ${nodeId} on gateway ${gatewayId}`);
                    return;
                }
            }

            console.log(
                `Control ACK: gateway=${gatewayId} node=${nodeId || 'n/a'} device=${data.device || 'n/a'} state=${data.state || 'n/a'} status=${data.status || 'n/a'}`
            );

            if (this.db) {
                const controlAckCollectionName = this.config?.CONTROL_ACK_COLLECTION_NAME || 'control_acks';
                await this.db.collection(controlAckCollectionName).insertOne({
                    ...data,
                    topic,
                    received_at: new Date(),
                });
            }
        } catch (error) {
            console.error('Control ACK error:', error.message);
        }
    }

    onClientError(client, error) {
        console.error(`[MQTT ERROR] ${client.id}:`, error.message);
    }

    onConnectionError(client, error) {
        console.error(`[MQTT] Connection error:`, error.message);
    }
}

module.exports = MQTTHandlers;

