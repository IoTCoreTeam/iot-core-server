const { connect, close } = require('../config/db')

async function testConnection() {
  try {
    console.log('Testing MongoDB connection...')
    const db = await connect()
    const result = await db.command({ ping: 1 })
    console.log('Ping result:', result)
    console.log('Test Passed: Successfully connected to MongoDB.')
  } catch (error) {
    console.error('Test Failed:', error.message)
    process.exit(1)
  } finally {
    await close()
  }
}

if (require.main === module) {
  testConnection()
}

module.exports = testConnection