function createControlController({ controlCommandService }) {
  if (!controlCommandService) {
    throw new Error('controlCommandService is required');
  }

  async function enqueueCommand(req, res) {
    try {
      const result = controlCommandService.enqueue(req.body || {});
      return res.json({
        success: true,
        message: 'Command queued',
        data: result,
      });
    } catch (error) {
      console.error('[controlController] enqueueCommand:', error.message);
      const status = error.statusCode || 500;
      return res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  async function commandPump(req, res) {
    return commandDevice(req, res, 'pump');
  }

  async function commandLight(req, res) {
    return commandDevice(req, res, 'light');
  }

  async function commandDevice(req, res, device) {
    try {
      const body = req.body || {};
      const result = controlCommandService.enqueue({
        gateway_id: body.gateway_id,
        node_id: body.node_id,
        device,
        state: body.state,
        delayMs: body.delayMs,
      });

      return res.json({
        success: true,
        message: `${device} command queued`,
        data: result,
      });
    } catch (error) {
      console.error(`[controlController] commandDevice(${device}):`, error.message);
      const status = error.statusCode || 500;
      return res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  function health(req, res) {
    return res.json({
      success: true,
      data: {
        queued: controlCommandService.size(),
        processing: controlCommandService.isProcessing(),
      },
    });
  }

  return {
    enqueueCommand,
    commandPump,
    commandLight,
    health,
  };
}

module.exports = {
  createControlController,
};
