const REGISTRATION_STATUSES = ['pending', 'registered', 'failed']

/**
 * Normalize any incoming status value to one of the allowed enums.
 */
const normalizeRegistrationStatus = (value) => {
  if (value === undefined || value === null) {
    return 'pending'
  }

  const candidate = String(value).toLowerCase()
  return REGISTRATION_STATUSES.includes(candidate) ? candidate : 'pending'
}

/**
 * Map common timestamp fields so that snake_case and camelCase payloads both work.
 */
const mapTimestamps = (attributes = {}) => ({
  created_at: attributes.created_at ?? attributes.createdAt ?? null,
  updated_at: attributes.updated_at ?? attributes.updatedAt ?? null,
  deleted_at: attributes.deleted_at ?? attributes.deletedAt ?? null
})

/**
 * Guard against invalid numeric input before storing decimals.
 */
const ensureDecimal = (value, precision = 4) => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }

  return Number(number.toFixed(precision))
}

/**
 * Read either snake_case or camelCase versions of a field.
 */
const readField = (attributes = {}, snake, camel) => {
  if (camel && camel in attributes) {
    return attributes[camel]
  }

  if (snake && snake in attributes) {
    return attributes[snake]
  }

  return null
}

module.exports = {
  REGISTRATION_STATUSES,
  normalizeRegistrationStatus,
  mapTimestamps,
  ensureDecimal,
  readField
}
