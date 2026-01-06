const { normalizeRegistrationStatus, mapTimestamps } = require('./utils')

/**
 * Mirror the gateway table defined in control-module/database/migrations/2025_12_20_033737_create_gateways_table.php.
 */
class GatewayModel {
  static tableName = 'gateways'
  static fillable = [
    'name',
    'external_id',
    'connection_key',
    'location',
    'ip_address',
    'description',
    'registration_status'
  ]

  constructor(attributes = {}) {
    const { created_at, updated_at, deleted_at } = mapTimestamps(attributes)

    this.id = attributes.id ?? null
    this.name = attributes.name ?? null
    this.external_id = attributes.external_id ?? null
    this.connection_key = attributes.connection_key ?? null
    this.location = attributes.location ?? null
    this.ip_address = attributes.ip_address ?? null
    this.description = attributes.description ?? null
    this.registration_status = normalizeRegistrationStatus(attributes.registration_status)
    this.created_at = created_at
    this.updated_at = updated_at
    this.deleted_at = deleted_at
  }

  toRecord() {
    return {
      id: this.id,
      name: this.name,
      external_id: this.external_id,
      connection_key: this.connection_key,
      location: this.location,
      ip_address: this.ip_address,
      description: this.description,
      registration_status: this.registration_status,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at
    }
  }
}

module.exports = {
  GatewayModel
}
