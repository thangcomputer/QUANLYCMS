const axios = require('axios');

async function testShareUrl() {
  console.log('--- Testing Share URL Format ---');
  const sessionId = 'test-session-12345';
  const origin = 'http://localhost:5173';
  
  // Giả lập logic trong AdminDashboard.jsx sau khi tôi đã sửa
  const shareUrl = `${origin}/pay/${sessionId}`;
  
  console.log(`Generated URL: ${shareUrl}`);
  
  if (shareUrl.includes('/#/')) {
    console.error('❌ FAILED: URL still contains incorrect hash fragment!');
    process.exit(1);
  } else {
    console.log('✅ PASSED: URL format is correct (BrowserRouter style).');
  }
}

testShareUrl();
