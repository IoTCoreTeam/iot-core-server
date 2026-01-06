const {
  normalizeRegistrationStatus,
  mapTimestamps,
  readField
} = require('./utils')

/**
 * Mirror the node_controllers table defined in control-module/database/migrations/2025_12_20_033902_create_node_controllers_table.php.
 */
class NodeControllerModel {
  static tableName = 'node_controllers'
  static fillable = [
    'node_id',
    'external_id',
    'name',
    'firmware_version',
    'registration_status'
  ]

  constructor(attributes = {}) {
    const { created_at, updated_at, deleted_at } = mapTimestamps(attributes)

    this.id = attributes.id ?? null
    this.node_id = readField(attributes, 'node_id', 'nodeId')
    this.external_id = attributes.external_id ?? null
    this.name = attributes.name ?? null
    this.firmware_version = attributes.firmware_version ?? null
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
      firmware_version: this.firmware_version,
      registration_status: this.registration_status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    }
  }
}

module.exports = {
  NodeControllerModel
}
