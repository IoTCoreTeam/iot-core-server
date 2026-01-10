# IoT Core Server

Small Node.js service that hosts:
- an embedded MQTT broker (`aedes`, port 1883) for gateways to publish sensor data.
- an HTTP + WebSocket API (port 8017) that fronts MongoDB data and streams real-time gateway events.
- a MongoDB backend that persistently stores sensor readings and heartbeats.

---

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Copy `.env.example` → `.env` and adjust**  
   Required values:
   - `MONGODB_URI`: connection string for MongoDB.
   - `DATABASE_NAME`: database name (default `sensor_readings`).
   - `SENSOR_COLLECTION_NAME`: collection for readings (default `sensor_readings`).
   - `APP_HOST` / `APP_PORT`: HTTP server binding.
   - `MQTT_PORT`: broker port (1883 default).
   - Token and integration overrides as needed.
3. **Start the server**
   ```bash
   npm run dev
   ```
4. **Optional: run the simulator**
   ```bash
   node mqtt/gateway-simulator.js
   ```
5. **Verify data**
   ```bash
   node test/checkSensorData.js
   node test/testAPI.js
   ```

---

## Directory structure

- `config/`
  - `env.js`: loads defaults for MongoDB, MQTT, HTTP and collection names.
  - `db.js`: shared MongoDB client helpers.
- `mqtt/`
  - `mqttHandle.js`: core MQTT message handling (see flow below).
  - `gateway-simulator.js`: publishes sample sensor/heartbeat payloads for local testing.
- `routes/`
  - `routeMetricData.js`: exposes `/v1/sensors` read endpoints.
  - `routeWhiteList.js`: GET/POST whitelist manipulation and snapshot.
- `services/`
  - `sensorService.js`: wraps MongoDB queries used by REST handlers.
  - `deviceWhiteList.js`: polls the control module for allowed gateways/nodes, tracks gateway online status, and exposes helper APIs.
  - `sseGatewayService.js`: manages Server-Sent Events clients that receive gateway updates.
- `models/`: schema helpers used by controllers/services.
- `controllers/`: request handlers for metric routes.
- `scripts/` & `test/`: utilities and smoke tests for MQTT and HTTP flows.
- `index.js`: boots Express + Socket.IO, registers MQTT handlers, SSE route, and rate limiting logic.
- `package.json` / `package-lock.json`: dependency metadata.

---

## Key features

- **MQTT ingestion** with buffering + per-gateway rate limiting before persisting to MongoDB.
- **Whitelist-aware processing**: only registered gateways marked as `online` are persisted; whitelist snapshot endpoint includes current statuses.
- **Server-Sent Events** on `/events/gateways` to stream gateway metadata (id, name, status, last seen) to clients.
- **Heartbeat tracking** that normalizes statuses and writes to the `heartbeats` collection when gateways are active.
- **Sensor data API** (`/v1/sensors`) backed by `sensorService.js`, plus Socket.IO for real-time WebSocket clients.
- **Simulator** that emits sensor readings and heartbeats every 10 seconds and obeys configurable heartbeat intervals.

---

## `mqtt/mqttHandle.js` flow 

1. **Initialization**
   - Dependency-injected services include MongoDB access, whitelist service, SSE gateway service, and configuration defaults.
   - A per-gateway buffer holds nodes while the handler waits for multiple node messages (timeout 10s).

2. **Sensor data handling**
   - Incoming payloads are parsed and gateway metadata extracted (ID, MAC, IP, timestamp, nodes, sensors).
   - The handler checks the whitelist: gateway registration status is looked up, and sensors may be filtered if needed.
   - Gateway status is updated (`deviceWhiteList.setGatewayStatus`), and buffered data tracks node counts plus latest gateway info.
   - If SSE clients exist, a `gateway-update` event is emitted with id/name/ip/mac/status/registered/lastSeen.
   - When the buffer flushes, the handler skips MongoDB writes unless the gateway is online and registered; otherwise the buffer is cleared.
   - MongoDB writes use the collection defined by `SENSOR_COLLECTION_NAME` and log inserted document IDs plus node summaries.

3. **Heartbeat handling**
   - Payloads are normalized (`status` coerced to `online`/`inactive`) and the whitelist status map is updated.
   - Heartbeats from non-whitelisted gateways are logged and ignored.
   - Only `online` and registered gateways insert documents into the `heartbeats` collection, storing timestamps and uptime.
   - The SSE service receives a gateway update for every heartbeat to keep clients in sync.

4. **Buffer & cleanup**
   - Each gateway buffer uses a timer to batch sensor readings (two nodes expected before writing).
   - If MongoDB isn’t ready when the timer fires, the handler logs and keeps trying until the buffer is processed.
   - Errors during parsing/logging are caught and reported without crashing the broker.

This flow keeps data consistent: only approved gateways contribute to MongoDB, status changes propagate to SSE consumers, and heartbeats reinforce whether a gateway can write.
