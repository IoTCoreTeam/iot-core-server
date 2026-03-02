class ControlCommandService {
  constructor({ aedes, deviceWhitelist, config = {} }) {
    this.aedes = aedes;
    this.deviceWhitelist = deviceWhitelist;
    this.config = config;
    this.queue = [];
    this.processing = false;
  }

  enqueue(command) {
    const delayMs = Number(command.delayMs || 0);
    if (Number.isNaN(delayMs) || delayMs < 0) {
      const error = new Error('delayMs must be a number >= 0');
      error.statusCode = 400;
      throw error;
    }

    this.validate(command);
    this.validateWhitelist(command);

    const job = {
      gateway_id: command.gateway_id,
      node_id: command.node_id || null,
      action_type: command.action_type ?? null,
      device: command.device ?? null,
      state: command.state ?? null,
      value: command.value ?? null,
      delayMs,
      requested_at: new Date().toISOString(),
    };

    this.queue.push(job);
    this.processQueue().catch((error) => {
      console.error('[controlCommandService] Queue error:', error.message);
    });

    return {
      queued: this.queue.length,
      processing: this.processing,
      job,
    };
  }

  size() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }

  async processQueue() {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (job.delayMs > 0) {
          await this.sleep(job.delayMs);
        }
        await this.publishNow(job);
      }
    } finally {
      this.processing = false;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async publishNow(command) {
    if (!this.aedes) {
      const error = new Error('MQTT broker is not ready');
      error.statusCode = 503;
      throw error;
    }

    this.validate(command);
    this.validateWhitelist(command);

    const topicPrefix = this.config.CONTROL_COMMAND_TOPIC_PREFIX || 'esp32/commands';
    const topic = `${topicPrefix}/${command.gateway_id}`;
    const payload = JSON.stringify({
      gateway_id: command.gateway_id,
      node_id: command.node_id,
      action_type: command.action_type,
      device: command.device,
      state: command.state,
      value: command.value ?? null,
      requested_at: command.requested_at || new Date().toISOString(),
    });

    await new Promise((resolve, reject) => {
      this.aedes.publish(
        {
          topic,
          payload: Buffer.from(payload),
          qos: 1,
          retain: false,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    });

    console.log(`[controlCommandService] Published to ${topic}: ${payload}`);

    return {
      topic,
      payload: JSON.parse(payload),
    };
  }

  validate(command) {
    if (!command.gateway_id) {
      const error = new Error('gateway_id is required');
      error.statusCode = 400;
      throw error;
    }

    // No action_type validation here; payload is pass-through to firmware.
  }

  validateWhitelist(command) {
    if (!this.deviceWhitelist) {
      return;
    }

    const gatewayAllowed = this.deviceWhitelist.isGatewayAllowed(command.gateway_id);
    if (!gatewayAllowed) {
      const error = new Error(`gateway not whitelisted: ${command.gateway_id}`);
      error.statusCode = 403;
      throw error;
    }

    if (!command.node_id) {
      return;
    }

    const nodeAllowed = typeof this.deviceWhitelist.isNodeAllowedForGateway === 'function'
      ? this.deviceWhitelist.isNodeAllowedForGateway(command.gateway_id, command.node_id)
      : this.deviceWhitelist.isNodeAllowed(command.node_id);

    if (!nodeAllowed) {
      const error = new Error(`node not whitelisted for gateway ${command.gateway_id}: ${command.node_id}`);
      error.statusCode = 403;
      throw error;
    }
  }

}

module.exports = ControlCommandService;
