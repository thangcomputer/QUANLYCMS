const { io } = require('socket.io-client');

async function testSocketAuth() {
  console.log('--- Testing Socket.IO Handshake Security ---');
  
  const socket = io('http://localhost:5000', {
    transports: ['websocket'],
    auth: {} // Không gửi token
  });

  socket.on('connect', () => {
    console.error('❌ FAILED: Socket connected without token! Security hole exists.');
    socket.disconnect();
    process.exit(1);
  });

  socket.on('connect_error', (err) => {
    console.log(`✅ PASSED: Socket connection rejected as expected. Error: ${err.message}`);
    socket.disconnect();
    process.exit(0);
  });

  // Timeout sau 5s
  setTimeout(() => {
    console.error('❌ FAILED: Test timed out.');
    socket.disconnect();
    process.exit(1);
  }, 5000);
}

testSocketAuth();
