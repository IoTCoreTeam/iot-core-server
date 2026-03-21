const crypto = require('crypto')

const extractToken = (req) => {
  const bearer = req.headers.authorization
  if (typeof bearer === 'string') {
    const [scheme, token] = bearer.split(' ')
    if (scheme && token && scheme.toLowerCase() === 'bearer') {
      return token.trim()
    }
  }

  const headerToken = req.headers['x-service-token']
  if (typeof headerToken === 'string') {
    return headerToken.trim()
  }

  return null
}

const timingSafeEqual = (a, b) => {
  const aBuffer = Buffer.from(String(a), 'utf8')
  const bBuffer = Buffer.from(String(b), 'utf8')
  if (aBuffer.length !== bBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

const createAuthenticateServiceToken = (env) => {
  const expectedToken = String(env.SERVICE_TOKEN || '').trim()

  return (req, res, next) => {
    if (!expectedToken) {
      return res.status(500).json({ message: 'Service token is not configured' })
    }

    const token = extractToken(req)
    if (!token || !timingSafeEqual(token, expectedToken)) {
      return res.status(401).json({ message: 'Unauthorized service token' })
    }

    return next()
  }
}

module.exports = {
  createAuthenticateServiceToken
}
