const { MongoClient } = require('mongodb')
const env = require('./env')

let client = null
let db = null

const connect = async () => {
  if (db) return db

  const uri = env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env')
  }

  try {
    client = new MongoClient(uri)
    await client.connect()
    console.log('Successfully connected to MongoDB')

    db = client.db(env.DATABASE_NAME)
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

const getDb = () => {
  if (!db) {
    throw new Error('Database not initialized. Call connect() first.')
  }
  return db
}

const close = async () => {
  if (client) {
    await client.close()
    client = null
    db = null
    console.log('MongoDB connection closed')
  }
}

module.exports = {
  connect,
  getDb,
  close
}
