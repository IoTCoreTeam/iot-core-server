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
