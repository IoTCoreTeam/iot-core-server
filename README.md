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

## JWT Authentication and RBAC
This server verifies incoming Bearer access tokens using an RSA public key (`RS256`) and authorizes requests by role/scope claims for control commands.

### Public key location
- Default key path: `server/storage/oauth-public.key`
- This key file is now ignored by git via `storage/*.key` in `.gitignore`.

### Environment variables
Configure these values in `server/.env`:

```env
JWT_PUBLIC_KEY_PATH=storage/oauth-public.key
JWT_ISSUER=
JWT_AUDIENCE=
JWT_ALGORITHMS=RS256
JWT_ROLE_CLAIM=roles
JWT_SCOPE_CLAIM=scope
JWT_CLOCK_TOLERANCE_SEC=5
```

Notes:
- Set `JWT_ISSUER` and `JWT_AUDIENCE` to match your auth provider.
- `JWT_ROLE_CLAIM` and `JWT_SCOPE_CLAIM` can be changed to match your token payload format.

### Verification flow
1. Client sends `Authorization: Bearer <access_token>`.
2. Server verifies JWT signature with `JWT_PUBLIC_KEY_PATH`.
3. Server validates claims (`exp`, `nbf`, algorithm, and optional `iss`/`aud`).
4. Decoded payload is attached to `req.auth` and `req.user`.
5. Authorization middleware checks roles/scopes and grants or denies access.

### HTTP status behavior
- `401 Unauthorized`: missing/invalid Bearer token, bad signature, expired token.
- `403 Forbidden`: token is valid but does not have required role/scope.

### Current route policy
- Control command routes require one of: `admin`, `engineer`
  - `POST /v1/control/enqueue`
  - `POST /v1/control/pump`
  - `POST /v1/control/light`
- Other routes currently do not enforce JWT/role checks at server route layer.
