const express = require('express')

function createWhitelistRoute(controller, { authorizeRead, authorizeWrite } = {}) {
  const router = express.Router()

  const allowRead = authorizeRead || ((_req, _res, next) => next())
  const allowWrite = authorizeWrite || ((_req, _res, next) => next())

  router.get('/', allowRead, controller.getWhitelist)
  router.post('/', allowWrite, controller.overrideWhitelist)

  return router
}

module.exports = {
  createWhitelistRoute
}
