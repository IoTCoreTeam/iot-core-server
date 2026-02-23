const express = require('express');
const { metrics } = require('../config/metrics');

const routeMetrics = express.Router();

routeMetrics.get('/', (_req, res) => {
  res.json(metrics);
});

module.exports = {
  routeMetrics,
};
