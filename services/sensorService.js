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

  const metricsValueField = `gateway.nodes.devices.metrics.${sensor_type}.value`
  const metricsUnitField = `gateway.nodes.devices.metrics.${sensor_type}.unit`
  const flatValueField = 'gateway.nodes.devices.value'

  const fieldExists = (path) => ({
    [path]: { $exists: true, $ne: null }
  })

  const matchStage = {
    'gateway.nodes.devices.timestamp': { $exists: true },
    $and: [
      {
        $or: [
          { 'gateway.nodes.devices.type': sensor_type },
          fieldExists(metricsValueField)
        ]
      },
      {
        $or: [fieldExists(metricsValueField), fieldExists(flatValueField)]
      }
    ]
  }

  if (sensorIds.length > 0) {
    matchStage['gateway.nodes.devices.id'] = { $in: sensorIds }
  }

  let groupFormat = null
  switch (normalizedTimeField) {
    case 'minute':
      groupFormat = '%Y-%m-%dT%H:%M:00Z'
      break
    case 'hour':
      groupFormat = '%Y-%m-%dT%H:00:00Z'
      break
    case 'day':
      groupFormat = '%Y-%m-%dT00:00:00Z'
      break
    default:
      groupFormat = null
  }

  const normalizedValueExpr = {
    $ifNull: [`$${metricsValueField}`, `$${flatValueField}`]
  }
  const normalizedUnitExpr = {
    $ifNull: [`$${metricsUnitField}`, '$gateway.nodes.devices.unit']
  }

  const pipeline = [
    { $unwind: '$gateway.nodes' },
    { $unwind: '$gateway.nodes.devices' },
    {
      $set: {
        'gateway.nodes.devices.timestamp': {
          $cond: {
            if: { $eq: [{ $type: '$gateway.nodes.devices.timestamp' }, 'string'] },
            then: { $toDate: '$gateway.nodes.devices.timestamp' },
            else: '$gateway.nodes.devices.timestamp'
          }
        },
        'gateway.nodes.devices.value': normalizedValueExpr,
        'gateway.nodes.devices.unit': normalizedUnitExpr
      }
    },
    { $match: matchStage }
  ]

  const baseProjection = {
    id: '$gateway.nodes.devices.id',
    type: '$gateway.nodes.devices.type',
    name: '$gateway.nodes.devices.name',
    value: '$gateway.nodes.devices.value',
    unit: '$gateway.nodes.devices.unit',
    timestamp: '$gateway.nodes.devices.timestamp'
  }

  if (normalizedTimeField === 'sec') {
    const lowerBound = skip
    const upperBound = skip + limit
    pipeline.push(
      {
        $setWindowFields: {
          partitionBy: '$gateway.nodes.devices.id',
          sortBy: { 'gateway.nodes.devices.timestamp': -1 },
          output: {
            row_num: { $documentNumber: {} }
          }
        }
      },
      {
        $match: {
          row_num: { $gt: lowerBound, $lte: upperBound }
        }
      },
      { $addFields: { timestamp: '$gateway.nodes.devices.timestamp' } },
      { $project: baseProjection },
      { $sort: { 'gateway.nodes.devices.timestamp': -1 } },
      { $sort: { timestamp: 1 } }
    )
  } else {
    pipeline.push(
      {
        $group: {
          _id: {
            time: {
              $dateToString: {
                format: groupFormat,
                date: '$gateway.nodes.devices.timestamp'
              }
            },
            sensorId: '$gateway.nodes.devices.id',
            sensorName: '$gateway.nodes.devices.name',
            sensorType: '$gateway.nodes.devices.type'
          },
          value: { $avg: '$gateway.nodes.devices.value' },
          unit: { $first: '$gateway.nodes.devices.unit' }
        }
      },
      { $sort: { '_id.time': -1 } },
      { $skip: skip },
      { $limit: limit },
      { $sort: { '_id.time': 1 } },
      {
        $project: {
          id: '$_id.sensorId',
          type: '$_id.sensorType',
          name: '$_id.sensorName',
          timestamp: {
            $dateFromString: {
              dateString: '$_id.time'
            }
          },
          value: '$value',
          unit: '$unit'
        }
      }
    )
  }

  return aggregateData(pipeline)
}

module.exports = {
  getMetricData
}
