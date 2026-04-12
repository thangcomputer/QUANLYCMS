const mongoose = require('mongoose');

/**
 * ScheduleHistory — Nhật ký sắp lịch / hủy lịch
 * Mỗi hành động Thêm hoặc Hủy lịch đều tạo 1 bản ghi ở đây.
 * Dùng để Admin theo dõi hành vi hủy lịch của Giảng viên.
 */
const scheduleHistorySchema = new mongoose.Schema({
  // Lịch học liên quan
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true,
  },

  // Ai thực hiện
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  actorName: { type: String, default: 'Unknown' },
  actorRole: {
    type: String,
    enum: ['teacher', 'admin', 'staff', 'system'],
    default: 'teacher',
  },

  // Hành động
  action: {
    type: String,
    enum: ['CREATED', 'CANCELLED', 'UPDATED', 'COMPLETED'],
    required: true,
  },

  // Lý do (bắt buộc khi CANCELLED)
  reason: { type: String, default: '' },

  // Snapshot dữ liệu trước/sau
  oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },

  // Thông tin phụ để hiển thị nhanh (không cần join)
  studentName: { type: String },
  teacherName: { type: String },
  scheduledDate: { type: Date },
  course: { type: String },

}, { timestamps: true });

scheduleHistorySchema.index({ scheduleId: 1 });
scheduleHistorySchema.index({ actorId: 1, createdAt: -1 });
scheduleHistorySchema.index({ action: 1 });

module.exports = mongoose.model('ScheduleHistory', scheduleHistorySchema);
