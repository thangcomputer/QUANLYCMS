const { io } = require('socket.io-client');
async function test() {
  const adminRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'admin123' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.data.accessToken;
  const adminUser = adminData.data;

  const stuRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '222222', password: '222222' })
  });
  const stuData = await stuRes.json();
  const stuToken = stuData.data.accessToken;
  const stuUser = stuData.data;

  const adminSocket = io('http://localhost:5000', { auth: { token: adminToken }, query: { userId: adminUser.id, role: 'admin', name: adminUser.name }});
  const stuSocket = io('http://localhost:5000', { auth: { token: stuToken }, query: { userId: stuUser.id, role: 'student', name: stuUser.name }});

  stuSocket.on('message:receive', (msg) => {
    console.log("✅ Student received message via socket:", msg.content);
  });

  adminSocket.on('message:receive', (msg) => {
    console.log("✅ Admin received message via socket:", msg.content);
  });

  await new Promise(r => setTimeout(r, 1000));

  const convId = ['admin_admin', `student_${stuUser.id}`].sort().join('__');
  
  console.log("Student sending message to Admin...");
  const stuSendRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
    body: JSON.stringify({
      conversationId: convId, senderId: stuUser.id, senderRole: 'student', receiverId: 'admin', receiverRole: 'admin', content: 'Test from script student'
    })
  });
  console.log(await stuSendRes.json());

  await new Promise(r => setTimeout(r, 1000));

  console.log("Admin sending message to Student...");
  const adminSendRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      conversationId: convId, senderId: adminUser.id, senderRole: 'admin', receiverId: stuUser.id, receiverRole: 'student', content: 'Test from script admin'
    })
  });
  console.log(await adminSendRes.json());

  await new Promise(r => setTimeout(r, 2000));
  process.exit(0);
}
test();
