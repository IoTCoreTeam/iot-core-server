const { Server } = require('socket.io')

const attachSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  io.on('connection', (socket) => {
    console.log('WebSocket client connected:', socket.id)

    socket.on('REQUEST_DEVICE_STATUS', () => {
      try {
        socket.emit('DEVICE_STATUS_UPDATE', {
          gateways: [],
          nodes: [],
          devices: {
            activeRegistered: []
          }
        })
      } catch (err) {
        console.error('REQUEST_DEVICE_STATUS error:', err)
      }
    })

    socket.on('disconnect', () => {
      console.log('WebSocket client disconnected:', socket.id)
    })
  })

  return io
}

module.exports = {
  attachSocket
}
