const path = require('path')
const { connect, close } = require('../config/db')
const { SENSOR_COLLECTION_NAME } = require('../config/env')

const pipeline = [
  { $unwind: '$gateway.nodes' },
  { $unwind: '$gateway.nodes.devices' },
  {
    $match: {
      'gateway.nodes.devices.type': 'temperature'
    }
  },
  {
    $replaceRoot: {
      newRoot: '$gateway.nodes.devices'
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
        id: doc.id,
        type: doc.type,
        name: doc.name,
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
