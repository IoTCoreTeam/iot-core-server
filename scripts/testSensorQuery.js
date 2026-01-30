const path = require('path')
const { connect, close } = require('../config/db')
const { SENSOR_COLLECTION_NAME } = require('../config/env')

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
      'measurements.metric': 'temperature'
    }
  },
  {
    $project: {
      _id: 0,
      gateway_id: 1,
      node_id: 1,
      sensor_id: '$measurements.sensor_id',
      metric: '$measurements.metric',
      value: '$measurements.value',
      unit: '$measurements.unit',
      timestamp: '$measurements.timestamp'
    }
  },
  { $limit: 5 }
]

const runTestQuery = async () => {
  try {
    const db = await connect()
    console.log(`Using collection: ${SENSOR_COLLECTION_NAME}`)

    const cursor = db
      .collection(SENSOR_COLLECTION_NAME)
      .aggregate(pipeline)

    const results = await cursor.toArray()

    console.log(`Found ${results.length} temperature documents:`)

    results.forEach((doc, index) => {
      console.log(`\n[${index + 1}]`, {
        gateway_id: doc.gateway_id,
        node_id: doc.node_id,
        sensor_id: doc.sensor_id,
        metric: doc.metric,
        value: doc.value,
        unit: doc.unit,
        timestamp: doc.timestamp
      })
    })
  } catch (error) {
    console.error('Test query failed:', error)
    process.exit(1)
  } finally {
    await close()
  }
}

if (require.main === module) {
  runTestQuery()
}
