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
    throw new Error('Missing JWT_PUBLIC_KEY_PATH')
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

const createAuthenticateJwt = (env) => {
  const publicKeyFile = resolvePublicKeyPath(env.JWT_PUBLIC_KEY_PATH)
  const publicKey = fs.readFileSync(publicKeyFile, 'utf8')
  const verifyOptions = buildVerifyOptions(env)

  if (!verifyOptions.algorithms.length) {
    throw new Error('Missing JWT_ALGORITHMS')
  }

  return (req, res, next) => {
    const token = extractBearerToken(req.headers.authorization)

    if (!token) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' })
    }

    try {
      const payload = jwt.verify(token, publicKey, verifyOptions)
      req.auth = payload
      req.user = payload
      return next()
    } catch (error) {
      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'NotBeforeError' ||
        error.name === 'JsonWebTokenError'
      ) {
        return res.status(401).json({ message: `Unauthorized: ${error.message}` })
      }

      return next(error)
    }
  }
}

module.exports = {
  createAuthenticateJwt
}
