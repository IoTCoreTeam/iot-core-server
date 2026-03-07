const { aggregateData } = require('../models')
const { metrics } = require('../config/metrics')

const normalizeMetric = (value) => {
  if (!value) return value
  const key = String(value).toLowerCase()
  const map = {
    soil_moisture: 'soil',
    soilmoisture: 'soil',
    air_humidity: 'humidity',
    airhumidity: 'humidity'
  }
  return map[key] || key
}

const buildMetricNodeMap = (rows = []) => {
  const map = new Map()
  rows.forEach((row) => {
    if (!row?._id) return
    map.set(row._id, Array.isArray(row.nodes) ? row.nodes : [])
  })
  return map
}

const getMetricNodes = async () => {
  const pipeline = [
    {
      $match: {
        event_type: { $ne: 'heartbeat' },
        metric: { $exists: true },
        node_id: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$metric',
        nodes: { $addToSet: '$node_id' }
      }
    },
    {
      $project: {
        _id: 1,
        nodes: 1
      }
    }
  ]

  const rows = await aggregateData(pipeline)
  const map = buildMetricNodeMap(rows)

  return metrics.map((metric) => {
    const normalized = normalizeMetric(metric.key)
    return {
      key: metric.key,
      nodes: map.get(normalized) || []
    }
  })
}

module.exports = {
  getMetricNodes
}
