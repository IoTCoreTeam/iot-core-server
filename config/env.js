const path = require('path')
const dotenv = require('dotenv')

dotenv.config({
  path: path.join(__dirname, '..', '.env')
})

const env = {
  APP_HOST: process.env.APP_HOST || '0.0.0.0',
  APP_PORT: process.env.APP_PORT || '8017',
  MONGODB_URI: process.env.MONGODB_URI,
  DATABASE_NAME: process.env.DATABASE_NAME || 'sensor_readings',
  SENSOR_COLLECTION_NAME: process.env.SENSOR_COLLECTION_NAME || 'sensor_readings'
}

module.exports = env
