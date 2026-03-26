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
  CONTROL_RESPONSE_TIMEOUT_MS: process.env.CONTROL_RESPONSE_TIMEOUT_MS || '15000',
  HEARTBEAT_TIMEOUT_MS: process.env.HEARTBEAT_TIMEOUT_MS || '30000',
  HEARTBEAT_CHECK_INTERVAL_MS: process.env.HEARTBEAT_CHECK_INTERVAL_MS || '5000',
  JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH || 'storage/oauth-public.key',
  JWT_ISSUER: process.env.JWT_ISSUER || '',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || '',
  JWT_ALGORITHMS: process.env.JWT_ALGORITHMS || 'RS256',
  JWT_ROLE_CLAIM: process.env.JWT_ROLE_CLAIM || 'roles',
  JWT_SCOPE_CLAIM: process.env.JWT_SCOPE_CLAIM || 'scope',
  JWT_CLOCK_TOLERANCE_SEC: process.env.JWT_CLOCK_TOLERANCE_SEC || '5',
  SERVICE_TOKEN: process.env.SERVICE_TOKEN || '',
}

module.exports = env
