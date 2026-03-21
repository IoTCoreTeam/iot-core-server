const { createMetricDataRoute } = require('../routes/routeMetricData')
const { createMetricsRoute } = require('../routes/routeMetrics')
const { createWhitelistRoute } = require('../routes/routeWhiteList')
const { createControlRoute } = require('../routes/routeControl')
const { createDeviceStatusRoute } = require('../routes/routeDeviceStatus')
const { createControlAckRoute } = require('../routes/routeControlAck')
const env = require('../config/env')
const { createAuthenticateJwt } = require('../middlewares/authenticateJwt')
const { createAuthorizeRoles } = require('../middlewares/authorizeRoles')

const registerRoutes = (app, controllers) => {
  const {
    controlController,
    deviceStatusController,
    metricController,
    sensorController,
    whitelistController,
    controlAckController
  } = controllers

  const authenticateJwt = createAuthenticateJwt(env)
  const authorizeRoles = createAuthorizeRoles({
    roleClaim: env.JWT_ROLE_CLAIM,
    scopeClaim: env.JWT_SCOPE_CLAIM
  })
  const authorizeControlWrite = authorizeRoles('admin', 'engineer')

  const routeMetricData = createMetricDataRoute(sensorController)
  const routeMetrics = createMetricsRoute(metricController)
  const routeControl = createControlRoute(controlController, {
    authenticate: authenticateJwt,
    authorizeWrite: authorizeControlWrite
  })
  const routeDeviceStatus = createDeviceStatusRoute(deviceStatusController)
  const routeControlAck = createControlAckRoute(controlAckController)
  const whitelistRoute = createWhitelistRoute(whitelistController)

  app.use('/v1/sensors', routeMetricData)
  app.use('/v1/metrics', routeMetrics)
  app.use('/v1/whitelist', whitelistRoute)
  app.use('/v1/control', routeControl)
  app.use('/v1/device-status', routeDeviceStatus)
  app.use('/v1/control-acks', routeControlAck)
}

module.exports = {
  registerRoutes
}
