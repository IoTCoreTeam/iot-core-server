const express = require('express')

function createControlRoute(controller, { authenticate, authorizeWrite } = {}) {
  const router = express.Router()

  const requireAuth = authenticate || ((_req, _res, next) => next())
  const allowWrite = authorizeWrite || ((_req, _res, next) => next())

  router.get('/health', controller.health)
  router.post('/enqueue', requireAuth, allowWrite, controller.enqueueCommand)
  router.post('/pump', requireAuth, allowWrite, controller.commandPump)
  router.post('/light', requireAuth, allowWrite, controller.commandLight)
  router.post('/ground-control', requireAuth, allowWrite, controller.commandGroundControl)

  // khai báo mở rộng thêm các thiết bị khác ở đây nếu cần, nó sẽ gán vào trường ""device": <device-type>", ví dụ:
  // router.post('/fan', requireAuth, allowWrite, (req, res) => controller.commandDevice(req, res, 'fan'))
  // các hàm controller. sẽ được khai báo trong controlController.js, ví dụ:
  // async function commandFan(req, res) {
  //   return commandDevice(req, res, 'fan')
  // } 

  return router
}

module.exports = {
  createControlRoute
}
