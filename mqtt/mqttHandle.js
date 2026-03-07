const handleSensorData = require('./handlers/handleSensorData'); // handler: sensor data
const handleHeartbeat = require('./handlers/handleHeartbeat'); // handler: gateway heartbeat
const handleNodeHeartbeat = require('./handlers/handleNodeHeartbeat'); // handler: node/controller heartbeat
const handleServoAck = require('./handlers/handleServoAck'); // handler: servo ack
const handleControlAck = require('./handlers/handleControlAck'); // handler: control/actuator ack
const timeUtils = require('./utils/time'); // utils: time normalization/format
const statusUtils = require('./utils/status'); // utils: status + node type
const whitelistUtils = require('./utils/whitelist'); // utils: whitelist checks
const ssePayloadUtils = require('./utils/ssePayload'); // utils: SSE payload builders
const bufferService = require('./services/bufferService'); // service: buffer + SSE emit
const heartbeatService = require('./services/heartbeatService'); // service: heartbeat timers/summary

class MQTTHandlers {
    constructor(dependencies) {
        this.deviceWhitelist = dependencies.deviceWhitelist; // injected whitelist service
        this.rateLimiters = dependencies.rateLimiters; // rate limiter registry
        this.getRateLimiter = dependencies.getRateLimiter; // rate limiter accessor
        this.dbGetter = dependencies.db; // db getter fn
        this.aedes = dependencies.aedes; // mqtt broker instance
        this.config = dependencies.config; // runtime config
        this.sseService = dependencies.sseService; // SSE push service

        this.nodeBuffer = new Map(); // gateway -> nodes buffer
        this.BUFFER_TIMEOUT = 10000; // buffer expiry (ms)
        this.nodeHeartbeatStatus = new Map(); // gateway -> node heartbeat map
        this.gatewayNetworkInfo = new Map(); // gateway -> ip/mac cache
        this.HEARTBEAT_SUMMARY_INTERVAL = 30000; // summary log interval (ms)
        this.lastHeartbeatSummaryAt = 0; // last summary timestamp
        this.HEARTBEAT_TIMEOUT_MS = Number(this.config?.HEARTBEAT_TIMEOUT_MS || 45000); // heartbeat timeout (ms)
    }

    get db() {
        return this.dbGetter(); // lazy db access
    }

    onClientConnected(client) {
        console.log(`\n[MQTT] Gateway Connected: ${client.id}`); // log connect
    }

    onClientDisconnected(client) {
        console.log(`\n[MQTT] Gateway Disconnected: ${client.id}`); // log disconnect
    }

    onSubscribe(subscriptions, client) {
        console.log(`\n[MQTT] ${client.id} subscribed to:`); // log subscriptions
        subscriptions.forEach(sub => {
            console.log(`  - ${sub.topic}`); // log each topic
        });
    }

    async onPublish(packet, client) {
        if (!client || packet.topic.startsWith('$SYS')) { // ignore broker/system topics
            return;
        }

        const topic = packet.topic; // mqtt topic
        const payload = packet.payload.toString(); // mqtt payload

        if (topic === 'esp32/sensors/data') { // sensor data topic
            await this.handleSensorData(payload, client); // delegate to handler
        } else if (topic === 'esp32/heartbeat') { // gateway heartbeat topic
            await this.handleHeartbeat(payload, client); // delegate to handler
        } else if (topic === 'esp32/nodes/heartbeat' || topic === 'esp32/controllers/heartbeat') { // node heartbeat topic
            await this.handleNodeHeartbeat(payload, client); // delegate to handler
        } else if (topic === 'esp32/servo/ack') { // servo ack topic
            await this.handleServoAck(payload, client); // delegate to handler
        } else if (topic === 'esp32/control/ack' || topic === 'esp32/actuator/ack') { // control ack topic
            await this.handleControlAck(payload, topic); // delegate to handler
        }
    }

    normalizeTimestamp(value) {
        return timeUtils.normalizeTimestamp(value); // normalize time input
    }

    getWhitelistService() {
        return whitelistUtils.getWhitelistService(this); // resolve whitelist service
    }

    isGatewayRegistered(gatewayId) {
        return whitelistUtils.isGatewayRegistered(this, gatewayId); // check gateway whitelist
    }

    isNodeRegisteredForGateway(gatewayId, nodeId) {
        return whitelistUtils.isNodeRegisteredForGateway(this, gatewayId, nodeId); // check node whitelist
    }

    normalizeOnlineStatus(value) {
        return statusUtils.normalizeOnlineStatus(value); // normalize status string
    }

    formatLocalIso(value) {
        return timeUtils.formatLocalIso(value); // format local ISO timestamp
    }

    formatTimestampForSse(value) {
        return timeUtils.formatTimestampForSse(value); // format timestamp for SSE
    }

    resolveNodeType(nodeId) {
        return statusUtils.resolveNodeType(nodeId); // derive node type
    }

    buildNodeSsePayload(gatewayId, nodeData) {
        return ssePayloadUtils.buildNodeSsePayload(this, gatewayId, nodeData); // build node payload
    }

    buildGatewaySnapshot(gatewayId, buffer) {
        return ssePayloadUtils.buildGatewaySnapshot(this, gatewayId, buffer); // build gateway snapshot
    }

    getGatewaySnapshotList() {
        return bufferService.getGatewaySnapshotList(this); // list snapshots
    }

    emitGatewayUpdate(gatewayInfo, nodes = null) {
        return bufferService.emitGatewayUpdate(this, gatewayInfo, nodes); // emit SSE update
    }

    emitBufferedGatewayUpdates() {
        return bufferService.emitBufferedGatewayUpdates(this); // emit all buffered updates
    }

    markHeartbeatTimeouts(now = new Date()) {
        return heartbeatService.markHeartbeatTimeouts(this, now); // mark stale nodes/gateways
    }

    async handleSensorData(payload, client) {
        return handleSensorData.call(this, payload, client); // delegate sensor handler
    }

    async handleHeartbeat(payload, client) {
        return handleHeartbeat.call(this, payload, client); // delegate heartbeat handler
    }

    logNodeHeartbeatSummary() {
        return heartbeatService.logNodeHeartbeatSummary(this); // log heartbeat summary
    }

    async handleNodeHeartbeat(payload, client) {
        return handleNodeHeartbeat.call(this, payload, client); // delegate node heartbeat handler
    }

    async handleServoAck(payload, client) {
        return handleServoAck.call(this, payload, client); // delegate servo ack handler
    }

    async handleControlAck(payload, topic) {
        return handleControlAck.call(this, payload, topic); // delegate control ack handler
    }

    onClientError(client, error) {
        console.error(`[MQTT ERROR] ${client.id}:`, error.message); // log client errors
    }

    onConnectionError(client, error) {
        console.error(`[MQTT] Connection error:`, error.message); // log connection errors
    }
}

module.exports = MQTTHandlers; // export class
