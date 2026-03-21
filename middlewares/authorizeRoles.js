const toValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (value === null || value === undefined) {
    return []
  }

  return [String(value).trim()].filter(Boolean)
}

const createAuthorizeRoles = ({ roleClaim = 'roles', scopeClaim = 'scope' } = {}) => {
  return (...allowedRoles) => {
    const expected = new Set(allowedRoles.map((role) => String(role).trim()).filter(Boolean))

    return (req, res, next) => {
      const auth = req.auth || {}
      const grantedRoles = new Set([
        ...toValues(auth[roleClaim]),
        ...toValues(auth[scopeClaim])
      ])

      if (!expected.size) {
        return next()
      }

      for (const role of expected) {
        if (grantedRoles.has(role)) {
          return next()
        }
      }

      return res.status(403).json({ message: 'Forbidden: insufficient role' })
    }
  }
}

module.exports = {
  createAuthorizeRoles
}
