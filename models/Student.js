const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Schema cho Học Viên
 * Lưu thông tin đăng ký, học phí, tiến độ học
 */
const StudentSchema = new mongoose.Schema(
  {
    // ── Thông tin cá nhân ──────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Tên học viên là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    email: { type: String, trim: true, lowercase: true },
    googleId: { type: String, sparse: true, unique: true },
    zaloId: { type: String, sparse: true, unique: true },
    avatar: { type: String, default: '' },
    gender: { type: String, enum: ['male', 'female', 'Nam', 'Nữ', ''], default: '' },
    age: {
      type: Number,
      min: [10, 'Tuổi tối thiểu là 10'],
      max: [80, 'Tuổi tối đa là 80'],
    },
    phone: {
      type: String,
      trim: true,
    },
    zalo: {
      type: String,
      required: [true, 'Số Zalo là bắt buộc'],
      trim: true,
    },
    address: { type: String, trim: true },

    // ── Thông tin khóa học ─────────────────────────────────────────
    learningMode: {
      type: String,
      enum: ['ONLINE', 'OFFLINE'],
      default: 'OFFLINE',
    },
    course: {
      type: String,
      required: [true, 'Tên khóa học là bắt buộc'],
      trim: true,
    },
    // Nhiều khóa học / nhiều giảng viên trên cùng 1 tài khoản học viên
    enrollments: [{
      courseName: { type: String, required: true, trim: true },
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
      examSubjects: [{ type: String }],
      teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
      teacherName: { type: String, default: '' },
      price: { type: Number, default: 0, min: 0 },
      paid: { type: Boolean, default: false },
      paidAt: { type: Date },
      totalSessions: { type: Number, default: 12 },
      remainingSessions: { type: Number, default: 12 },
      completedSessions: { type: Number, default: 0 },
      avgGrade: { type: Number, default: 0, min: 0, max: 10 },
      grades: [{
        date: String,
        note: String,
        grade: Number,
        /** Giờ thao tác (HH:mm) — khi điểm danh / cập nhật */
        time: { type: String, default: '' },
        /** Timestamp thao tác thực tế */
        at: { type: Date },
        assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
      }],
      linkHoc: { type: String, default: '' },
      nextClass: { type: String, default: '' },
      nextClassTime: { type: String, default: '' },
      status: {
        type: String,
        enum: ['active', 'completed', 'paused', 'pending_payment', 'refunded', 'cancelled'],
        default: 'active',
      },
      isPrimary: { type: Boolean, default: false },
      registeredAt: { type: Date, default: Date.now },
      /** Quyền học theo enrollment — thu hồi khi hoàn 100% (undefined/true = được học) */
      learningAccess: { type: Boolean, default: true },
      // Quyền theo từng khóa (môn cần camera / mở khóa thi riêng)
      requireWebcam: { type: Boolean, default: false },
      examUnlocked: { type: Boolean, default: false },
      /** Lưu ý Admin gửi GV khi đăng ký khóa — hiện banner trên hồ sơ HV */
      teacherAlert: { type: String, default: '', maxlength: 500 },
      /** Đã xem pháo hoa hoàn thành khóa. false = vừa hoàn thành chưa xem. thiếu field = đã cũ, không hiện. */
      courseCelebrationSeen: { type: Boolean },
      // Soft-cancel enrollment
      cancelledAt: { type: Date, default: null },
      cancelReason: { type: String, default: '' },
      refundedAmount: { type: Number, default: 0 },
    }],
    price: {
      type: Number,
      required: [true, 'Học phí là bắt buộc'],
      min: [0, 'Học phí không thể âm'],
    },
    totalSessions: {
      type: Number,
      default: 12,
    },
    remainingSessions: {
      type: Number,
      default: function () { return this.totalSessions; },
    },

    // ── Thanh toán ────────────────────────────────────────────────
    paid: {
      type: Boolean,
      default: false,
    },
    paidAt: { type: Date },
    paidAmount: { type: Number, default: 0 },  // Số tiền thực nhận qua SePay
    paidNote: { type: String, default: '' },    // Nội dung CK ghi nhận
    studentCode: { type: String, default: '' }, // Canonical HV###### (server-generated)
    /** Historical codes for payment/search compatibility — never rewrite finance history */
    legacyStudentCodes: {
      type: [String],
      default: undefined,
      validate: {
        validator(arr) {
          if (arr == null) return true;
          if (!Array.isArray(arr)) return false;
          const seen = new Set();
          for (const c of arr) {
            if (typeof c !== 'string') return false;
            const t = c.trim();
            if (!t) return false;
            const key = t.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
          }
          return true;
        },
        message: 'legacyStudentCodes must be unique non-empty strings',
      },
    },
    // Chi nhánh học viên đăng ký
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    branchCode: { type: String, default: '' }, // Cached: CS1, CS2... dùng trong QR
    // Lịch sử điều chỉnh học phí bởi Admin
    priceHistory: [{
      oldPrice:  { type: Number },
      newPrice:  { type: Number },
      reason:    { type: String, default: '' },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changedAt: { type: Date, default: Date.now },
    }],
    paymentMethod: {
      type: String,
      default: 'transfer',
    },

    // ── Học tập ───────────────────────────────────────────────────
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null,
    },
    grade: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    lastGrade: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },
    avgGrade: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    grades: [{
      date: String,
      note: String,
      grade: Number,
      /** Giờ thao tác (HH:mm) — khi điểm danh / cập nhật */
      time: { type: String, default: '' },
      /** Timestamp thao tác thực tế */
      at: { type: Date },
      assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    }],
    /** Nhật ký điểm danh / hủy điểm danh / hủy ca — không tính buổi học */
    activityLog: [{
      type: { type: String, default: 'attendance' },
      date: { type: String, default: '' },
      note: { type: String, default: '' },
      sessionNumber: { type: Number },
      at: { type: Date, default: Date.now },
      byId: { type: String, default: '' },
      byName: { type: String, default: '' },
      scheduleId: { type: String },
      course: { type: String },
    }],
    completedSessions: {
      type: Number,
      default: 0,
    },
    attendanceDates: [{ type: Date }],
    notes: { type: String, default: '' },
    linkHoc: { type: String, default: '' },
    
    // ── Lớp học Trực tuyến / Virtual Class ───────────────────────
    online_meeting_url: { type: String, default: '' },
    platform_type: { 
      type: String, 
      enum: ['GOOGLE_MEET', 'ZOOM', 'OTHER'], 
      default: 'OTHER' 
    },

    // ── Nợ lương Giảng viên ──────────────────────────────────────
    teacher_payment_status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID_IN_ADVANCE', 'COMPLETED'],
      default: 'UNPAID',
    },

    // ── Lịch học kế tiếp (đồng bộ) ──────────────────────────────
    nextClass: { type: String, default: '' },
    nextClassTime: { type: String, default: '' },

    // ── Kiểm soát Phòng Thi (Workflow 2) ─────────────────────────
    studentExamUnlocked: {
      type: Boolean,
      default: false,
      // Chỉ được set = true khi đã hoàn thành đủ totalSessions buổi học
    },
    /** Alias nghiệp vụ / workflow — đồng bộ với studentExamUnlocked khi mở khóa */
    examApproved: {
      type: Boolean,
      default: false,
    },
    requireWebcam: {
      type: Boolean,
      default: false,
      // true: Bắt buộc bật webcam khi thi; false (mặc định): không bắt buộc — admin bật từng HV/khóa
    },

    // ── Tiến độ thi tốt nghiệp (per-subject) ────────────────────
    examProgress: [{
      id:         { type: String },                        // 'coban', 'word', 'excel', 'powerpoint'
      status:     { type: String, default: 'chua_thi' },   // 'chua_thi' | 'dang_thi' | 'dat' | 'khong_dat'
      tracNghiem: {
        score: { type: Number, default: 0 },
        total: { type: Number, default: 15 }
      },
      thucHanh:   { type: String, default: 'chua_nop' },   // 'chua_nop' | 'da_nop'
      essayFile:  { type: String, default: '' },            // URL file bài tự luận đã upload
      essayScore: { type: Number, default: null },          // Điểm chấm bởi admin (0-10)
      lockUntil:  { type: Number, default: null },          // Timestamp: khóa thi lại trong 7 ngày
      /** Optional fields for server-issued, idempotent exam attempts. */
      attemptId: { type: String, default: null },
      attemptStatus: {
        type: String,
        enum: ['active', 'submitted', 'forfeited', null],
        default: null,
      },
      attemptStartedAt: { type: Date, default: null },
      attemptSubmittedAt: { type: Date, default: null },
    }],

    // ── Tài khoản học viên (login) ────────────────────────────────
    password: {
      type: String,
      select: false, // không trả về khi query
    },
    status: {
      type: String,
      default: 'Chờ xếp lớp',
    },
    isFirstLogin: {
      type: Boolean,
      default: false,
    },
    /** Đã xem pháo hoa chào mừng lần đầu (HV/GV). Tài khoản cũ thiếu field = coi như đã xem. */
    welcomeCelebrationSeen: {
      type: Boolean,
      default: false,
    },
    /** Pháo hoa hoàn thành khóa (legacy 1 khóa, không enrollment). false = chờ xem. */
    courseCelebrationSeen: { type: Boolean },
    tokenVersion: { type: Number, default: 0 },   // ⭐ Anti-sharing: tăng mỗi lần login
    refreshToken: { type: String, select: false }, // Refresh token rotation (server-side)
    deviceFingerprint: { type: String, default: null, select: false }, // ⭐ Device lock: fingerprint máy đang đăng nhập
    /** Lịch sử fingerprint (HV). Logout chỉ xóa deviceFingerprint phiên hiện tại, không xóa mảng này. */
    knownDevices: {
      type: [{
        fingerprint: { type: String, default: '' },
        userAgent: { type: String, default: '' },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
      }],
      default: [],
      select: false,
    },
    knownDeviceCount: { type: Number, default: 0 },
    /** Khóa đăng nhập HV — tách khỏi status học vụ (Đang học / Chờ xếp lớp). */
    accountLocked: { type: Boolean, default: false },
    
    // ── Audit: Ai là người thêm học viên này ──────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: { type: String, default: '' },
    createdByBranch: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: Số buổi đã học ────────────────────────────────────────
