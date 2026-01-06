const { getDb } = require('../config/db')
const { SENSOR_COLLECTION_NAME } = require('../config/env')

const aggregateData = async (pipeline = []) => {
  const db = getDb()
  return db.collection(SENSOR_COLLECTION_NAME).aggregate(pipeline).toArray()
}

module.exports = {
  aggregateData
}
