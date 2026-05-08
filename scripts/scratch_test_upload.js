const axios = require('axios');

async function testUploadAuth() {
  console.log('--- Testing Upload Practical Route Security ---');
  try {
    const res = await axios.post('http://localhost:5000/api/teachers/upload-practical', {}, {
      validateStatus: () => true
    });
    
    console.log(`Response Status: ${res.status}`);
    if (res.status === 401) {
      console.log('✅ PASSED: Route is protected. Unauthorized access blocked.');
    } else {
      console.error(`❌ FAILED: Route returned ${res.status}. Should be 401.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FAILED: Request error:', err.message);
    process.exit(1);
  }
}

testUploadAuth();
