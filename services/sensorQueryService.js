const { aggregateData } = require('../models')

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
    timestamp_from,
    timestamp_to,
    limit: limitParam = '200',
    page: pageParam = '1'
  } = query

  const selectedMetric = normalizeMetric(metric || sensor_type)
  const sensorIds = buildParamList(sensor_id)
  const nodeIds = buildParamList(node_id)
  const gatewayIds = buildParamList(gateway_id)

  const limit = Math.max(1, Math.min(500, Number(limitParam) || 200))
  const page = Math.max(1, Number(pageParam) || 1)
  const skip = (page - 1) * limit

  const timestampMatch = {}
  if (timestamp_from) {
    const fromDate = new Date(String(timestamp_from))
    if (!Number.isNaN(fromDate.getTime())) {
      timestampMatch.$gte = fromDate
    }
  }
  if (timestamp_to) {
    const toDate = new Date(String(timestamp_to))
    if (!Number.isNaN(toDate.getTime())) {
      timestampMatch.$lte = toDate
    }
  }

  // If no filter params are provided, this match object only keeps event_type != heartbeat,
  // which means the query returns all sensor_readings with pagination.
  const match = {
    ...(sensorIds.length > 0 && { sensor_id: { $in: sensorIds } }),
    ...(nodeIds.length > 0 && { node_id: { $in: nodeIds } }),
    ...(gatewayIds.length > 0 && { gateway_id: { $in: gatewayIds } }),
    ...(Object.keys(timestampMatch).length > 0 && { timestamp: timestampMatch }),
    event_type: { $ne: 'heartbeat' },
    ...(selectedMetric && { metric: selectedMetric })
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
