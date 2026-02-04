const express = require('express');

function createControlRoute(controller) {
  const router = express.Router();

  router.get('/health', controller.health);
  router.post('/enqueue', controller.enqueueCommand);
  router.post('/pump', controller.commandPump);
  router.post('/light', controller.commandLight);

  return router;
}

module.exports = {
  createControlRoute,
};
