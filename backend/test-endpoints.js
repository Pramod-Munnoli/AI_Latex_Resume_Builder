
const axios = require('axios');
async function testHealth() {
    try {
        const res = await axios.get('http://localhost:3000/api/health');
        console.log('Health check:', res.data);
        const config = await axios.get('http://localhost:3000/api/config');
        console.log('Config check:', config.data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}
testHealth();
