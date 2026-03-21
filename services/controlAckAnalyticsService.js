const { listControlAcks } = require('../models/controlAckModel')

const DAY_IN_HOURS = 24
const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const parseDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

const normalizeStatus = (value) => String(value || '').trim().toLowerCase()
const normalizeState = (value) => String(value || '').trim().toLowerCase()

const classifyStatus = (status) => {
  if (!status) return 'unknown'
  if (status.includes('timeout')) return 'timeout'
  if (
    status.includes('fail') ||
    status.includes('error') ||
    status.includes('reject') ||
    status.includes('offline')
  ) {
    return 'failed'
  }
  if (
    status.includes('applied') ||
    status.includes('dispatch') ||
    status.includes('success') ||
    status.includes('ack') ||
    status.includes('ok') ||
    status.includes('complete')
  ) {
    return 'success'
  }
  return 'unknown'
}

const toBucketDate = (date, bucket) => {
  const bucketDate = new Date(date)
  bucketDate.setSeconds(0, 0)
  if (bucket === 'hour') {
    bucketDate.setMinutes(0, 0, 0)
  }
  return bucketDate
}

const buildTimelineBuckets = ({ since, now, bucket }) => {
  const stepMs = bucket === 'hour' ? MS_PER_HOUR : MS_PER_MINUTE
  const buckets = []
  const cursor = new Date(since)

  if (bucket === 'hour') {
    cursor.setMinutes(0, 0, 0)
  } else {
    cursor.setSeconds(0, 0)
  }

  while (cursor <= now) {
    buckets.push(new Date(cursor))
    cursor.setTime(cursor.getTime() + stepMs)
  }

  return buckets
}

const emptyBucket = (bucketDate) => ({
  bucket: bucketDate.toISOString(),
  on: 0,
  off: 0,
  success: 0,
  failed: 0,
  timeout: 0,
  unknown: 0,
  avg_latency_ms: null,
  p95_latency_ms: null
})

const roundNumber = (value) => Math.round(value * 100) / 100

const percentile = (values, p) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  )
  return sorted[index]
}

const getControlAckOverview = async ({ hours = DAY_IN_HOURS, bucket = 'hour' } = {}) => {
  const safeHours = clamp(Number(hours) || DAY_IN_HOURS, 1, 168)
  const safeBucket = bucket === 'minute' ? 'minute' : 'hour'
  const now = new Date()
  const since = new Date(now.getTime() - safeHours * MS_PER_HOUR)

  const rows = await listControlAcks({ since })
  const timeline = buildTimelineBuckets({ since, now, bucket: safeBucket })
  const bucketMap = new Map(timeline.map((bucketDate) => [bucketDate.toISOString(), emptyBucket(bucketDate)]))
  const latencyByBucket = new Map()

  rows.forEach((row) => {
    const eventTime = parseDate(row.timestamp) || parseDate(row.received_at)
    if (!eventTime) return
    if (eventTime < since) return
    if (eventTime > now) return

    const bucketKey = toBucketDate(eventTime, safeBucket).toISOString()
    const current = bucketMap.get(bucketKey)
    if (!current) return

    const state = normalizeState(row.state)
    if (state === 'on') current.on += 1
    if (state === 'off') current.off += 1

    const statusClass = classifyStatus(normalizeStatus(row.status))
    current[statusClass] += 1

    const sentAt = parseDate(row.timestamp)
    const receivedAt = parseDate(row.received_at)
    if (sentAt && receivedAt) {
      const latency = receivedAt.getTime() - sentAt.getTime()
      if (Number.isFinite(latency) && latency >= 0 && latency <= 24 * MS_PER_HOUR) {
        const list = latencyByBucket.get(bucketKey) || []
        list.push(latency)
        latencyByBucket.set(bucketKey, list)
      }
    }
  })

  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime())
    .map((item) => {
      const latencyValues = latencyByBucket.get(item.bucket) || []
      if (!latencyValues.length) return item
      const sum = latencyValues.reduce((total, value) => total + value, 0)
      const avg = sum / latencyValues.length
      const p95 = percentile(latencyValues, 95)
      return {
        ...item,
        avg_latency_ms: roundNumber(avg),
        p95_latency_ms: p95 === null ? null : roundNumber(p95)
      }
    })

  const totals = buckets.reduce(
    (acc, item) => {
      acc.on += item.on
      acc.off += item.off
      acc.success += item.success
      acc.failed += item.failed
      acc.timeout += item.timeout
      acc.unknown += item.unknown
      return acc
    },
    { on: 0, off: 0, success: 0, failed: 0, timeout: 0, unknown: 0 }
  )

  return {
    range_hours: safeHours,
    bucket: safeBucket,
    buckets,
    totals: {
      ...totals,
      total: totals.success + totals.failed + totals.timeout + totals.unknown
    }
  }
}

module.exports = {
  getControlAckOverview
}
