const env = require('../config/env')
const { connect, close } = require('../config/db')

const sensorCollectionName = env.SENSOR_COLLECTION_NAME

async function checkSensorData() {
    try {
        const db = await connect()

        console.log('='.repeat(70))
        console.log(`Checking ${sensorCollectionName} collection`)
        console.log('='.repeat(70))

        const count = await db.collection(sensorCollectionName).countDocuments()
        console.log(`\nTotal documents: ${count}`)

        if (count > 0) {
            // Get latest 5 documents
            const docs = await db.collection(sensorCollectionName)
                .find()
                .sort({ received_at: -1 })
                .limit(5)
                .toArray()

            console.log(`\nLatest 5 documents:\n`)

            docs.forEach((doc, index) => {
                console.log(`--- Document ${index + 1} ---`)
                console.log(`ID: ${doc._id}`)
                console.log(`Gateway ID: ${doc.gateway_id || doc.gateway?.id}`)
                console.log(`Gateway MAC: ${doc.gateway_mac || doc.gateway?.mac}`)

                if (Array.isArray(doc.measurements)) {
                    console.log(`Node ID: ${doc.node_id}`)
                    console.log(`Measurements: ${doc.measurements.length}`)
                    doc.measurements.forEach((measurement, j) => {
                        console.log(`  ${j + 1}. ${measurement.metric}: ${measurement.value}${measurement.unit} (ID: ${measurement.sensor_id})`)
                    })
                } else {
                    console.log(`Number of nodes: ${doc.gateway?.nodes?.length || 0}`)
                    doc.gateway?.nodes?.forEach((node, i) => {
                        console.log(`\n  Node ${i + 1}: ${node.id}`)
                        console.log(`  Sensors: ${node.devices?.length || 0}`)
                        node.devices?.forEach((device, j) => {
                            console.log(`    ${j + 1}. ${device.type}: ${device.value}${device.unit} (ID: ${device.id})`)
                        })
                    })
                }

                console.log(`\nReceived at: ${doc.received_at}`)
                console.log('─'.repeat(70))
            })

            // Count by gateway
            console.log('\n📊 Statistics by Gateway:')
            const gatewayStats = await db.collection(sensorCollectionName)
                .aggregate([
                    {
                        $group: {
                            _id: { $ifNull: ['$gateway_id', '$gateway.id'] },
                            count: { $sum: 1 },
                            latestUpdate: { $max: '$received_at' }
                        }
                    },
                    { $sort: { latestUpdate: -1 } }
                ])
                .toArray()

            gatewayStats.forEach(stat => {
                console.log(`  ${stat._id}: ${stat.count} documents (Latest: ${stat.latestUpdate})`)
            })

        } else {
            console.log('\n⚠️  No data found!')
        }

    } catch (error) {
        console.error('Error:', error.message)
        console.error(error.stack)
    } finally {
        await close()
    }
}

checkSensorData()
