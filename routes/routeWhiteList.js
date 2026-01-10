const express = require('express');
const deviceWhiteList = require('../services/deviceWhiteList');

const router = express.Router();

router.get('/', (_req, res) => {
  return res.json({
    success: true,
    message: 'Whitelist snapshot',
    data: deviceWhiteList.getWhitelistSnapshot(),
  });
});

router.post('/', (req, res) => {
  const { gateways, nodes, node_controllers, node_sensors } = req.body || {};
  deviceWhiteList.overrideWhitelist({ gateways, nodes, node_controllers, node_sensors });
  return res.json({
    success: true,
    message: 'Whitelist overridden',
    data: deviceWhiteList.getWhitelistSnapshot(),
  });
});

module.exports = {
  router,
};
