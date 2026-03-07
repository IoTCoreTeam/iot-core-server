function createDeviceStatusController({ deviceStatusService }) {
  if (!deviceStatusService) {
    throw new Error('deviceStatusService is required')
  }

  function getStatus(_req, res) {
    const gateways = deviceStatusService.getStatus()
    return res.json({
      success: true,
      data: gateways
    })
  }

  async function ensureAllDigitalOff(_req, res) {
    try {
      const summary = deviceStatusService.ensureAllDigitalOff()
      return res.json({
        success: summary.errors.length === 0,
        data: summary
      })
    } catch (error) {
      const status = error.statusCode || 500
      return res.status(status).json({
        success: false,
        message: error.message
      })
    }
  }

  return {
    getStatus,
    ensureAllDigitalOff
  }
}

module.exports = {
  createDeviceStatusController
}
