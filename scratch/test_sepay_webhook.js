/**
 * test_sepay_webhook.js
 * Chạy: node scratch/test_sepay_webhook.js
 * 
 * Mục đích: Mô phỏng SePay gửi webhook để kiểm tra toàn bộ luồng nhận diện thanh toán
 * mà không cần chuyển tiền thật.
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 5000;

// ─── Bước 1: Lấy sessionId mới nhất từ DB ──────────────────────────────────
async function getLatestPendingSession() {
  return new Promise((resolve) => {
    http.get(`http://${API_HOST}:${API_PORT}/api/webhooks/payment-status?sessionId=DUMMY_THAT_WONT_EXIST`, (res) => {
      // We don't use this, just a health check
    });

    // Connect to MongoDB directly to get the latest pending session
    const mongoose = require('mongoose');
    mongoose.connect('mongodb://127.0.0.1:27017/quanlycms').then(async () => {
      const PaymentSession = require('./models/PaymentSession');
      const session = await PaymentSession.findOne({ status: 'pending' }).sort({ createdAt: -1 });
      if (!session) {
        console.log('❌ Không có session nào đang pending. Hãy tạo mã QR trong Admin trước!');
        process.exit(1);
      }
      console.log(`✅ Tìm thấy session: ${session.sessionId}`);
      console.log(`   Ref: "${session.ref}"`);
      console.log(`   Amount: ${session.amount}`);
      console.log(`   Student: ${session.studentName}`);
      mongoose.disconnect();
      resolve(session);
    }).catch(err => {
      console.error('DB Error:', err.message);
      process.exit(1);
    });
  });
}

// ─── Bước 2: Gửi webhook giả mạo SePay ────────────────────────────────────
async function sendFakeWebhook(session) {
  // Nội dung chuyển khoản giả — chứa ref của session
  const fakeContent = `Chuyen khoan ${session.ref} thanh toan hoc phi`;
  
  const payload = JSON.stringify({
    transferAmount: session.amount,
    content: fakeContent,
    description: fakeContent,
    accountNumber: '4628686',
    transferType: 'in',
    referenceCode: 'TEST_' + Date.now(),
    transactionDate: new Date().toISOString(),
  });

  console.log(`\n📤 Gửi webhook giả với nội dung: "${fakeContent}"`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: '/api/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const result = JSON.parse(data);
        console.log(`\n📥 Phản hồi từ server:`, result);
        
        if (result.success && result.matched) {
          console.log('\n🎉 WEBHOOK HOẠT ĐỘNG! Hệ thống đã nhận diện thanh toán thành công!');
          console.log('   ✅ Session đã được cập nhật sang trạng thái PAID trong database.');
          console.log('   ✅ Socket.io đã emit tuition:paid cho frontend.');
        } else if (result.success && !result.matched) {
          console.log('\n⚠️  Server nhận được webhook nhưng KHÔNG khớp được session nào!');
          console.log('   Kiểm tra lại nội dung chuyển khoản và ref trong database.');
        } else {
          console.log('\n❌ Server trả về lỗi!');
        }
        resolve(result);
      });
    });

    req.on('error', (err) => {
      console.error('❌ Lỗi kết nối đến server:', err.message);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────
console.log('🔍 Kiểm tra luồng thanh toán SePay...\n');
getLatestPendingSession()
  .then(session => sendFakeWebhook(session))
  .catch(console.error);
