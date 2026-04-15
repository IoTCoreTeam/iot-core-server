const { getDb } = require('../config/db')
const { CONTROL_ACK_COLLECTION_NAME } = require('../config/env')

const ACK_V2_TOPIC = 'esp32/controllers/status-event'

const listControlAcks = async ({ since, limit = 20000 } = {}) => {
  const db = getDb()
  const collection = db.collection(CONTROL_ACK_COLLECTION_NAME)

  const query = { topic: ACK_V2_TOPIC }
  if (since) {
    const sinceDate = new Date(since)
    if (!Number.isNaN(sinceDate.getTime())) {
      query.$or = [
        { received_at: { $gte: sinceDate } },
        { timestamp: { $gte: sinceDate.toISOString() } }
      ]
    }
  }

  return collection
    .find(query, {
      projection: {
        _id: 0,
        gateway_id: 1,
        node_id: 1,
        device: 1,
        state: 1,
        status: 1,
        timestamp: 1,
        received_at: 1,
        command_exec_ms: 1
      }
    })
    .sort({ timestamp: 1, received_at: 1 })
    .limit(limit)
    .toArray()
}

const buildParamList = (value) => {
  if (!value) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

const queryControlAcks = async (query = {}) => {
  const {
    gateway_id,
    node_id,
    device,
    state,
    status,
    topic,
    timestamp_from,
    timestamp_to,
    limit: limitParam = '200',
    page: pageParam = '1'
  } = query

  const gatewayIds = buildParamList(gateway_id)
  const nodeIds = buildParamList(node_id)
  const devices = buildParamList(device)
  const states = buildParamList(state)
  const statuses = buildParamList(status)
  const topics = buildParamList(topic)

  const limit = Math.max(1, Math.min(500, Number(limitParam) || 200))
  const page = Math.max(1, Number(pageParam) || 1)
  const skip = (page - 1) * limit

  const receivedAtMatch = {}
  const timestampStringMatch = {}
  if (timestamp_from) {
    const fromDate = new Date(String(timestamp_from))
    if (!Number.isNaN(fromDate.getTime())) {
      receivedAtMatch.$gte = fromDate
      timestampStringMatch.$gte = fromDate.toISOString()
    }
  }
  if (timestamp_to) {
    const toDate = new Date(String(timestamp_to))
    if (!Number.isNaN(toDate.getTime())) {
      receivedAtMatch.$lte = toDate
      timestampStringMatch.$lte = toDate.toISOString()
    }
  }

  const db = getDb()
  const collection = db.collection(CONTROL_ACK_COLLECTION_NAME)
  const baseQuery = {
    topic: ACK_V2_TOPIC,
    ...(gatewayIds.length > 0 && { gateway_id: { $in: gatewayIds } }),
    ...(nodeIds.length > 0 && { node_id: { $in: nodeIds } }),
    ...(devices.length > 0 && { device: { $in: devices } }),
    ...(states.length > 0 && { state: { $in: states } }),
    ...(statuses.length > 0 && { status: { $in: statuses } }),
    ...(topics.length > 0 && { topic: { $in: topics.filter((value) => value === ACK_V2_TOPIC) } })
  }

  const hasTimeFilter =
    Object.keys(receivedAtMatch).length > 0 ||
    Object.keys(timestampStringMatch).length > 0

  const mongoQuery = hasTimeFilter
    ? {
        ...baseQuery,
        $or: [
          ...(Object.keys(receivedAtMatch).length > 0
            ? [{ received_at: receivedAtMatch }]
            : []),
          ...(Object.keys(timestampStringMatch).length > 0
            ? [{ timestamp: timestampStringMatch }]
            : [])
        ]
      }
    : baseQuery

  return collection
    .find(mongoQuery, {
      projection: {
        _id: 1,
        gateway_id: 1,
        node_id: 1,
        device: 1,
        state: 1,
        status: 1,
        topic: 1,
        timestamp: 1,
        received_at: 1,
        command_exec_ms: 1,
        command_seq: 1,
        requested_at: 1,
        requested_at_ms: 1,
        response_deadline_at: 1,
        dispatched_at: 1
      }
    })
    .sort({ timestamp: -1, received_at: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
}

module.exports = {
  listControlAcks,
  queryControlAcks
}
