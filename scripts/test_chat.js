const { io } = require('socket.io-client');

async function test() {
  console.log("Logging in as Admin...");
  const adminRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'admin123' })
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.data.accessToken;
  const adminUser = adminData.data.user;

  console.log("Logging in as Student 222222...");
  const stuRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '222222', password: '222222' })
  });
  const stuData = await stuRes.json();
  if(!stuData.data) {
    console.log("Student login failed", stuData);
    return;
  }
  const stuToken = stuData.data.accessToken;
  const stuUser = stuData.data.user;

  console.log("Connecting Admin Socket...");
  const adminSocket = io('http://localhost:5000', { auth: { token: adminToken }, query: { userId: adminUser.id, role: 'admin', name: adminUser.name }});
  
  console.log("Connecting Student Socket...");
  const stuSocket = io('http://localhost:5000', { auth: { token: stuToken }, query: { userId: stuUser._id || stuUser.id, role: 'student', name: stuUser.name }});

  let stuReceived = false;
  let adminReceived = false;

  stuSocket.on('message:receive', (msg) => {
    console.log("✅ Student received message via socket:", msg.content, "from", msg.senderId);
    stuReceived = true;
  });

  adminSocket.on('message:receive', (msg) => {
    console.log("✅ Admin received message via socket:", msg.content, "from", msg.senderId);
    adminReceived = true;
  });

  await new Promise(r => setTimeout(r, 1000));

  console.log("Student sending message to Admin...");
  const convId = ['admin_admin', `student_${stuUser._id || stuUser.id}`].sort().join('__');
  console.log("Using convId:", convId);
  const stuSendRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
    body: JSON.stringify({
      conversationId: convId,
      senderId: stuUser._id || stuUser.id, senderRole: 'student', senderName: stuUser.name,
      receiverId: 'admin', receiverRole: 'admin', receiverName: 'Admin',
      content: 'Hello from student!', isGroup: false
    })
  });
  console.log("Student API Send Response:", await stuSendRes.json());

  await new Promise(r => setTimeout(r, 1000));

  console.log("Admin sending reply to Student...");
  const adminSendRes = await fetch('http://localhost:5000/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      conversationId: convId,
      senderId: adminUser.id, senderRole: 'admin', senderName: adminUser.name,
      receiverId: stuUser._id || stuUser.id, receiverRole: 'student', receiverName: stuUser.name,
      content: 'Hello back from admin!', isGroup: false
    })
  });
  console.log("Admin API Send Response:", await adminSendRes.json());

  await new Promise(r => setTimeout(r, 2000));
  console.log("Test finished. Exiting...");
  process.exit(0);
}

test();
