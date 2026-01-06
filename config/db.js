const { MongoClient } = require('mongodb')
const { MONGODB_URI, DATABASE_NAME } = require('./env')

let clientInstance = null
let databaseInstance = null

const connect = async () => {
  if (databaseInstance) {
    return databaseInstance
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured')
  }

  const client = new MongoClient(MONGODB_URI)
  await client.connect()

  clientInstance = client
  databaseInstance = client.db(DATABASE_NAME)

  return databaseInstance
}

const getDb = () => {
  if (!databaseInstance) {
    throw new Error('Database connection is not ready')
  }
  return databaseInstance
}

const close = async () => {
  if (clientInstance) {
    await clientInstance.close()
    clientInstance = null
    databaseInstance = null
  }
}

module.exports = {
  connect,
  getDb,
  close
}
