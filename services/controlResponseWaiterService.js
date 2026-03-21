class ControlResponseWaiterService {
  constructor({ defaultTimeoutMs = 15000 } = {}) {
    this.defaultTimeoutMs = Number(defaultTimeoutMs) || 15000
    this.pending = new Map()
  }

  buildKey({ gateway_id, node_id, device, state }) {
    return [
      String(gateway_id || ''),
      String(node_id || ''),
      String(device || ''),
      String(state || '')
    ].join('::')
  }

  register(command, { timeoutMs } = {}) {
    const key = this.buildKey(command)
    if (!this.pending.has(key)) {
      this.pending.set(key, [])
    }

    const waitTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : this.defaultTimeoutMs
    const queue = this.pending.get(key)

    let settled = false
    let timeoutHandle = null
    let resolveFn = null
    let rejectFn = null

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      const list = this.pending.get(key)
      if (!list) {
        return
      }
      const index = list.findIndex((item) => item.resolve === resolveFn && item.reject === rejectFn)
      if (index >= 0) {
        list.splice(index, 1)
      }
      if (list.length === 0) {
        this.pending.delete(key)
      }
    }

    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
      queue.push({ resolve, reject })
    })

    timeoutHandle = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      const error = new Error(`Timed out waiting control status event (${waitTimeout} ms)`)
      error.statusCode = 504
      rejectFn(error)
    }, waitTimeout)

    return {
      promise,
      cancel: (reason) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        const error = reason instanceof Error ? reason : new Error(reason || 'Control command canceled')
        rejectFn(error)
      },
      resolve: (payload) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolveFn(payload)
      }
    }
  }

  resolveFromStatusEvent(event = {}) {
    const gatewayId = event.gateway_id
    const nodeId = event.node_id
    const device = event.command_device || event.device || null
    const state = event.command_state || event.state || null
    const key = this.buildKey({
      gateway_id: gatewayId,
      node_id: nodeId,
      device,
      state
    })

    const queue = this.pending.get(key)
    if (!queue || queue.length === 0) {
      return false
    }

    const next = queue.shift()
    if (queue.length === 0) {
      this.pending.delete(key)
    }

    if (next && typeof next.resolve === 'function') {
      next.resolve({
        gateway_id: gatewayId,
        node_id: nodeId,
        command_seq: event.command_seq ?? null,
        command_device: device,
        command_state: state,
        command_result: event.command_result ?? null,
        command_exec_ms: event.command_exec_ms ?? null,
        controller_states: Array.isArray(event.controller_states) ? event.controller_states : [],
        status_kv: event.status_kv ?? null,
        gateway_timestamp: event.gateway_timestamp ?? null,
        sensor_timestamp: event.sensor_timestamp ?? null,
        topic: event.topic ?? null
      })
      return true
    }

    return false
  }
}

module.exports = ControlResponseWaiterService
