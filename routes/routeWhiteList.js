const express = require('express')

function createWhitelistRoute(controller) {
  const router = express.Router()

  router.get('/', controller.getWhitelist)
  router.post('/', controller.overrideWhitelist)

  return router
}

module.exports = {
  createWhitelistRoute
}
