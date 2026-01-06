const { MongoClient } = require('mongodb')
const { readFileSync } = require('fs')
const { join } = require('path')

const ENV_PATH = join(__dirname, '..', '.env')

const parseEnvFile = (filePath) => {
  try {
    const content = readFileSync(filePath, 'utf8')
    return content.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return acc
      }

      const [key, ...rest] = trimmed.split('=')
      acc[key] = rest.join('=').trim()
      return acc
    }, {})
  } catch (error) {
    return {}
  }
}

const env = {
  ...process.env,
  ...parseEnvFile(ENV_PATH)
}

const uri = env.MONGODB_URI
const databaseName = env.DATABASE_NAME || 'admin'

async function testMongoConnection({ timeoutMs = 5000 } = {}) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Please populate server/.env before running this test.')
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs
  })

  try {
    await client.connect()
    const info = await client.db(databaseName).command({ ping: 1 })
    return {
      success: true,
      message: `Connected to MongoDB database "${databaseName}"`,
      info
    }
  } finally {
    await client.close()
  }
}

if (require.main === module) {
  testMongoConnection()
    .then((result) => {
      console.log(result.message)
      process.exit(0)
    })
    .catch((error) => {
      console.error('MongoDB connection test failed:', error.message)
      process.exit(1)
    })
}

module.exports = {
  testMongoConnection
}

// npm install mongodb
// node server/test/checkMongoConnection.js or npm test