/**
 * webhookRoutes.js
 *
 * POST /api/webhooks/sepay              — SePay gọi khi có tiền vào TK
 * GET  /api/webhooks/payment-status/:id — Polling kiểm tra HV đã thanh toán
 * POST /api/webhooks/payment-session    — Tạo session thanh toán tạm (đăng ký mới)
 * GET  /api/webhooks/payment-session/:id — Kiểm tra session
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Student = require('../models/Student');
const { authMiddleware } = require('../middleware/auth');

// ── SePay HMAC signature verification ────────────────────────────────────────
// SePay gửi x-sepay-token header = HMAC-SHA256(requestBody, SEPAY_SECRET_KEY)
// Nếu SEPAY_SECRET_KEY chưa set trong .env → bỏ qua (backward compat)
function verifySepaySignature(req, res, next) {
  const secret = process.env.SEPAY_SECRET_KEY;
  if (!secret) return next();  // Chưa cấu hình → cho qua

  const signature = req.headers['x-sepay-token'] || req.headers['x-api-key'];
  if (!signature) {
    console.warn('[SEPAY] Missing signature header — rejected');
    return res.status(401).json({ success: false, message: 'Missing webhook signature' });
  }

  // Tính HMAC từ raw body
  const rawBody = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  if (signature !== expected) {
    console.warn('[SEPAY] Invalid signature — rejected');
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }
  next();
}

// ── In-memory payment sessions (5 phút tự xóa) ───────────────────────────────
// Map<sessionId, { ref, amount, status, createdAt }>
const paymentSessions = new Map();
const SESSION_TTL = 5 * 60 * 1000; // 5 phút

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of paymentSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      paymentSessions.delete(id);
    }
  }
}
// Dọn mỗi 2 phút
setInterval(cleanExpiredSessions, 2 * 60 * 1000);

// ── POST /api/webhooks/payment-session ── Tạo session (PUBLIC) ────────────────
// Frontend gọi khi học viên vào bước 2, nhận sessionId để polling
router.post('/payment-session', (req, res) => {
  const { ref, amount } = req.body;
  if (!ref) return res.status(400).json({ success: false, message: 'Thiếu ref' });

  const sessionId = `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  paymentSessions.set(sessionId, {
    ref: ref.toLowerCase(),
    amount: Number(amount) || 0,
    status: 'pending',
    createdAt: Date.now(),
  });

  console.log(`[PAYMENT SESSION] Tạo mới: ${sessionId} — ref: "${ref}"`);
  return res.json({ success: true, sessionId, expiresIn: SESSION_TTL / 1000 });
});

// ── GET /api/webhooks/payment-session/:id ── Polling (PUBLIC) ─────────────────
router.get('/payment-session/:id', (req, res) => {
  const session = paymentSessions.get(req.params.id);
  if (!session) {
    return res.json({ success: true, status: 'not_found' });
  }

  const elapsed = Date.now() - session.createdAt;
  const remaining = Math.max(0, Math.floor((SESSION_TTL - elapsed) / 1000));

  if (session.status !== 'paid' && elapsed > SESSION_TTL) {
    session.status = 'expired';
  }

  return res.json({
    success: true,
    status: session.status,   // 'pending' | 'paid' | 'expired'
    remaining,
    paidAmount: session.paidAmount || 0,
  });
});

// ── POST /api/webhooks/sepay ── SePay Webhook (HMAC verified) ──────────────────
router.post('/sepay', verifySepaySignature, async (req, res) => {
  try {
    const body = req.body;
    console.log('[SEPAY WEBHOOK]', JSON.stringify(body, null, 2));

    const content = (body.content || body.description || '').toLowerCase().trim();
    const amount  = Number(body.transferAmount || body.amount || 0);

    if (!content || amount <= 0) {
      return res.json({ success: false, message: 'Thiếu thông tin giao dịch' });
    }

    let matched = false;

    // ── 1. Kiểm tra payment sessions (đăng ký mới) ───────────────────────────
    for (const [id, session] of paymentSessions) {
      if (session.status === 'pending' && content.includes(session.ref)) {
        session.status    = 'paid';
        session.paidAmount = amount;
        console.log(`[SEPAY] ✅ Session ${id} khớp — đã thanh toán ${amount}đ`);
        matched = true;

        // Emit socket cho frontend đang chờ
        const io = req.app.get('io');
        if (io) {
          io.emit('tuition:paid', {
            sessionId: id,
            amount,
            message: `✅ Đã nhận ${amount.toLocaleString('vi-VN')}đ`,
          });
        }
        break;
      }
    }

    // ── 2. Kiểm tra học viên hiện có trong DB ────────────────────────────────
    if (!matched) {
      const students = await Student.find({ paid: false }).lean();
      for (const s of students) {
        const code = (s.studentCode || String(s._id).slice(-6)).toLowerCase();
        const name = (s.name || '').toLowerCase().replace(/\s+/g, '');
        if (content.includes(code) || content.includes(name)) {
          await Student.findByIdAndUpdate(s._id, {
            paid: true,
            paidAmount: amount,
            paidAt: new Date(),
            paidNote: body.content || '',
          });
          matched = true;

          const io = req.app.get('io');
          if (io) {
            io.emit('tuition:paid', {
              studentId: String(s._id),
              amount,
              message: `✅ ${s.name} đã thanh toán ${amount.toLocaleString('vi-VN')}đ`,
            });
          }
          console.log(`[SEPAY] ✅ Học viên ${s.name} đã thanh toán ${amount}đ`);
          break;
        }
      }
    }

    if (!matched) {
      console.warn('[SEPAY] Không match được — nội dung:', content);
    }

    return res.json({ success: true, matched });

  } catch (err) {
    console.error('[SEPAY WEBHOOK ERROR]', err);
    return res.json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── GET /api/webhooks/payment-status/:studentId ── Polling HV đã có tài khoản ─
router.get('/payment-status/:studentId', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    return res.json({
      success: true,
      paid: student.paid === true,
      paidAmount: student.paidAmount || 0,
      paidAt: student.paidAt || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
