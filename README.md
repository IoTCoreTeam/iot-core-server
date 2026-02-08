# IoT Core Server (kh-version)

Node.js service running:
- HTTP API (`APP_HOST`/`APP_PORT`, default `0.0.0.0:8017`)
- MQTT broker (`1883`)
- MongoDB write path for sensor metrics

## Current Data Flow

1. Gateway heartbeat (`esp32/heartbeat`)
- fields: `gateway_id`, `status`, `uptime`, `timestamp`

2. Node heartbeat (`esp32/nodes/heartbeat`, `esp32/controllers/heartbeat`)
- fields: `type`, `gateway_id`, `gateway_ip`, `gateway_mac`, `node_id`, `node_name`, `node_mac`, `sensor_id`, `status`, `uptime`, `heartbeat_seq`, `sensor_rssi`, `gateway_timestamp`, `sensor_timestamp`
- server uses this flow to keep `ip/mac` in memory (`nodeBuffer`) and publish SSE updates

3. Sensor data (`esp32/sensors/data`)
- gateway firmware drops sensor data if node is not in gateway whitelist
- payload stays metric-focused (no `gateway_ip/gateway_mac/node_mac`)
- server stores per-metric docs in MongoDB

## Whitelist Rules (Current)

- Gateway whitelist is checked in server before sensor DB write.
- Node whitelist is enforced at gateway layer.
- Server does not re-check node whitelist before sensor DB write.
- Node heartbeat can still be received/logged even when node is not whitelisted.
- `POST /v1/whitelist` triggers gateway whitelist sync over MQTT (retained):
  - topic: `esp32/whitelist/{gateway_id}`
  - payload: `type`, `gateway_id`, `nodes[]`, `updated_at`
  - each gateway only receives and applies node list mapped to itself (`gateway_nodes[gateway_id]`).

## Auto Whitelist Source

- Server polls: `http://127.0.0.1:8000/api/available-nodes`
- Expected JSON:
  - `success: true`
  - `data.gateways: string[]`
  - `data.nodes: string[]`
  - optional: `data.gateway_nodes: { [gatewayId]: string[] }`
- Mapping rule when `gateway_nodes` is missing:
  - if only one gateway exists, all `nodes` are assigned to that gateway
  - if multiple gateways exist, node mapping stays empty per gateway until `gateway_nodes` is provided
- Snapshot is pushed to gateways through retained MQTT whitelist messages.

## MongoDB Write Model

Collection: `SENSOR_COLLECTION_NAME` (default `sensor_readings`)

Each inserted sensor document contains:
- `gateway_id`
- `node_id`
- `sensor_id`
- `metric`
- `value`
- `unit`
- `timestamp`
- optional: `raw`, `status`

`ip/mac` are not written to MongoDB.

## SSE for App

Endpoint:
- `GET /events/gateways`

Event:
- `gateway-update`

Payload:
- `id`, `name`, `ip`, `mac`, `status`, `registered`, `lastSeen`
- `nodes[]` (if available in gateway buffer)
- each node: `id`, `node_id`, `gateway_id`, `name`, `ip`, `mac`, `status`, `registered`, `last_seen`, `node_type`

## Control API (Pump/Light)

- `POST /v1/control/pump`
- `POST /v1/control/light`
- `POST /v1/control/enqueue`
- `GET /v1/control/health`

MQTT publish topic:
- `esp32/commands/{gateway_id}`

## Setup

1. Install
```bash
npm install
```

2. Create `.env`
```env
APP_HOST=0.0.0.0
APP_PORT=8017
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_NAME=iot_core_system
SENSOR_COLLECTION_NAME=sensor_readings
SERVO_ACK_COLLECTION_NAME=servo_acks
CONTROL_ACK_COLLECTION_NAME=control_acks
CONTROL_COMMAND_TOPIC_PREFIX=esp32/commands
CONTROL_MODULE_AVAILABLE_NODES_URL=http://127.0.0.1:8000/api/available-nodes
WHITELIST_SYNC_INTERVAL_MS=30000
```

3. Run
```bash
npm run dev
```

## Manual Whitelist (PowerShell)

```powershell
$body = @{
  gateways = @("GW_001","GW_002","GW_003")
  nodes = @("node-sensor-001","node-control-001","node-sensor-002","node-sensor-003")
  gateway_nodes = @{
    GW_001 = @("node-sensor-001","node-control-001")
    GW_002 = @("node-sensor-002")
    GW_003 = @("node-sensor-003")
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8017/v1/whitelist" `
  -ContentType "application/json" `
  -Body $body
```

## MAC Notes

- `GW_001`: `00:70:07:7E:7D:3C`
- `GW_002`: `00:70:07:E5:F2:58`
- `node-control-001`: `00:70:07:E6:B6:7C`
- `GW_003`: `TBD`
