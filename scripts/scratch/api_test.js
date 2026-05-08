const axios = require('axios');

const API_BASE = 'http://localhost:5174/api';

async function test() {
  const staff = axios.create({ baseURL: API_BASE });
  const studentA = axios.create({ baseURL: API_BASE });
  const studentB = axios.create({ baseURL: API_BASE });
  const admin = axios.create({ baseURL: API_BASE });

  const log = (msg) => console.log(`[TEST] ${msg}`);

  try {
    // 1. Login
    log('Logging in...');
    let res = await staff.post('/auth/login', { identifier: '0393703659', password: '123456', role: 'teacher' });
    staff.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;

    res = await studentA.post('/auth/login', { identifier: '222222', password: '222222', role: 'student' });
    studentA.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;
    const studentAId = res.data.data.user ? res.data.data.user._id : res.data.data._id;

    res = await studentB.post('/auth/login', { identifier: '555555', password: '555555', role: 'student' });
    studentB.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;
    const studentBId = res.data.data.user ? res.data.data.user._id : res.data.data._id;

    res = await admin.post('/auth/login', { identifier: 'admin', password: 'admin123', role: 'admin' });
    admin.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.accessToken}`;

    log('Login successful.');

    // 2. Staff gets contacts
    res = await staff.get('/messages/contacts');
    const contacts = res.data.data;
    const hasStudentA = contacts.some(c => c.phone === '222222');
    const hasStudentB = contacts.some(c => c.phone === '555555');
    
    if (hasStudentA && !hasStudentB) {
      log('✅ Branch Isolation: Staff sees Student A, but NOT Student B.');
    } else {
      log(`❌ Branch Isolation failed: hasStudentA=${hasStudentA}, hasStudentB=${hasStudentB}`);
      return;
    }

    // 3. Staff messages Student A
    res = await staff.post('/messages', {
      receiverId: studentAId,
      receiverName: 'Student Branch A',
      receiverRole: 'student',
      content: 'Hello Student A from Staff ONL',
      isGroup: false
    });
    const staffMsgConvId = res.data.data.conversationId;
    log('✅ Staff sent message to Student A.');

    // 4.5 Staff tries to message Student B (Cross-Branch)
    let crossBranchBlocked = false;
    try {
      await staff.post('/messages', {
        receiverId: studentBId,
        receiverName: 'Student B',
        receiverRole: 'student',
        content: 'Cross branch leak attempt',
        isGroup: false
      });
    } catch(err) {
      if (err.response && err.response.status === 403) {
        crossBranchBlocked = true;
      }
    }
    
    if (crossBranchBlocked) {
       log('✅ Cross-Branch Protection: Staff ONL blocked from messaging Student CS1.');
    } else {
       log('❌ Cross-Branch Protection FAILED: Staff ONL could message Student CS1.');
       return;
    }

    // 4. Student A checks messages
    res = await studentA.get(`/messages/${staffMsgConvId}`);
    const studentAMsgs = res.data.data;
    if (studentAMsgs[0].senderName === 'Phòng Giáo Vụ' && studentAMsgs[0].senderId === 'admin') {
      log('✅ Unified Identity: Student A sees sender as "Phòng Giáo Vụ" (ID: admin).');
    } else {
      log(`❌ Unified Identity failed: ${studentAMsgs[0].senderName} / ${studentAMsgs[0].senderId}`);
      return;
    }

    // 5. Student A replies
    res = await studentA.post('/messages', {
      receiverId: 'admin',
      receiverName: 'Phòng Giáo Vụ',
      receiverRole: 'admin',
      content: 'Hello Staff, received',
      isGroup: false
    });
    log('✅ Student A replied.');

    // 6. Super Admin checks conversations
    res = await admin.get(`/messages/${staffMsgConvId}`);
    const adminMsgs = res.data.data;
    if (adminMsgs.length >= 2) {
      log('✅ Unified Thread: Super Admin sees both messages in the same thread.');
    } else {
      log(`❌ Unified Thread failed: Only ${adminMsgs.length} messages found.`);
      return;
    }

    // 7. Super Admin broadcasts
    res = await admin.post('/messages/broadcast', {
      targetRole: 'student',
      content: 'System Broadcast Test'
    });
    log('✅ Super Admin sent broadcast to all students.');

    // 8. Student B checks messages (should have received broadcast)
    log('Fetching conversations for Student B...');
    res = await studentB.get(`/messages/conversations/${studentBId}`);
    const studentBConvs = res.data.data;
    if (studentBConvs.length > 0) {
      const bConvId = studentBConvs[0].conversationId;
      log(`Student B requesting convId: ${bConvId}`);
      res = await studentB.get(`/messages/${bConvId}`);
      if (res.data.data.some(m => m.content === 'System Broadcast Test' && m.senderName === 'Phòng Giáo Vụ')) {
         log('✅ Broadcast Success: Student B received broadcast from "Phòng Giáo Vụ".');
      } else {
         log('❌ Broadcast received but content/sender mismatch.');
         return;
      }
    } else {
      log('❌ Broadcast Failed: Student B did not receive any conversation.');
      return;
    }

    log('🎉 ALL TESTS PASSED!');

  } catch (err) {
    if (err.response) {
      log(`❌ TEST FAILED with HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    } else {
      log(`❌ TEST FAILED with error: ${err.message}`);
    }
  }
}

test();
