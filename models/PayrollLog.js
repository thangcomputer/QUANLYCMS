/**
 * PayrollLog.js — Nhật ký trả lương nhân sự
 * Ghi nhận mỗi lần xuất tiền cho nhân viên (lương cứng hàng tháng)
 */
const mongoose = require('mongoose');

const payrollLogSchema = new mongoose.Schema({
  employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName: { type: String, required: true },
  position:     { type: String, default: '' },
  branchId:     { type: String, default: '' },
  branchCode:   { type: String, default: '' },
  amount:       { type: Number, required: true },        // Số tiền trả (VNĐ)
  payDate:      { type: Date, default: Date.now },        // Ngày trả
  monthLabel:   { type: String, default: '' },            // VD: "Tháng 4/2026"
  note:         { type: String, default: '' },            // Ghi chú tùy ý
  paidBy:       { type: String, default: '' },            // Tên admin trả
  // Phân biệt với lương ca dạy (module Giảng viên)
  salaryType:   { type: String, enum: ['LUONG_CUNG','LUONG_CA'], default: 'LUONG_CUNG' },
}, {
  timestamps: true,
});

payrollLogSchema.index({ employeeId: 1, payDate: -1 });
payrollLogSchema.index({ branchId: 1 });

module.exports = mongoose.model('PayrollLog', payrollLogSchema);
