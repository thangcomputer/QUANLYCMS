const mongoose = require('mongoose');

const paymentSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  ref: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'expired'], default: 'pending' },
  studentName: { type: String, default: '' },
  courseName: { type: String, default: '' },
  paidAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Tự động xóa sau 24h (86400 giây)
});

module.exports = mongoose.model('PaymentSession', paymentSessionSchema);
