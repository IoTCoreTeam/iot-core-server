const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')

const parseAlgorithms = (raw) =>
  String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

const resolvePublicKeyPath = (publicKeyPath) => {
  if (!publicKeyPath) {
    return null
  }

  if (path.isAbsolute(publicKeyPath)) {
    return publicKeyPath
  }

  return path.resolve(__dirname, '..', publicKeyPath)
}

const buildVerifyOptions = (env) => {
  const options = {
    algorithms: parseAlgorithms(env.JWT_ALGORITHMS),
    clockTolerance: Number(env.JWT_CLOCK_TOLERANCE_SEC || 0)
  }

  if (env.JWT_ISSUER) {
    options.issuer = env.JWT_ISSUER
  }

  if (env.JWT_AUDIENCE) {
    options.audience = env.JWT_AUDIENCE
  }

  return options
}

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader) {
    return null
  }

  const [scheme, token] = String(authorizationHeader).split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null
  }

  return token.trim()
}

const timingSafeEqual = (a, b) => {
  const aBuffer = Buffer.from(String(a), 'utf8')
  const bBuffer = Buffer.from(String(b), 'utf8')
  if (aBuffer.length !== bBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

const createAuthenticateBackendToken = (env) => {
  const expectedServiceToken = String(env.SERVICE_TOKEN || '').trim()
  const publicKeyPath = resolvePublicKeyPath(env.JWT_PUBLIC_KEY_PATH)
  const verifyOptions = buildVerifyOptions(env)
  let publicKey = null
  let publicKeyError = null

  if (publicKeyPath) {
    try {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8')
    } catch (error) {
      publicKeyError = error
    }
  }

  return (req, res, next) => {
    const bearerToken = extractBearerToken(req.headers.authorization)

    if (bearerToken && publicKey && verifyOptions.algorithms.length) {
      try {
        const payload = jwt.verify(bearerToken, publicKey, verifyOptions)
        req.auth = payload
        req.user = payload
        return next()
      } catch (error) {
        if (
          error.name !== 'TokenExpiredError' &&
          error.name !== 'NotBeforeError' &&
          error.name !== 'JsonWebTokenError'
        ) {
          return next(error)
        }
      }
    }

    if (bearerToken && expectedServiceToken && timingSafeEqual(bearerToken, expectedServiceToken)) {
      req.auth = { service: true }
      return next()
    }

    const headerToken = req.headers['x-service-token']
    if (expectedServiceToken && typeof headerToken === 'string') {
      if (timingSafeEqual(headerToken.trim(), expectedServiceToken)) {
        req.auth = { service: true }
        return next()
      }
    }

    if (publicKeyError) {
      return res.status(500).json({ message: 'JWT public key could not be loaded' })
    }

    if (bearerToken) {
      return res.status(401).json({ message: 'Unauthorized: invalid access token' })
    }

    return res.status(401).json({ message: 'Missing or invalid Authorization header' })
  }
}

module.exports = {
  createAuthenticateBackendToken
}
