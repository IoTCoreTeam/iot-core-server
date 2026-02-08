const axios = require('axios');

const AVAILABLE_NODES_URL =
  process.env.CONTROL_MODULE_AVAILABLE_NODES_URL ||
  'http://127.0.0.1:8000/api/available-nodes';
const POLL_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = Number(process.env.DEVICE_ACTIVITY_REQUEST_TIMEOUT_MS) || 5000;
const DEFAULT_GATEWAY_STATUS = 'inactive';
const ONLINE_GATEWAY_STATUS = 'online';

class DeviceActivityService {
  constructor() {
    this.httpClient = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
    });
    this.remoteWhitelist = this.createEmptyWhitelist();
    this.manualWhitelist = this.createEmptyWhitelist();
    this.whitelist = this.createEmptyWhitelist();
    this.pollTimer = null;
    this.isFetching = false;
    this.gatewayStatuses = new Map();
    this.startPolling();
    void this.fetchWhitelist();
  }

  createEmptyWhitelist() {
    return {
      gateways: new Set(),
      nodes: new Set(),
      gatewayNodes: new Map(),
      nodeControllers: new Set(),
      nodeSensors: new Set(),
    };
  }

  createGatewayNodeMap(gateways, nodes, gatewayNodesRaw) {
    const map = new Map();

    if (gatewayNodesRaw && typeof gatewayNodesRaw === 'object' && !Array.isArray(gatewayNodesRaw)) {
      for (const [gatewayId, nodeList] of Object.entries(gatewayNodesRaw)) {
        if (!gatewayId) {
          continue;
        }
        const validNodes = Array.isArray(nodeList) ? nodeList.map(String) : [];
        map.set(String(gatewayId), new Set(validNodes));
      }
    } else if (gateways.length === 1) {
      map.set(gateways[0], new Set(nodes));
    } else if (gateways.length > 1 && nodes.length > 0) {
      console.warn(
        '[deviceActivityService] gateway_nodes is missing while multiple gateways exist. Node mapping is empty per gateway.'
      );
    }

    for (const gatewayId of gateways) {
      if (!map.has(gatewayId)) {
        map.set(gatewayId, new Set());
      }
    }

    return map;
  }

  createWhitelistFromRaw({
    gateways = [],
    nodes = [],
    gateway_nodes = null,
    node_controllers = [],
    node_sensors = [],
  } = {}) {
    const gatewayList = Array.isArray(gateways) ? gateways.map(String) : [];
    const nodeList = Array.isArray(nodes) ? nodes.map(String) : [];
    const controllerList = Array.isArray(node_controllers)
      ? node_controllers.map(String)
      : [];
    const sensorList = Array.isArray(node_sensors) ? node_sensors.map(String) : [];

    return {
      gateways: new Set(gatewayList),
      nodes: new Set(nodeList),
      gatewayNodes: this.createGatewayNodeMap(gatewayList, nodeList, gateway_nodes),
      nodeControllers: new Set(controllerList),
      nodeSensors: new Set(sensorList),
    };
  }

  mergeGatewayNodeMaps(primary, secondary) {
    const merged = new Map();
    const mergeMap = (source) => {
      for (const [gatewayId, nodeSet] of source.entries()) {
        if (!merged.has(gatewayId)) {
          merged.set(gatewayId, new Set());
        }
        for (const nodeId of nodeSet) {
          merged.get(gatewayId).add(nodeId);
        }
      }
    };

    mergeMap(primary instanceof Map ? primary : new Map());
    mergeMap(secondary instanceof Map ? secondary : new Map());
    return merged;
  }

  mergeWhitelists(primary, secondary) {
    const base = primary || this.createEmptyWhitelist();
    const extra = secondary || this.createEmptyWhitelist();
    return {
      gateways: new Set([...base.gateways, ...extra.gateways]),
      nodes: new Set([...base.nodes, ...extra.nodes]),
      gatewayNodes: this.mergeGatewayNodeMaps(base.gatewayNodes, extra.gatewayNodes),
      nodeControllers: new Set([...base.nodeControllers, ...extra.nodeControllers]),
      nodeSensors: new Set([...base.nodeSensors, ...extra.nodeSensors]),
    };
  }

  applyMergedWhitelist() {
    this.whitelist = this.mergeWhitelists(this.remoteWhitelist, this.manualWhitelist);
    this.syncGatewayStatuses(Array.from(this.whitelist.gateways));
  }

  async fetchWhitelist() {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;
    try {
      const response = await this.httpClient.get(AVAILABLE_NODES_URL);
      const payload = response?.data;
      if (!payload || payload.success !== true || !payload.data) {
        throw new Error('Available nodes response invalid');
      }

      this.remoteWhitelist = this.createWhitelistFromRaw(payload.data);
      this.applyMergedWhitelist();
    } catch (error) {
      console.error('[deviceActivityService] failed to refresh whitelist:', error.message);
      this.remoteWhitelist = this.createEmptyWhitelist();
      this.applyMergedWhitelist();
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

  overrideWhitelist({
    gateways = [],
    nodes = [],
    gateway_nodes = null,
    node_controllers = [],
    node_sensors = [],
  } = {}) {
    this.manualWhitelist = this.createWhitelistFromRaw({
      gateways,
      nodes,
      gateway_nodes,
      node_controllers,
      node_sensors,
    });
    console.log('[deviceActivityService] whitelist overridden manually');
    this.applyMergedWhitelist();
  }

  getWhitelistSnapshot() {
    const current = this.whitelist || this.createEmptyWhitelist();
    const gatewayNodes = {};
    for (const [gatewayId, nodes] of current.gatewayNodes.entries()) {
      gatewayNodes[gatewayId] = Array.from(nodes);
    }
    return {
      gateways: Array.from(current.gateways).map((id) => ({
        id,
        status: this.getGatewayStatus(id),
      })),
      nodes: Array.from(current.nodes),
      gateway_nodes: gatewayNodes,
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

  isNodeAllowedForGateway(gatewayId, nodeId) {
    if (!this.whitelist || !nodeId) {
      return false;
    }
    const key = gatewayId ? String(gatewayId) : '';
    const nodeKey = String(nodeId);
    if (key && this.whitelist.gatewayNodes.has(key)) {
      return this.whitelist.gatewayNodes.get(key).has(nodeKey);
    }
    return this.isNodeAllowed(nodeKey);
  }

  isSensorAllowed(sensorId) {
    if (!this.whitelist || !sensorId) {
      return false;
    }
    return this.whitelist.nodeSensors.has(String(sensorId));
  }

  setGatewayStatus(gatewayId, status = DEFAULT_GATEWAY_STATUS) {
    if (!gatewayId) {
      return;
    }
    this.gatewayStatuses.set(
      String(gatewayId),
      this.toGatewayStatus(status)
    );
  }

  getGatewayStatus(gatewayId) {
    if (!gatewayId) {
      return DEFAULT_GATEWAY_STATUS;
    }
    return this.gatewayStatuses.get(String(gatewayId)) || DEFAULT_GATEWAY_STATUS;
  }

  syncGatewayStatuses(gatewayIds) {
    const updated = new Map();
    const list = Array.isArray(gatewayIds) ? gatewayIds : [];
    for (const gatewayId of list) {
      const key = String(gatewayId);
      updated.set(key, this.gatewayStatuses.get(key) || DEFAULT_GATEWAY_STATUS);
    }
    this.gatewayStatuses = updated;
  }

  toGatewayStatus(status) {
    if (typeof status !== 'string') {
      return DEFAULT_GATEWAY_STATUS;
    }
    return status.trim().toLowerCase() === ONLINE_GATEWAY_STATUS
      ? ONLINE_GATEWAY_STATUS
      : DEFAULT_GATEWAY_STATUS;
  }
}

const deviceActivityService = new DeviceActivityService();

module.exports = deviceActivityService;
module.exports.DeviceActivityService = DeviceActivityService;
