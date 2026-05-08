const axios = require('axios');

const API_BASE = 'http://localhost:5174/api';

async function test() {
  const staff = axios.create({ baseURL: API_BASE });
  const log = (msg) => console.log(`[TEST] ${msg}`);

  try {
    log('Logging in as staff...');
    const res = await staff.post('/auth/login', { identifier: '0393703659', password: '123456', role: 'teacher' });
    log(JSON.stringify(res.data));
  } catch (err) {
    console.error(err);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}

test();
