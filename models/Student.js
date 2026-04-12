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
    studentCode: { type: String, default: '' }, // Mã HV dùng trong nội dung QR
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

    // ── Tài khoản học viên (login) ────────────────────────────────
    password: {
      type: String,
      select: false, // không trả về khi query
    },
    status: {
      type: String,
      default: 'Chờ xếp lớp',
    },
    tokenVersion: { type: Number, default: 0 },   // ⭐ Anti-sharing: tăng mỗi lần login
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

// ── Indexes ───────────────────────────────────────────────────────
StudentSchema.index({ zalo: 1 });
StudentSchema.index({ course: 1 });
StudentSchema.index({ teacherId: 1 });
StudentSchema.index({ paid: 1 });

const Student = mongoose.model('Student', StudentSchema);
module.exports = Student;
