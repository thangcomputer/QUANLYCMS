const { io } = require('socket.io-client');
async function test() {
  const adminRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'admin123' })
  });
  console.log("Admin Login:", await adminRes.json());
}
test();
