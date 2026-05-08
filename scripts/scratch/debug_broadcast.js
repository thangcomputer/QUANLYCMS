const axios = require('axios');
const API_BASE = 'http://localhost:5174/api';

async function debugBroadcast() {
  const admin = axios.create({ baseURL: API_BASE });
  try {
    let res = await admin.post('/auth/login', { identifier: 'admin', password: 'admin123', role: 'admin' });
    admin.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;
    
    res = await admin.post('/messages/broadcast', {
      targetRole: 'student',
      content: 'System Broadcast Test'
    });
    console.log(res.data);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
debugBroadcast();
