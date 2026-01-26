// ═══════════════════════════════════════════════════════════════
// handlers/mqttHandlers.js - Xử lý 4 sensors riêng biệt
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');
const deviceWhiteList = require('../services/deviceWhiteList');

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
        } else if (topic === 'esp32/servo/ack') {
            await this.handleServoAck(payload, client);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SENSOR DATA HANDLER - 4 sensors riêng biệt
    // ═══════════════════════════════════════════════════════════════

    async handleSensorData(payload, client) {
        console.log("handleSensorData: "+payload);
        try {
            console.log('Raw sensor payload received:', payload);
            const espData = JSON.parse(payload);
            const {
                gateway_id, gateway_ip, gateway_mac,
                node_id, node_ip, node_mac,
                sensors,  // ARRAY OF 4 SENSORS
                sensor_timestamp, gateway_timestamp,
                sensor_rssi, gateway_rssi
            } = espData;

            /*
            if (!deviceWhiteList.isGatewayAllowed(gateway_id)) {
                console.log(`Gateway not whitelisted: ${gateway_id}`);
                return;
            }

            if (!deviceWhiteList.isNodeAllowed(node_id)) {
                console.log(`Node not whitelisted: ${node_id}`);
                return;
            }
            */
            const isRegistered = deviceWhiteList.isGatewayAllowed(gateway_id);
            // Bypassing whitelist for testing
            const filteredSensors = sensors || []; // (sensors || []).filter(sensor => deviceWhiteList.isSensorAllowed(sensor.id));

            if (gateway_id) {
                deviceWhiteList.setGatewayStatus(gateway_id, 'online');
            }
            /*
            if (filteredSensors.length === 0) {
                console.log(`No whitelisted sensors for node ${node_id}`);
                return;
            }
            */

            // 2. Rate Limiting
            const limiter = this.getRateLimiter(gateway_id);
            if (!limiter.consume(1)) {
                console.log(`Rate limit exceeded: ${gateway_id}`);
                return;
            }

            // 3. Log received data
            console.log(`\n✓ Data received from ${node_id}:`);
            console.log(`  Gateway: ${gateway_id} (MAC: ${gateway_mac})`);
            console.log(`  Node: ${node_id} (MAC: ${node_mac})`);
            console.log(`  Sensors count: ${filteredSensors.length}`);
            // Log từng sensor
            if (filteredSensors && Array.isArray(filteredSensors)) {
                filteredSensors.forEach(sensor => {
                    console.log(`    - ${sensor.name} (${sensor.id}): ${sensor.value} ${sensor.unit}`);
                });
            }

            // 4. XỬ LÝ 4 SENSORS - Convert sang devices array
            const devices = [];

            if (filteredSensors && Array.isArray(filteredSensors)) {
                filteredSensors.forEach(sensor => {
                    const device = {
                        id: sensor.id,
                        type: sensor.type,
                        name: sensor.name,
                        value: sensor.value,
                        unit: sensor.unit,
                        timestamp: new Date(gateway_timestamp)
                    };

                    // Thêm raw value nếu có
                    if (sensor.raw !== undefined) {
                        device.raw = sensor.raw;
                    }

                    // Thêm status nếu có
                    if (sensor.status !== undefined) {
                        device.status = sensor.status;
                    }

                    devices.push(device);
                });
            }

            // 5. TẠO NODE OBJECT
            const nodeData = {
                id: node_id,
                name: `Environmental Node ${node_id === 'node-001' ? '#1' : '#2'}`,
                ip: node_ip || null,
                mac: node_mac || null,
                status: 'active',
                last_seen: new Date(gateway_timestamp),
                rssi: sensor_rssi,
                devices: devices  // 4 sensors riêng biệt
            };

            // 6. BUFFER LOGIC
            if (!this.nodeBuffer.has(gateway_id)) {
                this.nodeBuffer.set(gateway_id, {
                    gateway_info: {
                        id: gateway_id,
                        name: 'Main Gateway',
                        ip: gateway_ip || null,
                        mac: gateway_mac || null,
                        status: deviceWhiteList.getGatewayStatus(gateway_id),
                        registered: isRegistered,
                        lastSeen: new Date(gateway_timestamp)
                    },
                    nodes: {},
                    timer: null
                });
            }

            const buffer = this.nodeBuffer.get(gateway_id);

            buffer.nodes[node_id] = nodeData;
            buffer.gateway_info.lastSeen = new Date(gateway_timestamp);
            buffer.gateway_info.ip = gateway_ip || buffer.gateway_info.ip;
            buffer.gateway_info.mac = gateway_mac || buffer.gateway_info.mac;
            buffer.gateway_info.status = deviceWhiteList.getGatewayStatus(gateway_id);
            buffer.gateway_info.registered = isRegistered;

            console.log(`Buffered: ${Object.keys(buffer.nodes).length}/2 nodes`);

            if (this.sseService) {
                const gatewayPayload = {
                    id: buffer.gateway_info.id,
                    name: buffer.gateway_info.name,
                    ip: buffer.gateway_info.ip,
                    mac: buffer.gateway_info.mac,
                    status: buffer.gateway_info.status,
                    registered: buffer.gateway_info.registered,
                    lastSeen: buffer.gateway_info.lastSeen
                        ? buffer.gateway_info.lastSeen
                              .toISOString()
                              .replace(/Z$/, '+00:00')
                        : null
                };
                this.sseService.sendGatewayUpdate(gatewayPayload);
            }

            if (buffer.timer) {
                clearTimeout(buffer.timer);
            }

            const nodeCount = Object.keys(buffer.nodes).length;

            if (nodeCount === 2) {
                console.log(`Both nodes received! Saving to MongoDB...`);
                await this.saveBufferedData(gateway_id);
            } else {
                console.log(`Waiting for second node (timeout: ${this.BUFFER_TIMEOUT}ms)...`);
                buffer.timer = setTimeout(async () => {
                    console.log(`\nTimeout! Saving with ${nodeCount} node(s)...`);
                    await this.saveBufferedData(gateway_id);
                }, this.BUFFER_TIMEOUT);
            }

        } catch (error) {
            console.error('Failed to handle sensor data:', error.message);
            console.error('Stack:', error.stack);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // LƯU BUFFER VÀO MONGODB
    // ═══════════════════════════════════════════════════════════════

    async saveBufferedData(gateway_id) {
        try {
            if (!this.nodeBuffer.has(gateway_id)) {
                return;
            }

            const buffer = this.nodeBuffer.get(gateway_id);

            if (buffer.timer) {
                clearTimeout(buffer.timer);
                buffer.timer = null;
            }

            const document = {
                gateway: {
                    ...buffer.gateway_info,
                    nodes: Object.values(buffer.nodes)
                },
                received_at: new Date(),
                event_type: 'sensor_reading'
            };

            const gatewayStatus = deviceWhiteList.getGatewayStatus(gateway_id);
            if (gatewayStatus !== 'online' || buffer.gateway_info.registered !== true) {
                console.log(`Skipping MongoDB write for ${gateway_id} (status=${gatewayStatus}, registered=${buffer.gateway_info.registered})`);
                this.nodeBuffer.delete(gateway_id);
                return;
            }

            if (this.db) {
                const sensorCollectionName = this.config?.SENSOR_COLLECTION_NAME || 'sensor_readings'
                const result = await this.db.collection(sensorCollectionName).insertOne(document);
                console.log(`    New document created in MongoDB`);
                console.log(`    Document ID: ${result.insertedId}`);
                console.log(`    Nodes: ${Object.keys(buffer.nodes).join(', ')}`);

                // Log sensors count
                Object.values(buffer.nodes).forEach(node => {
                    console.log(`      ${node.id}: ${node.devices.length} sensors`);
                });
            } else {
                console.log(`MongoDB not connected`);
            }

            this.nodeBuffer.delete(gateway_id);
            console.log(`Buffer cleared for ${gateway_id}\n`);

        } catch (error) {
            console.error('Failed to save buffered data:', error.message);
        }
    }

    async handleHeartbeat(payload, client) {
        console.log("handleHeartbeat: " + payload);
        try {
            const data = JSON.parse(payload);
            const { gateway_id, status, uptime, timestamp } = data;

            const normalizedStatus =
                typeof status === 'string' &&
                status.trim().toLowerCase() === 'online'
                    ? 'online'
                    : 'inactive';

            const registered = deviceWhiteList.isGatewayAllowed(gateway_id);
            if (!registered) {
                console.log(`Heartbeat from non-whitelisted gateway: ${gateway_id}`);
            }

            deviceWhiteList.setGatewayStatus(gateway_id, normalizedStatus);
            console.log(`Heartbeat: ${gateway_id} (${normalizedStatus}) registered=${registered}`);

            if (
                this.db &&
                normalizedStatus === 'online' &&
                registered &&
                gateway_id
            ) {
                const gatewayCollectionName = this.config?.SENSOR_COLLECTION_NAME || 'sensor_readings'
                await this.db.collection(gatewayCollectionName).insertOne({
                    gateway_id,
                    status: normalizedStatus,
                    uptime,
                    timestamp: timestamp ? new Date(timestamp) : new Date(),
                    received_at: new Date(),
                    event_type: 'heartbeat'
                });
            }

            if (this.sseService) {
                const lastSeen = timestamp ? new Date(timestamp) : new Date();
                const gatewayPayload = {
                    id: gateway_id,
                    name: `Gateway ${gateway_id}`,
                    status: normalizedStatus,
                    registered,
                    lastSeen: lastSeen.toISOString().replace(/Z$/, '+00:00'),
                };

                this.sseService.sendGatewayUpdate(gatewayPayload);
            }
        } catch (error) {
            console.error("Heartbeat error:", error.message);
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

    onClientError(client, error) {
        console.error(`[MQTT ERROR] ${client.id}:`, error.message);
    }

    onConnectionError(client, error) {
        console.error(`[MQTT] Connection error:`, error.message);
    }
}

module.exports = MQTTHandlers;
