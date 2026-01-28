const env = require('../config/env')
const { connect, close } = require('../config/db')

const sensorCollectionName = env.SENSOR_COLLECTION_NAME

async function debugMqttAndMongo() {
    try {
        const db = await connect()

        console.log('='.repeat(70))
        console.log('DEBUGGING MQTT -> MongoDB Flow')
        console.log('='.repeat(70))

        const collections = await db.listCollections().toArray()
        console.log('Available collections:')
        collections.forEach(c => console.log(`  - ${c.name}`))

        const sensorCount = await db.collection(sensorCollectionName).countDocuments()
        console.log(`${sensorCollectionName}: ${sensorCount} documents`)

        if (sensorCount > 0) {
            const latest = await db.collection(sensorCollectionName)
                .find()
                .sort({ received_at: -1 })
                .limit(1)
                .toArray()

            console.log('Latest document structure:')
            console.log(JSON.stringify(latest[0], null, 2))

            const gateways = new Set()
            const flattenedGateways = await db.collection(sensorCollectionName)
                .distinct('gateway_id')
            flattenedGateways.forEach((id) => id && gateways.add(id))

            const legacyGateways = await db.collection(sensorCollectionName)
                .distinct('gateway.id')
            legacyGateways.forEach((id) => id && gateways.add(id))

            console.log(`Unique gateways: ${Array.from(gateways).join(', ')}`)

            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
            const recentCount = await db.collection(sensorCollectionName)
                .countDocuments({ received_at: { $gte: fiveMinutesAgo } })
            console.log(`Documents in last 5 minutes: ${recentCount}`)
        } else {
            console.log(`No data in ${sensorCollectionName}!`)
            console.log('Possible issues:')
            console.log('  1. MQTT broker not started')
            console.log('  2. Simulator not sending data')
            console.log('  3. mqttHandle not processing messages')
            console.log('  4. Database save failing')
        }

        const heartbeatCount = await db.collection(sensorCollectionName).countDocuments({
            event_type: 'heartbeat'
        })
        console.log(`heartbeat events: ${heartbeatCount} documents`)

    } catch (error) {
        console.error('Error:', error.message)
        console.error(error.stack)
    } finally {
        await close()
    }
}

debugMqttAndMongo()
