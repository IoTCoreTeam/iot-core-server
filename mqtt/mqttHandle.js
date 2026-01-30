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
        try {
            const espData = JSON.parse(payload);
            const {
                gateway_id, gateway_ip, gateway_mac,
                node_id, node_ip, node_mac,
                sensors,  // ARRAY OF 4 SENSORS
                sensor_timestamp, gateway_timestamp,
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
                : derivedSensors; // (sensors || []).filter(sensor => deviceWhiteList.isSensorAllowed(sensor.id));

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
                return;
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

            // Always keep only the latest node payload and save immediately
            buffer.nodes = { [node_id]: nodeData };
            buffer.gateway_info.lastSeen = new Date(gateway_timestamp);
            buffer.gateway_info.ip = gateway_ip || buffer.gateway_info.ip;
            buffer.gateway_info.mac = gateway_mac || buffer.gateway_info.mac;
            buffer.gateway_info.status = deviceWhiteList.getGatewayStatus(gateway_id);
            buffer.gateway_info.registered = isRegistered;

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
                buffer.timer = null;
            }

            const receivedAt = new Date();
            const documents = Object.values(buffer.nodes).flatMap((node) =>
                (node.devices || []).map((device) => ({
                    gateway_id: gateway_id,
                    node_id: node.id,
                    sensor_id: device.id,
                    metric: device.type,
                    value: device.value,
                    unit: device.unit,
                    timestamp: device.timestamp || receivedAt,
                    ...(device.raw !== undefined ? { raw: device.raw } : {}),
                    ...(device.status !== undefined ? { status: device.status } : {}),
                }))
            );


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

    // ═══════════════════════════════════════════════════════════════
    // LƯU BUFFER VÀO MONGODB
    // ═══════════════════════════════════════════════════════════════

    async handleHeartbeat(payload, client) {
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
                return;
            }

            deviceWhiteList.setGatewayStatus(gateway_id, normalizedStatus);
            console.log('[heartbeat] received');

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
