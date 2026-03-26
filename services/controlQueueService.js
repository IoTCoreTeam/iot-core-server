class ControlQueueService {
  constructor({ aedes, deviceWhitelist, config = {}, controlResponseWaiter = null, onStatus = null }) {
    this.aedes = aedes;
    this.deviceWhitelist = deviceWhitelist;
    this.config = config;
    this.controlResponseWaiter = controlResponseWaiter;
    this.onStatus = typeof onStatus === 'function' ? onStatus : null;
    this.queue = [];
    this.processing = false;
    this.commandSeq = 0;
  }

  nextCommandSeq() {
    if (this.commandSeq >= 2147483647) {
      this.commandSeq = 0;
    }
    this.commandSeq += 1;
    return this.commandSeq;
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

    const waitForResponse = command.wait_for_response !== false;
    const responseTimeoutMs = Number(command.response_timeout_ms || this.config.CONTROL_RESPONSE_TIMEOUT_MS || 15000);
    if (waitForResponse && (!Number.isFinite(responseTimeoutMs) || responseTimeoutMs <= 0)) {
      const error = new Error('response_timeout_ms must be a number > 0');
      error.statusCode = 400;
      throw error;
    }
    const requestedAtMs = Number(command.requested_at_ms) || Date.now();
    const requestedAt = command.requested_at || new Date(requestedAtMs).toISOString();
    const responseDeadlineAt =
      command.response_deadline_at ||
      new Date(requestedAtMs + responseTimeoutMs).toISOString();
    const commandSeq = Number.isFinite(Number(command.command_seq)) && Number(command.command_seq) > 0
      ? Number(command.command_seq)
      : this.nextCommandSeq();

    const job = {
      gateway_id: command.gateway_id,
      node_id: command.node_id || null,
      action_type: command.action_type ?? null,
      device: command.device ?? null,
      state: command.state ?? null,
      value: command.value ?? null,
      workflow_id: command.workflow_id ?? null,
      run_id: command.run_id ?? null,
      delayMs,
      wait_for_response: waitForResponse,
      response_timeout_ms: responseTimeoutMs,
      requested_at: requestedAt,
      requested_at_ms: requestedAtMs,
      response_deadline_at: responseDeadlineAt,
      dispatched_at: null,
      command_seq: commandSeq,
    };

    let resolveRequest;
    let rejectRequest;
    const completion = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });

    job.resolveRequest = resolveRequest;
    job.rejectRequest = rejectRequest;

    this.queue.push(job);
    this.emitStatus('queued', {
      job: this.publicJob(job),
      queued: this.queue.length,
      processing: this.processing
    });
    this.processQueue().catch((error) => {
      console.error('[controlQueueService] Queue error:', error.message);
    });

    return completion;
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
        let waiter = null;

        try {
          if (job.delayMs > 0) {
            this.emitStatus('delay_wait_started', {
              job: this.publicJob(job),
              delayMs: job.delayMs,
              queued: this.queue.length
            });
            await this.sleep(job.delayMs);
            this.emitStatus('delay_wait_completed', {
              job: this.publicJob(job),
              delayMs: job.delayMs,
              queued: this.queue.length
            });
          }

          if (job.wait_for_response) {
            if (!this.controlResponseWaiter) {
              const error = new Error('Control response waiter is not configured');
              error.statusCode = 503;
              throw error;
            }

            waiter = this.controlResponseWaiter.register(job, {
              timeoutMs: job.response_timeout_ms
            });
          }

          const dispatch = await this.publishNow(job);
          job.dispatched_at = dispatch?.dispatched_at || null;
          this.emitStatus('dispatched', {
            job: this.publicJob(job),
            dispatch,
            queued: this.queue.length
          });
          if (waiter && typeof waiter.setDispatchMeta === 'function') {
            waiter.setDispatchMeta({
              dispatched_at: job.dispatched_at,
            });
          }
          const controlResponse = waiter ? await waiter.promise : null;

          job.resolveRequest({
            queued: this.queue.length,
            processing: this.processing,
            job: this.publicJob(job),
            dispatch,
            control_response: controlResponse
          });
          this.emitStatus('completed', {
            job: this.publicJob(job),
            dispatch,
            control_response: controlResponse,
            queued: this.queue.length
          });
        } catch (error) {
          if (waiter) {
            waiter.cancel(error);
          }
          this.emitStatus('failed', {
            job: this.publicJob(job),
            queued: this.queue.length,
            error: error?.message || 'Queue job failed'
          });
          job.rejectRequest(error);
        }
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
      command_seq: command.command_seq,
      action_type: command.action_type,
      device: command.device,
      state: command.state,
      value: command.value ?? null,
      requested_at: command.requested_at || new Date().toISOString(),
      requested_at_ms: command.requested_at_ms || Date.now(),
      response_deadline_at: command.response_deadline_at || null,
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

    console.log(`[controlQueueService] Published to ${topic}: ${payload}`);

    return {
      topic,
      payload: JSON.parse(payload),
      dispatched_at: new Date().toISOString(),
    };
  }

  publicJob(job) {
    return {
      gateway_id: job.gateway_id,
      node_id: job.node_id,
      action_type: job.action_type,
      device: job.device,
      state: job.state,
      value: job.value,
      workflow_id: job.workflow_id,
      run_id: job.run_id,
      delayMs: job.delayMs,
      wait_for_response: job.wait_for_response,
      response_timeout_ms: job.response_timeout_ms,
      requested_at: job.requested_at,
      requested_at_ms: job.requested_at_ms,
      response_deadline_at: job.response_deadline_at,
      dispatched_at: job.dispatched_at,
      command_seq: job.command_seq,
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

  emitStatus(status, payload = {}) {
    if (!this.onStatus) {
      return;
    }
    const runId = payload?.run_id ?? payload?.job?.run_id ?? null
    const workflowId = payload?.workflow_id ?? payload?.job?.workflow_id ?? null
    try {
      this.onStatus({
        type: 'control_queue_status',
        status,
        ts: new Date().toISOString(),
        run_id: runId,
        workflow_id: workflowId,
        ...payload
      });
    } catch (error) {
      console.error('[controlQueueService] Failed to emit status:', error.message);
    }
  }

}

module.exports = ControlQueueService;

