const express = require('express')
const http = require('http')

const createHttpServer = () => {
  const app = express()
  const server = http.createServer(app)

  app.use(express.json())

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  return { app, server }
}

module.exports = {
  createHttpServer
}
