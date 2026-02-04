const axios = require('axios');

const AVAILABLE_NODES_URL =
  process.env.CONTROL_MODULE_AVAILABLE_NODES_URL ||
  'http://127.0.0.1:8100/api/available-nodes';
const POLL_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = Number(process.env.DEVICE_ACTIVITY_REQUEST_TIMEOUT_MS) || 5_000;
const DEFAULT_GATEWAY_STATUS = 'inactive';
const ONLINE_GATEWAY_STATUS = 'online';

class DeviceActivityService {
  constructor() {
    this.httpClient = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
    });
    this.whitelist = this.createEmptyWhitelist();
    this.manualWhitelist = this.createEmptyWhitelist();
    this.pollTimer = null;
    this.isFetching = false;
    this.gatewayStatuses = new Map();
    this.startPolling();
    void this.fetchWhitelist();
    //console.log('[deviceActivityService] initialized, polling every 30s');
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

  normalizeGatewayId(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      const candidate = value.gateway_id ?? value.gatewayId ?? value.id ?? value.gateway;
      if (candidate === null || candidate === undefined) {
        return null;
      }
      return String(candidate);
    }
    return String(value);
  }

  normalizeNodeId(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      const candidate = value.node_id ?? value.nodeId ?? value.id ?? value.node;
      if (candidate === null || candidate === undefined) {
        return null;
      }
      return String(candidate);
    }
    return String(value);
  }

  addGatewayNodes(map, gatewayId, nodes) {
    const normalizedGatewayId = this.normalizeGatewayId(gatewayId);
    if (!normalizedGatewayId) {
      return;
    }

    if (!map.has(normalizedGatewayId)) {
      map.set(normalizedGatewayId, new Set());
    }

    const target = map.get(normalizedGatewayId);
    const nodeList = Array.isArray(nodes) ? nodes : [nodes];
    nodeList.forEach((node) => {
      const normalizedNodeId = this.normalizeNodeId(node);
      if (normalizedNodeId) {
        target.add(normalizedNodeId);
      }
    });
  }

  normalizeGatewayNodes(raw) {
    const map = new Map();
    if (!raw) {
      return map;
    }

    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (!entry) {
          return;
        }
        const gatewayId =
          entry.gateway_id ??
          entry.gatewayId ??
          entry.gateway ??
          entry.id;
        const singleNode =
          entry.node_id ??
          entry.nodeId ??
          entry.node;
        const nodes =
          entry.nodes ??
          entry.node_ids ??
          entry.nodeIds ??
          entry.node_list ??
          entry.nodeList ??
          entry.whitelist ??
          (singleNode ? [singleNode] : undefined);
        this.addGatewayNodes(map, gatewayId, nodes);
      });
      return map;
    }

    if (typeof raw === 'object') {
      Object.entries(raw).forEach(([gatewayId, nodes]) => {
        this.addGatewayNodes(map, gatewayId, nodes);
      });
    }

    return map;
  }

  mergeGatewayNodeMaps(primary, secondary) {
    const base = primary instanceof Map ? primary : new Map();
    const extra = secondary instanceof Map ? secondary : new Map();
    const merged = new Map();

    const mergeInto = (gatewayId, nodes) => {
      if (!merged.has(gatewayId)) {
        merged.set(gatewayId, new Set());
      }
      const target = merged.get(gatewayId);
      (nodes || new Set()).forEach((nodeId) => target.add(String(nodeId)));
    };

    base.forEach((nodes, gatewayId) => mergeInto(gatewayId, nodes));
    extra.forEach((nodes, gatewayId) => mergeInto(gatewayId, nodes));

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

  async fetchWhitelist() {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;
    //console.log('[deviceActivityService] polling available nodes...');

    try {
      const response = await this.httpClient.get(AVAILABLE_NODES_URL);
      const payload = response?.data;

      if (!payload || payload.success !== true || !payload.data) {
        throw new Error('Available nodes response invalid');
      }

      const {
        gateways = [],
        nodes = [],
        node_controllers = [],
        node_sensors = [],
        gateway_nodes,
        gatewayNodes,
        gateway_nodes_map,
        gatewayNodesMap,
        nodes_by_gateway,
        nodesByGateway,
        gateways_with_nodes,
        gatewaysWithNodes,
      } = payload.data;

      const gatewayNodesFromPayload = this.normalizeGatewayNodes(
        gateway_nodes ??
          gatewayNodes ??
          gateway_nodes_map ??
          gatewayNodesMap ??
          nodes_by_gateway ??
          nodesByGateway ??
          gateways_with_nodes ??
          gatewaysWithNodes
      );
      const gatewayNodesFromNodes = this.normalizeGatewayNodes(nodes);
      const remoteWhitelist = {
        gateways: new Set(gateways.map((value) => String(value))),
        nodes: new Set(
          nodes
            .map((value) => this.normalizeNodeId(value))
            .filter((value) => value)
        ),
        gatewayNodes: this.mergeGatewayNodeMaps(gatewayNodesFromPayload, gatewayNodesFromNodes),
        nodeControllers: new Set(node_controllers.map((value) => String(value))),
        nodeSensors: new Set(node_sensors.map((value) => String(value))),
      };
      this.whitelist = this.mergeWhitelists(remoteWhitelist, this.manualWhitelist);
      this.syncGatewayStatuses(Array.from(this.whitelist.gateways));

      // console.log(
      //   '[deviceActivityService] whitelist updated',
      //   {
      //     gateways: gateways.length,
      //     nodes: nodes.length,
      //     nodeControllers: node_controllers.length,
      //     nodeSensors: node_sensors.length,
      //   }
      // );
    } catch (error) {
      console.error('[deviceActivityService] failed to refresh whitelist:', error.message);
      this.whitelist = this.mergeWhitelists(this.createEmptyWhitelist(), this.manualWhitelist);
      this.syncGatewayStatuses(Array.from(this.whitelist.gateways));
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
    gateway_nodes,
    node_controllers = [],
    node_sensors = [],
  } = {}) {
    this.manualWhitelist = {
      gateways: new Set((gateways || []).map((value) => String(value))),
      nodes: new Set(
        (nodes || [])
          .map((value) => this.normalizeNodeId(value))
          .filter((value) => value)
      ),
      gatewayNodes: this.normalizeGatewayNodes(gateway_nodes),
      nodeControllers: new Set((node_controllers || []).map((value) => String(value))),
      nodeSensors: new Set((node_sensors || []).map((value) => String(value))),
    };

    console.log('[deviceActivityService] whitelist overridden manually');
    this.whitelist = this.mergeWhitelists(this.whitelist, this.manualWhitelist);
    this.syncGatewayStatuses(Array.from(this.whitelist.gateways));
  }

  getWhitelistSnapshot() {
    const current = this.whitelist || this.createEmptyWhitelist();
    const gatewayNodes = {};
    (current.gatewayNodes || new Map()).forEach((nodes, gatewayId) => {
      gatewayNodes[gatewayId] = Array.from(nodes);
    });
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

    const normalizedGatewayId = gatewayId ? String(gatewayId) : null;
    const normalizedNodeId = String(nodeId);
    const gatewayNodes = this.whitelist.gatewayNodes;

    if (gatewayNodes && normalizedGatewayId && gatewayNodes.has(normalizedGatewayId)) {
      return gatewayNodes.get(normalizedGatewayId).has(normalizedNodeId);
    }

    return this.isNodeAllowed(normalizedNodeId);
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
      this.normalizeGatewayStatus(status)
    );
  }

  getGatewayStatus(gatewayId) {
    if (!gatewayId) {
      return DEFAULT_GATEWAY_STATUS;
    }
    return (
      this.gatewayStatuses.get(String(gatewayId)) || DEFAULT_GATEWAY_STATUS
    );
  }

  syncGatewayStatuses(gatewayIds) {
    const normalizedIds = (gatewayIds || []).map((value) => String(value));
    const updated = new Map();
    normalizedIds.forEach((id) => {
      updated.set(id, this.gatewayStatuses.get(id) || DEFAULT_GATEWAY_STATUS);
    });
    this.gatewayStatuses = updated;
  }

  normalizeGatewayStatus(status) {
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
