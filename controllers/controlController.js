function createControlController({ controlService }) {
  if (!controlService) {
    throw new Error('controlService is required')
  }

  async function enqueueCommand(req, res) {
    try {
      const result = await controlService.enqueueCommand(req.body || {})
      return res.json({
        success: true,
        message: 'Command completed',
        data: result
      })
    } catch (error) {
      console.error('[controlController] enqueueCommand:', error.message)
      const status = error.statusCode || 500
      return res.status(status).json({
        success: false,
        message: error.message
      })
    }
  }

  async function commandPump(req, res) {
    return commandDevice(req, res, 'pump')
  }

  async function commandLight(req, res) {
    return commandDevice(req, res, 'light')
  }

  async function commandGroundControl(req, res) {
    return commandDevice(req, res, 'ground-control')
  }

  async function commandDevice(req, res, device) {
    try {
      const result = await controlService.commandDevice(req.body || {}, device)
      return res.json({
        success: true,
        message: `${device} command completed`,
        data: result
      })
    } catch (error) {
      console.error(`[controlController] commandDevice(${device}):`, error.message)
      const status = error.statusCode || 500
      return res.status(status).json({
        success: false,
        message: error.message
      })
    }
  }

  function health(_req, res) {
    const data = controlService.health()
    return res.json({
      success: true,
      data
    })
  }

  return {
    enqueueCommand,
    commandPump,
    commandLight,
    commandGroundControl,
    health
  }
}

module.exports = {
  createControlController
}
