const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Người nhận (Giảng viên)
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  teacherName: {
    type: String,
    required: true,
  },
  teacherPhone: {
    type: String,
    default: '',
  },

  // Thông tin giao dịch
  amount: {
    type: Number,
    required: [true, 'Số tiền là bắt buộc'],
    min: 0,
  },
  description: {
    type: String,
    default: '',
    // VD: "Thù lao 8 buổi dạy tháng 3/2026"
  },
  month: {
    type: String,
    default: '',
    // VD: "Tháng 3/2026"
  },

  // Trạng thái
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  },

  // Admin xác nhận
  confirmedBy: {
    type: String,
    default: 'Admin',
  },
  confirmedAt: {
    type: Date,
  },

  // Thông tin ngân hàng
  bankName: { type: String, default: '' },
  bankAccount: { type: String, default: '' },

  // Ghi chú
  note: { type: String, default: '' },

  // Chi nhánh
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    default: null,
  },
  branchCode: { type: String, default: '' },
}, {
  timestamps: true,
});

// Index cho truy vấn nhanh
transactionSchema.index({ teacherId: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
