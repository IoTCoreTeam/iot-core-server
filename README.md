# IoT Core Main Server - MQTT & API Server

## 📋 Tổng Quan

Server Node.js xử lý:
- **MQTT Broker** (port 1883) - nhận dữ liệu từ gateways
- **HTTP/WebSocket API** (port 8017) - cung cấp dữ liệu cho frontend
- **MongoDB** - lưu trữ sensor data

---

## ⚙️ Cài Đặt

### 1. Install Dependencies
```bash
cd iot-core-main-server
npm install
```

### 2. Configure `.env`
```env
# MongoDB
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/
DATABASE_NAME=iot-sensor

# Server
PORT=8017
HOST=localhost
NODE_ENV=development
```

---

## 🚀 Chạy Server

```bash
npm run dev
```

**Expected output:**
```
Successfully connected to MongoDB
✓ HTTP/WebSocket server listening on http://0.0.0.0:8017
✓ MQTT broker listening on port 1883
```

---

## 🧪 Test

### 1. Test MongoDB Connection
```bash
node test/checkMongoConnection.js
```
✅ Kết quả: `Successfully connected to MongoDB`

### 2. Test MQTT + MongoDB Flow

**Bước 1:** Start server
```bash
npm run dev
```

**Bước 2:** Chạy simulator (terminal mới)
```bash
node mqtt/gateway-simulator.js
```

**Expected output:**
```
🚀 MQTT SIMULATOR - 2 GATEWAYS, 4 NODES

Gateway 1: gateway-001 (00:70:07:7E:7D:3C)
   - node-001
   - node-002
Gateway 2: gateway-002 (AA:BB:CC:DD:EE:FF)
   - node-003
   - node-004

✅ gateway-001 -> node-001: Temp=25.3°C, Humid=65%, Light=78%, Rain=12%
✅ gateway-001 -> node-002: Temp=27.1°C, Humid=54%, Light=98%, Rain=46%
✅ gateway-002 -> node-003: Temp=29.6°C, Humid=56%, Light=51%, Rain=33%
✅ gateway-002 -> node-004: Temp=26.8°C, Humid=78%, Light=100%, Rain=46%
```

**Bước 3:** Check data đã lưu vào MongoDB
```bash
node test/checkSensorData.js
```

**Expected output:**
```
Total documents in sensor_readings: 150

Latest 5 documents:

--- Document 1 ---
ID: 67...
Gateway ID: gateway-001
Gateway MAC: 00:70:07:7E:7D:3C
Number of nodes: 2

  Node 1: node-001
  Sensors: 4
    1. temperature: 25.3°C (ID: node-001-temp)
    2. humidity: 65% (ID: node-001-humid)
    3. light: 78% (ID: node-001-light)
    4. rain: 12% (ID: node-001-rain)

  Node 2: node-002
  Sensors: 4
    1. temperature: 27.1°C (ID: node-002-temp)
    ...

📊 Statistics by Gateway:
  gateway-001: 75 documents
  gateway-002: 75 documents
```

### 3. Test API Endpoints
```bash
node test/testAPI.js
```

**Expected output:**
```
📊 Test 1: Get Temperature Data (limit 5)
✅ Status: 200
📈 Results: 30 records
Sample data:
  1. Temperature: 25.3°C at 2026-01-09T03:45:00.000Z
  2. Temperature: 27.1°C at 2026-01-09T03:45:01.000Z

💧 Test 2: Get Humidity Data (limit 3)
✅ Status: 200
📈 Results: 30 records

✅ All API tests passed successfully!
```

---

## 📡 API Usage

### Base URL
```
http://127.0.0.1:8017
```

### Endpoints

#### 1. Health Check
```bash
curl http://127.0.0.1:8017/health
```

