const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  user_id:    { type: String, required: true },
  name:       { type: String, default: 'Hệ thống' },
  role:       { type: String, default: 'system' },     // admin | staff | teacher | student | system
  adminRole:  { type: String, default: null },          // SUPER_ADMIN | STAFF
  branchCode: { type: String, default: '' },            // CS1, CS3...

  action:     { type: String, required: true },         // ĐĂNG NHẬP, THÊM MỚI, CẬP NHẬT, XÓA...
  category:   { type: String, default: 'system' },     // auth, student, teacher, finance, schedule, settings
  target:     { type: String },                         // Endpoint URL
  message:    { type: String },                         // Human-readable mô tả chi tiết
  method:     { type: String },                         // HTTP Method

  // ── Device fingerprint ──
  ip:         { type: String, default: 'unknown' },
  device:     { type: String, default: '' },            // "Chrome 120 / Windows 10"
  userAgent:  { type: String, default: '' },            // Raw user-agent string

  createdAt:  { type: Date, default: Date.now },
});

// Index tìm kiếm nhanh
systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ action: 1, createdAt: -1 });
systemLogSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
