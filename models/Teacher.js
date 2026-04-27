const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Schema cho Giảng Viên
 * Lưu thông tin hồ sơ, kết quả test, lớp phụ trách
 */
const TeacherSchema = new mongoose.Schema(
  {
    // ── Thông tin cá nhân ──────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Tên giảng viên là bắt buộc'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Số điện thoại là bắt buộc'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/, 'Email không hợp lệ'],
      sparse: true,
    },
    googleId: { type: String, sparse: true, unique: true },
    zaloId: { type: String, sparse: true, unique: true },
    avatar: { type: String, default: '' }, // URL ảnh đại diện

    // ── Tài khoản đăng nhập ────────────────────────────────────────
    password: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      minlength: [6, 'Mật khẩu tối thiểu 6 ký tự'],
      select: false,
    },

    // ── Kết quả bài Test ──────────────────────────────────────────
    testScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    testDate: { type: Date },
    testNotes: { type: String, default: '' },
    testStatus: { type: String, default: null }, // 'passed' | 'failed' | null

    // ── Thực hành ─────────────────────────────────────────────────
    practicalFile: { type: String, default: null },
    practicalStatus: { type: String, default: 'none' }, // 'none' | 'submitted' | 'reviewed' | 'approved' | 'rejected'

    // ── Trạng thái & Phân quyền ───────────────────────────────────
    status: {
      type: String,
      default: 'pending',
    },
    lockReason: { type: String, default: null },
    role: {
      type: String,
      enum: ['teacher', 'admin', 'staff'],
      default: 'teacher',
    },
    // Phân quyền nội bộ (chỉ áp dụng với role === 'admin' hoặc 'staff')
    adminRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'STAFF'],
      default: null,  // null = không phải tài khoản nội bộ
    },
    permissions: {
      type: [String],
      default: [],
      // Các giá trị hợp lệ:
      // 'manage_students'  — Quản lý học viên
      // 'manage_schedule'  — Lịch dạy
      // 'manage_finance'   — Tài chính
      // 'manage_training'  — Đào tạo GV/HV
      // 'system_settings'  — Cài đặt hệ thống
      // 'manage_staff'     — Quản lý nhân viên nội bộ (SUPER_ADMIN only)
    },
    approvedBy: {
      type: String,
      default: null,
    },
    approvedAt: { type: Date },

    // ── Lớp phụ trách ─────────────────────────────────────────────
    assignedClasses: [{ type: String }], // Tên các lớp/khóa học
    assignedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],

    // ── Thống kê ─────────────────────────────────────────────────
    totalSessionsTaught: { type: Number, default: 0 },
    averageRating: { type: Number, min: 0, max: 5, default: 0 },

    // Lương cơ bản / buổi dạy (Workflow 4 tính thù lao)
    baseSalaryPerSession: { type: Number, default: 0, min: 0 },

    // ── Thông tin thêm ────────────────────────────────────────────
    specialty: { type: String, default: '' }, // Chuyên môn: "THVP, Excel, ..."
    bio: { type: String, default: '' },
    startDate: { type: Date, default: Date.now }, // Ngày bắt đầu làm việc
    address: { type: String, default: '' },       // Địa chỉ thường trú
    bankAccount: {
      bankName: { type: String, default: '' },        // Tên hiển thị: "Vietcombank"
      bankCode: { type: String, default: '' },        // Mã VietQR: "vietcombank" | "mbbank" | "tcb"...
      accountNumber: { type: String, default: '' },   // Số tài khoản
      accountHolder: { type: String, default: '' },   // Tên chủ tài khoản
      accountName: { type: String, default: '' },     // legacy alias
      bankBranch: { type: String, default: '' },      // Chi nhánh
    },

    // ── Chi nhánh ─────────────────────────────────────────────────
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    branchCode: { type: String, default: '' }, // Cached: CS1, CS2...

    // ── Bảo mật ───────────────────────────────────────────────────
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    refreshToken: { type: String, select: false },
    tokenVersion: { type: Number, default: 0 },   // ⭐ Anti-sharing: tăng mỗi lần login → vô hiệu token cũ
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: Tài khoản có bị khóa không ──────────────────────────
TeacherSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Middleware: Hash password trước khi save ──────────────────────
TeacherSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (this.isModified('status') && this.status === 'active' && !this.approvedAt) {
    this.approvedAt = new Date();
  }
});

// ── Method: So sánh password ────────────────────────────────────
TeacherSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Method: Xử lý đăng nhập sai ─────────────────────────────────
TeacherSchema.methods.incLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME    = 15 * 60 * 1000; // 15 phút

  // Reset nếu hết thời gian khóa
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + LOCK_TIME };
  }
  return this.updateOne(updates);
};

// ── Indexes ──────────────────────────────────────────────────────
TeacherSchema.index({ status: 1 });
TeacherSchema.index({ role: 1 });

const Teacher = mongoose.model('Teacher', TeacherSchema);
module.exports = Teacher;
