const { getDb } = require('../config/db')
const { CONTROL_ACK_COLLECTION_NAME } = require('../config/env')

const listControlAcks = async ({ since, limit = 20000 } = {}) => {
  const db = getDb()
  const collection = db.collection(CONTROL_ACK_COLLECTION_NAME)

  const query = since
    ? {
        $or: [
          { timestamp: { $gte: since } },
          { received_at: { $gte: since } }
        ]
      }
    : {}

  return collection
    .find(query, {
      projection: {
        _id: 0,
        state: 1,
        status: 1,
        timestamp: 1,
        received_at: 1
      }
    })
    .sort({ timestamp: 1, received_at: 1 })
    .limit(limit)
    .toArray()
}

module.exports = {
  listControlAcks
}
