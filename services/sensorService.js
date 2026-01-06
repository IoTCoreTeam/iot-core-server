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
            if: {
              $eq: [{ $type: '$gateway.nodes.devices.timestamp' }, 'string']
            },
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
    _id: '$_id',
    id: '$gateway.nodes.devices.id',
    type: '$gateway.nodes.devices.type',
    name: '$gateway.nodes.devices.name',
    value: '$gateway.nodes.devices.value',
    unit: '$gateway.nodes.devices.unit',
    timestamp: '$gateway.nodes.devices.timestamp'
  }

  /* ============================================================
   * SEC → raw data (no grouping)
   * ============================================================
   */
  if (normalizedTimeField === 'sec') {
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
          row_num: { $gt: skip, $lte: skip + limit }
        }
      },
      { $project: baseProjection },
      { $sort: { timestamp: 1 } }
    )

    return aggregateData(pipeline)
  }

  /* ============================================================
   * MINUTE / HOUR / DAY → downsample (latest per bucket)
   * ============================================================
   */

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
    {
      $sort: {
        'gateway.nodes.devices.timestamp': -1
      }
    },
    {
      $group: {
        _id: {
          sensorId: '$gateway.nodes.devices.id',
          bucketTime: '$bucketTime'
        },
        doc: { $first: '$$ROOT' }
      }
    },
    {
      $replaceRoot: {
        newRoot: '$doc'
      }
    },
    {
      $sort: {
        'gateway.nodes.devices.timestamp': -1
      }
    },
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
