function createWhitelistController({ whitelistService }) {
  if (!whitelistService) {
    throw new Error('whitelistService is required')
  }

  function getWhitelist(_req, res) {
    return res.json({
      success: true,
      message: 'Whitelist snapshot',
      data: whitelistService.getSnapshot()
    })
  }

  async function overrideWhitelist(req, res) {
    try {
      const { snapshot, warning } = await whitelistService.overrideWhitelist(req.body || {})
      return res.json({
        success: true,
        message: warning ? 'Whitelist overridden with sync warning' : 'Whitelist overridden',
        ...(warning ? { warning } : {}),
        data: snapshot
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
    getWhitelist,
    overrideWhitelist
  }
}

module.exports = {
  createWhitelistController
}
