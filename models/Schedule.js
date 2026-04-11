const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // Giảng viên đặt lịch
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  teacherName: { type: String, required: true },

  // Học viên
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
  studentName: { type: String, required: true },

  // Lịch
  date: { type: Date, required: true },
  startTime: { type: String, required: true }, // "19:00"
  endTime:   { type: String, default: '' },   // "21:00"

  // Thông tin học
  course: { type: String, required: true },
  linkHoc: { type: String, default: '' }, // Google Meet / Zoom

  // Trạng thái
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled',
  },

  // Thanh toán
  is_paid_to_teacher: { type: Boolean, default: false }, 
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending',
  },

  // Nhắc nhở
  reminderSent: { type: Boolean, default: false },
  reminderSentAt: { type: Date },

  note: { type: String, default: '' },

  // Chi nhánh
  branchId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  branchCode: { type: String, default: '' },
}, {
  timestamps: true,
});

scheduleSchema.index({ teacherId: 1, date: 1 });
scheduleSchema.index({ studentId: 1, date: 1 });
scheduleSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
