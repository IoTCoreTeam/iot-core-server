class ControlQueueSseService {
  constructor() {
    this.clients = new Set()
    this.eventId = 0
  }

  registerRoute(app, path = '/events/control-queue') {
    app.get(path, (req, res) => this.handleRequest(req, res))
  }

  handleRequest(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.flushHeaders()

    const readyMessage = `event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`
    res.write(readyMessage)
    this.clients.add(res)

    req.on('close', () => {
      this.clients.delete(res)
      res.end()
    })
  }

  sendStatus(payload) {
    if (!this.clients.size) {
      return
    }

    this.broadcast('control-queue-status', payload)
  }

  sendWorkflowStatus(payload) {
    if (!this.clients.size) {
      return
    }

    this.broadcast('workflow-status', payload)
  }

  broadcast(eventName, payload) {
    const id = ++this.eventId
    const body = JSON.stringify(payload)
    const chunk = `id: ${id}\nevent: ${eventName}\ndata: ${body}\n\n`
    this.clients.forEach((client) => {
      client.write(chunk)
    })
  }
}

module.exports = ControlQueueSseService
