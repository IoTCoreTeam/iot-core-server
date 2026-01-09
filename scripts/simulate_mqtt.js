const mqtt = require('mqtt');

// Connect to the local MQTT broker
const client = mqtt.connect('mqtt://localhost:1883');

const GATEWAYS = ['gateway-001', 'gateway-002'];
const NODES = ['node-001', 'node-002'];

function generateSensorData(gatewayId, nodeId) {
    const timestamp = new Date().toISOString();
    return {
        gateway_id: gatewayId,
        gateway_ip: '192.168.1.100',
        gateway_mac: 'AA:BB:CC:DD:EE:FF',
        node_id: nodeId,
        node_ip: '192.168.1.101',
        node_mac: '11:22:33:44:55:66',
        gateway_timestamp: timestamp,
        sensor_timestamp: timestamp,
        sensor_rssi: -60,
        gateway_rssi: -50,
        sensors: [
            {
                id: 'temp-sensor-' + nodeId,
                type: 'temperature',
                name: 'Temperature Sensor',
                value: 25 + Math.random() * 5,
                unit: '°C',
                status: 'active'
            },
            {
                id: 'humid-sensor-' + nodeId,
                type: 'humidity',
                name: 'Humidity Sensor',
                value: 60 + Math.random() * 10,
                unit: '%',
                status: 'active'
            },
            {
                id: 'light-sensor-' + nodeId,
                type: 'light',
                name: 'Light Sensor',
                value: 500 + Math.random() * 100,
                unit: 'lux',
                status: 'active'
            },
            {
                id: 'soil-sensor-' + nodeId,
                type: 'soil_moisture',
                name: 'Soil Moisture',
                value: 40 + Math.random() * 20,
                unit: '%',
                status: 'active'
            }
        ]
    };
}

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    setInterval(() => {
        GATEWAYS.forEach(gatewayId => {
            NODES.forEach(nodeId => {
                const data = generateSensorData(gatewayId, nodeId);
                const topic = 'esp32/sensors/data';
                console.log(`Publishing to ${topic} from ${gatewayId} / ${nodeId}`);
                client.publish(topic, JSON.stringify(data));
            });
        });
    }, 5000); // Send every 5 seconds
});

client.on('error', (err) => {
    console.error('MQTT error:', err);
    process.exit(1);
});
