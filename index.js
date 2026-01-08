const express = require('express')
const { routeMetricData } = require('./routes/routeMetricData')
const { router: whiteListRouter } = require('./routes/routeWhiteList')
const { connect, close } = require('./config/db')
const env = require('./config/env')
const deviceWhiteList = require('./services/deviceWhiteList')

const app = express()

app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  next()
})

app.get('/health', (_req, res) => {res.json({ status: 'ok' })}) // chỉ có nhiệm vụ duy nhất là check server có đang chạy không

app.use('/v1/sensors', routeMetricData)
app.use('/v1/whitelist', whiteListRouter) // route này để nhận update các thiết bị được đăng ký từ control module

const port = Number(env.APP_PORT || 8017)
const host = env.APP_HOST || '0.0.0.0'

const startServer = async () => {
  try {
    await connect()
    app.listen(port, host, () => {
      console.log(`Server listening on http://${host}:${port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    await close()
    process.exit(1)
  }
}

startServer()
