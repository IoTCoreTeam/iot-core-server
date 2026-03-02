const express = require('express');
const { metrics } = require('../config/metrics');
const { fetchMetricNodes } = require('../controllers/metricController');

const routeMetrics = express.Router();

routeMetrics.get('/', (_req, res) => {
  res.json(metrics);
});
routeMetrics.get('/nodes', fetchMetricNodes);

module.exports = {
  routeMetrics,
};
