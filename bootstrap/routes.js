const { createMetricDataRoute } = require('../routes/routeMetricData')
const { createMetricsRoute } = require('../routes/routeMetrics')
const { createWhitelistRoute } = require('../routes/routeWhiteList')
const { createControlRoute } = require('../routes/routeControl')
const { createDeviceStatusRoute } = require('../routes/routeDeviceStatus')
const { createControlAckRoute } = require('../routes/routeControlAck')
const { createWorkflowEventRoute } = require('../routes/routeWorkflowEvent')
const env = require('../config/env')
const { createAuthenticateBackendToken } = require('../middlewares/authenticateBackendToken')

const registerRoutes = (app, controllers) => {
  const {
    controlController,
    deviceStatusController,
    metricController,
    sensorController,
    whitelistController,
    controlAckController,
    workflowEventController
  } = controllers

  const authenticateBackendToken = createAuthenticateBackendToken(env)

  const routeMetricData = createMetricDataRoute(sensorController)
  const routeMetrics = createMetricsRoute(metricController)
  const routeControl = createControlRoute(controlController, {
    authenticate: authenticateBackendToken,
    authorizeWrite: authenticateBackendToken
  })
  const routeDeviceStatus = createDeviceStatusRoute(deviceStatusController, {
    authorizeRead: authenticateBackendToken,
    authorizeWrite: authenticateBackendToken
  })
  const routeControlAck = createControlAckRoute(controlAckController)
  const routeWorkflowEvent = createWorkflowEventRoute(workflowEventController, {
    authenticate: authenticateBackendToken,
    authorizeWrite: authenticateBackendToken
  })
  const whitelistRoute = createWhitelistRoute(whitelistController, {
    authorizeRead: authenticateBackendToken,
    authorizeWrite: authenticateBackendToken
  })

  app.use('/v1/sensors', authenticateBackendToken, routeMetricData)
  app.use('/v1/metrics', authenticateBackendToken, routeMetrics)
  app.use('/v1/whitelist', whitelistRoute)
  app.use('/v1/control', routeControl)
  app.use('/v1/device-status', routeDeviceStatus)
  app.use('/v1/control-acks', authenticateBackendToken, routeControlAck)
  app.use('/v1/workflow-events', routeWorkflowEvent)
}

module.exports = {
  registerRoutes
}
