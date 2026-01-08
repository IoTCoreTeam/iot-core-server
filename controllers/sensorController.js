const { getMetricData } = require("../services/sensorService");

async function fetchMetricData(req, res) {
  try {
    const metrics = await getMetricData(req.query);
    res.json(metrics);
  } catch (error) {
    console.error("[sensorController] Error fetching metric data:", error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
}

module.exports = {
  fetchMetricData,
};
