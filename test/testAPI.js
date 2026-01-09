const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8017/v1/sensors';

async function testAPI() {
    console.log('='.repeat(70));
    console.log('Testing Sensor Data API');
    console.log('='.repeat(70));

    try {
        // Test 1: Get temperature data
        console.log('\n📊 Test 1: Get Temperature Data (limit 5)');
        const tempResponse = await axios.get(`${BASE_URL}/query`, {
            params: {
                sensor_type: 'temperature',
                limit: 5
            }
        });
        console.log(`✅ Status: ${tempResponse.status}`);
        console.log(`📈 Results: ${tempResponse.data.length} records`);
        if (tempResponse.data.length > 0) {
            console.log('Sample data:');
            tempResponse.data.slice(0, 2).forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.name}: ${item.value}${item.unit} at ${item.timestamp}`);
            });
        }

        // Test 2: Get humidity data
        console.log('\n💧 Test 2: Get Humidity Data (limit 3)');
        const humidResponse = await axios.get(`${BASE_URL}/query`, {
            params: {
                sensor_type: 'humidity',
                limit: 3
            }
        });
        console.log(`✅ Status: ${humidResponse.status}`);
        console.log(`📈 Results: ${humidResponse.data.length} records`);
        if (humidResponse.data.length > 0) {
            console.log('Sample data:');
            humidResponse.data.forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.name}: ${item.value}${item.unit}`);
            });
        }

        // Test 3: Get light data
        console.log('\n💡 Test 3: Get Light Data (limit 3)');
        const lightResponse = await axios.get(`${BASE_URL}/query`, {
            params: {
                sensor_type: 'light',
                limit: 3
            }
        });
        console.log(`✅ Status: ${lightResponse.status}`);
        console.log(`📈 Results: ${lightResponse.data.length} records`);

        // Test 4: Get rain data
        console.log('\n🌧️ Test 4: Get Rain Data (limit 3)');
        const rainResponse = await axios.get(`${BASE_URL}/query`, {
            params: {
                sensor_type: 'rain',
                limit: 3
            }
        });
        console.log(`✅ Status: ${rainResponse.status}`);
        console.log(`📈 Results: ${rainResponse.data.length} records`);

        // Test 5: Get specific sensor ID
        console.log('\n🔍 Test 5: Get Specific Sensor (dht11-001)');
        const sensorResponse = await axios.get(`${BASE_URL}/query`, {
            params: {
                sensor_type: 'temperature',
                sensor_id: 'dht11-001',
                limit: 5
            }
        });
        console.log(`✅ Status: ${sensorResponse.status}`);
        console.log(`📈 Results: ${sensorResponse.data.length} records`);

        console.log('\n' + '='.repeat(70));
        console.log('✅ All API tests passed successfully!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ API Test Failed:');
        console.error('Error:', error.response?.data || error.message);
        console.error('Status:', error.response?.status);
    }
}

testAPI();
