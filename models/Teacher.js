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
    zalo: {
      type: String,
      trim: true,
      default: '',
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
    gender: { type: String, enum: ['male', 'female', 'Nam', 'Nữ', ''], default: '' },
    /** Canonical GV###### — display/reference only; assignment uses ObjectId */
    teacherCode: { type: String, default: '' },

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
    testMcCorrect: { type: Number, default: null },
    testMcWrong: { type: Number, default: null },
    testMcTotal: { type: Number, default: null },
    /** Optional server-issued attempt metadata; no backfill/migration is required. */
    examAttemptId: { type: String, default: null },
    examAttemptStatus: {
      type: String,
      enum: ['active', 'submitted', 'forfeited', null],
      default: null,
    },
    examAttemptStartedAt: { type: Date, default: null },
    examAttemptSubmittedAt: { type: Date, default: null },
    /** Số lần không thấy mặt/mắt trong oval (cộng dồn, không reset khi thấy lại) */
    faceViolationCount: { type: Number, default: 0 },

    /** Lịch sử nhập/sửa điểm bài test onboarding (GRADE-HIST). */
    scoreHistory: [{
      at: { type: Date, default: Date.now },
      oldScore: { type: Number, default: null },
      newScore: { type: Number, required: true },
      actorUserId: { type: String, default: '' },
      actorRole: { type: String, default: '' },
      actorName: { type: String, default: '' },
      note: { type: String, default: '' },
    }],

    // ── Thực hành ─────────────────────────────────────────────────
    practicalFile: { type: String, default: null },
    practicalStatus: { type: String, default: 'none' }, // 'none' | 'submitted' | 'reviewed' | 'approved' | 'rejected'

    // ── Trạng thái & Phân quyền ───────────────────────────────────
    status: {
      type: String,
      default: 'inactive',
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
      enum: ['SUPER_ADMIN', 'HIGH_ADMIN', 'STAFF', 'SUPPORT'],
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
    approvalMode: {
      type: String,
      enum: ['workflow', 'manual', null],
      default: null,
    },
    approvalNote: { type: String, default: '' },
    suspendedBy: { type: String, default: null },
    suspendedAt: { type: Date, default: null },

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
    /** Số lượt đánh giá công khai (HV → GV) — đồng bộ khi submit teacher_rating */
    ratingCount: { type: Number, min: 0, default: 0 },

    // Lương cứng / buổi dạy (không phụ thuộc sao)
    baseSalaryPerSession: { type: Number, default: 0, min: 0 },

    // Mức tiền thưởng sao hàng tháng khi đạt mốc đánh giá
    customStarBonusAmount: { type: Number, default: 200000, min: 0 },

    /** Các tháng YYYY-MM đã chi thưởng sao (≥5 HV đạt 5★ trong tháng → thưởng/tháng) */
    starBonusPaidMonths: { type: [String], default: [] },


    // ── Thông tin thêm ────────────────────────────────────────────
    specialty: { type: String, default: '' }, // Chuyên môn: "THVP, Excel, ..."
    subjectIds: { type: [String], default: [] }, // Môn phụ trách: coban, word, excel...
    /** Giọng giảng dạy theo vùng miền */
    voiceRegion: {
      type: String,
      enum: ['', 'bac', 'trung', 'nam', 'tay'],
      default: '',
    },
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
    isFirstLogin: { type: Boolean, default: false },
    /** Đã xem pháo hoa chào mừng lần đầu. Tài khoản cũ thiếu field = coi như đã xem. */
    welcomeCelebrationSeen: { type: Boolean, default: false },
    deviceFingerprint: { type: String, default: null, select: false }, // ⭐ Device lock: fingerprint máy đang đăng nhập

    // ── MFA (TOTP) — dành cho tài khoản nội bộ admin/staff ────────
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: '', select: false },
    mfaPendingSecret: { type: String, default: '', select: false },
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
TeacherSchema.index({ branchId: 1, status: 1 });
TeacherSchema.index({ role: 1, status: 1 });
TeacherSchema.index({ teacherCode: 1 }, { sparse: true });

const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema);
module.exports = Teacher;
