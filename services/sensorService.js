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

  // NEW PIPELINE matching actual data structure:
  // gateway.nodes[].devices[] where device = {id, type, name, value, unit, timestamp}

  const pipeline = [
    { $unwind: '$gateway.nodes' },
    { $unwind: '$gateway.nodes.devices' },
    {
      $match: {
        'gateway.nodes.devices.type': sensor_type,
        ...(sensorIds.length > 0 && { 'gateway.nodes.devices.id': { $in: sensorIds } })
      }
    }
  ]

  const baseProjection = {
    _id: '$_id',
    id: '$gateway.nodes.devices.id',
    type: '$gateway.nodes.devices.type',
    name: '$gateway.nodes.devices.name',
    value: '$gateway.nodes.devices.value',
    unit: '$gateway.nodes.devices.unit',
    timestamp: '$gateway.nodes.devices.timestamp'
  }

  if (normalizedTimeField === 'sec') {
    // Return individual records sorted by timestamp
    pipeline.push(
      { $sort: { 'gateway.nodes.devices.timestamp': -1 } },
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
            date: '$gateway.nodes.devices.timestamp',
            unit: bucketUnit
          }
        }
      }
    },
    { $sort: { 'gateway.nodes.devices.timestamp': -1 } },
    {
      $group: {
        _id: {
          sensorId: '$gateway.nodes.devices.id',
          bucketTime: '$bucketTime'
        },
        doc: { $first: '$$ROOT' }
      }
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { 'gateway.nodes.devices.timestamp': -1 } },
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