#### 2. Query Sensor Data
```bash
# Temperature
curl "http://127.0.0.1:8017/v1/sensors/query?sensor_type=temperature&limit=10"

# Humidity
curl "http://127.0.0.1:8017/v1/sensors/query?sensor_type=humidity&limit=10"

# Light
curl "http://127.0.0.1:8017/v1/sensors/query?sensor_type=light&limit=10"

# Rain
curl "http://127.0.0.1:8017/v1/sensors/query?sensor_type=rain&limit=10"

# Specific sensor
curl "http://127.0.0.1:8017/v1/sensors/query?sensor_type=temperature&sensor_id=node-001-temp&limit=10"
```

**Parameters:**
- `sensor_type` (required): `temperature`, `humidity`, `light`, `rain`
- `sensor_id` (optional): Specific sensor ID
- `limit` (optional): 1-100 (default: 30)
- `page` (optional): Page number
- `time_field` (optional): `sec`, `minute`, `hour`, `day`

**Response:**
```json
[
  {
    "id": "node-001-temp",
    "type": "temperature",
    "name": "Temperature",
    "value": 25.3,
    "unit": "°C",
    "timestamp": "2026-01-09T03:45:00.000Z"
  }
]
```

---

## 🛠️ Troubleshooting

### Port đã được sử dụng
```bash
# Windows - Kill process on port 8017
netstat -ano | findstr :8017
taskkill /PID <PID> /F

# Hoặc đổi port trong .env
PORT=8018
```

### MongoDB connection failed
Kiểm tra:
1. ✅ `MONGODB_URI` trong `.env` đúng
2. ✅ Network có kết nối được MongoDB Atlas
3. ✅ Username/password đúng

### MQTT không nhận data
```bash
# 1. Check MQTT broker có chạy không
# Server logs phải có: "MQTT broker listening on port 1883"

# 2. Restart server
# Ctrl+C, sau đó: npm run dev

# 3. Restart simulator
node mqtt/gateway-simulator.js
```

### API trả về 0 records
```bash
# 1. Check MongoDB có dữ liệu
node test/checkSensorData.js

# 2. Restart server để load code mới
# Ctrl+C
npm run dev

# 3. Chờ simulator gửi data mới (10 giây)
```

---

## 📂 File Structure

```
iot-core-main-server/
├── config/
│   ├── db.js              # MongoDB connection
│   └── env.js             # Environment variables
├── controllers/
│   └── sensorController.js
├── models/
│   └── sensorModel.js
├── mqtt/
│   ├── mqttHandle.js      # MQTT message handler
│   └── gateway-simulator.js # Test simulator
├── routes/
│   ├── routeMetricData.js
│   └── routeWhiteList.js
├── services/
│   ├── sensorService.js   # Query logic
│   └── deviceWhiteList.js
├── test/
│   ├── checkMongoConnection.js
│   ├── checkSensorData.js
│   ├── testAPI.js
│   ├── debugMqtt.js
│   └── showStructure.js
├── index.js               # Main entry point
├── package.json
└── .env
```

---

## 📊 Data Flow

```
ESP32 Gateway → MQTT (port 1883) → mqttHandle.js → MongoDB
                                                      ↓
Frontend/App ← HTTP API (port 8017) ← sensorService.js
```

---

## 🎯 Quick Start (TL;DR)

```bash
# 1. Install
npm install

# 2. Configure .env
# Set MONGODB_URI and DATABASE_NAME

# 3. Start server
npm run dev

# 4. Test (terminal mới)
node mqtt/gateway-simulator.js

# 5. Verify
node test/checkSensorData.js
node test/testAPI.js
```

---

## 📝 Notes

- **Whitelist bypassed** trong `mqttHandle.js` (lines 72-86) để test
- **Rate limit**: 100 requests/minute per gateway
- **Buffer timeout**: 10 seconds
- **Simulator interval**: 10 seconds
- **Cấu hình**: 2 gateways, 4 nodes, 4 sensors/node

---

## 🔗 Related

- Control Module: http://127.0.0.1:8100
- MQTT Broker: mqtt://localhost:1883
- MongoDB: Check `.env` for connection string
