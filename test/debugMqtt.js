const { connect, close } = require('../config/db')

async function debugMqttAndMongo() {
    try {
        const db = await connect()

        console.log('='.repeat(70))
        console.log('🔍 DEBUGGING MQTT -> MongoDB Flow')
        console.log('='.repeat(70))

        // Check all collections
        const collections = await db.listCollections().toArray()
        console.log('\n📦 Available collections:')
        collections.forEach(c => console.log(`  - ${c.name}`))

        // Check sensor_readings
        const sensorCount = await db.collection('sensor_readings').countDocuments()
        console.log(`\n📊 sensor_readings: ${sensorCount} documents`)

        if (sensorCount > 0) {
            // Get latest document with full details
            const latest = await db.collection('sensor_readings')
                .find()
                .sort({ received_at: -1 })
                .limit(1)
                .toArray()

            console.log('\n📄 Latest document structure:')
            console.log(JSON.stringify(latest[0], null, 2))

            // Check gateways
            const gateways = await db.collection('sensor_readings')
                .distinct('gateway.id')
            console.log(`\n🏠 Unique gateways: ${gateways.join(', ')}`)

            // Check recent data (last 5 minutes)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
            const recentCount = await db.collection('sensor_readings')
                .countDocuments({ received_at: { $gte: fiveMinutesAgo } })
            console.log(`\n⏰ Documents in last 5 minutes: ${recentCount}`)

        } else {
            console.log('\n⚠️  No data in sensor_readings!')
            console.log('\nPossible issues:')
            console.log('  1. MQTT broker not started')
            console.log('  2. Simulator not sending data')
            console.log('  3. mqttHandle not processing messages')
            console.log('  4. Database save failing')
        }

        // Check heartbeats collection
        const heartbeatCount = await db.collection('heartbeats').countDocuments()
        console.log(`\n💓 heartbeats: ${heartbeatCount} documents`)

    } catch (error) {
        console.error('\n❌ Error:', error.message)
        console.error(error.stack)
    } finally {
        await close()
    }
}

debugMqttAndMongo()
