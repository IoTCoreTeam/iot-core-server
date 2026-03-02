const { aggregateData } = require('../models/sensorModel')

const buildParamList = (value) => {
  if (!value) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

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

const getMetricData = async (query = {}) => {
  const {
    metric,
    sensor_type,
    sensor_id,
    node_id,
    gateway_id,
    limit: limitParam = '200',
    page: pageParam = '1'
  } = query

  const selectedMetric = normalizeMetric(metric || sensor_type)
  const sensorIds = buildParamList(sensor_id)
  const nodeIds = buildParamList(node_id)
  const gatewayIds = buildParamList(gateway_id)

  if (!selectedMetric && sensorIds.length === 0 && nodeIds.length === 0 && gatewayIds.length === 0) {
    const err = new Error('At least one filter param is required')
    err.statusCode = 400
    throw err
  }

  const limit = Math.max(1, Math.min(500, Number(limitParam) || 200))
  const page = Math.max(1, Number(pageParam) || 1)
  const skip = (page - 1) * limit

  const match = {
    ...(sensorIds.length > 0 && { sensor_id: { $in: sensorIds } }),
    ...(nodeIds.length > 0 && { node_id: { $in: nodeIds } }),
    ...(gatewayIds.length > 0 && { gateway_id: { $in: gatewayIds } }),
    event_type: { $ne: 'heartbeat' },
    metric: selectedMetric ? selectedMetric : { $exists: true }
  }

  const baseProject = {
    _id: 1,
    gateway_id: 1,
    node_id: 1,
    sensor_id: 1,
    metric: 1,
    value: 1,
    unit: 1,
    timestamp: 1,
    raw: 1
  }

  const pipeline = sensorIds.length > 0
    ? [
        { $match: match },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$sensor_id',
            doc: { $first: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { timestamp: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: baseProject },
        { $sort: { timestamp: 1 } }
      ]
    : [
        { $match: match },
        { $sort: { timestamp: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: baseProject },
        { $sort: { timestamp: 1 } }
      ]

  return aggregateData(pipeline)
}

module.exports = {
  getMetricData
}
