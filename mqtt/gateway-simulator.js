const mqtt = require('mqtt');

// ═══════════════════════════════════════════════════════════════
// MQTT Configuration
// ═══════════════════════════════════════════════════════════════
const MQTT_CONFIG = {
  broker: 'mqtt://localhost:1883',
  clientId: `gateway_simulator_${Math.random().toString(16).slice(3)}`,
  topics: {
    sensors: 'esp32/sensors/data',
    heartbeat: 'esp32/heartbeat',
    servoAck: 'esp32/servo/ack'
  },
  interval: 10000 // 10 giây
};

// ═══════════════════════════════════════════════════════════════
// 2 GATEWAYS, mỗi gateway có 2 NODES
// ═══════════════════════════════════════════════════════════════
const GATEWAYS = [
  {
    id: 'gateway-001',
    name: 'Gateway #1',
    ip: '192.168.1.100',
    mac: '00:70:07:7E:7D:3C',
    nodes: [
      { id: 'node-001', name: 'Node #1', ip: '192.168.1.101', mac: '4C:C3:82:0D:52:54' },
      { id: 'node-002', name: 'Node #2', ip: '192.168.1.102', mac: '4C:C3:82:0D:52:55' }
    ]
  },
  {
    id: 'gateway-002',
    name: 'Gateway #2',
    ip: '192.168.1.200',
    mac: 'AA:BB:CC:DD:EE:FF',
    nodes: [
      { id: 'node-003', name: 'Node #3', ip: '192.168.1.201', mac: '11:22:33:44:55:66' },
      { id: 'node-004', name: 'Node #4', ip: '192.168.1.202', mac: '77:88:99:AA:BB:CC' }
    ]
  }
];

const client = mqtt.connect(MQTT_CONFIG.broker, {
  clientId: MQTT_CONFIG.clientId,
  clean: true,
  reconnectPeriod: 1000
});

function generateSensorData(gateway, node) {
  const now = new Date();
  return {
    gateway_id: gateway.id,
    gateway_ip: gateway.ip,
    gateway_mac: gateway.mac,
    node_id: node.id,
    node_ip: node.ip,
    node_mac: node.mac,
    sensors: [
      { id: `${node.id}-temp`, type: "temperature", name: "Temperature", value: parseFloat((20 + Math.random() * 10).toFixed(1)), unit: "°C" },
      { id: `${node.id}-humid`, type: "humidity", name: "Humidity", value: Math.floor(40 + Math.random() * 40), unit: "%" },
      { id: `${node.id}-light`, type: "light", name: "Light", value: Math.floor(Math.random() * 101), unit: "%", raw: Math.floor(Math.random() * 4096) },
      { id: `${node.id}-rain`, type: "rain", name: "Rain", value: Math.floor(Math.random() * 101), unit: "%", raw: Math.floor(Math.random() * 4096), status: Math.random() > 0.7 ? "wet" : "dry" }
    ],
    sensor_timestamp: now.toISOString(),
    gateway_timestamp: now.toISOString(),
    sensor_rssi: Math.floor(Math.random() * 30) - 90,
    gateway_rssi: Math.floor(Math.random() * 30) - 80
  };
}

function generateHeartbeat(gateway) {
  return {
    gateway_id: gateway.id,
    status: 'online',
    uptime: Math.floor(Math.random() * 86400000),
    timestamp: new Date().toISOString()
  };
}

function publishAllSensors() {
  console.log('\n' + '═'.repeat(70));
  console.log(`📡 Publishing at ${new Date().toISOString()}`);
  console.log('═'.repeat(70));

  let delayIndex = 0;
  GATEWAYS.forEach((gateway) => {
    gateway.nodes.forEach((node) => {
      setTimeout(() => {
        const data = generateSensorData(gateway, node);
        client.publish(MQTT_CONFIG.topics.sensors, JSON.stringify(data), { qos: 1 }, (err) => {
          if (err) {
            console.error(`❌ ${gateway.id}/${node.id}: ${err.message}`);
          } else {
            console.log(`✅ ${gateway.id} -> ${node.id}: Temp=${data.sensors[0].value}°C, Humid=${data.sensors[1].value}%, Light=${data.sensors[2].value}%, Rain=${data.sensors[3].value}% (${data.sensors[3].status})`);
          }
        });
      }, delayIndex * 1000);
      delayIndex++;
    });
  });
}

function publishHeartbeat() {
  GATEWAYS.forEach((gateway) => {
    const data = generateHeartbeat(gateway);
    client.publish(MQTT_CONFIG.topics.heartbeat, JSON.stringify(data), { qos: 1 }, (err) => {
      if (!err) console.log(`💓 Heartbeat: ${gateway.id}`);
    });
  });
}

client.on('connect', () => {
  console.log('\n' + '═'.repeat(70));
  console.log('🚀 MQTT SIMULATOR - 2 GATEWAYS, 4 NODES');
  console.log('═'.repeat(70));
  console.log(`📡 Broker: ${MQTT_CONFIG.broker}`);
  GATEWAYS.forEach((gw, i) => {
    console.log(`\nGateway ${i + 1}: ${gw.id} (${gw.mac})`);
    gw.nodes.forEach(n => console.log(`   - ${n.id} (${n.mac})`));
  });
  console.log(`\n⏱️  Interval: ${MQTT_CONFIG.interval / 1000}s`);
  console.log('═'.repeat(70));

  publishAllSensors();
  publishHeartbeat();

  setInterval(publishAllSensors, MQTT_CONFIG.interval);
  setInterval(publishHeartbeat, 30000);
});

client.on('error', (err) => console.error('❌ Error:', err.message));
client.on('offline', () => console.log('📴 Offline'));
client.on('reconnect', () => console.log('🔄 Reconnecting...'));

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping...');
  client.end();
  process.exit(0);
});