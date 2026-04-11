/**
 * Employee.js — Hồ sơ Nhân sự (không bắt buộc có tài khoản đăng nhập)
 * Dùng cho: Bảo vệ, Thu ngân, Kế toán, Quản lý, IT, Trợ giảng, Giảng viên (lương cứng), v.v.
 */
const mongoose = require('mongoose');

const POSITIONS = [
  'BAO_VE',       // Bảo vệ
  'QUAN_LY',      // Quản lý
  'GIANG_VIEN',   // Giảng viên (lương cứng hàng tháng)
  'THU_VIEC',     // Thử việc
  'IT',           // IT
  'KE_TOAN',      // Kế toán
  'THU_NGAN',     // Thu ngân
  'TRO_GIANG',    // Trợ giảng
  'KHAC',         // Khác
];

const POSITION_LABELS = {
  BAO_VE:     'Bảo vệ',
  QUAN_LY:    'Quản lý',
  GIANG_VIEN: 'Giảng viên',
  THU_VIEC:   'Thử việc',
  IT:         'IT',
  KE_TOAN:    'Kế toán',
  THU_NGAN:   'Thu ngân',
  TRO_GIANG:  'Trợ giảng',
  KHAC:       'Khác',
};

const employeeSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  phone:      { type: String, trim: true, default: '' },
  position:   { type: String, enum: POSITIONS, default: 'KHAC' },
  branchId:   { type: String, default: '' },
  branchCode: { type: String, default: '' },
  baseSalary: { type: Number, default: 0 },           // VNĐ/tháng
  startDate:  { type: Date, default: Date.now },       // Ngày vào làm
  status:     { type: String, enum: ['active','inactive','resigned'], default: 'active' },
  note:       { type: String, default: '' },
  // Thông tin ngân hàng (VietQR)
  bankAccount: {
    bankCode:      { type: String, default: '' },   // Mã BIN ngân hàng (VD: 970436 = Vietcombank)
    accountNumber: { type: String, default: '' },   // Số tài khoản
    accountName:   { type: String, default: '' },   // Tên chủ tài khoản
  },
  // Liên kết tùy chọn với tài khoản Teacher (nếu là GV lương cứng)
  linkedTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
}, {
  timestamps: true,
});

employeeSchema.index({ branchId: 1, position: 1 });
employeeSchema.index({ status: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
module.exports.POSITIONS = POSITIONS;
module.exports.POSITION_LABELS = POSITION_LABELS;
