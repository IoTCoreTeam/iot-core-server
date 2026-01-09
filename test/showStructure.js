const { connect, close } = require('../config/db')

async function showDataStructure() {
    try {
        const db = await connect()

        console.log('='.repeat(70))
        console.log('📋 ACTUAL MongoDB Document Structure')
        console.log('='.repeat(70))

        const latest = await db.collection('sensor_readings')
            .find()
            .sort({ received_at: -1 })
            .limit(1)
            .toArray()

        if (latest.length > 0) {
            console.log('\nFull document:')
            console.log(JSON.stringify(latest[0], null, 2))

            // Check structure
            const doc = latest[0]
            console.log('\n' + '='.repeat(70))
            console.log('Structure Analysis:')
            console.log('='.repeat(70))
            console.log(`\ngateway exists: ${!!doc.gateway}`)
            console.log(`gateway.nodes exists: ${!!doc.gateway?.nodes}`)
            console.log(`gateway.nodes is array: ${Array.isArray(doc.gateway?.nodes)}`)
            console.log(`gateway.nodes.length: ${doc.gateway?.nodes?.length}`)

            if (doc.gateway?.nodes?.[0]) {
                const firstNode = doc.gateway.nodes[0]
                console.log(`\n\nFirst node structure:`)
                console.log(`  id: ${firstNode.id}`)
                console.log(`  devices exists: ${!!firstNode.devices}`)
                console.log(` devices is array: ${Array.isArray(firstNode.devices)}`)
                console.log(`  devices.length: ${firstNode.devices?.length}`)

                if (firstNode.devices?.[0]) {
                    console.log(`\nFirst device structure:`)
                    console.log(JSON.stringify(firstNode.devices[0], null, 2))
                }
            }
        } else {
            console.log('\n⚠️  No documents found!')
        }

    } catch (error) {
        console.error('Error:', error.message)
    } finally {
        await close()
    }
}

showDataStructure()
