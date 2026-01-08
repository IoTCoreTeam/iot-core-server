const express = require('express');
const deviceWhiteList = require('../services/deviceWhiteList');

const router = express.Router();

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
