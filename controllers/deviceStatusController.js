function normalizeBooleanState(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', '1', 'open', 'opened', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', '0', 'close', 'closed', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function resolveDigitalState(device) {
  if (!device || typeof device !== 'object') {
    return null;
  }
  const raw = device.status ?? device.value ?? null;
  return normalizeBooleanState(raw);
}

function isDigitalDevice(device) {
  const type = String(device?.type ?? '').toLowerCase();
  return type === 'digital';
}

function resolveCommandDeviceName(nodeId, device) {
  if (!device) {
    return null;
  }
  if (typeof device.name === 'string' && device.name.trim().length > 0) {
    return device.name.trim();
  }
  if (typeof device.id === 'string' && nodeId) {
    const prefix = `${nodeId}-`;
    if (device.id.startsWith(prefix)) {
      return device.id.slice(prefix.length);
    }
  }
  return typeof device.id === 'string' ? device.id : null;
}

function createDeviceStatusController({ mqttHandlers, controlCommandService }) {
  if (!mqttHandlers) {
    throw new Error('mqttHandlers is required');
  }

  function getStatus(req, res) {
    const gateways = mqttHandlers.getGatewaySnapshotList();
    return res.json({
      success: true,
      data: gateways,
    });
  }

  async function ensureAllDigitalOff(req, res) {
    if (!controlCommandService) {
      return res.status(500).json({
        success: false,
        message: 'controlCommandService is not configured',
      });
    }

    const gateways = mqttHandlers.getGatewaySnapshotList();
    const summary = {
      totalDigital: 0,
      forcedOff: 0,
      alreadyOff: 0,
      unknownState: 0,
      errors: [],
    };

    for (const gateway of gateways) {
      const gatewayId = gateway?.id ?? gateway?.gateway_id ?? null;
      const nodes = Array.isArray(gateway?.nodes) ? gateway.nodes : [];
      for (const node of nodes) {
        const nodeId = node?.id ?? node?.node_id ?? null;
        const devices = Array.isArray(node?.devices) ? node.devices : [];
        for (const device of devices) {
          if (!isDigitalDevice(device)) {
            continue;
          }
          summary.totalDigital += 1;
          const state = resolveDigitalState(device);
          if (state === null) {
            summary.unknownState += 1;
            continue;
          }
          if (state === false) {
            summary.alreadyOff += 1;
            continue;
          }
          const deviceName = resolveCommandDeviceName(nodeId, device);
          if (!gatewayId || !deviceName) {
            summary.errors.push({
              gateway_id: gatewayId,
              node_id: nodeId,
              device: deviceName,
              message: 'Missing gateway_id or device name',
            });
            continue;
          }
          try {
            controlCommandService.enqueue({
              gateway_id: String(gatewayId),
              node_id: nodeId ? String(nodeId) : null,
              device: deviceName,
              state: 'off',
            });
            summary.forcedOff += 1;
          } catch (error) {
            summary.errors.push({
              gateway_id: gatewayId,
              node_id: nodeId,
              device: deviceName,
              message: error?.message || 'Failed to enqueue off command',
            });
          }
        }
      }
    }

    return res.json({
      success: summary.errors.length === 0,
      data: summary,
    });
  }

  return {
    getStatus,
    ensureAllDigitalOff,
  };
}

module.exports = {
  createDeviceStatusController,
};
