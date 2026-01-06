const {
  normalizeRegistrationStatus,
  mapTimestamps,
  readField
} = require('./utils')

/**
 * Mirror the nodes table defined in control-module/database/migrations/2025_12_20_033500_create_nodes_table.php.
 */
class NodeModel {
  static tableName = 'nodes'
  static fillable = [
    'gateway_id',
    'external_id',
    'name',
    'location',
    'registration_status',
    'description',
    'metadata'
  ]

  constructor(attributes = {}) {
    const { created_at, updated_at, deleted_at } = mapTimestamps(attributes)

    this.id = attributes.id ?? null
    this.gateway_id = readField(attributes, 'gateway_id', 'gatewayId')
    this.external_id = attributes.external_id ?? null
    this.name = attributes.name ?? null
    this.location = attributes.location ?? null
    this.registration_status = normalizeRegistrationStatus(attributes.registration_status)
    this.description = attributes.description ?? null
    this.metadata = attributes.metadata ?? null
    this.created_at = created_at
    this.updated_at = updated_at
    this.deleted_at = deleted_at
  }

  toRecord() {
    return {
      id: this.id,
      gateway_id: this.gateway_id,
      external_id: this.external_id,
      name: this.name,
      location: this.location,
      registration_status: this.registration_status,
      description: this.description,
      metadata: this.metadata,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    }
  }
}

module.exports = {
  NodeModel
}
