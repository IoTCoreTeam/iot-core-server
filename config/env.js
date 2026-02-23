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
  SENSOR_COLLECTION_NAME: process.env.SENSOR_COLLECTION_NAME || 'sensor_readings',
  SERVO_ACK_COLLECTION_NAME: process.env.SERVO_ACK_COLLECTION_NAME || 'servo_acks',
  CONTROL_ACK_COLLECTION_NAME: process.env.CONTROL_ACK_COLLECTION_NAME || 'control_acks',
  CONTROL_COMMAND_TOPIC_PREFIX: process.env.CONTROL_COMMAND_TOPIC_PREFIX || 'esp32/commands',
  CONTROL_ALLOWED_DEVICES: process.env.CONTROL_ALLOWED_DEVICES || 'pump,light',
  CONTROL_ALLOW_ANY_DEVICE: process.env.CONTROL_ALLOW_ANY_DEVICE || 'false',
}

module.exports = env
