const { aggregateData } = require('../models/sensorModel')

const buildSensorIds = (sensorIdParam) => {
  if (!sensorIdParam) return []
  return Array.isArray(sensorIdParam) ? sensorIdParam : [sensorIdParam]
}

const ALLOWED_TIME_FIELDS = ['sec', 'minute', 'hour', 'day']

const getMetricData = async (query = {}) => {
  const {
    sensor_type,
    sensor_id,
    time_field = 'sec',
    limit: limitParam = '30',
    page: pageParam = '1'
  } = query

  if (!sensor_type) {
    const err = new Error('sensor_type is required')
    err.statusCode = 400
    throw err
  }

  const normalizedTimeField = ALLOWED_TIME_FIELDS.includes(time_field)
    ? time_field
    : 'sec'

  const sensorIds = buildSensorIds(sensor_id)
  const limit = Math.max(1, Math.min(100, Number(limitParam) || 30))
  const page = Math.max(1, Number(pageParam) || 1)
  const skip = (page - 1) * limit

  // NEW PIPELINE for flattened documents:
  // measurements[] where measurement = {sensor_id, metric, value, unit, timestamp}

  const pipeline = [
    {
      $match: {
        event_type: 'sensor_reading',
        measurements: { $exists: true, $ne: [] }
      }
    },
    { $unwind: '$measurements' },
    {
      $match: {
        'measurements.metric': sensor_type,
        ...(sensorIds.length > 0 && { 'measurements.sensor_id': { $in: sensorIds } })
      }
    }
  ]

  const baseProjection = {
    _id: '$_id',
    gateway_id: '$gateway_id',
    node_id: '$node_id',
    id: '$measurements.sensor_id',
    type: '$measurements.metric',
    name: '$measurements.metric',
    value: '$measurements.value',
    unit: '$measurements.unit',
    timestamp: '$measurements.timestamp'
  }

  if (normalizedTimeField === 'sec') {
    // Return individual records sorted by timestamp
    pipeline.push(
      { $sort: { 'measurements.timestamp': -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: baseProjection },
      { $sort: { timestamp: 1 } }
    )

    return aggregateData(pipeline)
  }

  // For minute/hour/day, group by time bucket
  let bucketUnit = 'minute'
  if (normalizedTimeField === 'hour') bucketUnit = 'hour'
  if (normalizedTimeField === 'day') bucketUnit = 'day'

  pipeline.push(
    {
      $set: {
        bucketTime: {
          $dateTrunc: {
            date: '$measurements.timestamp',
            unit: bucketUnit
          }
        }
      }
    },
    { $sort: { 'measurements.timestamp': -1 } },
    {
      $group: {
        _id: {
          sensorId: '$measurements.sensor_id',
          bucketTime: '$bucketTime'
        },
        doc: { $first: '$$ROOT' }
      }
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { 'measurements.timestamp': -1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: baseProjection },
    { $sort: { timestamp: 1 } }
  )

  return aggregateData(pipeline)
}

module.exports = {
  getMetricData
}
