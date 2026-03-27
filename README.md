# IoT Core Server Documentation

## Project Introduction
The IoT Core Server is a robust platform designed for managing and processing data from IoT devices. It provides services to collect, analyze, and visualize data from connected devices.

## Cloud Role
The IoT Core Server acts as a middleware between the IoT devices and the cloud. It ensures secure data transmission, performs real-time data processing, and integrates seamlessly with cloud storage and computing services.

## Architecture
The architecture of the IoT Core Server consists of:
- **IoT Devices:** Sensors and actuators that collect or interact with data.
- **IoT Gateway:** Connects IoT devices to the IoT Core Server.
- **IoT Core Server:** The main server that processes incoming data, manages device connections, and facilitates data exchanges.
- **Cloud Services:** External services utilized for data storage, processing, and machine learning capabilities.

## Service Overview
- `controlAppService`: Application layer to enqueue control commands or build device-specific commands, and expose queue health.
- `controlQueueService`: Control command queue; enforces whitelist, handles delays, and publishes MQTT messages to gateways.
- `deviceStatusAppService`: Reads gateway snapshots from MQTT handlers and provides a utility to force all digital devices to `off`.
- `deviceWhitelistService`: Polls the control module for allowed gateways/nodes, merges whitelists, and tracks gateway status.
- `gatewaySseService`: Streams SSE events so clients receive real-time gateway updates.
- `metricCatalogService`: Exposes the configured metric catalog and returns metric-to-node mappings.
- `metricNodeMapService`: Aggregates sensor data to map metrics to the nodes that reported them.
- `metricQueryService`: Facade for metric data queries and a placeholder metric limit response.
- `sensorDataSaveService`: Persists sensor data to MongoDB and marks gateways online when data arrives.
- `sensorQueryService`: Queries sensor data by metric/sensor/node/gateway with pagination.
- `whitelistSyncService`: Returns whitelist snapshots and allows overrides, optionally notifying downstream updates.

## Setup Tutorial
### Prerequisites
- Install [Node.js](https://nodejs.org/) version 14 or greater.
- Install [Docker](https://www.docker.com/) for container management.
- Ensure you have network access to IoT devices.

### Installation Steps
1. **Clone the Repository**
   ```bash
   git clone https://github.com/IoTCoreTeam/iot-core-server.git
   cd iot-core-server
   ```
2. **Install Dependencies**
   ```bash
   npm install
   ```
3. **Run the Server**
   ```bash
   npm run dev
   ```

## Service Token Authentication
This server now authenticates internal calls from backend by a shared `SERVICE_TOKEN` (service-to-service auth).  
Role-based checks on control routes are removed at server layer; authorization is delegated to backend central auth.

### Environment variables
Configure these values in `server/.env`:

```env
SERVICE_TOKEN=replace-with-strong-shared-token
```

Backend must use the same value via `NODE_SERVER_SERVICE_TOKEN`.

### Verification flow
1. Backend sends one of:
   - `Authorization: Bearer <SERVICE_TOKEN>`, or
   - `X-Service-Token: <SERVICE_TOKEN>`
2. Server middleware compares token using timing-safe equality.
3. If matched, request is accepted; otherwise rejected.

### HTTP status behavior
- `401 Unauthorized`: missing or incorrect service token.
- `500 Internal Server Error`: `SERVICE_TOKEN` not configured on server.

### Protected routes
The following route groups require service token:
- `POST /v1/control/enqueue`
- `POST /v1/control/pump`
- `POST /v1/control/light`
- `POST /v1/control/ground-control`
- `GET /v1/device-status`
- `POST /v1/device-status/ensure-off`
- `GET /v1/whitelist`
- `POST /v1/whitelist`

### Extending Device Commands
To add a new device-specific control endpoint, register a new route in `server/routes/routeControl.js` and add a matching controller method in `server/controllers/controlController.js`.

Example route registration:

```js
router.post('/fan', requireAuth, allowWrite, controller.commandFan)
```

Example controller method:

```js
async function commandFan(req, res) {
  return commandDevice(req, res, 'fan')
}
```

Then expose the new method in the controller return object so the router can use it.

### Note about JWT settings
Legacy JWT environment variables may still exist in `.env`, but the current backend-to-server control flow uses `SERVICE_TOKEN`.
