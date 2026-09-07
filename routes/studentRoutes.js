const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Student = require('../models/Student');
const Invoice = require('../models/Invoice');
const Schedule = require('../models/Schedule');
const { authMiddleware, checkPermission, isTeacher, branchFilter, userHasPermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../constants/permissions');
const { assertStudentBranchAccess } = require('../middleware/studentBranchGuard');
const { policyShadowStudentRead } = require('../middleware/policyShadowStudentRead');
const { policyShadowStudentMutation } = require('../middleware/policyShadowStudentMutation');
const { dataScopeObserve } = require('../middleware/dataScopeObserve');

/** Admin/Staff management list requires MANAGE_STUDENTS; teachers keep ownership-scoped access. */
function requireManageStudentsUnlessTeacher(req, res, next) {
  if (req.user?.role === 'teacher') return next();
  return checkPermission(PERMISSIONS.MANAGE_STUDENTS)(req, res, next);
}
const { sanitizeRegex } = require('../middleware/sanitizeRegex');
const logger = require('../config/logger');
const { buildMongoPaidFilterCondition } = require('../utils/studentPaidFilterBuckets');
const { buildStudentSearchAndConditions } = require('../utils/personSearchQuery');
const {
  applyEnrollmentStats,
  legacyEnrollmentFromStudent,
  resolveEnrollmentIndex,
  studentMatchesTeacher,
  resolveEnrollmentExamSubjects,
  syncStudentFromPrimaryEnrollment,
  sanitizeTeacherAlert,
} = require('../services/enrollmentService');

async function syncCertPrepFromEnrollment(student, req) {
  try {
    const { safeSyncStudentEnrollments } = require('../services/certPrepEnrollmentService');
    await safeSyncStudentEnrollments(student, {
      grantedBy: `enrollment-bridge:${req?.user?.id || ''}`,
    });
  } catch (err) {
    logger.error('[CERT-PREP-ENROLL] isolated: %s', err.message);
  }
}

async function revokeCertPrepAfterEnrollmentCancel(student, cancelledEnrollment) {
  try {
    const { safeRevokeCertPrepAccessForEnrollment } = require('../services/certPrepEnrollmentService');
    await safeRevokeCertPrepAccessForEnrollment(student, cancelledEnrollment);
  } catch (err) {
    logger.error('[CERT-PREP-ENROLL] revoke isolated: %s', err.message);
  }
}

async function reconcileCertPrepAfterRefund(student) {
  try {
    const { safeReconcileStudentCertPrepAccess } = require('../services/certPrepEnrollmentService');
    await safeReconcileStudentCertPrepAccess(student);
  } catch (err) {
    logger.error('[CERT-PREP-ENROLL] reconcile isolated: %s', err.message);
  }
}
const { sendAccountWelcome } = require('../services/accountWelcome');
const { resolveDefaultAccountPassword } = require('../utils/tempPassword');
const { extractSessionNumber, buildActivityEntry } = require('../utils/studentActivityLog');
const {
  generateStudentCode,
  isCanonical,
} = require('../services/businessCodeService');
const { settlePayment, postRefund, voidLedgerEntry, postSalary } = require('../services/ledgerService');
const { refundStudentTuition, payTeacherForStudent } = require('../services/studentFinanceService');
const cache = require('../utils/cache');
const { emitDataRefresh, emitBranch } = require('../utils/realtimeEmit');
const { getCachedSettings } = require('../services/settingsCache');
const {
  createExamAttempt,
  gradeExamAttempt,
  verifyAttemptToken,
  decideStudentAttemptStart,
} = require('../services/examAttemptService');
const { claimStudentAttempt, claimStudentOpenAttempt } = require('../services/examAttemptStore');
const {
  purgeStudentSideEffects,
  purgeCancelledOnlyStudents,
  purgeOrphanMessages,
} = require('../services/userCascadeCleanup');

function financeActor(req) {
  return {
    id: String(req.user?.id || req.user?._id || ''),
    role: String(req.user?.role || ''),
  };
}

function financeReqMeta(req, student) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.ip
      || '',
    userAgent: req.headers['user-agent'] || '',
    branchId: student?.branchId || req.user?.branchId || null,
  };
}

function bustFinanceCaches() {
  try {
    cache.delByPrefix('bi:overview');
  } catch { /* ignore */ }
}

function studentRealtime(io, studentLike, event, payload) {
  if (!io) return;
  const branchId = studentLike?.branchId || null;
  const userIds = [
    studentLike?._id,
    studentLike?.id,
    studentLike?.teacherId,
  ].filter(Boolean).map(String);
  emitBranch(io, branchId, event, payload);
  for (const uid of userIds) {
    io.to(uid).emit(event, payload);
  }
}

function studentDataRefresh(io, studentLike, payload) {
  if (!io) return;
  const branchId = studentLike?.branchId || null;
  const userIds = [
    studentLike?._id,
    studentLike?.id,
    studentLike?.teacherId,
  ].filter(Boolean).map(String);
  emitDataRefresh(io, payload, { branchId, userIds });
}

/**
 * Chuông + sync danh bạ khi HV được gán GV lúc tạo / thêm khóa
 * (cùng nội dung với PUT assign-teacher — tránh lệch UX).
 * Lưu DB luôn; socket chỉ khi có io.
 */
async function notifyTeacherAssignedOnEnroll(io, {
  student,
  teacherId,
  teacherName = '',
  courseName = '',
}) {
  if (!student?._id || !teacherId) return;
  const tid = String(teacherId._id || teacherId || '').trim();
  if (!tid || tid === 'null' || tid === 'undefined') return;
  const studentId = String(student._id);

  const NotificationService = require('../services/NotificationService');
  const hvLabel = `⟦student_detail:${studentId}:profile|${student.name}⟧`;
  const course = String(courseName || student.course || '').trim() || 'khóa học';

  let gvName = String(teacherName || student.teacherName || '').trim();
  let teacherCard = {
    teacherId: tid,
    teacherName: gvName,
    specialty: '',
    averageRating: 0,
    ratingCount: 0,
    voiceRegion: '',
    avatar: '',
  };
  try {
    const Teacher = require('../models/Teacher');
    const t = await Teacher.findById(tid)
      .select('name specialty averageRating ratingCount voiceRegion avatar')
      .lean();
    if (t) {
      if (!gvName) gvName = t.name || '';
      teacherCard = {
        teacherId: tid,
        teacherName: gvName || t.name || 'Giảng viên',
        specialty: t.specialty || '',
        averageRating: Number(t.averageRating) || 0,
        ratingCount: Number(t.ratingCount) || 0,
        voiceRegion: String(t.voiceRegion || ''),
        avatar: t.avatar || '',
      };
    }
  } catch { /* ignore */ }
  if (!gvName) gvName = teacherCard.teacherName || 'Giảng viên';
  teacherCard.teacherName = gvName;

  try {
    await NotificationService.send(io, {
      type: 'COURSE',
      title: '📚 Học viên mới được giao',
      content: `Học viên ${hvLabel} (${course}) đã được giao cho bạn.`,
      receivers: tid,
      payload: {
        studentId,
        type: 'student',
        targetAudience: 'teacher',
        reassign: false,
      },
      link: `/teacher#students?studentId=${studentId}`,
    });
  } catch (err) {
    logger.error('[STUDENTS] notify teacher on enroll: %s', err?.message || err);
  }

  try {
    await NotificationService.send(io, {
      type: 'COURSE',
      title: '👨‍🏫 Phân công giảng viên phụ trách',
      content: `Bạn đã được phân công Giảng viên ${gvName} phụ trách khóa "${course}".`,
      receivers: studentId,
      payload: {
        ...teacherCard,
        courseName: course,
        targetAudience: 'student',
        kind: 'teacher_assigned',
      },
      link: '/student#profile',
    });
  } catch (err) {
    logger.error('[STUDENTS] notify student on enroll: %s', err?.message || err);
  }

  if (!io) return;
  try {
    io.to(tid).emit('CONTACT_LIST_UPDATED', { studentId });
    io.to(studentId).emit('CONTACT_LIST_UPDATED', { teacherId: tid });
    studentRealtime(io, student, 'student:assigned', {
      teacherId: tid,
      studentId,
    });
  } catch (err) {
    logger.warn('[STUDENTS] assign socket sync: %s', err?.message || err);
  }
}

/** Chuông HV — lỗi notify không làm fail API gốc. */
function notifyStudentBell(io, studentId, { type, title, content, payload = {}, link = '/student#profile' }) {
  if (!studentId) return Promise.resolve();
  const NotificationService = require('../services/NotificationService');
  return NotificationService.send(io, {
    type,
    title,
    content,
    receivers: String(studentId),
    payload: { targetAudience: 'student', ...payload },
    link,
  }).catch((err) => {
    logger.error('[STUDENTS] notify student: %s', err?.message || err);
  });
}