StudentSchema.virtual('sessionsCompleted').get(function () {
  return this.totalSessions - this.remainingSessions;
});

// ── Virtual: % tiến độ ────────────────────────────────────────────
StudentSchema.virtual('progressPercent').get(function () {
  if (!this.totalSessions) return 0;
  const done = this.completedSessions != null ? this.completedSessions : Math.max(0, this.totalSessions - this.remainingSessions);
  const total = Math.max(this.totalSessions, done + this.remainingSessions);
  return Math.round((done / total) * 100);
});

// ── Middleware: Hash password trước khi save ───────────────────────
StudentSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  // Tự động set paidAt khi paid = true
  if (this.isModified('paid') && this.paid && !this.paidAt) {
    this.paidAt = new Date();
  }
});

// ── Method: Kiểm tra password ────────────────────────────────────
StudentSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Indexes ──────────────────────────────────────────────────────────────────────
StudentSchema.index({ zalo: 1 });
StudentSchema.index({ phone: 1 });                    // Auth lookup
StudentSchema.index({ course: 1 });
StudentSchema.index({ teacherId: 1 });
StudentSchema.index({ branchId: 1 });
StudentSchema.index({ paid: 1 });
StudentSchema.index({ status: 1 });                    // Lọc "Chờ xếp lớp" / "Đang học"
StudentSchema.index({ studentExamUnlocked: 1 });       // Kiểm tra phòng thi
StudentSchema.index({ teacherId: 1, status: 1 });      // Bộ đôi hay dùng nhất
StudentSchema.index({ 'enrollments.teacherId': 1 });    // GV xem HV qua enrollments
StudentSchema.index({ paid: 1, updatedAt: -1 });     // SePay webhook — HV chưa TT gần đây
StudentSchema.index({ studentCode: 1 }, { sparse: true }); // Match mã HV trong nội dung CK
StudentSchema.index({ branchId: 1, status: 1 });

const Student = mongoose.models.Student || mongoose.model('Student', StudentSchema);
module.exports = Student;
