const {
  normalizeRegistrationStatus,
  mapTimestamps,
  readField,
  ensureDecimal
} = require('./utils')

/**
 * Mirror the node_sensors table defined in control-module/database/migrations/2025_12_20_033913_create_node_sensors_table.php.
 */
class NodeSensorModel {
  static tableName = 'node_sensors'
  static fillable = [
    'node_id',
    'external_id',
    'name',
    'sensor_type',
    'last_reading',
    'limit_value',
    'registration_status'
  ]

  constructor(attributes = {}) {
    const { created_at, updated_at, deleted_at } = mapTimestamps(attributes)

    this.id = attributes.id ?? null
    this.node_id = readField(attributes, 'node_id', 'nodeId')
    this.external_id = attributes.external_id ?? null
    this.name = attributes.name ?? null
    this.sensor_type = attributes.sensor_type ?? null
    this.last_reading = ensureDecimal(
      attributes.last_reading ?? attributes.lastReading
    )
    this.limit_value = ensureDecimal(
      attributes.limit_value ?? attributes.limitValue
    )
    this.registration_status = normalizeRegistrationStatus(attributes.registration_status)
    this.created_at = created_at
    this.updated_at = updated_at
    this.deleted_at = deleted_at
  }

  toRecord() {
    return {
      id: this.id,
      node_id: this.node_id,
      external_id: this.external_id,
      name: this.name,
      sensor_type: this.sensor_type,
      last_reading: this.last_reading,
      limit_value: this.limit_value,
      registration_status: this.registration_status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    }
  }
}

module.exports = {
  NodeSensorModel
}