async function nextInvoiceCode() {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `HD${yy}${mm}-`;
  // Lấy mã lớn nhất cùng tháng để tăng tuần tự (tránh trùng khi race nhẹ)
  const latest = await Invoice.findOne({ maHoaDon: { $regex: `^${prefix}` } })
    .sort({ maHoaDon: -1 })
    .select('maHoaDon')
    .lean();
  let seq = 1;
  if (latest?.maHoaDon) {
    const m = String(latest.maHoaDon).match(/-(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function createTuitionInvoice({ student, courseName, amount, note = '' }) {
  const hocPhi = Number(amount) || 0;
  if (!student?._id || hocPhi <= 0) return null;
  try {
    let maHD = await nextInvoiceCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await Invoice.create({
          maHoaDon: maHD,
          hocVien: student._id,
          hoTen: student.name,
          khoaHoc: courseName || student.course || 'Học phí',
          hocPhi,
          ghiChu: note || `Thanh toán khóa ${courseName || student.course || ''}`.trim(),
        });
      } catch (err) {
        if (err?.code === 11000) {
          maHD = await nextInvoiceCode();
          continue;
        }
        throw err;
      }
    }
    return null;
  } catch (err) {
    logger.warn('[INVOICE] create skipped:', err.message);
    return null;
  }
}

// ─── GET /api/students ─────────────────────────────────────────────────────────
// Lấy danh sách học viên (Admin+MANAGE_STUDENTS / Teacher ownership) — pagination
router.get('/', [authMiddleware, branchFilter, policyShadowStudentRead('list'), dataScopeObserve('student'), requireManageStudentsUnlessTeacher], async (req, res) => {
  try {
    const { teacherId, paid, status, course, search, page, limit, branch_id } = req.query;
    const andConditions = [];

    if (req.branchFilter && Object.keys(req.branchFilter).length > 0) {
      andConditions.push(req.branchFilter);
    }
    if (branch_id && branch_id !== 'all' && !req.userBranchId) {
      andConditions.push({ branchId: branch_id });
    }

    if (req.user.role === 'teacher') {
      andConditions.push({
        $or: [
          { teacherId: req.user.id },
          { 'enrollments.teacherId': req.user.id },
        ],
      });
    } else if (req.user.role === 'admin' || req.user.role === 'staff') {
      if (teacherId) andConditions.push({ teacherId });
    } else {
      return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối' });
    }

    if (paid && paid !== 'all') {
      const paidCond = buildMongoPaidFilterCondition(paid);
      if (paidCond) andConditions.push(paidCond);
    }

    if (status) andConditions.push({ status });

    if (course && course !== 'all') {
      const cReg = { $regex: sanitizeRegex(course), $options: 'i' };
      andConditions.push({
        $or: [
          { course: cReg },
          { 'enrollments.courseName': cReg },
          { 'enrollments.name': cReg },
        ],
      });
    }

    if (search) {
      const searchConds = buildStudentSearchAndConditions(search);
      if (searchConds.length) andConditions.push(...searchConds);
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    // ── Pagination ──────────────────────────────────────────────────
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(5000, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    const totalRecords = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalRecords / limitNum);

    const students = await Student.find(filter)
      .populate('teacherId', 'name phone specialty')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // ⚡ FIX N+1: Thay vì chạy 3 query/học-viên, dùng 1 lần aggregate tổng hợp toàn bộ
    const studentIds = students.map(s => s._id);

    // 1. Đếm số buổi hoàn thành + số buổi chưa trả lương (gom theo học viên)
    const sessionAgg = await Schedule.aggregate([
      { $match: { studentId: { $in: studentIds }, status: 'completed' } },
      {
        $group: {
          _id: '$studentId',
          completed: { $sum: 1 },
          pendingPayment: { $sum: { $cond: [{ $eq: ['$is_paid_to_teacher', false] }, 1, 0] } },
        }
      },
    ]);
    const sessionMap = Object.fromEntries(sessionAgg.map(r => [String(r._id), r]));

    // 2. Kiểm tra Cooldown 12h bằng 1 query duy nhất
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const cooldownAgg = await Schedule.aggregate([
      { $match: { studentId: { $in: studentIds }, status: 'completed', createdAt: { $gte: twelveHoursAgo } } },
      { $group: { _id: '$studentId', latestCreatedAt: { $max: '$createdAt' } } },
    ]);
    const cooldownMap = Object.fromEntries(cooldownAgg.map(r => [String(r._id), r.latestCreatedAt]));

    const studentsWithRealSessions = students.map(st => {
      const doc = st.toObject();
      doc.requireWebcam = doc.requireWebcam !== false;
      const sid = String(st._id);
      const sess = sessionMap[sid];
      const realCompleted = sess?.completed || 0;
      doc.completedSessions = realCompleted;
      doc.remainingSessions = Math.max(0, (st.totalSessions || 12) - realCompleted);
      doc.pendingTeacherPaymentSessions = sess?.pendingPayment || 0;

      const lastAt = cooldownMap[sid];
      if (lastAt) {
        const diffMs = Date.now() - new Date(lastAt).getTime();
        const remainHrs = Math.max(0, 12 - diffMs / (1000 * 60 * 60));
        doc.can_check_in = false;
        doc.remaining_cooldown_hours = parseFloat(remainHrs.toFixed(1));
        doc.last_attendance_at = lastAt;
      } else {
        doc.can_check_in = true;
        doc.remaining_cooldown_hours = 0;
        doc.last_attendance_at = null;
      }

      return doc;
    });

    const enrichedStudents = await Promise.all(
      studentsWithRealSessions.map((doc) => applyEnrollmentStats(doc, doc._id, Schedule))
    );

    // Heal: khóa cancelled thiếu refundedAmount trên DTO → lấy từ ledger refund
    try {
      const needHealIds = [];
      enrichedStudents.forEach((s) => {
        const list = Array.isArray(s.courses) && s.courses.length
          ? s.courses
          : (Array.isArray(s.enrollments) ? s.enrollments : []);
        const missing = list.some((e) => e?.status === 'cancelled' && !(Number(e.refundedAmount) > 0));
        if (missing) needHealIds.push(s._id);
      });
      if (needHealIds.length) {
        const LedgerEntry = require('../models/LedgerEntry');
        const refundRows = await LedgerEntry.find({
          studentId: { $in: needHealIds },
          type: 'refund',
          status: 'posted',
        }).select('studentId courseName amount postedAt').lean();
        const byStudent = new Map();
        refundRows.forEach((r) => {
          const sid = String(r.studentId);
          if (!byStudent.has(sid)) byStudent.set(sid, []);
          byStudent.get(sid).push(r);
        });
        const norm = (n) => String(n || '').trim().toLowerCase();
        enrichedStudents.forEach((s) => {
          const sid = String(s._id);
          const ledgers = byStudent.get(sid);
          if (!ledgers?.length) return;
          const patchList = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach((e) => {
              if (e?.status !== 'cancelled' || Number(e.refundedAmount) > 0) return;
              const courseKey = norm(e.courseName || e.name);
              const match = ledgers.find((r) => norm(r.courseName) === courseKey)
                || ledgers.find((r) => courseKey && norm(r.courseName).includes(courseKey))
                || ledgers[0];
              if (match) e.refundedAmount = Math.abs(Number(match.amount) || 0);
            });
          };
          patchList(s.courses);
          patchList(s.enrollments);
        });
      }
    } catch (healErr) {
      logger.warn('[STUDENTS] refund heal skipped: %s', healErr.message);
    }

    res.json({
      success: true,
      count: enrichedStudents.length,
      totalRecords,
      totalPages,
      currentPage: pageNum,
      data: enrichedStudents,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/stats ───────────────────────────────────────────────────
// Thống kê tổng quan (Admin dashboard)
// ─── GET /api/students/stats (branch-aware, timezone-safe) ────────────────────
router.get('/stats', [authMiddleware, branchFilter, policyShadowStudentRead('stats'), requireManageStudentsUnlessTeacher], async (req, res) => {
  try {
    // branchFilter đã gán req.branchFilter: {} cho SUPER_ADMIN, {branchId:...} cho STAFF
    const bf = { ...req.branchFilter };
    // Admin có thể override bằng ?branch_id query
    const { branch_id } = req.query;
    if (branch_id && branch_id !== 'all' && !req.userBranchId) {
      bf.branchId = branch_id;
    }

    const total = await Student.countDocuments(bf);
    const paid = await Student.countDocuments({ ...bf, paid: true });
    const unpaid = await Student.countDocuments({ ...bf, paid: false });
    const unlocked = await Student.countDocuments({ ...bf, studentExamUnlocked: true });

    const { sumFinancialRevenue } = require('../services/ledgerService');
    const branchId = bf.branchId || null;

    // Doanh thu SoT = Ledger (PAYMENT − REFUND), không dùng enrollment.paid
    const [revenueAll, pendingResult, todayRevenueRow] = await Promise.all([
      sumFinancialRevenue({ branchId }),
      Student.aggregate([
        { $match: { ...bf } },
        {
          $project: {
            pending: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$enrollments', []] } }, 0] },
                {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: '$enrollments',
                          as: 'e',
                          cond: {
                            $and: [
                              { $ne: ['$$e.paid', true] },
                              { $ne: ['$$e.status', 'cancelled'] },
                            ],
                          },
                        },
                      },
                      as: 'e',
                      in: { $ifNull: ['$$e.price', 0] },
                    },
                  },
                },
                {
                  $cond: [{ $eq: ['$paid', true] }, 0, { $ifNull: ['$price', 0] }],
                },
              ],
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$pending' } } },
      ]),
      (async () => {
        const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
        const startOfTodayVN = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()) - 7 * 60 * 60 * 1000);
        return sumFinancialRevenue({ branchId, from: startOfTodayVN, to: new Date() });
      })(),
    ]);
    const totalRevenue = revenueAll.net || 0;
    const pendingRevenue = pendingResult[0]?.total || 0;
    const todayRevenue = todayRevenueRow.net || 0;

    // Số giảng viên active (branch-aware)
    const Teacher = require('../models/Teacher');
    const teacherBranchFilter = req.userBranchId ? { branchId: req.userBranchId } : {};
    if (branch_id && branch_id !== 'all' && !req.userBranchId) teacherBranchFilter.branchId = branch_id;
    const activeTeachers = await Teacher.countDocuments({ ...teacherBranchFilter, status: { $in: ['Active', 'active'] }, role: 'teacher' });
    const pendingTeachers = await Teacher.countDocuments({ role: 'teacher', status: 'Pending' });
    const totalTeachers = await Teacher.countDocuments({ ...teacherBranchFilter, role: 'teacher' });
    res.json({
      success: true,
      data: { total, paid, unpaid, unlocked, totalRevenue, pendingRevenue, todayRevenue, activeTeachers, pendingTeachers, totalTeachers },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/:id ─────────────────────────────────────────────────────────────────
// Phase 7.35: policyShadowStudentRead('get_one') — evaluation-only; Legacy handler remains HTTP authority.
router.get('/:id', [authMiddleware, branchFilter, policyShadowStudentRead('get_one'), dataScopeObserve('student', { listMode: false })], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('teacherId', 'name phone specialty avatar')
      .populate('branchId', 'name code');

    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // ⭐ 403 guard: STAFF chỉ được xem HV của chi nhánh mình
    if (req.userBranchId) {
      const studentBranch = student.branchId ? String(student.branchId._id || student.branchId) : null;
      if (studentBranch && studentBranch !== String(req.userBranchId)) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập học viên này' });
      }
    }

    const isSelf = req.user.role === 'student' && req.user.id === student._id.toString();
    const isMyTeacher = req.user.role === 'teacher' && studentMatchesTeacher(student, req.user.id);
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';

    if (!isAdminOrStaff && !isSelf && !isMyTeacher) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }

    const doc = student.toObject();
    doc.requireWebcam = doc.requireWebcam !== false;
    await applyEnrollmentStats(doc, req.params.id, Schedule);

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/:id/full-detail (MEGA ENDPOINT) ───────────────────────
// Tổng hợp toàn bộ hồ sơ học viên: Thông tin cá nhân, Lịch sử điểm danh, Hóa đơn, Điểm thi
// Phase 7.35: policyShadowStudentRead('full_detail') — evaluation-only; Legacy handler remains HTTP authority.
router.get('/:id/full-detail', [authMiddleware, branchFilter, policyShadowStudentRead('full_detail')], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('teacherId', 'name phone specialty avatar')
        .populate('branchId', 'name code');

    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // 🛡️ 403 guard: STAFF chỉ được xem HV của chi nhánh mình
    if (req.userBranchId && student.branchId && String(student.branchId._id || student.branchId) !== String(req.userBranchId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập dữ liệu học viên cơ sở khác' });
    }

    const isSelf = req.user.role === 'student' && req.user.id === student._id.toString();
    const isMyTeacher = req.user.role === 'teacher' && studentMatchesTeacher(student, req.user.id);
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';
    if (!isAdminOrStaff && !isSelf && !isMyTeacher) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }

    // 1. Lịch sử điểm danh/học tập
    const schedules = await Schedule.find({ studentId: req.params.id }).sort({ date: -1 });

    // 2. Lịch sử hóa đơn học phí
    const mongoose = require('mongoose');
    const studentOid = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : req.params.id;
    const invoicesRaw = await Invoice.find({ hocVien: studentOid }).sort({ createdAt: -1 }).lean();
    let invoices = Array.isArray(invoicesRaw) ? [...invoicesRaw] : [];

    // H11: GET read-only — không backfill Invoice (tránh chứng từ orphan không Ledger).
    // Heal thiếu HĐ bằng job reconcile / finance reconcile API.

    // 2b) Ledger refund (không tạo Invoice gốc) — append để UI "Tài chính" hiển thị.
    const LedgerEntry = require('../models/LedgerEntry');
    const refundEntries = await LedgerEntry.find({
      studentId: studentOid,
      type: 'refund',
      status: 'posted',
    }).sort({ postedAt: -1 }).lean();

    const refundInvoices = (refundEntries || []).map((e, idx) => ({
      _id: e._id,
      maHoaDon: `R-${String(e._id || idx).slice(-6)}`,
      createdAt: e.postedAt || e.updatedAt || new Date(),
      ngayXuat: e.postedAt || e.updatedAt || new Date(),
      khoaHoc: e.courseName || 'Khóa học',
      ghiChu: e.note || 'Hoàn tiền (refund)',
      hocPhi: Number(e.amount) || 0,
      synthetic: true,
    }));

    // 3. Kết quả thi (nếu có)
    const ExamResult = require('../models/ExamResult');
    const examResults = await ExamResult.find({
      $or: [
        { studentId: req.params.id },
        { sbd: student.sbd }
      ]
    }).sort({ createdAt: -1 });

    const studentDoc = student.toObject();
    studentDoc.requireWebcam = studentDoc.requireWebcam !== false;
    await applyEnrollmentStats(studentDoc, req.params.id, Schedule);

    // Heal: nếu số lịch completed > số buổi lưu (điểm danh bù cũ bị kẹt) → ghi DB cho khớp mọi màn hình
    try {
      const { normCourseName } = require('../services/enrollmentService');
      let needsPersist = false;
      const dbEnrs = Array.isArray(student.enrollments) ? student.enrollments : [];
      const docEnrs = Array.isArray(studentDoc.enrollments) ? studentDoc.enrollments : [];
      docEnrs.forEach((de) => {
        const key = normCourseName(de.courseName || de.course);
        const dbEnr = dbEnrs.find((e) => normCourseName(e.courseName || e.course) === key);
        const nextDone = Number(de.completedSessions) || 0;
        const prevDone = Number(dbEnr?.completedSessions ?? student.completedSessions) || 0;
        if (nextDone > prevDone) needsPersist = true;
      });
      if (needsPersist && (isAdminOrStaff || isMyTeacher)) {
        student.enrollments = docEnrs;
        student.courses = studentDoc.courses;
        student.completedSessions = studentDoc.completedSessions;
        student.remainingSessions = studentDoc.remainingSessions;
        student.totalSessions = studentDoc.totalSessions;
        if (studentDoc.course) student.course = studentDoc.course;
        student.markModified('enrollments');
        await student.save();
      }
    } catch (healErr) {
      // Không chặn đọc hồ sơ nếu heal lỗi
      try {
        const logger = require('../config/logger');
        logger.warn('[students/full-detail] progress heal:', healErr.message);
      } catch (_) { /* ignore */ }
    }

    res.json({
      success: true,
      data: {
        student: studentDoc,
        schedules: schedules || [],
        invoices: [...(invoices || []), ...(refundInvoices || [])],
        examResults: examResults || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/students/import (BẢN GHI HÀNG LOẠT) ──────────────────────────
// Nhập danh sách học viên từ file Excel (Array of Objects)
router.post('/import', [authMiddleware, branchFilter, policyShadowStudentMutation('create_import'), checkPermission(PERMISSIONS.MANAGE_STUDENTS)], async (req, res) => {
  try {
    const { students: rawStudents } = req.body;
    if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ hoặc rỗng.' });
    }

    const Branch = require('../models/Branch');
    const Teacher = require('../models/Teacher');
    const bcrypt = require('bcryptjs');
    const forcedBranchId = req.userBranchId || null;
    const forcedBranchCode = req.userBranchCode || '';

    const branchCache = new Map();
    const resolveBranch = async (hint) => {
      const key = String(hint || '').trim();
      if (!key) return { branchId: null, branchCode: '' };
      if (branchCache.has(key.toLowerCase())) return branchCache.get(key.toLowerCase());
      let branch = null;
      if (/^[a-f\d]{24}$/i.test(key)) {
        branch = await Branch.findById(key).select('_id code name').lean();
      }
      if (!branch) {
        branch = await Branch.findOne({
          $or: [
            { code: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            { name: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          ],
        }).select('_id code name').lean();
      }
      const resolved = branch
        ? { branchId: branch._id, branchCode: branch.code || '' }
        : { branchId: null, branchCode: key };
      branchCache.set(key.toLowerCase(), resolved);
      return resolved;
    };

    const resolveTeacherId = async (hint) => {
      const key = String(hint || '').trim();
      if (!key) return null;
      if (/^[a-f\d]{24}$/i.test(key)) {
        const byId = await Teacher.findById(key).select('_id').lean();
        return byId?._id || null;
      }
      const phoneDigits = key.replace(/\D/g, '');
      const doc = await Teacher.findOne({
        role: 'teacher',
        $or: [
          ...(phoneDigits.length >= 8 ? [{ phone: phoneDigits }, { phone: key }] : []),
          { name: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      }).select('_id').lean();
      return doc?._id || null;
    };

    const studentsToInsert = [];
    for (const s of rawStudents) {
      if (!s) continue;
      const {
        password: _omitPassword,
        refreshToken: _omitRefresh,
        tokenVersion: _omitTv,
        studentCode: _omitClientCode,
        legacyStudentCodes: _omitLegacy,
        reservedStudentCode: _omitReserved,
        branchHint,
        teacherHint,
        ...safe
      } = s;

      const name = s.name?.toUpperCase()?.trim();
      const { normalizeVNPhone } = require('../utils/phoneIdentity');
      const phone = normalizeVNPhone(s.phone) || String(s.phone || '').trim();
      const zalo = String(s.zalo || phone || '').trim();
      if (!name || (!phone && !zalo)) continue;

      let branchId = forcedBranchId;
      let branchCode = forcedBranchCode;
      if (!branchId) {
        const resolved = await resolveBranch(branchHint || s.branchCode || s.branchId || '');
        branchId = resolved.branchId;
        branchCode = resolved.branchCode || '';
      }

      const teacherId = await resolveTeacherId(teacherHint || s.teacherId || s.teacherName || '');
      const genderRaw = String(s.gender || 'male').toLowerCase();
      const gender = (genderRaw === 'female' || genderRaw === 'nữ' || genderRaw === 'nu') ? 'female' : 'male';
      const learningMode = ['ONLINE', 'OFFLINE'].includes(String(s.learningMode || '').toUpperCase())
        ? String(s.learningMode).toUpperCase()
        : 'OFFLINE';
      const paid = s.paid === true || s.paid === 'Đã đóng phí' || s.paid === 'x' || s.paid === 'v';
      const totalSessions = Number(s.totalSessions) > 0 ? Number(s.totalSessions) : 12;
      const price = Number(s.price) || 0;
      const ageNum = Number(s.age);
      // Mật khẩu mặc định = SĐT (HV đổi sau lần đăng nhập đầu)
      const plainPassword = (phone && phone.length >= 6)
        ? phone
        : resolveDefaultAccountPassword({ phone, zalo });
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      const studentCode = await generateStudentCode();

      studentsToInsert.push({
        ...safe,
        name,
        phone: phone || zalo,
        zalo: zalo || phone,
        gender,
        ...(Number.isFinite(ageNum) && ageNum >= 10 && ageNum <= 80 ? { age: ageNum } : {}),
        course: String(s.course || '').trim() || 'CHƯA XÁC ĐỊNH',
        price,
        totalSessions,
        remainingSessions: totalSessions,
        paid,
        learningMode,
        branchId: branchId || null,
        branchCode: branchCode || '',
        ...(teacherId ? { teacherId } : {}),
        status: s.status || 'Chờ xếp lớp',
        password: hashedPassword,
        isFirstLogin: true,
        studentCode,
      });
    }

    if (studentsToInsert.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có bản ghi nào hợp lệ để nhập (Thiếu Tên hoặc SĐT/Zalo).' });
    }

    const result = await Student.insertMany(studentsToInsert, { ordered: false });

    for (const row of result) {
      await syncCertPrepFromEnrollment(row, req);
    }

    res.json({
      success: true,
      message: `Đã nhập thành công ${result.length} học viên.`,
      count: result.length
    });
  } catch (err) {
    if (err.name === 'BulkWriteError' || err.code === 11000) {
      const inserted = err.result?.nInserted || 0;
      const docs = err.insertedDocs || [];
      for (const row of docs) {
        await syncCertPrepFromEnrollment(row, req);
      }
      return res.json({
        success: true,
        message: `Đã nhập ${inserted} bản ghi (Một số bản ghi bị trùng SĐT đã được bỏ qua).`,
        count: inserted
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/students/reserve-code ───────────────────────────────────────────
// Allocate canonical HV###### before QR (server-only). Client must not invent TTH/Date.now.
router.post(
  '/reserve-code',
  [authMiddleware, branchFilter, checkPermission(PERMISSIONS.MANAGE_STUDENTS)],
  async (req, res) => {
    try {
      const studentCode = await generateStudentCode();
      return res.status(201).json({ success: true, data: { studentCode } });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({
        success: false,
        message: err.message || 'Không cấp được mã học viên',
        code: err.code || 'BUSINESS_CODE_ERROR',
      });
    }
  },
);

// ─── POST /api/students ────────────────────────────────────────────────────────
// Admin thêm học viên mới
// ─── POST /api/students ──────────────────────────────────────────────────────────────────
router.post('/', [authMiddleware, branchFilter, policyShadowStudentMutation('create'), checkPermission(PERMISSIONS.MANAGE_STUDENTS)], async (req, res, next) => {
  try {
    const { normalizeVNPhone } = require('../utils/phoneIdentity');
    const canonicalPhone = normalizeVNPhone(req.body.phone);
    if (!canonicalPhone) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }
    req.body.phone = canonicalPhone;
    // Mật khẩu mặc định = SĐT; lần đăng nhập đầu HV đặt MK riêng
    const plainPassword = canonicalPhone;
    req.body.password = plainPassword;
    req.body.isFirstLogin = true;

    // Strangler: CQRS when flag/replica resolves on; otherwise LIVE legacy (never hard-503).
    let useCqrs = false;
    try {
      const { isStudentCreateCqrs } = require('../shared/cqrs/flags');
      useCqrs = isStudentCreateCqrs();
    } catch {
      useCqrs = process.env.ENABLE_CQRS_STUDENT_CREATE === 'true';
    }
    if (useCqrs) {
      const CQRSStudentController = require('../modules/student/controllers/CQRSStudentController');
      return await CQRSStudentController.create(req, res, next);
    }

    // Bảo mật: STAFF chỉ được tạo HV thuộc chi nhánh của mình
    // SUPER_ADMIN tự đặt branchId hoặc để trống
    // HIGH_ADMIN: bắt buộc có branch (account hoặc body) — không tạo HV "lạc" rồi list không thấy
    if (req.userBranchId) {
      req.body.branchId = req.userBranchId;
      req.body.branchCode = req.userBranchCode || '';
    } else if (req.user?.adminRole === 'HIGH_ADMIN') {
      const bid = req.body.branchId;
      if (!bid || bid === 'all') {
        return res.status(400).json({
          success: false,
          message: 'Admin cấp cao phải chọn chi nhánh khi thêm học viên',
        });
      }
    }

    // Đồng bộ số buổi / tên khóa từ catalog khi có courseId
    if (req.body.courseId) {
      const Course = require('../models/Course');
      const catalog = await Course.findById(req.body.courseId)
        .select('name totalSessions price discountPercent')
        .lean();
      if (catalog) {
        if (!req.body.course) req.body.course = catalog.name;
        const catalogSessions = Number(catalog.totalSessions) > 0 ? Number(catalog.totalSessions) : 12;
        if (!(Number(req.body.totalSessions) > 0)) {
          req.body.totalSessions = catalogSessions;
        }
      }
    }
    const sessions = Number(req.body.totalSessions) > 0 ? Number(req.body.totalSessions) : 12;
    req.body.totalSessions = sessions;
    if (req.body.remainingSessions == null || req.body.remainingSessions === '') {
      req.body.remainingSessions = sessions;
    }

    // Nếu lúc tạo có gán Giảng viên luôn thì chuyển trạng thái thành Đang học
    if (req.body.teacherId && (!req.body.status || req.body.status === 'Chờ xếp lớp')) {
      req.body.status = 'Đang học';
    }

    // 1 SĐT / 1 email duy nhất — không trùng HV khác hoặc GV
    try {
      const { assertUniqueContact } = require('../utils/uniqueContact');
      await assertUniqueContact({
        phone: req.body.phone,
        zalo: req.body.zalo || req.body.phone,
        email: req.body.email,
      });
    } catch (dupErr) {
      if (dupErr.status === 409) {
        return res.status(409).json({ success: false, message: dupErr.message });
      }
      throw dupErr;
    }

    const student = new Student(req.body);
    // Server is sole authority for business codes — ignore client studentCode / legacy arrays
    delete student.legacyStudentCodes;
    const reserved = String(req.body.reservedStudentCode || '').trim().toUpperCase();
    if (isCanonical('student', reserved)) {
      const taken = await Student.exists({
        $or: [{ studentCode: reserved }, { legacyStudentCodes: reserved }],
      });
      if (!taken) {
        student.studentCode = reserved;
      } else {
        student.studentCode = await generateStudentCode();
      }
    } else {
      student.studentCode = await generateStudentCode();
    }

    // Luôn có enrollment primary (đồng bộ danh sách khóa + thu phí)
    const isPaidOnCreate = student.paid === true || student.paid === 'true' || student.paid === 1;
    const courseName = String(student.course || '').trim() || 'Khóa học';
    const courseId = req.body.courseId || null;
    const price = Number(student.price) || 0;
    const enrollSessions = Number(student.totalSessions) > 0 ? Number(student.totalSessions) : sessions;
    let teacherName = student.teacherName || '';
    if (student.teacherId && !teacherName) {
      try {
        const Teacher = require('../models/Teacher');
        const t = await Teacher.findById(student.teacherId).select('name').lean();
        teacherName = t?.name || '';
        student.teacherName = teacherName;
      } catch { /* ignore */ }
    }
    const examSubjects = await resolveEnrollmentExamSubjects({
      courseName,
      courseId,
    });
    if (!Array.isArray(student.enrollments) || student.enrollments.length === 0) {
      student.enrollments = [{
        courseName,
        courseId: courseId || null,
        examSubjects,
        teacherId: student.teacherId || null,
        teacherName,
        price,
        paid: !!isPaidOnCreate,
        paidAt: isPaidOnCreate ? new Date() : undefined,
        totalSessions: enrollSessions,
        remainingSessions: enrollSessions,
        completedSessions: 0,
        grades: [],
        status: isPaidOnCreate ? 'active' : 'pending_payment',
        learningAccess: !!isPaidOnCreate,
        isPrimary: true,
        registeredAt: new Date(),
        requireWebcam: true,
        examUnlocked: false,
        teacherAlert: sanitizeTeacherAlert(req.body.teacherAlert),
      }];
    } else if (isPaidOnCreate) {
      student.enrollments.forEach((e, i) => {
        if (i === 0 || e.isPrimary) {
          e.paid = true;
          e.paidAt = e.paidAt || new Date();
          e.learningAccess = true;
          if (!e.status || e.status === 'pending_payment') e.status = 'active';
        }
      });
    }
    if (isPaidOnCreate) {
      student.paid = true;
      if (!(Number(student.paidAmount) > 0)) student.paidAmount = price;
      if (!student.paidAt) student.paidAt = new Date();
      if (!student.paymentMethod) student.paymentMethod = 'cash';
    }

    await student.save();

    // Tạo hóa đơn + ledger ngay khi thêm HV đã thanh toán (fail-closed: Ledger bắt buộc)
    let createdInvoice = null;
    if (isPaidOnCreate && price > 0) {
      createdInvoice = await createTuitionInvoice({
        student,
        courseName,
        amount: Number(student.paidAmount) > 0 ? student.paidAmount : price,
        note: `Thanh toán khi thêm học viên — ${courseName}`,
      });
      try {
        const primaryEnr = student.enrollments?.[0];
        await settlePayment({
          student,
          amount: Number(student.paidAmount) > 0 ? student.paidAmount : price,
          invoice: createdInvoice,
          enrollmentId: primaryEnr?._id ? String(primaryEnr._id) : '',
          courseName,
          source: 'student_create_paid',
          sourceRef: createdInvoice?.maHoaDon || `create:${student._id}`,
          idempotencyKey: `payment:create:${student._id}:${primaryEnr?._id || createdInvoice?.maHoaDon || 'nohd'}`,
          actor: financeActor(req),
          note: 'Thanh toán khi thêm học viên',
          metadata: { paymentMethod: student.paymentMethod || 'cash' },
          reqMeta: financeReqMeta(req, student),
        });
        bustFinanceCaches();
      } catch (ledgerErr) {
        logger.error('[STUDENTS] ledger settle on create FAILED — rollback paid: %s', ledgerErr.message);
        // Rollback cache + void invoice (không để paid không có Ledger)
        if (Array.isArray(student.enrollments)) {
          student.enrollments.forEach((e) => {
            e.paid = false;
            e.paidAt = undefined;
            e.status = 'pending_payment';
          });
          student.markModified('enrollments');
        }
        student.paid = false;
        student.paidAmount = 0;
        student.paidAt = undefined;
        await student.save();
        if (createdInvoice?._id) {
          try {
            await Invoice.findByIdAndUpdate(createdInvoice._id, { status: 'void' });
          } catch { /* ignore */ }
        }
        return res.status(500).json({
          success: false,
          message: 'Đã tạo HV nhưng ghi sổ cái thất bại — trạng thái thu đã rollback. Thử thu lại.',
          data: { studentId: student._id },
        });
      }
    }

    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      NotificationService.notifyBranchAdmins(io, {
        branchId: student.branchId,
        title: '🆕 Học viên mới đăng ký',
        content: `Học viên ⟦student_detail:${student._id}:profile|${student.name}⟧ đã đăng ký khóa học ${student.course}.`,
        payload: { 
          studentId: student._id,
          creatorName: req.user?.name || 'Hệ thống',
          creatorRole: req.user?.adminRole === 'SUPER_ADMIN' || req.user?.adminRole === 'HIGH_ADMIN' 
            ? 'Admin' 
            : (req.user?.role === 'staff' ? 'Nhân viên chi nhánh' : (req.user?.role === 'teacher' ? 'Giảng viên' : 'Hệ thống'))
        },
        link: '/admin/students',
      });
      
      studentRealtime(io, student, 'student:new', {
        studentId: student._id,
        name: student.name,
        course: student.course,
      });
      studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', action: 'create' });
      if (createdInvoice) {
        studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'revenue:updated', { amount: price, studentName: student.name });
      }
    }

    // Phân công GV lúc đăng ký → chuông GV + HV (lưu DB kể cả khi tạm không có socket)
    if (student.teacherId) {
      await notifyTeacherAssignedOnEnroll(io, {
        student,
        teacherId: student.teacherId,
        teacherName: student.teacherName || teacherName || '',
        courseName: student.course || courseName || '',
      });
    }

    const welcome = await sendAccountWelcome(io, {
      role: 'student',
      userId: student._id,
      name: student.name,
      phone: student.phone,
      zalo: student.zalo,
      email: student.email,
      password: plainPassword,
    });

    // Populate branch để logger và frontend có tên chi nhánh (không chỉ ObjectId)
    const Branch = require('../models/Branch');
    const branchDoc = student.branchId
      ? await Branch.findById(student.branchId).select('name code').lean()
      : null;
    const studentObj = student.toObject();
    delete studentObj.password;
    delete studentObj.refreshToken;
    delete studentObj.deviceFingerprint;
    if (branchDoc) {
      studentObj.branchName = branchDoc.name || branchDoc.code || '';
      studentObj.branchCode = studentObj.branchCode || branchDoc.code || '';
    }
    studentObj.welcomeQueued = welcome.queued;
    studentObj.welcomeNotified = welcome.notified;
    studentObj.tempPassword = plainPassword;
    if (createdInvoice) {
      studentObj.invoice = {
        _id: createdInvoice._id,
        maHoaDon: createdInvoice.maHoaDon,
        hocPhi: createdInvoice.hocPhi,
      };
    }

    await syncCertPrepFromEnrollment(student, req);

    res.status(201).json({ success: true, data: studentObj });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id ─────────────────────────────────────────────────────
// Cập nhật thông tin học viên (Admin, Teacher, Student tự cập nhật)
router.put('/:id', [authMiddleware, branchFilter, policyShadowStudentMutation('update'), assertStudentBranchAccess], async (req, res) => {
  try {
    // STAFF/Admin thiếu manage_students → 403 (H7); teacher/student tự sửa vẫn theo allowlist bên dưới
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      const allowed = await userHasPermission(req.user, PERMISSIONS.MANAGE_STUDENTS);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Bạn không có quyền quản lý học viên.',
        });
      }
    }

    const safeBody = { ...req.body };
    // H12: cấm set paid/paidAmount/paymentMethod qua PUT generic — phải qua /pay hoặc /refund
    delete safeBody.paid;
    delete safeBody.paidAmount;
    delete safeBody.paidAt;
    delete safeBody.paymentMethod;
    delete safeBody.paidNote;
    delete safeBody.knownDevices;
    delete safeBody.knownDeviceCount;
    delete safeBody.accountLocked;
    delete safeBody.deviceFingerprint;
    let pendingTeacherAlert;
    if (Object.prototype.hasOwnProperty.call(safeBody, 'teacherAlert')) {
      pendingTeacherAlert = sanitizeTeacherAlert(safeBody.teacherAlert);
      delete safeBody.teacherAlert;
    }
    const before = await Student.findById(req.params.id)
      .select(
        'studentExamUnlocked examApproved name examProgress phone email course status price '
        + 'totalSessions completedSessions remainingSessions teacherId teacherName linkHoc address',
      )
      .lean();

    // Nếu là Teacher, chỉ cho phép cập nhật thông tin điểm danh, thành tích
    const enrollmentCourse = safeBody.courseName;
    delete safeBody.courseName;

    if (req.user.role === 'teacher') {
      const allowedKeys = ['completedSessions', 'remainingSessions', 'lastGrade', 'avgGrade', 'grades', 'status', 'notes', 'linkHoc', 'nextClass', 'nextClassTime'];
      Object.keys(safeBody).forEach(key => {
        if (!allowedKeys.includes(key)) {
          delete safeBody[key];
        }
      });

      if (enrollmentCourse) {
        const doc = await Student.findById(req.params.id);
        if (doc?.enrollments?.length) {
          const idx = doc.enrollments.findIndex((e) => e.courseName === enrollmentCourse);
          if (idx >= 0) {
            const { mapEnrollmentStatusToRoot } = require('../utils/studentStatusMap');
            const patchKeys = ['completedSessions', 'remainingSessions', 'lastGrade', 'avgGrade', 'grades', 'status', 'notes', 'linkHoc', 'nextClass', 'nextClassTime'];
            const prevLinkHoc = Object.prototype.hasOwnProperty.call(safeBody, 'linkHoc')
              ? String(doc.enrollments[idx].linkHoc || '').trim()
              : null;
            patchKeys.forEach((k) => {
              if (safeBody[k] !== undefined) doc.enrollments[idx][k] = safeBody[k];
            });
            if (doc.enrollments[idx].isPrimary) {
              patchKeys.forEach((k) => {
                if (safeBody[k] === undefined) return;
                // Root student.status uses Vietnamese labels; enrollment uses enum
                if (k === 'status') {
                  doc.status = mapEnrollmentStatusToRoot(safeBody.status);
                } else {
                  doc[k] = safeBody[k];
                }
              });
            }
            await doc.save();
            const populated = await Student.findById(doc._id).populate('teacherId', 'name phone specialty');
            const io = req.app.get('io');
            // Use populated (post-save) — never reference later `const student` (TDZ)
            if (io) studentRealtime(io, populated, 'student:updated', populated._id);
            if (prevLinkHoc !== null && prevLinkHoc !== String(safeBody.linkHoc || '').trim()) {
              const courseLabel = enrollmentCourse || doc.enrollments[idx]?.courseName || doc.course || 'khóa học';
              const nextLink = String(safeBody.linkHoc || '').trim();
              await notifyStudentBell(io, doc._id, {
                type: 'SCHEDULE',
                title: nextLink ? '🔗 Link vào lớp đã cập nhật' : '🔗 Link vào lớp đã được gỡ',
                content: nextLink
                  ? `Giảng viên đã cập nhật link học khóa "${courseLabel}". Bấm thông báo để vào lớp.\n${nextLink}`
                  : `Link học khóa "${courseLabel}" đã được gỡ.`,
                payload: {
                  kind: 'class_link_updated',
                  courseName: courseLabel,
                  linkHoc: nextLink || '',
                  targetAudience: 'student',
                },
                // Giữ path hồ sơ làm fallback; Meet URL nằm trong payload.linkHoc
                link: '/student#profile',
              });
            }
            return res.json({ success: true, data: populated });
          }
        }
      }
    }

    // Nếu Admin cập nhật thông tin và có gán Giảng viên, tự động chuyển sang Đang học
    if (safeBody.teacherId) {
      const currentSt = await Student.findById(req.params.id);
      if (currentSt && currentSt.status === 'Chờ xếp lớp') {
        safeBody.status = 'Đang học';
      }
    }

    // Nếu là Student, chỉ cho phép cập nhật hồ sơ cá nhân CỦA CHÍNH MÌNH
    if (req.user.role === 'student') {
      if (req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật hồ sơ của chính mình' });
      }
      // examProgress: dùng PUT /:id/exam-progress (state machine server-side)
      const allowedKeys = ['email', 'zalo', 'address', 'password', 'avatar', 'gender'];
      Object.keys(safeBody).forEach(key => {
        if (!allowedKeys.includes(key)) {
          delete safeBody[key];
        }
      });
      if (Object.prototype.hasOwnProperty.call(safeBody, 'gender')) {
        const g = String(safeBody.gender || '').trim().toLowerCase();
        if (g === 'female' || g === 'nữ' || g === 'nu') safeBody.gender = 'female';
        else if (g === 'male' || g === 'nam') safeBody.gender = 'male';
        else delete safeBody.gender;
      }
    }

    // Một nguồn đúng cho link vào lớp: GV/Admin sửa linkHoc → đồng bộ online_meeting_url (tránh URL cũ chiếm ưu tiên ở client)
    if (Object.prototype.hasOwnProperty.call(safeBody, 'linkHoc')) {
      safeBody.online_meeting_url = safeBody.linkHoc || '';
    }

    // Admin/staff đổi khóa học / số buổi → lấy từ catalog nếu thiếu
    const isStaffOrAdmin = req.user.role === 'admin' || req.user.role === 'staff';
    if (isStaffOrAdmin && safeBody.courseId && !(Number(safeBody.totalSessions) > 0)) {
      const Course = require('../models/Course');
      const catalog = await Course.findById(safeBody.courseId).select('name totalSessions').lean();
      if (catalog) {
        safeBody.totalSessions = Number(catalog.totalSessions) > 0 ? Number(catalog.totalSessions) : 12;
        if (!safeBody.course) safeBody.course = catalog.name;
      }
    }

    // Hash mật khẩu nếu admin/staff đổi (findByIdAndUpdate không chạy pre('save'))
    let passwordChanged = false;
    if (Object.prototype.hasOwnProperty.call(safeBody, 'password')) {
      const plain = String(safeBody.password || '').trim();
      if (plain) {
        const bcrypt = require('bcryptjs');
        safeBody.password = await bcrypt.hash(plain, 10);
        passwordChanged = true;
      } else {
        delete safeBody.password;
      }
    }

    // Đổi SĐT / Zalo / email → kiểm tra trùng toàn hệ thống (HV + GV)
    if (
      safeBody.phone !== undefined
      || safeBody.zalo !== undefined
      || safeBody.email !== undefined
    ) {
      if (safeBody.phone !== undefined) {
        const { normalizeVNPhone } = require('../utils/phoneIdentity');
        const canonicalPhone = normalizeVNPhone(safeBody.phone);
        if (!canonicalPhone) {
          return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
        }
        safeBody.phone = canonicalPhone;
      }
      const current = await Student.findById(req.params.id).select('phone zalo email').lean();
      if (!current) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
      }
      try {
        const { assertUniqueContact } = require('../utils/uniqueContact');
        await assertUniqueContact({
          phone: safeBody.phone !== undefined ? safeBody.phone : current.phone,
          zalo: safeBody.zalo !== undefined ? safeBody.zalo : current.zalo,
          email: safeBody.email !== undefined ? safeBody.email : current.email,
          excludeRole: 'student',
          excludeId: req.params.id,
        });
      } catch (dupErr) {
        if (dupErr.status === 409) {
          return res.status(409).json({ success: false, message: dupErr.message });
        }
        throw dupErr;
      }
    }

    const prevStatusDoc = await Student.findById(req.params.id).select('status').lean();
    const nextStatus = safeBody.status != null ? String(safeBody.status).toLowerCase() : null;
    const prevStatus = String(prevStatusDoc?.status || '').toLowerCase();
    const locking = nextStatus
      && ['suspended', 'inactive'].includes(nextStatus)
      && !['suspended', 'inactive'].includes(prevStatus);

    const updateOps = locking
      ? { $set: safeBody, $inc: { tokenVersion: 1 }, $unset: { refreshToken: '' } }
      : safeBody;

    const student = await Student.findByIdAndUpdate(req.params.id, updateOps, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('teacherId', 'name phone specialty');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    if (locking) {
      const ioLock = req.app.get('io');
      if (ioLock) {
        ioLock.emit('auth:forceLogout', {
          userId: String(student._id),
          role: 'student',
          reason: 'account_disabled',
        });
      }
    }

    // Đồng bộ enrollment chính — applyEnrollmentStats lấy totalSessions từ đây
    if (isStaffOrAdmin) {
      const touchCourse =
        safeBody.totalSessions != null
        || safeBody.completedSessions != null
        || safeBody.remainingSessions != null
        || safeBody.course != null
        || safeBody.courseId != null
        || safeBody.price != null
        || safeBody.teacherId !== undefined;

      if (touchCourse) {
        const { legacyEnrollmentFromStudent } = require('../services/enrollmentService');
        if (!student.enrollments?.length && (student.course || safeBody.course)) {
          student.enrollments = [legacyEnrollmentFromStudent(student)];
          student.enrollments[0].isPrimary = true;
        }
        if (student.enrollments?.length) {
          let idx = student.enrollments.findIndex((e) => e.isPrimary);
          if (idx < 0) idx = 0;
          const enr = student.enrollments[idx];
          if (safeBody.course != null) enr.courseName = safeBody.course;
          if (safeBody.courseId != null) enr.courseId = safeBody.courseId;
          if (safeBody.price != null) enr.price = Number(safeBody.price) || 0;
          if (safeBody.teacherId !== undefined) {
            enr.teacherId = safeBody.teacherId || null;
          }

          const ts = Number(
            safeBody.totalSessions != null ? safeBody.totalSessions : (enr.totalSessions || student.totalSessions || 12)
          ) > 0
            ? Number(safeBody.totalSessions != null ? safeBody.totalSessions : (enr.totalSessions || student.totalSessions || 12))
            : 12;

          let completed = Number(
            safeBody.completedSessions != null
              ? safeBody.completedSessions
              : (enr.completedSessions ?? student.completedSessions ?? 0)
          ) || 0;
          completed = Math.max(0, Math.min(ts, completed));

          let remaining;
          if (safeBody.remainingSessions != null) {
            remaining = Math.max(0, Math.min(ts, Number(safeBody.remainingSessions) || 0));
            // Nếu admin gửi cả completed + remaining, ưu tiên khớp remaining = total - completed
            if (safeBody.completedSessions != null) {
              remaining = Math.max(0, ts - completed);
            } else {
              completed = Math.max(0, ts - remaining);
            }
          } else {
            remaining = Math.max(0, ts - completed);
          }

          if (safeBody.totalSessions != null
            || safeBody.completedSessions != null
            || safeBody.remainingSessions != null) {
            enr.totalSessions = ts;
            enr.completedSessions = completed;
            enr.remainingSessions = remaining;
            student.totalSessions = ts;
            student.completedSessions = completed;
            student.remainingSessions = remaining;
          }

          student.markModified('enrollments');
          await student.save();
        }
      }

      // Đồng bộ quyền thi/camera xuống từng enrollment khi cập nhật flag root (list/edit modal)
      if (safeBody.studentExamUnlocked !== undefined || safeBody.requireWebcam !== undefined) {
        if (!student.enrollments?.length && student.course) {
          const { legacyEnrollmentFromStudent: legacyEnr } = require('../services/enrollmentService');
          student.enrollments = [legacyEnr(student)];
          student.enrollments[0].isPrimary = true;
        }
        if (student.enrollments?.length) {
          if (typeof safeBody.studentExamUnlocked === 'boolean') {
            student.enrollments.forEach((e) => {
              e.examUnlocked = !!safeBody.studentExamUnlocked;
            });
          }
          if (typeof safeBody.requireWebcam === 'boolean') {
            student.enrollments.forEach((e) => {
              e.requireWebcam = !!safeBody.requireWebcam;
            });
          }
          student.markModified('enrollments');
          await student.save();
        }
      }

      if (pendingTeacherAlert !== undefined) {
        if (!student.enrollments?.length && student.course) {
          student.enrollments = [legacyEnrollmentFromStudent(student)];
          student.enrollments[0].isPrimary = true;
        }
        if (student.enrollments?.length) {
          let alertIdx = student.enrollments.findIndex((e) => e.isPrimary);
          if (alertIdx < 0) alertIdx = 0;
          student.enrollments[alertIdx].teacherAlert = pendingTeacherAlert;
          student.markModified('enrollments');
          await student.save();
        }
      }
    }

    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'student:updated', student._id);
      studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });

      // ── Notification: duyệt/thu hồi quyền thi (khi admin/staff cập nhật qua PUT /students/:id)
      // AdminDashboard hiện dùng endpoint này cho approve/revoke exam, nên cần bắn noti ở đây.
      try {
        const NotificationService = require('../services/NotificationService');
        const beforeUnlocked = Boolean(before?.studentExamUnlocked);
        const afterUnlocked = Boolean(student.studentExamUnlocked);
        const beforeApproved = Boolean(before?.examApproved);
        const afterApproved = Boolean(student.examApproved);

        // Chỉ bắn noti nếu có thay đổi trạng thái (tránh spam khi update fields khác)
        if ((beforeUnlocked !== afterUnlocked) || (beforeApproved !== afterApproved)) {
          if (afterUnlocked || afterApproved) {
            await NotificationService.send(io, {
              type: 'EXAM',
              title: '✅ Bạn đã được duyệt thi',
              content: 'Admin đã cấp quyền cho bạn vào phòng thi. Bạn có thể vào thi ngay.',
              receivers: student._id.toString(),
              payload: { studentId: student._id.toString(), action: 'exam_approved' },
              link: '/student/exam'
            });
            studentRealtime(io, student, 'exam:unlocked', { studentId: student._id.toString(), studentName: student.name });
          } else {
            await NotificationService.send(io, {
              type: 'EXAM',
              title: '🔒 Quyền thi đã bị thu hồi',
              content: 'Quyền vào phòng thi của bạn vừa bị khóa. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.',
              receivers: student._id.toString(),
              payload: { studentId: student._id.toString(), action: 'exam_revoked' },
              link: '/student/exam'
            });
            studentRealtime(io, student, 'exam:locked', { studentId: student._id.toString(), reason: 'revoked', message: '🔒 Quyền thi đã bị thu hồi' });
          }
        }

        // ── Notification: cấp lại bài thi (thi lại) theo từng môn (examProgress reset)
        // AdminDashboard reset môn thi bằng cách update examProgress[].lockUntil=null, status='chua_thi', score/null...
        const beforeProg = Array.isArray(before?.examProgress) ? before.examProgress : null;
        const afterProg = Array.isArray(student.examProgress) ? student.examProgress : null;
        const isAdminActor = ['admin', 'staff'].includes(String(req.user?.role || '').toLowerCase());

        if (isAdminActor && beforeProg && afterProg && Object.prototype.hasOwnProperty.call(safeBody, 'examProgress')) {
          const beforeMap = new Map(beforeProg.map((p) => [String(p?.id || ''), p]));
          const retakeSubjects = [];
          for (const ap of afterProg) {
            const sid = String(ap?.id || '');
            if (!sid) continue;
            const bp = beforeMap.get(sid);
            if (!bp) continue;

            const beforeLocked = bp.lockUntil != null;
            const afterLocked = ap.lockUntil != null;
            const becameUnlocked = beforeLocked && !afterLocked;
            const statusReset = String(bp.status || '') === 'khong_dat' && String(ap.status || '') === 'chua_thi';

            if (becameUnlocked || statusReset) retakeSubjects.push(sid);
          }

          if (retakeSubjects.length > 0) {
            const uniq = Array.from(new Set(retakeSubjects));
            const subjectText = uniq.length === 1 ? `môn "${uniq[0]}"` : `${uniq.length} môn thi`;
            await NotificationService.send(io, {
              type: 'EXAM',
              title: '🔓 Đã cấp lại bài thi',
              content: `Admin đã mở khóa để bạn thi lại ${subjectText}. Bạn có thể vào phòng thi để làm lại.`,
              receivers: student._id.toString(),
              payload: { studentId: student._id.toString(), action: 'exam_retake_granted', subjects: uniq },
              link: '/student/exam'
            });
          }
        }
      } catch (notifErr) {
        logger?.error?.('[STUDENTS] Exam approval notification error:', notifErr);
      }

      try {
        const prevLink = String(before?.linkHoc || '').trim();
        const nextLink = String(student.linkHoc || '').trim();
        if (req.user.role !== 'student' && Object.prototype.hasOwnProperty.call(safeBody, 'linkHoc') && prevLink !== nextLink) {
          const NotificationService = require('../services/NotificationService');
          const courseLabel = student.course || 'khóa học';
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: nextLink ? '🔗 Link vào lớp đã cập nhật' : '🔗 Link vào lớp đã được gỡ',
            content: nextLink
              ? `Link học khóa "${courseLabel}" đã được cập nhật. Bấm thông báo để vào lớp.\n${nextLink}`
              : `Link học khóa "${courseLabel}" đã được gỡ.`,
            receivers: student._id.toString(),
            payload: {
              kind: 'class_link_updated',
              courseName: courseLabel,
              linkHoc: nextLink || '',
              targetAudience: 'student',
            },
            link: '/student#profile',
          });
        }
      } catch (linkErr) {
        logger?.error?.('[STUDENTS] class link notify: %s', linkErr?.message || linkErr);
      }
    }

    res.json({
      success: true,
      data: student,
      meta: {
        passwordChanged,
        changes: require('../utils/systemLogChangeSummary').summarizeStudentUpdates(
          { ...safeBody, ...(passwordChanged ? { _passwordChanged: true } : {}) },
          before,
          { passwordChanged },
        ),
        previous: before
          ? {
            name: before.name,
            phone: before.phone,
            course: before.course,
            status: before.status,
            price: before.price,
            totalSessions: before.totalSessions,
            completedSessions: before.completedSessions,
            remainingSessions: before.remainingSessions,
            teacherName: before.teacherName,
          }
          : null,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

const studentExamGuard = [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('exam_progress'),
  assertStudentBranchAccess,
];
const STUDENT_EXAM_LOCK_MS = 7 * 24 * 60 * 60 * 1000;

function studentAttemptResponse(entry, extra = {}) {
  const score = Number(entry?.tracNghiem?.score) || 0;
  const total = Number(entry?.tracNghiem?.total) || 0;
  return {
    attemptId: entry?.attemptId || '',
    score,
    total,
    percentage: total > 0 ? Math.round((score / total) * 100) : 0,
    passed: String(entry?.status) === 'dat' || (
      String(entry?.status) === 'dang_thi' && total > 0 && score / total >= 0.5
    ),
    status: entry?.status || 'chua_thi',
    lockUntil: entry?.lockUntil == null ? null : Number(entry.lockUntil),
    essayRequired: String(entry?.status) === 'dang_thi',
    idempotent: false,
    ...extra,
  };
}

/** Chốt RỚT + khóa cho lượt thi còn mở (reload, đóng tab, thoát phòng thi). */
async function forfeitOpenStudentAttempt(req, { studentId, subjectId, attemptId = '', reason = '' }) {
  const student = await claimStudentOpenAttempt(Student, {
    studentId,
    subjectId,
    attemptId,
    setFields: {
      'examProgress.$.status': 'khong_dat',
      'examProgress.$.lockUntil': Date.now() + STUDENT_EXAM_LOCK_MS,
      'examProgress.$.attemptStatus': 'forfeited',
      'examProgress.$.attemptSubmittedAt': new Date(),
      'examProgress.$.thucHanh': 'chua_nop',
    },
  });
  if (!student) return null;
  logger.warn('[STUDENTS] exam attempt forfeited %s/%s: %s', studentId, subjectId, reason || 'exit');
  const io = req.app.get('io');
  if (io) {
    studentRealtime(io, student, 'student:updated', student._id);
    studentDataRefresh(io, student, { type: 'student', id: student._id });
  }
  return student;
}

/** Cửa sổ cho phép hủy lượt vừa mở mà chưa vào phòng thi (bước bật camera). */
const STUDENT_EXAM_SOFT_RELEASE_MS = 90 * 1000;

async function releaseUnstartedStudentAttempt(req, { studentId, subjectId }) {
  const current = await Student.findById(studentId).select('examProgress').lean();
  const entry = (current?.examProgress || []).find((item) => String(item.id) === subjectId);
  const startedAt = entry?.attemptStartedAt ? new Date(entry.attemptStartedAt).getTime() : 0;
  const releasable = entry?.attemptStatus === 'active'
    && entry.attemptId
    && startedAt
    && Date.now() - startedAt <= STUDENT_EXAM_SOFT_RELEASE_MS;
  if (!releasable) return null;

  const student = await claimStudentAttempt(Student, {
    studentId,
    subjectId,
    attemptId: String(entry.attemptId),
    setFields: {
      'examProgress.$.status': 'chua_thi',
      'examProgress.$.attemptStatus': null,
      'examProgress.$.attemptId': null,
      'examProgress.$.attemptStartedAt': null,
      'examProgress.$.attemptSubmittedAt': null,
    },
  });
  if (!student) return null;
  const io = req.app.get('io');
  if (io) {
    studentRealtime(io, student, 'student:updated', student._id);
    studentDataRefresh(io, student, { type: 'student', id: student._id });
  }
  return student;
}

function studentExamDurationSeconds(settings, subjectId) {
  const raw = Number(settings?.studentExamMinutesRaw?.[subjectId]);
  const minutes = Number.isFinite(raw) && raw >= 1 && raw <= 600 ? raw : 90;
  return Math.round(minutes * 60);
}

// ─── POST /api/students/:id/exam-attempt ──────────────────────────────────────
// Server issues the exact answer-free question set and binds it to student-self.
router.post('/:id/exam-attempt', studentExamGuard, async (req, res) => {
  try {
    if (req.user?.role !== 'student' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Chỉ học viên được tạo lượt thi của chính mình' });
    }
    const subjectId = String(req.body?.subjectId || '').trim().toLowerCase();
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Thiếu subjectId' });
    }

    const { canStudentWriteExamProgress } = require('../services/examProgressService');
    let [student, settings] = await Promise.all([
      Student.findById(req.params.id),
      getCachedSettings(),
    ]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (!canStudentWriteExamProgress(student, subjectId)) {
      return res.status(403).json({ success: false, message: 'Môn thi chưa được mở khóa hoặc chưa đủ số buổi' });
    }

    let entry = (student.examProgress || []).find((item) => String(item.id) === subjectId);
    const decision = decideStudentAttemptStart(entry, req.body?.liveAttemptId);
    if (decision.action === 'closed') {
      return res.status(409).json({ success: false, message: 'Môn thi đã được chốt, liên hệ Admin để mở lại' });
    }
    if (decision.action === 'awaiting') {
      return res.status(409).json({ success: false, message: 'Bài thực hành đã nộp và đang chờ chấm điểm' });
    }
    if (decision.action === 'abandon') {
      // Tải lại trang / mở tab khác khi đang thi → hủy bài, tính RỚT.
      await forfeitOpenStudentAttempt(req, {
        studentId: req.params.id,
        subjectId,
        attemptId: decision.attemptId,
        reason: 'reload_or_new_tab',
      });
      return res.status(409).json({
        success: false,
        code: 'EXAM_ATTEMPT_ABANDONED',
        message: 'Bài thi đã bị hủy do tải lại trang hoặc rời phòng thi. Môn này bị tính RỚT — liên hệ Admin để mở lại.',
      });
    }

    const ttlSeconds = studentExamDurationSeconds(settings, subjectId);
    const mcAlreadySubmitted = entry?.attemptStatus === 'submitted'
      && String(entry?.status) === 'dang_thi'
      && Number(entry?.tracNghiem?.total) > 0
      && Number(entry?.tracNghiem?.score) / Number(entry?.tracNghiem?.total) >= 0.5;
    let attemptId = decision.action === 'resume' ? decision.attemptId : '';
    let startedAt = entry?.attemptStartedAt ? new Date(entry.attemptStartedAt).getTime() : 0;
    if (!mcAlreadySubmitted && attemptId && startedAt && Date.now() >= startedAt + ttlSeconds * 1000) {
      await claimStudentAttempt(Student, {
        studentId: req.params.id,
        subjectId,
        attemptId,
        setFields: {
          'examProgress.$.status': 'khong_dat',
          'examProgress.$.lockUntil': Date.now() + STUDENT_EXAM_LOCK_MS,
          'examProgress.$.attemptStatus': 'forfeited',
          'examProgress.$.attemptSubmittedAt': new Date(),
        },
      });
      return res.status(409).json({ success: false, message: 'Lượt thi đã hết thời gian' });
    }
    if (!attemptId) {
      const proposedAttemptId = crypto.randomUUID();
      startedAt = Date.now();
      const attemptEntry = {
        id: subjectId,
        status: 'dang_thi',
        attemptId: proposedAttemptId,
        attemptStatus: 'active',
        attemptStartedAt: new Date(startedAt),
        attemptSubmittedAt: null,
      };
      let claimed;
      if (!entry) {
        claimed = await Student.findOneAndUpdate(
          { _id: req.params.id, 'examProgress.id': { $ne: subjectId } },
          { $push: { examProgress: attemptEntry } },
          { returnDocument: 'after', runValidators: true },
        );
      } else {
        claimed = await Student.findOneAndUpdate(
          {
            _id: req.params.id,
            examProgress: {
              $elemMatch: {
                id: subjectId,
                attemptStatus: { $ne: 'active' },
                status: { $nin: ['dat', 'khong_dat'] },
              },
            },
          },
          {
            $set: {
              'examProgress.$.status': 'dang_thi',
              'examProgress.$.attemptId': proposedAttemptId,
              'examProgress.$.attemptStatus': 'active',
              'examProgress.$.attemptStartedAt': new Date(startedAt),
              'examProgress.$.attemptSubmittedAt': null,
            },
          },
          { returnDocument: 'after', runValidators: true },
        );
      }
      student = claimed || await Student.findById(req.params.id);
      entry = (student?.examProgress || []).find((item) => String(item.id) === subjectId);
      if (!entry || entry.attemptStatus !== 'active' || !entry.attemptId) {
        return res.status(409).json({ success: false, message: 'Không thể xác nhận lượt thi đang hoạt động' });
      }
      attemptId = String(entry.attemptId);
      startedAt = entry.attemptStartedAt ? new Date(entry.attemptStartedAt).getTime() : startedAt;
    }

    const remainingSeconds = mcAlreadySubmitted
      ? 1
      : Math.max(1, Math.floor((startedAt + ttlSeconds * 1000 - Date.now()) / 1000));
    const attempt = createExamAttempt({
      kind: 'student',
      userId: req.user.id,
      subjectIds: [subjectId],
      bank: settings?.studentExamBankRawData,
      attemptId,
      ttlSeconds: remainingSeconds,
    });
    const essayRequired = settings?.studentEssayRequiredRaw?.[subjectId] !== false;
    return res.json({
      success: true,
      data: {
        ...attempt,
        subjectId,
        essayRequired,
        passPercentage: 50,
        durationSeconds: ttlSeconds,
        mcSubmitted: mcAlreadySubmitted,
        mcResult: mcAlreadySubmitted
          ? studentAttemptResponse(entry, { essayRequired, idempotent: true })
          : null,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] create exam attempt:', error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
});

// ─── POST /api/students/:id/exam-attempt/submit ───────────────────────────────
router.post('/:id/exam-attempt/submit', studentExamGuard, async (req, res) => {
  try {
    if (req.user?.role !== 'student' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể nộp lượt thi của học viên khác' });
    }
    const settings = await getCachedSettings();
    const graded = gradeExamAttempt({
      token: req.body?.attemptToken,
      expected: { kind: 'student', userId: req.user.id },
      bank: settings?.studentExamBankRawData,
      answers: req.body?.answers,
    });
    const subjectId = String(graded.payload.subjectIds[0] || '');
    if (!subjectId || graded.payload.subjectIds.length !== 1) {
      return res.status(400).json({ success: false, message: 'Attempt không có đúng một môn thi' });
    }
    const essayRequired = settings?.studentEssayRequiredRaw?.[subjectId] !== false;
    const now = new Date();
    const nextStatus = graded.result.passed
      ? (essayRequired ? 'dang_thi' : 'dat')
      : 'khong_dat';
    const setFields = {
      'examProgress.$.tracNghiem.score': graded.result.correct,
      'examProgress.$.tracNghiem.total': graded.result.total,
      'examProgress.$.status': nextStatus,
      'examProgress.$.attemptStatus': 'submitted',
      'examProgress.$.attemptSubmittedAt': now,
    };
    if (!graded.result.passed) {
      setFields['examProgress.$.lockUntil'] = Date.now() + STUDENT_EXAM_LOCK_MS;
      setFields['examProgress.$.thucHanh'] = 'chua_nop';
    } else {
      setFields['examProgress.$.lockUntil'] = null;
    }

    const student = await claimStudentAttempt(Student, {
      studentId: req.params.id,
      subjectId,
      attemptId: graded.payload.attemptId,
      setFields,
    });

    if (!student) {
      const existingStudent = await Student.findById(req.params.id).select('examProgress').lean();
      const existing = (existingStudent?.examProgress || []).find(
        (item) => String(item.id) === subjectId && String(item.attemptId) === graded.payload.attemptId,
      );
      if (existing?.attemptStatus === 'submitted') {
        return res.json({
          success: true,
          data: studentAttemptResponse(existing, {
            essayRequired,
            idempotent: true,
          }),
        });
      }
      return res.status(409).json({ success: false, message: 'Lượt thi không còn hoạt động hoặc đã được thay thế' });
    }

    const entry = (student.examProgress || []).find((item) => String(item.id) === subjectId);
    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    return res.json({
      success: true,
      data: studentAttemptResponse(entry, {
        essayRequired,
        idempotent: false,
      }),
    });
  } catch (error) {
    logger.warn('[STUDENTS] submit exam attempt: %s', error.message);
    return res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể nộp bài' });
  }
});

// ─── POST /api/students/:id/exam-attempt/forfeit ──────────────────────────────
router.post('/:id/exam-attempt/forfeit', studentExamGuard, async (req, res) => {
  try {
    if (req.user?.role !== 'student' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể hủy lượt thi của học viên khác' });
    }
    const payload = verifyAttemptToken(req.body?.attemptToken, {
      kind: 'student',
      userId: req.user.id,
    }, { allowExpired: true });
    const subjectId = String(payload.subjectIds?.[0] || '');
    const student = await claimStudentAttempt(Student, {
      studentId: req.params.id,
      subjectId,
      attemptId: payload.attemptId,
      setFields: {
        'examProgress.$.tracNghiem.score': 0,
        'examProgress.$.tracNghiem.total': payload.questionIds.length,
        'examProgress.$.thucHanh': 'chua_nop',
        'examProgress.$.status': 'khong_dat',
        'examProgress.$.lockUntil': Date.now() + STUDENT_EXAM_LOCK_MS,
        'examProgress.$.attemptStatus': 'forfeited',
        'examProgress.$.attemptSubmittedAt': new Date(),
      },
    });
    if (!student) {
      const existingStudent = await Student.findById(req.params.id).select('examProgress').lean();
      const existing = (existingStudent?.examProgress || []).find(
        (item) => String(item.id) === subjectId && String(item.attemptId) === payload.attemptId,
      );
      if (existing && ['forfeited', 'submitted'].includes(existing.attemptStatus)) {
        return res.json({ success: true, data: studentAttemptResponse(existing, { idempotent: true }) });
      }
      return res.status(409).json({ success: false, message: 'Lượt thi không còn hoạt động' });
    }
    const entry = (student.examProgress || []).find((item) => String(item.id) === subjectId);
    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    return res.json({ success: true, data: studentAttemptResponse(entry) });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể hủy bài' });
  }
});

// ─── POST /api/students/:id/exam-attempt/abandon ───────────────────────────────
// Tải lại trang / đóng tab / thoát phòng thi: chốt RỚT ngay, không cần token.
router.post('/:id/exam-attempt/abandon', studentExamGuard, async (req, res) => {
  try {
    if (req.user?.role !== 'student' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể hủy lượt thi của học viên khác' });
    }
    const subjectId = String(req.body?.subjectId || '').trim().toLowerCase();
    if (!subjectId) {
      return res.status(400).json({ success: false, message: 'Thiếu subjectId' });
    }

    // Thoát ở bước kiểm tra camera (chưa vào phòng thi) → trả lượt về "chưa thi"
    if (req.body?.soft === true) {
      const released = await releaseUnstartedStudentAttempt(req, { studentId: req.params.id, subjectId });
      if (released) return res.json({ success: true, released: true, data: null });
    }

    const student = await forfeitOpenStudentAttempt(req, {
      studentId: req.params.id,
      subjectId,
      attemptId: String(req.body?.attemptId || '').trim(),
      reason: String(req.body?.reason || 'exit_exam_room').slice(0, 120),
    });
    if (!student) {
      return res.json({ success: true, data: null });
    }
    const entry = (student.examProgress || []).find((item) => String(item.id) === subjectId);
    return res.json({ success: true, data: studentAttemptResponse(entry) });
  } catch (error) {
    logger.warn('[STUDENTS] abandon exam attempt: %s', error.message);
    return res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể hủy bài' });
  }
});

// ─── PUT /api/students/:id/exam-progress ───────────────────────────────────────
// Student-self may only attach practical work after a server-graded MC attempt.
router.put('/:id/exam-progress', [authMiddleware, branchFilter, policyShadowStudentMutation('exam_progress'), assertStudentBranchAccess], async (req, res) => {
  try {
    const { applyStudentExamProgress, canStudentWriteExamProgress } = require('../services/examProgressService');
    const isSelf = req.user.role === 'student' && String(req.user.id) === String(req.params.id);
    const isStaff = req.user.role === 'admin' || req.user.role === 'staff';
    if (!isSelf && !isStaff) {
      return res.status(403).json({ success: false, message: 'Không có quyền cập nhật tiến độ thi' });
    }

    const { subjectId } = req.body || {};
    let { changes } = req.body || {};
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    if (isSelf) {
      if (!canStudentWriteExamProgress(student, subjectId)) {
        return res.status(403).json({ success: false, message: 'Chưa được mở khóa phòng thi' });
      }
      const current = (student.examProgress || []).find((item) => String(item.id) === String(subjectId));
      if (
        current?.attemptStatus !== 'submitted'
        || String(current?.status) !== 'dang_thi'
        || Number(current?.tracNghiem?.total) < 1
        || Number(current?.tracNghiem?.score) / Number(current?.tracNghiem?.total) < 0.5
      ) {
        return res.status(409).json({ success: false, message: 'Phần trắc nghiệm chưa được server chấm đạt' });
      }
      changes = {
        ...(req.body?.changes?.thucHanh !== undefined ? { thucHanh: req.body.changes.thucHanh } : {}),
        ...(req.body?.changes?.essayFile !== undefined ? { essayFile: req.body.changes.essayFile } : {}),
      };
    }

    let progress;
    let entry;
    try {
      ({ progress, entry } = applyStudentExamProgress(student, subjectId, changes || {}));
    } catch (verr) {
      return res.status(verr.status || 400).json({ success: false, message: verr.message });
    }

    student.examProgress = progress;
    await student.save({ validateModifiedOnly: true });

    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }

    return res.json({
      success: true,
      data: { examProgress: student.examProgress, entry },
    });
  } catch (error) {
    logger.error('[STUDENTS] exam-progress error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PATCH /api/students/:id/price ────────────────────────────────────────────
// Admin điều chỉnh học phí riêng cho 1 học viên cụ thể (ghi đè price snapshot)
// Dùng khi: học viên xin giảm học phí, có mã giảm giá, hoặc Admin muốn áp giá mới
router.patch('/:id/price', [authMiddleware, branchFilter, policyShadowStudentMutation('finance_price'), checkPermission(PERMISSIONS.MANAGE_FINANCE), assertStudentBranchAccess], async (req, res) => {
  try {
    const { newPrice, reason = '' } = req.body;
    if (!newPrice || isNaN(newPrice) || Number(newPrice) < 0) {
      return res.status(400).json({ success: false, message: 'Học phí không hợp lệ' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const oldPrice = student.price;
    student.price = Number(newPrice);
    student.priceHistory = student.priceHistory || [];
    student.priceHistory.push({
      oldPrice,
      newPrice: Number(newPrice),
      reason,
      changedBy: req.user.id,
      changedAt: new Date(),
    });
    await student.save({ validateModifiedOnly: true });

    const io = req.app.get('io');
    if (io) studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'student:updated', student._id);

    res.json({
      success: true,
      message: `Đã cập nhật học phí từ ${oldPrice.toLocaleString('vi-VN')}đ → ${Number(newPrice).toLocaleString('vi-VN')}đ`,
      data: student,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// ─── PUT /api/students/:id/pay ─────────────────────────────────────────────────
// Workflow 4: Admin xác nhận thu học phí → tạo hóa đơn tự động + ledger payment
router.put('/:id/pay', [authMiddleware, branchFilter, policyShadowStudentMutation('finance_pay'), checkPermission(PERMISSIONS.MANAGE_FINANCE), assertStudentBranchAccess], async (req, res) => {
  try {
    const { paymentMethod = 'transfer', note = '' } = req.body;

    const existing = await Student.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (existing.paid) {
      return res.status(409).json({ success: false, message: 'Học viên đã thanh toán trước đó' });
    }

    const paidAt = new Date();
    const paidAmount = Number(existing.paidAmount) > 0
      ? Number(existing.paidAmount)
      : (Number(existing.price) || 0);

    // Atomic claim — tránh race double-pay (admin×admin / admin×SePay)
    const claimed = await Student.findOneAndUpdate(
      { _id: req.params.id, paid: false },
      {
        $set: {
          paid: true,
          paidAt,
          paymentMethod,
          paidAmount,
        },
      },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      return res.status(409).json({ success: false, message: 'Học viên đã thanh toán trước đó' });
    }

    // Mở quyền học enrollment primary / đã gắn khóa chính
    if (claimed.enrollments?.length) {
      claimed.enrollments.forEach((e) => {
        if (e.isPrimary || claimed.enrollments.length === 1) {
          e.paid = true;
          e.paidAt = paidAt;
          e.learningAccess = true;
          if (e.status === 'pending_payment' || e.status === 'refunded') e.status = 'active';
        }
      });
      claimed.markModified('enrollments');
      await claimed.save({ validateModifiedOnly: true });
    }

    const student = claimed;
    let invoice = null;
    try {
      invoice = await createTuitionInvoice({
        student,
        courseName: student.course,
        amount: student.paidAmount || student.price,
        note,
      });
    } catch (invErr) {
      logger.warn('[STUDENTS] invoice on pay: %s', invErr.message);
    }
    const maHD = invoice?.maHoaDon || '';

    try {
      await settlePayment({
        student,
        amount: student.paidAmount || student.price,
        invoice,
        enrollmentId: (() => {
          const list = student.enrollments || [];
          const primary = list.find((e) => e.isPrimary) || list[0];
          return primary?._id ? String(primary._id) : '';
        })(),
        courseName: student.course,
        source: 'admin_pay',
        sourceRef: maHD || `pay:${student._id}`,
        // Key theo HV + enrollment primary — idempotent rematch cùng lần thu
        idempotencyKey: (() => {
          const list = student.enrollments || [];
          const primary = list.find((e) => e.isPrimary) || list[0];
          const enrId = primary?._id ? String(primary._id) : 'none';
          return `payment:student:${student._id}:enr:${enrId}`;
        })(),
        actor: financeActor(req),
        note,
        metadata: { paymentMethod: paymentMethod || 'transfer' },
        reqMeta: financeReqMeta(req, student),
      });
      bustFinanceCaches();
    } catch (ledgerErr) {
      logger.error('[STUDENTS] ledger settle pay FAILED — rollback: %s', ledgerErr.message);
      try {
        if (student.enrollments?.length) {
          student.enrollments.forEach((e) => {
            if (e.isPrimary || student.enrollments.length === 1) {
              e.paid = false;
              e.paidAt = undefined;
              e.learningAccess = false;
              if (e.status === 'active') e.status = 'pending_payment';
            }
          });
          student.markModified('enrollments');
        }
        student.paid = false;
        student.paidAmount = 0;
        student.paidAt = undefined;
        student.paymentMethod = '';
        await student.save({ validateModifiedOnly: true });
        if (invoice?._id) {
          await Invoice.findByIdAndUpdate(invoice._id, { status: 'void' });
        }
      } catch (rbErr) {
        logger.error('[STUDENTS] pay rollback failed: %s', rbErr.message);
      }
      return res.status(500).json({
        success: false,
        message: 'Ghi sổ cái thất bại — đã rollback trạng thái thu. Thử lại.',
      });
    }

    // Thông báo real-time
    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      
      // Notify Admin: doanh thu mới
      NotificationService.notifyAdmins(io, '💰 Thu học phí', `Đã thu ${student.price.toLocaleString('vi-VN')}đ từ ${student.name}`, { studentId: student._id }, '/admin/invoices');
      
      // Notify học viên: xác nhận đã thanh toán
      NotificationService.send(io, {
        type: 'FINANCE',
        title: '✅ Thanh toán thành công',
        content: `Học phí của bạn đã được xác nhận. Mã HĐ: ${maHD}`,
        receivers: student._id.toString(),
        link: '/student#profile'
      });

      studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'revenue:updated', { amount: student.price, studentName: student.name });
      studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
    }

    await syncCertPrepFromEnrollment(student, req);

    res.json({
      success: true,
      message: `Đã xác nhận thanh toán ${student.price.toLocaleString('vi-VN')}đ`,
      data: {
        student: (() => {
          const o = student.toObject();
          delete o.password;
          delete o.refreshToken;
          return o;
        })(),
        invoice,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] Pay error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/refund ─────────────────────────────────────────────
// Hoàn tiền: partial (amount) hoặc full. Atomic claim paidAmount trước ledger.
router.put('/:id/refund', [authMiddleware, branchFilter, policyShadowStudentMutation('finance_refund'), checkPermission(PERMISSIONS.MANAGE_FINANCE), assertStudentBranchAccess], async (req, res) => {
  try {
    const note = String(req.body?.note || 'Hoàn tiền / hủy xác nhận thanh toán').slice(0, 300);
    const result = await refundStudentTuition({
      studentId: req.params.id,
      amount: req.body?.amount,
      note,
      refundId: String(req.body?.refundId || req.headers['idempotency-key'] || '').trim(),
      actor: financeActor(req),
      reqMeta: financeReqMeta(req, null),
    });
    bustFinanceCaches();
    const student = result.student;
    const io = req.app.get('io');
    if (io && !result.idempotent) {
      const NotificationService = require('../services/NotificationService');
      const refundAmt = result.refundedAmount;
      const partial = result.partial;
      NotificationService.notifyAdmins(
        io,
        partial ? '↩️ Hoàn học phí (một phần)' : '↩️ Hoàn học phí',
        `Đã hoàn ${refundAmt.toLocaleString('vi-VN')}đ của ${student.name}${partial ? ` (còn ${Number(student.paidAmount).toLocaleString('vi-VN')}đ)` : ''}`,
        { studentId: student._id },
        '/admin/students',
      ).catch(() => {});
      NotificationService.send(io, {
        type: 'FINANCE',
        title: partial ? 'Hoàn học phí một phần' : 'Hoàn học phí',
        content: partial
          ? `Đã hoàn ${refundAmt.toLocaleString('vi-VN')}đ. Số dư đã thanh toán còn ${Number(student.paidAmount).toLocaleString('vi-VN')}đ. ${note}`
          : `Trạng thái thanh toán của bạn đã được cập nhật (hoàn/hủy). ${note}`,
        receivers: String(student._id),
        link: '/student#profile',
      }).catch(() => {});
      studentDataRefresh(io, student, { type: 'student', id: student._id });
      studentRealtime(io, student, 'revenue:updated', { amount: -refundAmt, studentName: student.name });
    }
    const o = student.toObject ? student.toObject() : student;
    delete o.password;
    delete o.refreshToken;
    await reconcileCertPrepAfterRefund(student);
    return res.json({
      success: true,
      message: result.idempotent
        ? 'Hoàn tiền đã được ghi nhận trước đó (idempotent)'
        : (result.partial
          ? `Đã hoàn một phần ${result.refundedAmount.toLocaleString('vi-VN')}đ (còn ${Number(result.remainingPaidAmount).toLocaleString('vi-VN')}đ)`
          : `Đã hoàn/hủy thanh toán ${result.refundedAmount.toLocaleString('vi-VN')}đ`),
      data: {
        student: o,
        refundedAmount: result.refundedAmount,
        partial: result.partial,
        remainingPaidAmount: result.remainingPaidAmount,
        oldValue: result.oldSnapshot,
        ledgerEntryId: result.ledgerEntryId,
        idempotent: result.idempotent,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] Refund error:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/unlock-exam ────────────────────────────────────────
// Workflow 2: Admin mở khóa phòng thi thủ công
// Body optional: { enrollmentId } — chỉ mở 1 khóa; không có = mở tất cả enrollment
router.put('/:id/unlock-exam', [authMiddleware, branchFilter, policyShadowStudentMutation('unlock_exam'), checkPermission(PERMISSIONS.MANAGE_STUDENTS), assertStudentBranchAccess], async (req, res) => {
  try {
    const { enrollmentId } = req.body || {};
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const ALLOWED_ENR_STATUS = new Set(['active', 'completed', 'paused', 'pending_payment', 'refunded']);

    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }

    // Chuẩn hóa status lệch enum (seed/legacy) trước khi markModified — tránh ValidationError 500
    (student.enrollments || []).forEach((e) => {
      if (e.status && !ALLOWED_ENR_STATUS.has(String(e.status))) {
        e.status = e.paid ? 'active' : 'pending_payment';
      }
    });

    const hasEnrollmentId = enrollmentId
      && enrollmentId !== 'main'
      && require('mongoose').Types.ObjectId.isValid(String(enrollmentId));

    if (hasEnrollmentId) {
      const idx = (student.enrollments || []).findIndex((e) => String(e._id) === String(enrollmentId));
      if (idx < 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học để mở thi' });
      }
      student.enrollments[idx].examUnlocked = true;
      // Root flag = true nếu có ít nhất 1 khóa được mở
      student.studentExamUnlocked = (student.enrollments || []).some((e) => e.examUnlocked === true);
      student.examApproved = student.studentExamUnlocked;
    } else {
      student.studentExamUnlocked = true;
      student.examApproved = true;
      (student.enrollments || []).forEach((e) => { e.examUnlocked = true; });
    }

    if (student.enrollments?.length) student.markModified('enrollments');
    await student.save({ validateModifiedOnly: true });

    // Thông báo — không để lỗi kênh làm fail API sau khi đã mở khóa trong DB
    const io = req.app.get('io');
    if (io) {
      try {
        const NotificationService = require('../services/NotificationService');
        await NotificationService.send(io, {
          type: 'EXAM',
          title: '🔓 Phòng thi đã mở',
          content: hasEnrollmentId
            ? 'Admin đã cấp quyền thi cho một khóa học của bạn.'
            : 'Giảng viên/Admin đã cấp quyền cho bạn vào thi.',
          receivers: student._id.toString(),
          link: '/student/exam',
          payload: {
            studentId: String(student._id),
            enrollmentId: hasEnrollmentId ? String(enrollmentId) : null,
          },
        });
        studentRealtime(io, student, 'exam:unlocked', {
          studentId: student._id.toString(),
          studentName: student.name,
          enrollmentId: hasEnrollmentId ? String(enrollmentId) : null,
        });
        studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
      } catch (notifErr) {
        logger.warn('[STUDENTS] unlock-exam notify: %s', notifErr.message);
      }
    }

    try {
      const workflowService = require('../services/workflowService');
      await workflowService.completeOpenForEntity('exam_unlock', student._id, {
        action: 'approve',
        user: req.user,
        note: 'Mở khóa từ API students/unlock-exam',
      });
    } catch (wfErr) {
      logger.warn({ err: wfErr.message }, '[STUDENTS] workflow sync');
    }

    try {
      const { writeAudit } = require('../services/auditLogService');
      await writeAudit({
        action: 'exam.unlock',
        actorUserId: String(req.user?.id || ''),
        actorRole: String(req.user?.role || ''),
        branchId: student.branchId || null,
        entityType: 'student',
        entityId: String(student._id),
        studentId: student._id,
        oldValue: { studentExamUnlocked: false },
        newValue: {
          studentExamUnlocked: true,
          enrollmentId: hasEnrollmentId ? String(enrollmentId) : 'all',
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (_) { /* non-blocking */ }

    const o = student.toObject();
    delete o.password;
    delete o.refreshToken;
    return res.json({
      success: true,
      message: `Đã mở khóa phòng thi cho ${student.name}`,
      data: o,
    });
  } catch (error) {
    logger.error('[STUDENTS] unlock-exam error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/lock-exam ──────────────────────────────────────────
// Admin/Staff hoặc GV phụ trách: đánh trượt / khóa phòng thi
router.put('/:id/lock-exam', [authMiddleware, branchFilter, policyShadowStudentMutation('lock_exam'), assertStudentBranchAccess], async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isAdminActor = role === 'admin' || role === 'staff';

    if (isAdminActor) {
      const allowed = await userHasPermission(req.user, PERMISSIONS.MANAGE_STUDENTS);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Bạn không có quyền khóa phòng thi học viên.',
        });
      }
    }

    const existing = await Student.findById(req.params.id).select('teacherId name studentExamUnlocked enrollments.teacherId').lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    if (!existing.studentExamUnlocked) {
      return res.status(400).json({
        success: false,
        message: 'Học viên chưa được mở khóa phòng thi hoặc đã bị đánh trượt',
      });
    }

    if (!isAdminActor) {
      if (role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Không có quyền khóa phòng thi' });
      }
      const uid = String(req.user.id);
      const rootOk = String(existing.teacherId || '') === uid;
      const enrOk = (existing.enrollments || []).some(
        (e) => String(e?.teacherId || '') === uid,
      );
      if (!rootOk && !enrOk) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ được đánh trượt học viên do bạn phụ trách',
        });
      }
    }

    const { reason: rawReason = '' } = req.body || {};
    const actorLabel = isAdminActor
      ? (req.user.name || 'Admin')
      : (req.user.name || 'Giảng viên');
    const reason = String(rawReason || '').trim()
      || `Vi phạm quy chế giám sát thi (${actorLabel} đã đánh trượt)`;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    const ALLOWED_ENR_STATUS = new Set(['active', 'completed', 'paused', 'pending_payment', 'refunded']);
    (student.enrollments || []).forEach((e) => {
      if (e.status && !ALLOWED_ENR_STATUS.has(String(e.status))) {
        e.status = e.paid ? 'active' : 'pending_payment';
      }
      e.examUnlocked = false;
    });
    student.studentExamUnlocked = false;
    student.examApproved = false;
    if (student.enrollments?.length) student.markModified('enrollments');
    await student.save({ validateModifiedOnly: true });

    const io = req.app.get('io');
    if (io) {
      try {
        const NotificationService = require('../services/NotificationService');

        await NotificationService.send(io, {
          type: 'EXAM',
          title: '🔒 Bài thi bị đánh trượt',
          content: `Phòng thi của bạn đã bị khóa. Lý do: ${reason}`,
          sender_id: req.user.id,
          receivers: student._id.toString(),
          payload: {
            studentId: student._id.toString(),
            action: 'exam_failed',
            reason,
            by: role,
            actorName: actorLabel,
          },
          link: '/student/exam',
        });

        const adminTitle = isAdminActor
          ? '🔒 Admin đã khóa phòng thi học viên'
          : '🚨 Giảng viên đánh trượt học viên';
        const adminContent = isAdminActor
          ? `${actorLabel} đã khóa phòng thi của học viên ${student.name}. Lý do: ${reason}`
          : `${actorLabel} đã đánh trượt học viên ${student.name}. Lý do: ${reason}`;

        await NotificationService.send(io, {
          type: 'EXAM',
          title: adminTitle,
          content: adminContent,
          sender_id: req.user.id,
          receivers: 'ALL_ADMIN',
          payload: {
            studentId: student._id.toString(),
            studentName: student.name,
            teacherId: student.teacherId?.toString?.() || student.teacherId,
            action: 'exam_failed',
            reason,
            by: role,
          },
          link: '/admin#students',
        });
      } catch (notifErr) {
        logger?.error?.('[LOCK_EXAM] Notification error:', notifErr);
      }

      const lockPayload = {
        studentId: student._id.toString(),
        reason,
        message: `🔒 Phòng thi đã bị khóa. Lý do: ${reason}`,
      };
      io.to(`student_${student._id}`).emit('exam:locked', lockPayload);
      studentRealtime(io, student, 'exam:locked', lockPayload);
      studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'student:updated', student._id);
      studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
    }

    res.json({
      success: true,
      message: `Đã đánh trượt / khóa phòng thi của ${student.name}`,
      data: student,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/enrollments ───────────────────────────────────────
// Admin thêm khóa học mới cho học viên (cùng tài khoản, khác môn / thầy)
router.post('/:id/enrollments', [authMiddleware, branchFilter, policyShadowStudentMutation('enrollment_create'), checkPermission(PERMISSIONS.MANAGE_STUDENTS), assertStudentBranchAccess], async (req, res) => {
  try {
    const { courseName, courseId, teacherId, price, totalSessions, paid, paymentMethod, teacherAlert } = req.body;
    if (!courseName?.trim() && !courseId) {
      return res.status(400).json({ success: false, message: 'Tên khóa học hoặc courseId là bắt buộc' });
    }

    const isPaidFlag = paid === true || paid === 'true' || paid === 1 || paid === '1';
    if (isPaidFlag) {
      const canFinance = await userHasPermission(req.user, PERMISSIONS.MANAGE_FINANCE);
      if (!canFinance) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Đánh dấu đã thanh toán khi thêm khóa cần quyền tài chính.',
        });
      }
    }

    const Course = require('../models/Course');
    let catalogCourse = null;
    if (courseId) {
      catalogCourse = await Course.findById(courseId).lean();
    }
    const resolvedName = (catalogCourse?.name || courseName || '').trim();
    if (!resolvedName) {
      return res.status(400).json({ success: false, message: 'Không xác định được tên khóa học' });
    }

    const student = await Student.findById(req.params.id).populate('teacherId', 'name phone');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }

    const duplicate = (student.enrollments || []).some((e) => {
      if (String(e.status || '') === 'cancelled') return false;
      if (catalogCourse?._id && e.courseId && String(e.courseId) === String(catalogCourse._id)) return true;
      return (e.courseName || '').toLowerCase() === resolvedName.toLowerCase();
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Học viên đã đăng ký khóa học này' });
    }

    let teacherName = '';
    if (teacherId) {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(teacherId).select('name').lean();
      teacherName = t?.name || '';
    }

    const sessions = Number(totalSessions) > 0 ? Number(totalSessions) : (catalogCourse?.totalSessions || 12);
    const resolvedPrice = Number(price) || catalogCourse?.discountPrice || catalogCourse?.price || 0;
    const isPaid = paid === true || paid === 'true' || paid === 1 || paid === '1';
    const examSubjects = await resolveEnrollmentExamSubjects({
      courseName: resolvedName,
      courseId: catalogCourse?._id || courseId,
    });

    student.enrollments.push({
      courseName: resolvedName,
      courseId: catalogCourse?._id || courseId || null,
      examSubjects,
      teacherId: teacherId || null,
      teacherName,
      price: resolvedPrice,
      paid: isPaid,
      paidAt: isPaid ? new Date() : undefined,
      totalSessions: sessions,
      remainingSessions: sessions,
      completedSessions: 0,
      grades: [],
      status: isPaid ? 'active' : 'pending_payment',
      learningAccess: !!isPaid,
      isPrimary: false,
      registeredAt: new Date(),
      requireWebcam: true,
      examUnlocked: false,
      teacherAlert: sanitizeTeacherAlert(teacherAlert),
    });

    // Cộng doanh thu thực nhận khi khóa phụ được đánh dấu đã thanh toán
    if (isPaid && resolvedPrice > 0) {
      student.paidAmount = (Number(student.paidAmount) || 0) + resolvedPrice;
      student.paid = true;
      if (!student.paidAt) student.paidAt = new Date();
    }

    await student.save();

    if (isPaid && resolvedPrice > 0) {
      const lastEnr = student.enrollments[student.enrollments.length - 1];
      const invoice = await createTuitionInvoice({
        student,
        courseName: resolvedName,
        amount: resolvedPrice,
        note: `Thanh toán khi thêm khóa ${resolvedName}`,
      });
      try {
        await settlePayment({
          student,
          amount: resolvedPrice,
          invoice,
          enrollmentId: String(lastEnr?._id || ''),
          courseName: resolvedName,
          source: 'enrollment_add_paid',
          sourceRef: invoice?.maHoaDon || `add:${student._id}:${lastEnr?._id || resolvedName}`,
          idempotencyKey: lastEnr?._id
            ? `payment:enrollment_add:${student._id}:${lastEnr._id}`
            : `payment:enrollment_add:${student._id}:${invoice?.maHoaDon || 'nohd'}`,
          actor: financeActor(req),
          note: `Thêm khóa ${resolvedName}`,
          metadata: { paymentMethod: paymentMethod || 'transfer' },
          reqMeta: financeReqMeta(req, student),
        });
        bustFinanceCaches();
      } catch (ledgerErr) {
        logger.error('[STUDENTS] ledger add enrollment FAILED — rollback: %s', ledgerErr.message);
        lastEnr.paid = false;
        lastEnr.paidAt = undefined;
        lastEnr.learningAccess = false;
        lastEnr.status = 'pending_payment';
        student.paidAmount = Math.max(0, (Number(student.paidAmount) || 0) - resolvedPrice);
        const stillPaid = (student.enrollments || []).some((e) => e.paid === true && e.status !== 'cancelled');
        student.paid = stillPaid;
        student.markModified('enrollments');
        await student.save();
        if (invoice?._id) {
          try { await Invoice.findByIdAndUpdate(invoice._id, { status: 'void' }); } catch { /* ignore */ }
        }
        return res.status(500).json({
          success: false,
          message: 'Đã thêm khóa nhưng ghi sổ cái thất bại — trạng thái thu đã rollback.',
          data: student.toObject(),
        });
      }
    }

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);

    await syncCertPrepFromEnrollment(student, req);

    const io = req.app.get('io');
    if (io) {
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    if (!teacherId) {
      await notifyStudentBell(io, student._id, {
        type: 'COURSE',
        title: '📚 Bạn được đăng ký khóa học',
        content: `Bạn đã được đăng ký khóa "${resolvedName}".`,
        payload: { kind: 'enrollment_added', courseName: resolvedName },
        link: '/student#profile',
      });
    }
    if (teacherId) {
      await notifyTeacherAssignedOnEnroll(io, {
        student,
        teacherId,
        teacherName,
        courseName: resolvedName,
      });
    }

    res.status(201).json({
      success: true,
      message: `Đã thêm khóa "${resolvedName}" cho học viên`,
      data: doc,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/enrollments/:enrollmentId/settings ─────────────────
// Cập nhật quyền theo khóa + (tuỳ chọn) số buổi khóa đó
router.put('/:id/enrollments/:enrollmentId/settings', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('enrollment_settings'),
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const idx = resolveEnrollmentIndex(student.enrollments, req.params.enrollmentId);
    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }

    const prevExamUnlocked = Boolean(student.enrollments[idx].examUnlocked);
    const courseLabelForExam = student.enrollments[idx].courseName || student.course || 'khóa học';

    const {
      requireWebcam,
      examUnlocked,
      totalSessions,
      completedSessions,
      remainingSessions,
      teacherAlert,
    } = req.body || {};
    if (typeof requireWebcam === 'boolean') {
      student.enrollments[idx].requireWebcam = requireWebcam;
    }
    if (typeof examUnlocked === 'boolean') {
      student.enrollments[idx].examUnlocked = examUnlocked;
    }
    const touchAlert = Object.prototype.hasOwnProperty.call(req.body || {}, 'teacherAlert');
    if (touchAlert) {
      student.enrollments[idx].teacherAlert = sanitizeTeacherAlert(teacherAlert);
    }

    const touchSessions =
      totalSessions != null || completedSessions != null || remainingSessions != null;
    if (touchSessions) {
      const enr = student.enrollments[idx];
      const ts = Number(totalSessions != null ? totalSessions : (enr.totalSessions || 12)) > 0
        ? Number(totalSessions != null ? totalSessions : (enr.totalSessions || 12))
        : 12;
      let completed = Number(
        completedSessions != null ? completedSessions : (enr.completedSessions ?? 0)
      ) || 0;
      completed = Math.max(0, Math.min(ts, completed));
      let remaining;
      if (remainingSessions != null && completedSessions == null) {
        remaining = Math.max(0, Math.min(ts, Number(remainingSessions) || 0));
        completed = Math.max(0, ts - remaining);
      } else {
        remaining = Math.max(0, ts - completed);
      }
      enr.totalSessions = ts;
      enr.completedSessions = completed;
      enr.remainingSessions = remaining;

      // Khóa chính → đồng bộ root student (list / legacy)
      if (enr.isPrimary || student.enrollments.length === 1) {
        student.totalSessions = ts;
        student.completedSessions = completed;
        student.remainingSessions = remaining;
        if (enr.courseName) student.course = enr.courseName;
      }
    }

    // Đồng bộ flag root để tương thích API cũ / danh sách
    student.studentExamUnlocked = (student.enrollments || []).some((e) => e.examUnlocked === true);
    const primary = student.enrollments.find((e) => e.isPrimary) || student.enrollments[0];
    if (primary) {
      student.requireWebcam = primary.requireWebcam !== false;
    }

    student.markModified('enrollments');
    await student.save({ validateModifiedOnly: true });

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);
    const io = req.app.get('io');
    if (io) studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });

    if (typeof examUnlocked === 'boolean' && prevExamUnlocked !== Boolean(student.enrollments[idx].examUnlocked)) {
      const unlocked = Boolean(student.enrollments[idx].examUnlocked);
      await notifyStudentBell(io, student._id, {
        type: 'EXAM',
        title: unlocked ? '✅ Bạn đã được duyệt thi' : '🔒 Quyền thi đã bị thu hồi',
        content: unlocked
          ? `Admin đã mở quyền thi khóa "${courseLabelForExam}". Bạn có thể vào phòng thi.`
          : `Quyền thi khóa "${courseLabelForExam}" vừa bị khóa.`,
        payload: {
          studentId: String(student._id),
          action: unlocked ? 'exam_approved' : 'exam_revoked',
          courseName: courseLabelForExam,
        },
        link: '/student/exam',
      });
    }

    return res.json({
      success: true,
      message: touchSessions
        ? 'Đã cập nhật số buổi khóa học'
        : (touchAlert ? 'Đã cập nhật lưu ý giảng viên' : 'Đã cập nhật quyền khóa học'),
      data: doc,
      meta: {
        courseName: student.enrollments[idx]?.courseName || '',
        changes: require('../utils/systemLogChangeSummary').summarizeEnrollmentSettings({
          ...req.body,
          courseName: student.enrollments[idx]?.courseName || '',
          ...(typeof examUnlocked === 'boolean'
            ? { status: examUnlocked ? 'Mở quyền thi khóa' : 'Khóa quyền thi khóa' }
            : {}),
          ...(typeof requireWebcam === 'boolean'
            ? { notes: requireWebcam ? 'Bật webcam' : 'Tắt webcam' }
            : {}),
        }),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/enrollments/:enrollmentId/pay ──────────────────────
// Xác nhận thanh toán học phí cho 1 khóa (enrollment)
router.put('/:id/enrollments/:enrollmentId/pay', [authMiddleware, branchFilter, policyShadowStudentMutation('enrollment_pay'), checkPermission(PERMISSIONS.MANAGE_FINANCE), assertStudentBranchAccess], async (req, res) => {
  try {
    const { paymentMethod = 'cash', note = '' } = req.body || {};
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
      student.markModified('enrollments');
      await student.save({ validateModifiedOnly: true });
    }
    const idx = resolveEnrollmentIndex(student.enrollments, req.params.enrollmentId);
    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }
    const enr = student.enrollments[idx];
    if (enr.paid) {
      return res.status(409).json({ success: false, message: 'Khóa học này đã thanh toán' });
    }
    const amount = Number(enr.price) || 0;
    const paidAt = new Date();

    // Atomic claim trên enrollment chưa paid
    const claimed = await Student.findOneAndUpdate(
      {
        _id: student._id,
        enrollments: {
          $elemMatch: {
            _id: enr._id,
            paid: { $ne: true },
          },
        },
      },
      {
        $set: {
          'enrollments.$.paid': true,
          'enrollments.$.paidAt': paidAt,
          'enrollments.$.learningAccess': true,
          'enrollments.$.status': 'active',
        },
      },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      return res.status(409).json({ success: false, message: 'Khóa học này đã thanh toán' });
    }

    // Refresh + sync root paid cache
    const fresh = await Student.findById(student._id);
    const claimedEnr = fresh.enrollments.find((e) => String(e._id) === String(enr._id)) || fresh.enrollments[idx];
    if (amount > 0) {
      fresh.paidAmount = (Number(fresh.paidAmount) || 0) + amount;
    }
    if (claimedEnr.isPrimary || fresh.enrollments.length === 1 || fresh.enrollments.every((e) => e.paid || e.status === 'cancelled')) {
      fresh.paid = true;
      fresh.paidAt = paidAt;
      fresh.paymentMethod = paymentMethod;
    } else if (fresh.enrollments.some((e) => e.paid)) {
      fresh.paid = true;
      if (!fresh.paidAt) fresh.paidAt = paidAt;
      fresh.paymentMethod = paymentMethod;
    }
    await fresh.save({ validateModifiedOnly: true });

    let invoice = null;
    if (amount > 0) {
      invoice = await createTuitionInvoice({
        student: fresh,
        courseName: claimedEnr.courseName,
        amount,
        note: note || `Thanh toán khóa ${claimedEnr.courseName}`,
      });
      try {
        await settlePayment({
          student: fresh,
          amount,
          invoice,
          enrollmentId: String(claimedEnr._id),
          courseName: claimedEnr.courseName,
          source: 'enrollment_pay',
          sourceRef: invoice?.maHoaDon || `enr:${claimedEnr._id}`,
          idempotencyKey: `payment:student:${fresh._id}:enr:${claimedEnr._id}`,
          actor: financeActor(req),
          note: note || '',
          metadata: { paymentMethod: paymentMethod || 'cash' },
          reqMeta: financeReqMeta(req, fresh),
        });
        bustFinanceCaches();
      } catch (ledgerErr) {
        logger.error('[STUDENTS] ledger enrollment pay FAILED — rollback: %s', ledgerErr.message);
        claimedEnr.paid = false;
        claimedEnr.paidAt = undefined;
        claimedEnr.learningAccess = false;
        claimedEnr.status = 'pending_payment';
        fresh.paidAmount = Math.max(0, (Number(fresh.paidAmount) || 0) - amount);
        fresh.paid = fresh.enrollments.some((e) => e.paid === true && e.status !== 'cancelled');
        fresh.markModified('enrollments');
        await fresh.save({ validateModifiedOnly: true });
        if (invoice?._id) {
          try { await Invoice.findByIdAndUpdate(invoice._id, { status: 'void' }); } catch { /* ignore */ }
        }
        return res.status(500).json({
          success: false,
          message: 'Ghi sổ cái thất bại — đã rollback trạng thái thu khóa.',
        });
      }
    }

    const io = req.app.get('io');
    if (io) studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: fresh._id });

    const maHD = invoice?.maHoaDon || invoice?.maHD || '';
    await notifyStudentBell(io, fresh._id, {
      type: 'FINANCE',
      title: '✅ Thanh toán thành công',
      content: maHD
        ? `Học phí khóa "${claimedEnr.courseName}" đã được xác nhận. Mã HĐ: ${maHD}`
        : `Học phí khóa "${claimedEnr.courseName}" đã được xác nhận.`,
      payload: { kind: 'tuition_paid', courseName: claimedEnr.courseName },
      link: '/student#profile',
    });

    const doc = fresh.toObject();
    await applyEnrollmentStats(doc, fresh._id, Schedule);
    await syncCertPrepFromEnrollment(fresh, req);
    return res.json({
      success: true,
      message: `Đã xác nhận thanh toán khóa "${claimedEnr.courseName}"${amount ? ` — ${amount.toLocaleString('vi-VN')}đ` : ''}`,
      data: { student: doc, invoice },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/students/:id/enrollments/:enrollmentId ───────────────────────
// Hủy (soft-cancel) 1 khóa học — không xóa cứng; hoàn tiền chỉ khi có quyền finance + refundAmount > 0
// Body (optional): { cancelReason: string, refundAmount: number }
router.delete('/:id/enrollments/:enrollmentId', [authMiddleware, branchFilter, policyShadowStudentMutation('enrollment_delete'), checkPermission(PERMISSIONS.MANAGE_STUDENTS), assertStudentBranchAccess], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const list = student.enrollments || [];
    const idx = resolveEnrollmentIndex(list, req.params.enrollmentId);
    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }
    const enr = list[idx];
    if (enr.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Khóa học này đã bị hủy trước đó.' });
    }

    // Cho phép hủy cả khóa active cuối cùng — HV vẫn giữ hồ sơ (dòng danh sách mờ)

    const cancelReason = String(req.body?.cancelReason || '').trim() || 'Admin hủy khóa';
    const courseName = enr.courseName;
    const wasPaid = enr.paid === true;
    const paidAmt = Number(enr.price || 0);

    // Số tiền hoàn: chỉ hoàn khi client gửi rõ; mặc định 0 (hủy ≠ tự động hoàn toàn bộ)
    let refundAmt = 0;
    if (wasPaid && paidAmt > 0 && req.body?.refundAmount != null) {
      const bodyRefund = Number(req.body.refundAmount);
      if (Number.isFinite(bodyRefund) && bodyRefund >= 0 && bodyRefund <= paidAmt) {
        refundAmt = bodyRefund;
      }
    }

    // H3: hoàn tiền > 0 cần MANAGE_FINANCE
    if (refundAmt > 0) {
      const canFinance = await userHasPermission(req.user, PERMISSIONS.MANAGE_FINANCE);
      if (!canFinance) {
        return res.status(403).json({
          success: false,
          message: '403 Forbidden: Hoàn tiền khi hủy khóa cần quyền quản lý tài chính.',
        });
      }
    }

    // Ledger refund trước soft-cancel+save:
    // 1) idempotencyKey ổn định → retry không double-post
    // 2) nếu save từng fail sau refund, retry vẫn postRefund(created:false) rồi hoàn tất cancel
    // Không bọc Mongo transaction: postEntry hiện không nhận session; withTransaction chưa dùng trên path này.
    let refundLedgerCreated = false;
    let refundIdempotencyKey = '';
    if (refundAmt > 0) {
      refundIdempotencyKey = `refund:cancel:${student._id}:${enr._id}`;
      try {
        const refundResult = await postRefund({
          amount: refundAmt,
          student,
          enrollmentId: String(enr._id),
          courseName,
          note: `Hoàn học phí khi hủy khóa "${courseName}". Lý do: ${cancelReason}`,
          sourceRef: `cancel:${student._id}:${enr._id}`,
          idempotencyKey: refundIdempotencyKey,
          actor: financeActor(req),
          reqMeta: financeReqMeta(req, student),
          metadata: { enrollmentId: String(enr._id), cancelReason },
        });
        refundLedgerCreated = !!refundResult?.created;
      } catch (ledgerErr) {
        logger.error('[STUDENTS] cancel enrollment refund FAILED: %s', ledgerErr.message);
        return res.status(ledgerErr.status || 500).json({
          success: false,
          message: ledgerErr.message || 'Ghi sổ hoàn thất bại — khóa chưa hủy.',
        });
      }
    }

    // Soft-cancel enrollment (giữ nguyên trong DB, đánh dấu cancelled)
    list[idx].status = 'cancelled';
    list[idx].cancelledAt = new Date();
    list[idx].cancelReason = cancelReason;
    list[idx].refundedAmount = refundAmt;
    list[idx].learningAccess = false;
    list[idx].paid = false;

    if (enr.isPrimary) {
      list[idx].isPrimary = false;
      const nextActive = list.find((e, i) => i !== idx && e.status !== 'cancelled');
      if (nextActive) nextActive.isPrimary = true;
    }

    student.enrollments = list;
    syncStudentFromPrimaryEnrollment(student);
    const activePaid = list.some((e) => e.status !== 'cancelled' && e.paid === true);
    student.paid = activePaid;
    if (refundAmt > 0) {
      student.paidAmount = Math.max(0, (Number(student.paidAmount) || 0) - refundAmt);
    }
    student.markModified('enrollments');
    try {
      await student.save();
    } catch (saveErr) {
      logger.error(
        '[STUDENTS] cancel enrollment save FAILED after refundAmt=%s ledgerCreated=%s key=%s: %s',
        refundAmt,
        refundLedgerCreated,
        refundIdempotencyKey || 'n/a',
        saveErr.message,
      );
      return res.status(500).json({
        success: false,
        message: saveErr.message || 'Lưu hủy khóa thất bại',
        meta: {
          refundLedgerMayExist: refundAmt > 0,
          refundIdempotencyKey: refundIdempotencyKey || undefined,
          hint: refundAmt > 0
            ? 'Ledger có thể đã ghi hoàn (idempotent). Retry cùng enrollment sẽ không double-refund; sửa lỗi save rồi retry để hoàn tất hủy khóa.'
            : undefined,
        },
      });
    }
    if (refundAmt > 0) bustFinanceCaches();

    // Hủy lịch chưa học (scheduled) của khóa này — giữ completed để Admin trả lương GV
    try {
      const cancelSch = await Schedule.updateMany(
        {
          studentId: student._id,
          status: 'scheduled',
          ...(courseName ? { course: courseName } : {}),
        },
        {
          $set: {
            status: 'cancelled',
            note: cancelReason
              ? `Hủy khóa: ${cancelReason}`
              : 'Hủy khóa / hoàn học phí — ca chưa học',
          },
        },
      );
      if (cancelSch.modifiedCount > 0) {
        logger.info('[STUDENTS] cancelled %s future schedules for student %s course %s', cancelSch.modifiedCount, student._id, courseName);
      }
    } catch (schErr) {
      logger.warn('[STUDENTS] cancel future schedules skipped: %s', schErr.message);
    }

    let refundMsg = '';
    if (refundAmt > 0) {
      try {
        const { writeAudit } = require('../services/auditLogService');
        await writeAudit({
          action: 'enrollment.cancel_refund',
          actorUserId: String(req.user?.id || ''),
          actorRole: String(req.user?.role || ''),
          studentId: student._id,
          branchId: student.branchId,
          entityType: 'enrollment',
          entityId: String(enr._id),
          oldValue: { status: 'active', paid: true, price: paidAmt },
          newValue: { status: 'cancelled', refundedAmount: refundAmt, cancelReason },
          ip: req.ip,
          userAgent: req.headers['user-agent'] || '',
        });
      } catch { /* ignore audit */ }
      refundMsg = ` Đã hoàn ${refundAmt.toLocaleString('vi-VN')}đ.`;
    }

    const io = req.app.get('io');
    if (io) {
      studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
      if (refundAmt > 0) studentRealtime(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), 'revenue:updated', { amount: -refundAmt, studentName: student.name });
    }
    await notifyStudentBell(io, student._id, {
      type: 'COURSE',
      title: 'Khóa học đã được hủy',
      content: refundAmt > 0
        ? `Khóa "${courseName}" đã hủy. Lý do: ${cancelReason}. Đã hoàn ${refundAmt.toLocaleString('vi-VN')}đ.`
        : `Khóa "${courseName}" đã hủy. Lý do: ${cancelReason}.`,
      payload: { kind: 'enrollment_cancelled', courseName, cancelReason },
      link: '/student#profile',
    });

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);
    await revokeCertPrepAfterEnrollmentCancel(student, list[idx]);
    return res.json({
      success: true,
      message: `Đã hủy khóa "${courseName}".${refundMsg}`,
      data: doc,
      meta: { refundedAmount: refundAmt, cancelReason },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/assign-teacher ─────────────────────────────────────
// Admin/Staff gán (hoặc bỏ gán) giảng viên — theo khóa (enrollmentId) hoặc khóa chính
router.put('/:id/assign-teacher', [authMiddleware, branchFilter, policyShadowStudentMutation('assign_teacher'), checkPermission(PERMISSIONS.MANAGE_STUDENTS), assertStudentBranchAccess], async (req, res) => {
  try {
    const { teacherId, enrollmentId, reason = '' } = req.body;
    const isUnassign = teacherId === null || teacherId === '' || teacherId === undefined;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }

    let teacherName = '';
    let teacherDoc = null;
    let prevTeacherIdForReassign = null;
    let activeEnrollmentId = '';
    let activeEnrollmentIdx = -1;
    // Validate ObjectId khi gán GV
    if (!isUnassign && teacherId) {
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(teacherId)) {
        return res.status(400).json({ success: false, message: 'ID giảng viên không hợp lệ' });
      }
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findById(teacherId)
        .select('name status role specialty subjectIds branchId averageRating ratingCount voiceRegion avatar')
        .lean();
      if (!t || t.role !== 'teacher') {
        return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
      }
      if (String(t.status || '').toLowerCase() !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Giảng viên chưa được cấp quyền giảng dạy (Active). Duyệt GV trước khi phân công.',
        });
      }
      // Cùng chi nhánh HV ↔ GV (tránh lệch staff/admin nhắn tin chi nhánh)
      const studentBranchId = String(student.branchId?._id || student.branchId || '').trim();
      const teacherBranchId = String(t.branchId?._id || t.branchId || '').trim();
      if (!studentBranchId) {
        return res.status(400).json({
          success: false,
          message: 'Học viên chưa có chi nhánh. Gán chi nhánh trước khi phân giảng viên.',
        });
      }
      if (!teacherBranchId) {
        return res.status(400).json({
          success: false,
          message: `Giảng viên "${t.name || ''}" chưa được gán chi nhánh.`,
        });
      }
      if (studentBranchId !== teacherBranchId) {
        return res.status(400).json({
          success: false,
          message: 'Chỉ được phân giảng viên cùng chi nhánh với học viên.',
        });
      }
      teacherDoc = t;
      teacherName = t.name || 'Giảng viên';
    }

    // Khớp môn: khóa học HV ↔ chuyên môn GV — lệch môn thì từ chối phân công
    let targetCourse = student.course;
    let targetExamSubjects = [];
    if (enrollmentId && student.enrollments?.length) {
      const idxPreview = student.enrollments.findIndex((e) => String(e._id) === String(enrollmentId));
      if (idxPreview >= 0) {
        targetCourse = student.enrollments[idxPreview].courseName || targetCourse;
        targetExamSubjects = student.enrollments[idxPreview].examSubjects || [];
      }
    } else if (student.enrollments?.length) {
      const primaryIdx = student.enrollments.findIndex((e) => e.isPrimary);
      const idx = primaryIdx >= 0 ? primaryIdx : 0;
      targetCourse = student.enrollments[idx]?.courseName || targetCourse;
      targetExamSubjects = student.enrollments[idx]?.examSubjects || [];
    }

    if (
      !isUnassign && teacherDoc && targetCourse
      && (!Array.isArray(targetExamSubjects) || !targetExamSubjects.filter(Boolean).length)
    ) {
      const enrForCourse = enrollmentId && student.enrollments?.length
        ? student.enrollments.find((e) => String(e._id) === String(enrollmentId))
        : (student.enrollments?.find((e) => e.isPrimary) || student.enrollments?.[0]);
      targetExamSubjects = await resolveEnrollmentExamSubjects({
        courseName: targetCourse,
        courseId: enrForCourse?.courseId,
      }) || [];
    }

    if (!isUnassign && teacherDoc && targetCourse) {
      const { resolveTeacherSubjectIds } = require('../utils/trainingSubjectAccess');
      const courseName = String(targetCourse || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');
      const specialty = String(teacherDoc.specialty || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');

      const courseFocus = (() => {
        if (courseName.includes('thvp') || courseName.includes('van phong') || courseName.includes('tin hoc van phong') || courseName.includes('microsoft office')) {
          return ['thvp'];
        }
        if (courseName.includes('canva') && (courseName.includes('powerpoint') || courseName.includes('ppt'))) return ['powerpoint', 'canva'];
        if (courseName.includes('canva')) return ['canva'];
        if (courseName.includes('excel')) return ['excel'];
        if (courseName.includes('word')) return ['word'];
        if (courseName.includes('powerpoint') || courseName.includes('ppt')) return ['powerpoint'];
        if (Array.isArray(targetExamSubjects) && targetExamSubjects.length) {
          const office = ['coban', 'word', 'excel', 'powerpoint'];
          const hits = targetExamSubjects.map(String).filter((id) => office.includes(id) && id !== 'coban');
          if (hits.length >= 3) return ['thvp'];
          return [...new Set(targetExamSubjects.map(String).filter((id) => id !== 'coban'))];
        }
        return [];
      })();

      const teacherFocus = (() => {
        if (specialty.includes('thvp') || specialty.includes('van phong') || specialty.includes('tin hoc van phong') || specialty.includes('microsoft office')) {
          return ['thvp'];
        }
        const focuses = new Set();
        if (specialty.includes('excel')) focuses.add('excel');
        if (specialty.includes('word')) focuses.add('word');
        if (specialty.includes('powerpoint') || specialty.includes('ppt')) focuses.add('powerpoint');
        if (specialty.includes('canva')) focuses.add('canva');
        const teacherSubs = resolveTeacherSubjectIds(teacherDoc).map(String);
        teacherSubs.forEach((id) => {
          if (id === 'coban') return;
          focuses.add(id);
        });
        // Đủ Word+Excel+PowerPoint → focus THVP (khớp khóa Tin học văn phòng).
        // Canva không chặn quy đổi — tránh GV Office+Canva bị từ chối gán THVP.
        const hasFullOffice = ['word', 'excel', 'powerpoint'].every((id) => focuses.has(id));
        if (hasFullOffice) {
          focuses.delete('word');
          focuses.delete('excel');
          focuses.delete('powerpoint');
          focuses.delete('coban');
          focuses.add('thvp');
        }
        return [...focuses];
      })();

      let matched = false;
      const teacherSubSet = new Set(resolveTeacherSubjectIds(teacherDoc).map(String).filter((id) => id && id !== 'coban'));
      const courseSubIds = [...new Set((targetExamSubjects || []).map(String).filter((id) => id && id !== 'coban'))];
      if (courseSubIds.length && courseSubIds.some((id) => teacherSubSet.has(id))) {
        matched = true;
      }
      if (!matched && courseFocus.length && teacherFocus.length) {
        const set = new Set(teacherFocus);
        matched = courseFocus.some((f) => set.has(f));
        if (!matched && courseFocus.includes('thvp')) {
          const officeHits = ['word', 'excel', 'powerpoint'].filter((id) => set.has(id));
          matched = officeHits.length >= 2;
        }
      }
      if (!matched && specialty && courseName) {
        matched = specialty.includes(courseName) || courseName.includes(specialty)
          || specialty.split(/[,;|/]+/).some((p) => {
            const part = p.trim();
            return part.length >= 3 && (courseName.includes(part) || part.includes(courseName));
          });
      }
      if (!matched) {
        return res.status(400).json({
          success: false,
          message: `Giảng viên "${teacherName}" không phụ trách môn "${targetCourse}". Chọn GV đúng chuyên môn.`,
        });
      }
    }

    const mongoose = require('mongoose');
    const hasValidEnrollmentId = enrollmentId
      && enrollmentId !== 'main'
      && mongoose.Types.ObjectId.isValid(String(enrollmentId));

    if (hasValidEnrollmentId && student.enrollments?.length) {
      const idx = student.enrollments.findIndex((e) => String(e._id) === String(enrollmentId));
      if (idx < 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
      }
      activeEnrollmentIdx = idx;
      activeEnrollmentId = String(student.enrollments[idx]._id);
      const prevEnrTeacher = student.enrollments[idx].teacherId;
      prevTeacherIdForReassign = prevEnrTeacher ? String(prevEnrTeacher) : null;
      student.enrollments[idx].teacherId = isUnassign ? null : teacherId;
      student.enrollments[idx].teacherName = teacherName;
      targetCourse = student.enrollments[idx].courseName;
      const isPrimary = !!student.enrollments[idx].isPrimary || student.enrollments.length === 1;
      if (isUnassign) {
        // Bỏ phân công: luôn xóa teacherId cấp HV nếu là khóa chính / khóa duy nhất
        // hoặc teacherId cấp HV đang trùng GV của khóa này
        const topTid = student.teacherId?._id || student.teacherId;
        if (isPrimary || String(topTid || '') === String(prevEnrTeacher || '')) {
          student.teacherId = null;
          student.teacherName = '';
        }
      } else if (isPrimary) {
        student.teacherId = teacherId;
        student.teacherName = teacherName;
      }
    } else {
      const primaryIdx = student.enrollments?.findIndex((e) => e.isPrimary);
      const idx = primaryIdx >= 0 ? primaryIdx : 0;
      if (student.enrollments?.[idx]) {
        activeEnrollmentIdx = idx;
        activeEnrollmentId = String(student.enrollments[idx]._id);
        prevTeacherIdForReassign = student.enrollments[idx].teacherId
          ? String(student.enrollments[idx].teacherId)
          : (student.teacherId ? String(student.teacherId._id || student.teacherId) : null);
        student.enrollments[idx].teacherId = isUnassign ? null : teacherId;
        student.enrollments[idx].teacherName = teacherName;
        targetCourse = student.enrollments[idx].courseName;
      }
      student.teacherId = isUnassign ? null : teacherId;
      student.teacherName = isUnassign ? '' : teacherName;
    }

    // Mark enrollments modified for Mongoose subdocument arrays
    if (student.enrollments?.length) {
      student.markModified('enrollments');
    }

    if (student.status === 'Chờ xếp lớp' && !isUnassign) {
      student.status = 'Đang học';
    }

    await student.save();
    await student.populate('teacherId', 'name phone specialty');

    const ScheduleModel = require('../models/Schedule');
    const schedFilter = {
      studentId: student._id,
      status: 'scheduled',
      ...(targetCourse ? { course: targetCourse } : {}),
    };
    let futureSchedulesUpdated = 0;
    if (isUnassign) {
      const r = await ScheduleModel.updateMany(schedFilter, { $set: { teacherId: null, teacherName: '' } });
      futureSchedulesUpdated = r.modifiedCount || 0;
    } else {
      const r = await ScheduleModel.updateMany(schedFilter, {
        $set: { teacherId, teacherName },
      });
      futureSchedulesUpdated = r.modifiedCount || 0;
    }

    const completedAgg = await ScheduleModel.aggregate([
      {
        $match: {
          studentId: student._id,
          status: 'completed',
          ...(targetCourse ? { course: targetCourse } : {}),
        },
      },
      { $group: { _id: '$teacherId', count: { $sum: 1 } } },
    ]);
    const completedSplit = {};
    completedAgg.forEach((row) => {
      if (row._id) completedSplit[String(row._id)] = row.count;
    });

    const enrSnap = activeEnrollmentIdx >= 0 ? student.enrollments[activeEnrollmentIdx] : null;
    const completedSessionsAtSwitch = Number(enrSnap?.completedSessions) || 0;
    const remainingSessionsSnap = Number(enrSnap?.remainingSessions) || 0;
    const progressPreserved = completedSessionsAtSwitch >= 0 && remainingSessionsSnap >= 0;

    const newTeacherStr = !isUnassign && teacherId ? String(teacherId) : '';
    const isReassign = !isUnassign && newTeacherStr
      && prevTeacherIdForReassign
      && prevTeacherIdForReassign !== newTeacherStr;

    if (isReassign || (!isUnassign && newTeacherStr && !prevTeacherIdForReassign)) {
      try {
        const TeacherAssignmentSegment = require('../models/TeacherAssignmentSegment');
        const enrollKey = activeEnrollmentId || 'primary';
        if (isReassign) {
          await TeacherAssignmentSegment.updateMany(
            {
              studentId: student._id,
              enrollmentId: enrollKey,
              endedAt: null,
            },
            { $set: { endedAt: new Date() } },
          );
        }
        await TeacherAssignmentSegment.create({
          studentId: student._id,
          enrollmentId: enrollKey,
          courseName: targetCourse || student.course || '',
          teacherId,
          teacherName,
          completedSessionsAtStart: completedSessionsAtSwitch,
          actorId: String(req.user?.id || ''),
          actorRole: String(req.user?.role || ''),
          reason: String(reason || '').slice(0, 500) || (isReassign ? 'Đổi giảng viên' : 'Phân công giảng viên'),
        });

        const { writeAudit } = require('../services/auditLogService');
        await writeAudit({
          action: isReassign ? 'teacher.reassign' : 'teacher.assign',
          actorUserId: String(req.user?.id || ''),
          actorRole: String(req.user?.role || ''),
          branchId: student.branchId || null,
          entityType: 'enrollment',
          entityId: enrollKey,
          studentId: student._id,
          teacherId,
          oldValue: {
            teacherId: prevTeacherIdForReassign,
            completedSessions: completedSessionsAtSwitch,
          },
          newValue: {
            teacherId: newTeacherStr,
            completedSessions: completedSessionsAtSwitch,
            futureSchedulesUpdated,
            completedSplit,
          },
          ip: req.ip,
          userAgent: req.headers['user-agent'] || '',
        });
      } catch (segErr) {
        logger.warn('[ASSIGN_TEACHER] segment/audit: %s', segErr.message);
      }
    }

    const io = req.app.get('io');

    try {
      if (io && !isUnassign) {
        const NotificationService = require('../services/NotificationService');
        const isNewAssign = !isReassign;
        const hvLabel = `⟦student_detail:${student._id}:profile|${student.name}⟧`;
        await NotificationService.send(io, {
          type: 'COURSE',
          title: isNewAssign ? '📚 Học viên mới được giao' : '👨‍🏫 Đổi giảng viên phụ trách',
          content: isNewAssign
            ? `Học viên ${hvLabel} (${targetCourse || student.course}) đã được giao cho bạn.`
            : `Bạn được phân công tiếp khóa "${targetCourse || student.course}" của ${hvLabel} (từ buổi ${completedSessionsAtSwitch + 1}).`,
          receivers: teacherId.toString(),
          payload: { studentId: student._id, type: 'student', targetAudience: 'teacher', reassign: isReassign },
          link: `/teacher#students?studentId=${student._id}`,
        });

        if (isReassign) {
          await NotificationService.send(io, {
            type: 'COURSE',
            title: '👨‍🏫 Giảng viên khóa học đã đổi',
            content: `Khóa "${targetCourse || student.course}" chuyển sang GV ${teacherName}. Tiến độ đã học: ${completedSessionsAtSwitch} buổi (không mất lịch).`,
            receivers: String(student._id),
            payload: {
              teacherId: String(teacherId),
              teacherName,
              specialty: teacherDoc?.specialty || '',
              averageRating: Number(teacherDoc?.averageRating) || 0,
              ratingCount: Number(teacherDoc?.ratingCount) || 0,
              voiceRegion: String(teacherDoc?.voiceRegion || ''),
              avatar: teacherDoc?.avatar || '',
              courseName: targetCourse || student.course || '',
              targetAudience: 'student',
              kind: 'teacher_reassigned',
            },
            link: '/student#profile',
          });
        } else {
          await NotificationService.send(io, {
            type: 'COURSE',
            title: '👨‍🏫 Phân công giảng viên phụ trách',
            content: `Bạn đã được phân công Giảng viên ${teacherName} phụ trách khóa "${targetCourse || student.course}".`,
            receivers: String(student._id),
            payload: {
              teacherId: String(teacherId),
              teacherName,
              specialty: teacherDoc?.specialty || '',
              averageRating: Number(teacherDoc?.averageRating) || 0,
              ratingCount: Number(teacherDoc?.ratingCount) || 0,
              voiceRegion: String(teacherDoc?.voiceRegion || ''),
              avatar: teacherDoc?.avatar || '',
              courseName: targetCourse || student.course || '',
              targetAudience: 'student',
              kind: 'teacher_assigned',
            },
            link: '/student#profile',
          });
        }


        io.to(teacherId.toString()).emit('CONTACT_LIST_UPDATED', { studentId: student._id });
        io.to(student._id.toString()).emit('CONTACT_LIST_UPDATED', { teacherId });
        studentRealtime(io, student, 'student:assigned', { teacherId: teacherId.toString(), studentId: student._id.toString() });
        studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
      } else if (io && isUnassign) {
        io.to(student._id.toString()).emit('CONTACT_LIST_UPDATED', { teacherId: null });
        studentDataRefresh(io, (typeof student !== 'undefined' && student ? student : (typeof claimed !== 'undefined' && claimed ? claimed : (typeof fresh !== 'undefined' && fresh ? fresh : (typeof populated !== 'undefined' && populated ? populated : {})))), { type: 'student', id: student._id });
      }
    } catch (notifErr) {
      logger.error('[ASSIGN_TEACHER] Notification error:', notifErr);
    }

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);

    let previousTeacherName = '';
    if (prevTeacherIdForReassign) {
      try {
        const Teacher = require('../models/Teacher');
        const prevT = await Teacher.findById(prevTeacherIdForReassign).select('name').lean();
        previousTeacherName = prevT?.name || '';
      } catch { /* ignore */ }
    }

    res.json({
      success: true,
      message: isUnassign ? 'Đã bỏ phân công giảng viên' : (isReassign ? 'Đã đổi giảng viên thành công' : 'Đã gán giảng viên thành công'),
      data: doc,
      meta: {
        reassign: !!isReassign,
        unassign: !!isUnassign,
        teacherName: isUnassign ? '' : teacherName,
        previousTeacherName,
        targetCourse: targetCourse || student.course || '',
        completedSessionsAtSwitch,
        futureSchedulesUpdated,
        completedSplit,
        progressPreserved,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ─── POST /api/students/purge-cancelled ───────────────────────────────────────
// Xóa vĩnh viễn HV chỉ còn khóa đã hủy/hoàn (ghost sau refund). Dry-run: { dryRun: true }
router.post('/purge-cancelled', [
  authMiddleware,
  branchFilter,
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
], async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dryRun === '1';
    let branchId = req.body?.branchId || null;
    if (!branchId && req.branchFilter?.branchId && typeof req.branchFilter.branchId === 'string') {
      branchId = req.branchFilter.branchId;
    }
    const result = await purgeCancelledOnlyStudents({ branchId, dryRun });
    if (!dryRun) {
      try {
        const orphan = await purgeOrphanMessages();
        result.orphanMessages = orphan.deletedMessages || 0;
      } catch (err) {
        logger.warn('[STUDENTS] orphan message cleanup:', err.message);
      }
      cache.flush?.();
      emitDataRefresh(req.app.get('io'), { type: 'students', scope: 'system' });
    }
    return res.json({
      success: true,
      message: dryRun
        ? `Tìm thấy ${result.count} học viên chỉ còn khóa đã hủy/hoàn`
        : `Đã xóa vĩnh viễn ${result.deleted} học viên ghost`,
      data: result,
    });
  } catch (error) {
    logger.error('[STUDENTS] purge-cancelled:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/students/:id ──────────────────────────────────────────────────
router.delete('/:id', [authMiddleware, branchFilter, policyShadowStudentMutation('delete'), checkPermission(PERMISSIONS.MANAGE_STUDENTS), assertStudentBranchAccess], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    const cascade = await purgeStudentSideEffects(student._id, { studentName: student.name });
    await Student.findByIdAndDelete(student._id);
    try {
      emitDataRefresh(req.app.get('io'), { type: 'students', scope: 'system' });
    } catch { /* ignore */ }
    res.json({
      success: true,
      message: `Đã xóa học viên ${student.name}`,
      cascade,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/reset-devices ─────────────────────────────────────
// Xóa lịch sử trình duyệt HV (không đụng khóa phiên 1 máy của lần login sau).
router.post('/:id/reset-devices', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('update'),
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: { knownDevices: [], knownDeviceCount: 0 } },
      { returnDocument: 'after' },
    );
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    return res.json({
      success: true,
      message: 'Đã xóa danh sách thiết bị. Học viên có thể gắn lại tối đa 2 trình duyệt trước khi báo Admin.',
      data: {
        _id: student._id,
        knownDeviceCount: 0,
        accountLocked: !!student.accountLocked,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] reset-devices: %s', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/lock-account ──────────────────────────────────────
router.post('/:id/lock-account', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('update'),
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      {
        $set: { accountLocked: true },
        $inc: { tokenVersion: 1 },
        $unset: { refreshToken: '', deviceFingerprint: '' },
      },
      { returnDocument: 'after' },
    );
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    const io = req.app.get('io');
    if (io) {
      io.emit('auth:forceLogout', {
        userId: String(student._id),
        role: 'student',
        reason: 'account_locked',
      });
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    return res.json({
      success: true,
      message: `Đã khóa đăng nhập của ${student.name}`,
      data: {
        _id: student._id,
        accountLocked: true,
        knownDeviceCount: Number(student.knownDeviceCount) || 0,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] lock-account: %s', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/unlock-account ────────────────────────────────────
router.post('/:id/unlock-account', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('update'),
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: { accountLocked: false } },
      { returnDocument: 'after' },
    );
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    const io = req.app.get('io');
    if (io) {
      studentRealtime(io, student, 'student:updated', student._id);
      studentDataRefresh(io, student, { type: 'student', id: student._id });
    }
    return res.json({
      success: true,
      message: `Đã mở khóa đăng nhập của ${student.name}`,
      data: {
        _id: student._id,
        accountLocked: false,
        knownDeviceCount: Number(student.knownDeviceCount) || 0,
      },
    });
  } catch (error) {
    logger.error('[STUDENTS] unlock-account: %s', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/reset-today-attendance ─────────────────────────────
// Xóa điểm danh HÔM NAY (= hủy ca đã hoàn thành) — Admin/Staff hoặc GV phụ trách (không giới hạn 1 tiếng)
router.post('/:id/reset-today-attendance', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('reset_today_attendance'),
  requireManageStudentsUnlessTeacher,
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'teacher' && !studentMatchesTeacher(student, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ được hủy điểm danh học viên do bạn phụ trách',
      });
    }

    const todayVN = new Date().toLocaleDateString('vi-VN');
    const scrubToday = (grades) => (grades || []).filter((g) => g && g.date !== todayVN);
    const oldGrades = student.grades || [];
    const todayRootGrade = oldGrades.find((g) => g && g.date === todayVN);
    let todayEnrGrade = null;
    if (Array.isArray(student.enrollments)) {
      for (const e of student.enrollments) {
        const hit = (e.grades || []).find((g) => g && g.date === todayVN);
        if (hit) {
          todayEnrGrade = hit;
          break;
        }
      }
    }
    const removedGrade = todayRootGrade || todayEnrGrade;
    const hadRootToday = Boolean(todayRootGrade);
    const hadEnrToday = Boolean(todayEnrGrade);

    if (!hadRootToday && !hadEnrToday) {
      return res.json({ success: true, message: 'Học viên chưa được điểm danh hôm nay.' });
    }

    const todayISO = new Date().toISOString().split('T')[0];
    const sessionNumber = extractSessionNumber(
      removedGrade?.note,
      Number(student.completedSessions) || undefined,
    );
    const cancelNote = sessionNumber
      ? `Hủy điểm danh buổi ${sessionNumber} (${todayVN})`
      : `Hủy điểm danh ngày ${todayVN}`;
    const activityEntries = [];
    // Giữ lại dấu vết buổi đã điểm danh (grades bị xóa) để tab Nhật ký vẫn thấy "Buổi X"
    if (removedGrade) {
      const attNote = removedGrade.note
        || (sessionNumber
          ? `Buổi ${sessionNumber}: Đã điểm danh hoàn thành buổi học`
          : `Đã điểm danh ngày ${todayVN}`);
      activityEntries.push(buildActivityEntry({
        type: 'attendance',
        date: todayVN,
        note: attNote,
        sessionNumber,
        actor: req.user,
        course: student.course || '',
      }));
    }
    activityEntries.push(buildActivityEntry({
      type: 'attendance_cancel',
      date: todayVN,
      note: cancelNote,
      sessionNumber,
      actor: req.user,
      course: student.course || '',
    }));

    // Xóa record hôm nay khỏi grades (root + từng enrollment — FE đọc grades enrollment)
    const newGrades = scrubToday(oldGrades);
    const newCompleted = newGrades.length;
    const newRemaining = Math.max(0, (student.totalSessions || 12) - newCompleted);

    const patch = {
      grades: newGrades,
      completedSessions: newCompleted,
      remainingSessions: newRemaining,
      status: 'Đang học',
      can_check_in: true,
    };

    if (Array.isArray(student.enrollments) && student.enrollments.length) {
      patch.enrollments = student.enrollments.map((enr) => {
        const plain = enr.toObject ? enr.toObject() : { ...enr };
        const eg = scrubToday(plain.grades);
        const total = plain.totalSessions || student.totalSessions || 12;
        return {
          ...plain,
          grades: eg,
          completedSessions: eg.length,
          remainingSessions: Math.max(0, total - eg.length),
        };
      });
      const primary = patch.enrollments.find((e) => e.isPrimary) || patch.enrollments[0];
      if (primary) {
        patch.completedSessions = primary.completedSessions;
        patch.remainingSessions = primary.remainingSessions;
        patch.grades = primary.grades?.length ? primary.grades : newGrades;
      }
    }

    await Student.findByIdAndUpdate(req.params.id, {
      $set: patch,
      $push: { activityLog: { $each: activityEntries, $slice: -100 } },
    });

    // Xóa schedule hôm nay nếu có (hủy điểm danh = hủy ca đã hoàn thành)
    await Schedule.deleteMany({
      studentId: req.params.id,
      date: { $gte: new Date(todayISO), $lt: new Date(new Date(todayISO).getTime() + 86400000) },
      status: 'completed'
    });

    const io = req.app.get('io');
    if (io) {
      studentDataRefresh(io, student, { type: 'student', id: req.params.id });
    }

    res.json({ success: true, message: `✅ Đã hủy điểm danh hôm nay cho "${student.name}"` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/reset-history ──────────────────────────────────────
// Reset lịch sử học (xóa buổi học, điểm danh, điểm số) — giữ thông tin cá nhân & học phí
router.post('/:id/reset-history', [
  authMiddleware,
  branchFilter,
  policyShadowStudentMutation('reset_history'),
  checkPermission(PERMISSIONS.MANAGE_STUDENTS),
  assertStudentBranchAccess,
], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // Xóa tất cả lịch học liên quan đến học viên này
    const deletedSchedules = await Schedule.deleteMany({ studentId: req.params.id });

    // Reset các field lịch sử trên Student document, giữ nguyên: name, phone, zalo, course, paid, price...
    await Student.findByIdAndUpdate(req.params.id, {
      $set: {
        remainingSessions: student.totalSessions || 12, // reset về đủ buổi
        studentExamUnlocked: false,
        grade: null,
        status: 'active',
        // Xóa lịch sử điểm danh nếu có field này
        attendanceHistory: [],
        examScore: null,
        practicalStatus: 'pending',
      },
    });

    // Log hệ thống
    const io = req.app.get('io');
    if (io) studentRealtime(io, student, 'student:history_reset', { studentId: req.params.id, name: student.name });

    res.json({
      success: true,
      message: `✅ Đã reset lịch sử học viên "${student.name}" — Xóa ${deletedSchedules.deletedCount} buổi học`,
      data: { deletedSchedules: deletedSchedules.deletedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/pay-teacher (THANH TOÁN LƯƠNG TRÊN TỪNG HỌC VIÊN) ───
// Ghi Transaction + Ledger salary; Schedule flags chỉ là projection.
router.put('/:id/pay-teacher', [authMiddleware, branchFilter, policyShadowStudentMutation('finance_pay_teacher'), checkPermission(PERMISSIONS.MANAGE_FINANCE), assertStudentBranchAccess], async (req, res) => {
  try {
    const result = await payTeacherForStudent({
      studentId: req.params.id,
      action: req.body?.action || 'PARTIAL',
      idempotencyKey: String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim(),
      actor: { ...financeActor(req), name: req.user?.name || 'Admin' },
    });
    const { student, teacher, paidSessions, amount, transaction, action, defaultDesc } = result;
    const io = req.app.get('io');
    if (io && !result.idempotent) {
      const NotificationService = require('../services/NotificationService');
      await NotificationService.send(io, {
        type: 'FINANCE',
        title: '💵 Đã thanh toán lương (theo học viên)',
        content: action === 'PAID_IN_ADVANCE'
          ? `Admin đã thiết lập TRẢ TRƯỚC cho học viên ${student.name}. Đã xác nhận ${paidSessions} buổi (${amount.toLocaleString('vi-VN')}đ).`
          : `Admin đã thanh toán ${paidSessions} buổi dạy của học viên ${student.name} (${amount.toLocaleString('vi-VN')}đ).`,
        receivers: String(teacher._id),
        payload: { studentId: String(student._id), action, paidSessions },
        link: '/teacher/finance',
      });
      studentRealtime(io, student, 'student:updated', student._id.toString());
      studentDataRefresh(io, student, { type: 'student', id: student._id.toString(), action: 'pay_teacher' });
    }
    return res.json({
      success: true,
      message: result.idempotent
        ? 'Giao dịch đã tồn tại (idempotent)'
        : (action === 'PAID_IN_ADVANCE'
          ? 'Đã thiết lập thanh toán TRỌN GÓI và ghi sổ các buổi đã hoàn thành.'
          : `Thanh toán thành công ${paidSessions} buổi dạy của HV ${student.name}.`),
      data: { paidSessions, amount, transaction, idempotent: result.idempotent, note: defaultDesc },
    });
  } catch (error) {
    logger.error('[STUDENTS] Pay Teacher error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

module.exports = router;



