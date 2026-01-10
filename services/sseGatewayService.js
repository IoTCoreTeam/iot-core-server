class SSEGatewayService {
  constructor() {
    this.clients = new Set()
    this.eventId = 0
  }

  registerRoute(app, path = '/events/gateways') {
    app.get(path, (req, res) => this.handleRequest(req, res))
  }

  handleRequest(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.flushHeaders()

    const message = `event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`
    res.write(message)
    this.clients.add(res)

    req.on('close', () => {
      this.clients.delete(res)
      res.end()
    })
  }

  sendGatewayUpdate(payload) {
    if (!this.clients.size) {
      return
    }

    const id = ++this.eventId
    const body = JSON.stringify(payload)
    const chunk = `id: ${id}\nevent: gateway-update\ndata: ${body}\n\n`

    this.clients.forEach((client) => {
      client.write(chunk)
    })
  }
}

module.exports = SSEGatewayService
