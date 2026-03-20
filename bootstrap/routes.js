const { createMetricDataRoute } = require('../routes/routeMetricData')
const { createMetricsRoute } = require('../routes/routeMetrics')
const { createWhitelistRoute } = require('../routes/routeWhiteList')
const { createControlRoute } = require('../routes/routeControl')
const { createDeviceStatusRoute } = require('../routes/routeDeviceStatus')
const { createControlAckRoute } = require('../routes/routeControlAck')

const registerRoutes = (app, controllers) => {
  const {
    controlController,
    deviceStatusController,
    metricController,
    sensorController,
    whitelistController,
    controlAckController
  } = controllers

  const routeMetricData = createMetricDataRoute(sensorController)
  const routeMetrics = createMetricsRoute(metricController)
  const routeControl = createControlRoute(controlController)
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
