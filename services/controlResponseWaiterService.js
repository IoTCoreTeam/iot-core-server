class ControlResponseWaiterService {
  constructor({ defaultTimeoutMs = 15000 } = {}) {
    this.defaultTimeoutMs = Number(defaultTimeoutMs) || 15000
    this.pending = new Map()
    this.pendingBySeq = new Map()
  }

  buildKey({ gateway_id, node_id, device, state }) {
    return [
      String(gateway_id || ''),
      String(node_id || ''),
      String(device || ''),
      String(state || '')
    ].join('::')
  }

  buildSeqKey({ gateway_id, node_id, command_seq }) {
    const seq = Number(command_seq)
    if (!Number.isFinite(seq) || seq <= 0) {
      return null
    }
    return [String(gateway_id || ''), String(node_id || ''), String(seq)].join('::')
  }

  addSeqEntry(seqKey, entry) {
    if (!seqKey) {
      return
    }
    if (!this.pendingBySeq.has(seqKey)) {
      this.pendingBySeq.set(seqKey, [])
    }
    this.pendingBySeq.get(seqKey).push(entry)
  }

  removeSeqEntry(seqKey, entry) {
    if (!seqKey) {
      return
    }
    const list = this.pendingBySeq.get(seqKey)
    if (!list || list.length === 0) {
      return
    }
    const index = list.indexOf(entry)
    if (index >= 0) {
      list.splice(index, 1)
    }
    if (list.length === 0) {
      this.pendingBySeq.delete(seqKey)
    }
  }

  removePendingEntry(key, entry) {
    const list = this.pending.get(key)
    if (!list || list.length === 0) {
      return
    }
    const index = list.indexOf(entry)
    if (index >= 0) {
      list.splice(index, 1)
    }
    if (list.length === 0) {
      this.pending.delete(key)
    }
  }

  popPendingEntryBySeq(seqKey) {
    if (!seqKey) {
      return null
    }
    const list = this.pendingBySeq.get(seqKey)
    if (!list || list.length === 0) {
      return null
    }
    const entry = list.shift()
    if (list.length === 0) {
      this.pendingBySeq.delete(seqKey)
    }
    return entry || null
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
    const seqKey = this.buildSeqKey({
      gateway_id: command?.gateway_id,
      node_id: command?.node_id,
      command_seq: command?.command_seq
    })

    const metadata = {
      command_seq: Number.isFinite(Number(command?.command_seq))
        ? Number(command.command_seq)
        : null,
      requested_at: command?.requested_at ?? null,
      requested_at_ms: Number.isFinite(Number(command?.requested_at_ms))
        ? Number(command.requested_at_ms)
        : null,
      response_deadline_at: command?.response_deadline_at ?? null,
      dispatched_at: command?.dispatched_at ?? null,
    }

    const entry = {
      key,
      seqKey,
      metadata,
      resolve: null,
      reject: null
    }

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
        timeoutHandle = null
      }
      this.removePendingEntry(key, entry)
      this.removeSeqEntry(seqKey, entry)
    }

    const promise = new Promise((resolve, reject) => {
      entry.resolve = resolve
      entry.reject = reject
      queue.push(entry)
      this.addSeqEntry(seqKey, entry)
    })

    timeoutHandle = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      const error = new Error(`Timed out waiting control status event (${waitTimeout} ms)`)
      error.statusCode = 504
      entry.reject(error)
    }, waitTimeout)

    return {
      promise,
      setDispatchMeta: (meta = {}) => {
        metadata.dispatched_at = meta.dispatched_at ?? metadata.dispatched_at ?? null
      },
      cancel: (reason) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        const error = reason instanceof Error ? reason : new Error(reason || 'Control command canceled')
        entry.reject(error)
      },
      resolve: (payload) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        entry.resolve(payload)
      }
    }
  }

  resolveFromStatusEvent(event = {}) {
    const gatewayId = event.gateway_id
    const nodeId = event.node_id
    const device = event.command_device || event.device || null
    const state = event.command_state || event.state || null

    const seqKey = this.buildSeqKey({
      gateway_id: gatewayId,
      node_id: nodeId,
      command_seq: event.command_seq
    })

    let next = this.popPendingEntryBySeq(seqKey)

    if (next) {
      this.removePendingEntry(next.key, next)
    } else {
      const key = this.buildKey({
        gateway_id: gatewayId,
        node_id: nodeId,
        device,
        state
      })

      const queue = this.pending.get(key)
      if (!queue || queue.length === 0) {
        return null
      }

      next = queue.shift()
      if (queue.length === 0) {
        this.pending.delete(key)
      }
      this.removeSeqEntry(next?.seqKey, next)
    }

    if (next && typeof next.resolve === 'function') {
      const correlation = next.metadata || {}
      next.resolve({
        gateway_id: gatewayId,
        node_id: nodeId,
        command_seq: event.command_seq ?? correlation.command_seq ?? null,
        command_device: device,
        command_state: state,
        command_result: event.command_result ?? null,
        command_exec_ms: event.command_exec_ms ?? null,
        requested_at: correlation.requested_at ?? null,
        requested_at_ms: correlation.requested_at_ms ?? null,
        response_deadline_at: correlation.response_deadline_at ?? null,
        dispatched_at: correlation.dispatched_at ?? null,
        controller_states: Array.isArray(event.controller_states) ? event.controller_states : [],
        status_kv: event.status_kv ?? null,
        gateway_timestamp: event.gateway_timestamp ?? null,
        sensor_timestamp: event.sensor_timestamp ?? null,
        topic: event.topic ?? null
      })
      return {
        matched: true,
        correlation
      }
    }

    return null
  }
}

module.exports = ControlResponseWaiterService

