const express = require('express');
const deviceWhiteList = require('../services/deviceWhiteList');

function createWhitelistRouter({ deviceWhiteListService = deviceWhiteList, onWhitelistUpdated } = {}) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    return res.json({
      success: true,
      message: 'Whitelist snapshot',
      data: deviceWhiteListService.getWhitelistSnapshot(),
    });
  });

  router.post('/', async (req, res) => {
    const { gateways, nodes, gateway_nodes, node_controllers, node_sensors } = req.body || {};

    deviceWhiteListService.overrideWhitelist({
      gateways,
      nodes,
      gateway_nodes,
      node_controllers,
      node_sensors,
    });

    const snapshot = deviceWhiteListService.getWhitelistSnapshot();
    let warning = null;

    if (typeof onWhitelistUpdated === 'function') {
      try {
        await onWhitelistUpdated(snapshot);
      } catch (error) {
        warning = error?.message || 'Failed to publish whitelist to gateways';
      }
    }

    return res.json({
      success: true,
      message: warning ? 'Whitelist overridden with sync warning' : 'Whitelist overridden',
      ...(warning ? { warning } : {}),
      data: snapshot,
    });
  });

  return router;
}

const router = createWhitelistRouter();

module.exports = {
  router,
  createWhitelistRouter,
};
