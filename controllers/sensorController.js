const { getMetricData } = require("../services/querySensor");

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
  fetchMetricLimit,
};

async function fetchMetricLimit(req, res) {
  try {
    const { metric } = req.params;
    res.json({
      success: true,
      data: null,
      metric: metric || null,
      message: "Metric limit not configured",
    });
  } catch (error) {
    console.error("[sensorController] Error fetching metric limit:", error.message);
    res.status(500).json({ success: false, message: "Metric limit error" });
  }
}
