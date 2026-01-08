const axios = require('axios');

const AVAILABLE_NODES_URL =
  process.env.CONTROL_MODULE_AVAILABLE_NODES_URL ||
  'http://127.0.0.1:8100/api/available-nodes';
const POLL_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = Number(process.env.DEVICE_ACTIVITY_REQUEST_TIMEOUT_MS) || 5_000;

class DeviceActivityService {
  constructor() {
    this.httpClient = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
    });
    this.whitelist = this.createEmptyWhitelist();
    this.pollTimer = null;
    this.isFetching = false;
    this.startPolling();
    void this.fetchWhitelist();
    console.log('[deviceActivityService] initialized, polling every 30s');
  }

  createEmptyWhitelist() {
    return {
      gateways: new Set(),
      nodes: new Set(),
      nodeControllers: new Set(),
      nodeSensors: new Set(),
    };
  }

  async fetchWhitelist() {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;
    console.log('[deviceActivityService] polling available nodes...');

    try {
      const response = await this.httpClient.get(AVAILABLE_NODES_URL);
      const payload = response?.data;

      if (!payload || payload.success !== true || !payload.data) {
        throw new Error('Available nodes response invalid');
      }

      const { gateways = [], nodes = [], node_controllers = [], node_sensors = [] } = payload.data;

      this.whitelist = {
        gateways: new Set(gateways.map((value) => String(value))),
        nodes: new Set(nodes.map((value) => String(value))),
        nodeControllers: new Set(node_controllers.map((value) => String(value))),
        nodeSensors: new Set(node_sensors.map((value) => String(value))),
      };

      console.log(
        '[deviceActivityService] whitelist updated',
        {
          gateways: gateways.length,
          nodes: nodes.length,
          nodeControllers: node_controllers.length,
          nodeSensors: node_sensors.length,
        }
      );
    } catch (error) {
      console.error('[deviceActivityService] failed to refresh whitelist:', error.message);
      this.whitelist = null;
    } finally {
      this.isFetching = false;
    }
  }

  startPolling() {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.fetchWhitelist();
    }, POLL_INTERVAL_MS);
  }

  overrideWhitelist({ gateways = [], nodes = [], node_controllers = [], node_sensors = [] } = {}) {
    this.whitelist = {
      gateways: new Set((gateways || []).map((value) => String(value))),
      nodes: new Set((nodes || []).map((value) => String(value))),
      nodeControllers: new Set((node_controllers || []).map((value) => String(value))),
      nodeSensors: new Set((node_sensors || []).map((value) => String(value))),
    };

    console.log('[deviceActivityService] whitelist overridden manually');
  }

  getWhitelistSnapshot() {
    const current = this.whitelist || this.createEmptyWhitelist();
    return {
      gateways: Array.from(current.gateways),
      nodes: Array.from(current.nodes),
      node_controllers: Array.from(current.nodeControllers),
      node_sensors: Array.from(current.nodeSensors),
    };
  }

  isGatewayAllowed(gatewayId) {
    if (!this.whitelist || !gatewayId) {
      return false;
    }

    return this.whitelist.gateways.has(String(gatewayId));
  }

  isNodeAllowed(nodeId) {
    if (!this.whitelist || !nodeId) {
      return false;
    }

    return this.whitelist.nodes.has(String(nodeId));
  }

  isSensorAllowed(sensorId) {
    if (!this.whitelist || !sensorId) {
      return false;
    }

    return this.whitelist.nodeSensors.has(String(sensorId));
  }
}

const deviceActivityService = new DeviceActivityService();

module.exports = deviceActivityService;
module.exports.DeviceActivityService = DeviceActivityService;
