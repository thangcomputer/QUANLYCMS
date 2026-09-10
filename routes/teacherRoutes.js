const express  = require('express');
const crypto   = require('crypto');
const mongoose = require('mongoose');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const Teacher  = require('../models/Teacher');
const Schedule = require('../models/Schedule');
const Transaction = require('../models/Transaction');
const { authMiddleware, branchFilter } = require('../middleware/auth');
const { PERMISSIONS } = require('../constants/permissions');
const { policyShadowTeacherWrite } = require('../middleware/policyShadowTeacherWrite');
const { policyShadowTeacherRoute } = require('../middleware/policyShadowTeacherRoute');
const { teachersCutoverGate } = require('../middleware/teachersCutoverGate');
const { sanitizeRegex } = require('../middleware/sanitizeRegex');
const logger = require('../config/logger');
const { resolveTeacherSubjectIds } = require('../utils/trainingSubjectAccess');
const { EXAM_SUBJECT_LABELS } = require('../services/examSubjectCatalog');
const { sendAccountWelcome } = require('../services/accountWelcome');
const NotificationService = require('../services/NotificationService');
const { resolveDefaultAccountPassword } = require('../utils/tempPassword');

function specialtyFromSubjectIds(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => EXAM_SUBJECT_LABELS[id] || id).join(', ');
}
const { generateTeacherCode } = require('../services/businessCodeService');
const { postSalary } = require('../services/ledgerService');
const { computeStarBonusSummary, resolveBonusForPayout } = require('../services/teacherStarBonus');
const { emitTeacherEvent, emitDataRefresh, emitFinanceEvent, emitUser } = require('../utils/realtimeEmit');
const { getCachedSettings } = require('../services/settingsCache');
const {
  createExamAttempt,
  gradeExamAttempt,
  verifyAttemptToken,
} = require('../services/examAttemptService');
const { claimTeacherAttempt } = require('../services/examAttemptStore');
const { purgeTeacherSideEffects } = require('../services/userCascadeCleanup');
const { normalizeVoiceRegion } = require('../constants/voiceRegions');
const { attemptedTeacherExamFields } = require('../utils/teacherExamFields');

const router = express.Router();

/**
 * Phase 7.31 cutover:
 * auth → [branchFilter if present] → policyShadow* → teachersCutoverGate → handler
 * Legacy isAdmin/isTeacher/checkPermission/assertTeacherBranchAccess/superAdminOnly
 * retained inside teachersCutoverGate.
 */
const teacherRouteGuard = (action) => [
  policyShadowTeacherRoute(action),
  teachersCutoverGate(action),
];
const teacherWriteGuard = (action) => [
  policyShadowTeacherWrite(action),
  teachersCutoverGate(action),
];

// Tự động tạo thư mục uploads/practical nếu chưa có
const uploadDir = path.join(__dirname, '..', 'uploads', 'practical');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_PRACTICAL_EXT = new Set([
  '.zip', '.rar', '.tar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp4',
]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = ALLOWED_PRACTICAL_EXT.has(rawExt) ? rawExt : '';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `practical-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PRACTICAL_EXT.has(ext)) {
      return cb(new Error('Định dạng file không được phép. Chỉ hỗ trợ ZIP/RAR/PDF/DOC/XLS/PPT/MP4.'));
    }
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime || mime === 'application/octet-stream') {
      return cb(null, true);
    }
    const okMime = /^(application\/(zip|x-zip-compressed|x-(rar|7z)-compressed|x-tar|pdf|msword|vnd\.|octet-stream)|video\/mp4)/.test(mime);
    if (!okMime) {
      return cb(new Error('MIME type không khớp định dạng cho phép.'));
    }
    cb(null, true);
  }
});

function handlePracticalUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file để tải lên' });
    }
    const fileUrl = `/uploads/practical/${req.file.filename}`;
    return res.json({ success: true, fileUrl, message: 'Tải file bài thực hành lên thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server khi tải file thực hành' });
  }
}

// ─── POST /api/teachers/upload-practical ──────────────────────────────────────
router.post('/upload-practical', authMiddleware, ...teacherRouteGuard('upload_practical'), (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.message || 'Không thể tải file lên';
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ success: false, message: msg });
    }
    return handlePracticalUpload(req, res);
  });
});

function teacherExamDurationSeconds(settings, subjectIds) {
  const minutes = (subjectIds || []).reduce((sum, subjectId) => {
    const raw = Number(settings?.teacherExamMinutesRaw?.[subjectId]);
    return sum + (Number.isFinite(raw) && raw >= 1 && raw <= 600 ? raw : 90);
  }, 0);
  return Math.max(10 * 60, Math.min(8 * 60 * 60, Math.round(minutes * 60)));
}

function teacherGradeResponse(teacher, gradedResult, extra = {}) {
  const correct = gradedResult?.correct ?? (Number(teacher?.testMcCorrect) || 0);
  const totalQuestions = gradedResult?.total ?? (Number(teacher?.testMcTotal) || 0);
  const score = gradedResult?.percentage ?? (Number(teacher?.testScore) || 0);
  return {
    attemptId: teacher?.examAttemptId || '',
    total: score,
    score,
    pass: gradedResult?.passed ?? String(teacher?.testStatus || '').toLowerCase() === 'passed',
    passed: gradedResult?.passed ?? String(teacher?.testStatus || '').toLowerCase() === 'passed',
    correctCount: correct,
    wrongCount: Math.max(0, totalQuestions - correct),
    mcTotal: totalQuestions,
    sectionFailures: gradedResult?.sectionFailures || [],
    idempotent: false,
    ...extra,
  };
}

// ─── POST /api/teachers/:id/exam-attempt ─────────────────────────────────────
router.post('/:id/exam-attempt', authMiddleware, ...teacherRouteGuard('submit_practical'), async (req, res) => {
  try {
    if (req.user?.role !== 'teacher' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Chỉ giáo viên được tạo lượt thi của chính mình' });
    }
    let [teacher, settings] = await Promise.all([
      Teacher.findById(req.params.id),
      getCachedSettings(),
    ]);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }
    const testStatus = String(teacher.testStatus || '').toLowerCase();
    const accountStatus = String(teacher.status || '').toLowerCase();
    if (testStatus === 'passed' || accountStatus === 'active') {
      return res.status(409).json({ success: false, message: 'Kết quả thi đã được chốt' });
    }
    if (testStatus === 'failed' || teacher.examAttemptStatus === 'forfeited') {
      return res.status(409).json({ success: false, message: 'Lượt thi đã bị khóa, liên hệ Admin để mở lại' });
    }

    const subjectIds = resolveTeacherSubjectIds(teacher);
    if (!subjectIds.length) {
      return res.status(409).json({ success: false, message: 'Giảng viên chưa được gán môn thi' });
    }
    const durationSeconds = teacherExamDurationSeconds(settings, subjectIds);
    let attemptId = teacher.examAttemptStatus === 'active' ? String(teacher.examAttemptId || '') : '';
    let startedAt = teacher.examAttemptStartedAt ? new Date(teacher.examAttemptStartedAt).getTime() : 0;
    if (attemptId && startedAt && Date.now() >= startedAt + durationSeconds * 1000) {
      await claimTeacherAttempt(Teacher, {
        teacherId: req.params.id,
        attemptId,
        setFields: {
          testScore: 0,
          testMcCorrect: 0,
          testStatus: 'failed',
          examAttemptStatus: 'forfeited',
          examAttemptSubmittedAt: new Date(),
        },
      });
      return res.status(409).json({ success: false, message: 'Lượt thi đã hết thời gian' });
    }
    if (!attemptId) {
      const proposedAttemptId = crypto.randomUUID();
      startedAt = Date.now();
      const claimed = await Teacher.findOneAndUpdate(
        {
          _id: req.params.id,
          examAttemptStatus: { $ne: 'active' },
          testStatus: { $nin: ['passed', 'failed'] },
          status: { $ne: 'active' },
        },
        {
          $set: {
            examAttemptId: proposedAttemptId,
            examAttemptStatus: 'active',
            examAttemptStartedAt: new Date(startedAt),
            examAttemptSubmittedAt: null,
          },
        },
        { returnDocument: 'after', runValidators: true },
      );
      teacher = claimed || await Teacher.findById(req.params.id);
      if (!teacher || teacher.examAttemptStatus !== 'active' || !teacher.examAttemptId) {
        return res.status(409).json({ success: false, message: 'Không thể xác nhận lượt thi đang hoạt động' });
      }
      attemptId = String(teacher.examAttemptId);
      startedAt = teacher.examAttemptStartedAt
        ? new Date(teacher.examAttemptStartedAt).getTime()
        : startedAt;
    }

    const remainingSeconds = Math.max(
      1,
      Math.floor((startedAt + durationSeconds * 1000 - Date.now()) / 1000),
    );
    const attempt = createExamAttempt({
      kind: 'teacher',
      userId: req.user.id,
      subjectIds,
      bank: settings?.teacherExamBankRawData,
      attemptId,
      ttlSeconds: remainingSeconds,
    });
    return res.json({
      success: true,
      data: {
        ...attempt,
        subjectIds,
        durationSeconds,
        passPercentage: 80,
        sectionPassPercentage: 50,
        teacherExamMinutes: settings?.teacherExamMinutesRaw || {},
        teacherEssayExamMinutes: settings?.teacherEssayExamMinutesRaw || {},
      },
    });
  } catch (error) {
    logger.warn('[TEACHERS] create exam attempt: %s', error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Lỗi server' });
  }
});

// ─── POST /api/teachers/:id/exam-attempt/submit ──────────────────────────────
router.post('/:id/exam-attempt/submit', authMiddleware, ...teacherRouteGuard('submit_practical'), async (req, res) => {
  try {
    if (req.user?.role !== 'teacher' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể nộp lượt thi của giáo viên khác' });
    }
    const settings = await getCachedSettings();
    const graded = gradeExamAttempt({
      token: req.body?.attemptToken,
      expected: { kind: 'teacher', userId: req.user.id },
      bank: settings?.teacherExamBankRawData,
      answers: req.body?.answers,
    });
    const status = graded.result.passed ? 'Pending' : 'Locked';
    const lockReason = graded.result.passed
      ? null
      : `Thi trượt trắc nghiệm (${graded.result.percentage}/100)`;
    const teacher = await claimTeacherAttempt(Teacher, {
      teacherId: req.params.id,
      attemptId: graded.payload.attemptId,
      setFields: {
        testScore: graded.result.percentage,
        testDate: new Date(),
        testStatus: graded.result.passed ? 'passed' : 'failed',
        testMcCorrect: graded.result.correct,
        testMcWrong: graded.result.total - graded.result.correct,
        testMcTotal: graded.result.total,
        status,
        lockReason,
        examAttemptStatus: 'submitted',
        examAttemptSubmittedAt: new Date(),
      },
    }).select('-password -refreshToken');

    if (!teacher) {
      const existing = await Teacher.findById(req.params.id)
        .select('testScore testStatus testMcCorrect testMcTotal examAttemptId examAttemptStatus')
        .lean();
      if (
        String(existing?.examAttemptId) === graded.payload.attemptId
        && existing?.examAttemptStatus === 'submitted'
      ) {
        return res.json({
          success: true,
          data: teacherGradeResponse(existing, graded.result, { idempotent: true }),
        });
      }
      return res.status(409).json({ success: false, message: 'Lượt thi không còn hoạt động hoặc đã được thay thế' });
    }

    const io = req.app.get('io');
    if (io) {
      emitDataRefresh(io, { type: 'teacher', id: teacher._id }, {
        branchId: teacher.branchId,
        userIds: [teacher._id],
      });
      NotificationService.notifyAdmins(
        io,
        graded.result.passed ? '🎉 Giảng viên thi đạt' : '❌ Giảng viên thi chưa đạt',
        `GV ${teacher.name}: ${graded.result.percentage}/100.`,
        { teacherId: teacher._id, passed: graded.result.passed },
        '/admin#training',
      ).catch((err) => logger.warn('[TEACHERS] notify exam result: %s', err.message));
    }
    return res.json({
      success: true,
      data: teacherGradeResponse(teacher, graded.result),
    });
  } catch (error) {
    logger.warn('[TEACHERS] submit exam attempt: %s', error.message);
    return res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể nộp bài' });
  }
});

// ─── POST /api/teachers/:id/exam-attempt/forfeit ─────────────────────────────
router.post('/:id/exam-attempt/forfeit', authMiddleware, ...teacherRouteGuard('submit_practical'), async (req, res) => {
  try {
    if (req.user?.role !== 'teacher' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể hủy lượt thi của giáo viên khác' });
    }
    const payload = verifyAttemptToken(req.body?.attemptToken, {
      kind: 'teacher',
      userId: req.user.id,
    }, { allowExpired: true });
    const teacher = await claimTeacherAttempt(Teacher, {
      teacherId: req.params.id,
      attemptId: payload.attemptId,
      setFields: {
        testScore: 0,
        testDate: new Date(),
        testStatus: 'failed',
        testMcCorrect: 0,
        testMcWrong: payload.questionIds.length,
        testMcTotal: payload.questionIds.length,
        status: 'Locked',
        lockReason: String(req.body?.reason || 'Bài thi bị hủy').slice(0, 300),
        examAttemptStatus: 'forfeited',
        examAttemptSubmittedAt: new Date(),
      },
    }).select('-password -refreshToken');
    if (!teacher) {
      const existing = await Teacher.findById(req.params.id)
        .select('examAttemptId examAttemptStatus testScore testStatus testMcCorrect testMcTotal')
        .lean();
      if (
        String(existing?.examAttemptId) === payload.attemptId
        && ['submitted', 'forfeited'].includes(existing?.examAttemptStatus)
      ) {
        return res.json({ success: true, data: teacherGradeResponse(existing, null, { idempotent: true }) });
      }
      return res.status(409).json({ success: false, message: 'Lượt thi không còn hoạt động' });
    }
    return res.json({ success: true, data: teacherGradeResponse(teacher) });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, message: error.message || 'Không thể hủy bài' });
  }
});

// ⭐ RBAC Guard: Chặn STAFF thực hiện thao tác ghi trên teachers
// STAFF chỉ được GET (xem), KHÔNG được POST/PUT/DELETE
// superAdminOnlyTeacher retained inside teachersCutoverGate (Phase 7.31).

// ─── POST /api/teachers ───────────────────────────────────────────────────────
// Chỉ Super Admin được tạo giảng viên
// Strangler Facade: ENABLE_CQRS_TEACHER=true → CQRS (transaction + outbox)
router.post('/', [authMiddleware, branchFilter, ...teacherRouteGuard('create')], async (req, res, next) => {
  try {
    if (process.env.ENABLE_CQRS_TEACHER === 'true' || process.env.ENABLE_CQRS_TEACHER === '1') {
      require('../modules/teacher/commands');
      const CQRSTeacherController = require('../modules/teacher/controllers/CQRSTeacherController');
      return CQRSTeacherController.post_root(req, res, next);
    }

    const { name, phone, specialty, subjectIds, password, status, branchId: reqBranchId, branchCode: reqBranchCode, startDate, address, email: rawEmail, baseSalaryPerSession, voiceRegion } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên và Số điện thoại' });
    }
    const { normalizeVNPhone } = require('../utils/phoneIdentity');
    const canonicalPhone = normalizeVNPhone(phone);
    if (!canonicalPhone) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }
    const emailTrim = (rawEmail || '').trim();
    const email = emailTrim && emailTrim !== 'email@example.com' ? emailTrim : undefined;
    try {
      const { assertUniqueContact } = require('../utils/uniqueContact');
      await assertUniqueContact({ phone: canonicalPhone, email });
    } catch (dupErr) {
      if (dupErr.status === 409) {
        return res.status(409).json({ success: false, message: dupErr.message });
      }
      throw dupErr;
    }
    if (password && String(password).trim().length > 0 && String(password).trim().length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự' });
    }

    // ⭐ Xác định branchId:
    //   - STAFF → bắt buộc dùng branchId của chính họ (không được chọn chi nhánh khác)
    //   - SUPER_ADMIN → dùng branchId từ request body (dropdown chọn), hoặc null
    let finalBranchId   = null;
    let finalBranchCode = '';
    if (req.userBranchId) {
      // STAFF → ép branchId
      finalBranchId   = req.userBranchId;
      finalBranchCode = req.userBranchCode || '';
    } else if (reqBranchId) {
      // SUPER_ADMIN chọn chi nhánh
      finalBranchId   = reqBranchId;
      finalBranchCode = reqBranchCode || '';
    }

    // Auto-Approve Logic: Nếu Admin gán chi nhánh ngay từ lúc tạo, tự động duyệt
    const isAssigningBranch = !!(finalBranchId || finalBranchCode);
    
    const normalizedSubjectIds = Array.isArray(subjectIds)
      ? [...new Set(subjectIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    const plainPassword = resolveDefaultAccountPassword({ password, phone: canonicalPhone });
    const teacherCode = await generateTeacherCode();
    const teacher = await Teacher.create({
      name,
      phone: canonicalPhone,
      email,
      specialty: specialty || specialtyFromSubjectIds(normalizedSubjectIds),
      subjectIds: normalizedSubjectIds,
      voiceRegion: normalizeVoiceRegion(voiceRegion),
      startDate: startDate || Date.now(),
      address:   address   || '',
      password:  plainPassword,
      status:    status || 'inactive',
      testStatus: null,
      role: 'teacher',
      isFirstLogin: false,
      branchId:   finalBranchId,
      branchCode: finalBranchCode,
      baseSalaryPerSession: Math.max(0, Number(baseSalaryPerSession) || 0),
      teacherCode,
    });

    // Emit socket scoped theo branch (không io.emit global)
    const io = req.app.get('io');
    if (io) {
      emitTeacherEvent(io, teacher, 'teacher:new', {
        teacherId: teacher._id,
        name: teacher.name,
        branchCode: teacher.branchCode,
        message: `Giảng viên mới: ${teacher.name} — Chi nhánh: ${teacher.branchCode || 'Chưa phân'}`,
      });
      NotificationService.notifyAdmins(
        io,
        '🆕 Giảng viên mới',
        `Đã tạo giảng viên ${teacher.name} (${teacher.phone}).`,
        { teacherId: teacher._id },
        '/admin/teachers',
      ).catch((err) => logger.warn('[TEACHERS] notifyAdmins:', err.message));
    }

    const welcome = await sendAccountWelcome(io, {
      role: 'teacher',
      userId: teacher._id,
      name: teacher.name,
      phone: teacher.phone,
      email: teacher.email,
      password: plainPassword,
    });

    return res.status(201).json({
      success: true,
      message: `Đã tạo giảng viên ${teacher.name}`,
      data: {
        ...teacher.toObject(),
        password: undefined,
        tempPassword: plainPassword,
        welcomeQueued: welcome.queued,
        welcomeNotified: welcome.notified,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã tồn tại' });
    }
    if (error.name === 'ValidationError') {
      const msg = Object.values(error.errors || {}).map((e) => e.message).join(', ');
      return res.status(400).json({ success: false, message: msg || 'Dữ liệu không hợp lệ' });
    }
    logger.error('[TEACHERS] Create error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
});

// ─── GET /api/teachers ────────────────────────────────────────────────────────
// Lấy danh sách giảng viên (Admin/Staff only — Teacher bị chặn)
router.get('/', [authMiddleware, branchFilter, ...teacherRouteGuard('list')], async (req, res) => {
  try {
    // ⭐ Chỉ Admin/Staff được xem danh sách GV — Teacher chỉ được xem profile của mình
    if (req.user.role === 'teacher' || req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Không có quyền xem danh sách giảng viên' });
    }

    const { status, search } = req.query;
    const filter = {};
    const andConditions = [];
    const bf = req.branchFilter || {};
    if (bf.branchId?.$in) {
      // Tenant scope: vẫn hiển thị GV chưa phân chi nhánh
      andConditions.push({ $or: [
        { branchId: { $in: bf.branchId.$in } },
        { branchId: null },
      ] });
    } else if (bf.branchId != null && bf.branchId !== '') {
      // Lọc 1 chi nhánh: gồm GV thuộc chi nhánh đó + GV chưa gán chi nhánh (để vẫn phân công được)
      andConditions.push({ $or: [
        { branchId: bf.branchId },
        { branchId: null },
      ] });
    } else {
      Object.assign(filter, bf);
    }
    filter.role = { $in: ['teacher'] };
    if (status) filter.status = status;
    if (search) {
      const s = sanitizeRegex(search);
      andConditions.push({ $or: [
        { name:      { $regex: s, $options: 'i' } },
        { phone:     { $regex: s, $options: 'i' } },
        { specialty: { $regex: s, $options: 'i' } },
        { teacherCode: { $regex: s, $options: 'i' } },
      ] });
    }
    if (andConditions.length) filter.$and = andConditions;

    const Evaluation = require('../models/Evaluation');
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const [teachersRaw, total, ratingAgg] = await Promise.all([
      Teacher.find(filter)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Teacher.countDocuments(filter),
      Evaluation.aggregate([
        { $match: { type: 'teacher_rating', targetTeacherId: { $ne: null } } },
        {
          $group: {
            _id: { $toString: '$targetTeacherId' },
            ratings: { $push: '$$ROOT' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const ratingMap = new Map(
      (ratingAgg || []).map((r) => [String(r._id), r.ratings || []])
    );

    const teachers = teachersRaw.map((t) => {
      const myRatings = ratingMap.get(String(t._id)) || [];
      const subjectIds = Array.isArray(t.subjectIds) && t.subjectIds.length
        ? t.subjectIds.filter(Boolean)
        : resolveTeacherSubjectIds(t);
      // Dedup theo HV + tính avg từ criteria.stars
      const seen = new Set();
      const unique = [];
      for (const r of myRatings) {
        const sid = String(r.studentId?._id || r.studentId || r._id || '');
        if (seen.has(sid)) continue;
        seen.add(sid);
        unique.push(r);
      }
      let avgFromRatings = Number(t.averageRating) || 0;
      if (unique.length) {
        const sum = unique.reduce((s, r) => {
          const stars = Number(r?.criteria?.stars);
          return s + (Number.isFinite(stars) ? stars : 0);
        }, 0);
        const withStars = unique.filter((r) => Number.isFinite(Number(r?.criteria?.stars)));
        if (withStars.length) {
          avgFromRatings = Math.round((sum / withStars.length) * 10) / 10;
        }
      }
      return {
        ...t,
        subjectIds,
        ratings: unique,
        averageRating: avgFromRatings,
        ratingCount: unique.length,
        id: t._id,
      };
    });

    return res.json({
      success: true,
      count: teachers.length,
      total,
      page: pageNum,
      limit: limitNum,
      data: teachers,
    });
  } catch (error) {
    logger.error('[TEACHERS] Get all error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/stats/summary ──────────────────────────────────────────
router.get('/stats/summary', [authMiddleware, branchFilter, ...teacherRouteGuard('stats_summary')], async (req, res) => {
  try {
    const bf = { ...req.branchFilter };
    const { branch_id } = req.query;
    if (branch_id && branch_id !== 'all' && !req.userBranchId) {
      bf.branchId = branch_id;
    }

    const total   = await Teacher.countDocuments({ ...bf, role: 'teacher' });
    const active  = await Teacher.countDocuments({ ...bf, role: 'teacher', status: { $in: ['active', 'Active'] } });
    const pending = await Teacher.countDocuments({ ...bf, role: 'teacher', status: 'pending' });
    const suspended = await Teacher.countDocuments({ ...bf, role: 'teacher', status: 'suspended' });

    return res.json({
      success: true,
      data: { total, active, pending, suspended },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id/public-card ───────────────────────────────────────
// HV xem thẻ GV được phân công (không lộ SĐT/bank). Admin/GV cũng dùng được.
router.get('/:id/public-card', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const teacherId = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return res.status(400).json({ success: false, message: 'ID giảng viên không hợp lệ' });
    }

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'student') {
      const Student = require('../models/Student');
      const student = await Student.findById(req.user.id)
        .select('teacherId enrollments.teacherId')
        .lean();
      if (!student) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
      }
      const assigned = new Set();
      const rootTid = student.teacherId?._id || student.teacherId;
      if (rootTid) assigned.add(String(rootTid));
      (student.enrollments || []).forEach((e) => {
        const tid = e?.teacherId?._id || e?.teacherId;
        if (tid) assigned.add(String(tid));
      });
      if (!assigned.has(teacherId)) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ xem được giảng viên đang phụ trách mình' });
      }
    } else if (role === 'teacher' && String(req.user.id) !== teacherId) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    } else if (role !== 'admin' && role !== 'staff' && role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    }

    const teacher = await Teacher.findById(teacherId)
      .select('name specialty averageRating ratingCount voiceRegion avatar subjectIds')
      .lean();
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    return res.json({
      success: true,
      data: {
        id: String(teacher._id),
        _id: String(teacher._id),
        name: teacher.name || '',
        specialty: teacher.specialty || '',
        subjectIds: Array.isArray(teacher.subjectIds) ? teacher.subjectIds : [],
        averageRating: Number(teacher.averageRating) || 0,
        ratingCount: Number(teacher.ratingCount) || 0,
        voiceRegion: normalizeVoiceRegion(teacher.voiceRegion),
        avatar: teacher.avatar || '',
      },
    });
  } catch (error) {
    logger.error('[TEACHERS] public-card: %s', error.message);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id ────────────────────────────────────────────────────
router.get('/:id', [authMiddleware, branchFilter, ...teacherRouteGuard('get_one')], async (req, res) => {
  try {
    // Teacher chỉ xem profile của chính mình
    if (req.user.role === 'teacher' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }
    // Student không được xem GV
    if (req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    }

    const teacher = await Teacher.findById(req.params.id)
      .select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // ⭐ STAFF cross-branch guard: STAFF chỉ xem GV cùng chi nhánh
    if (req.userBranchId && teacher.branchId
        && String(teacher.branchId) !== String(req.userBranchId)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem giảng viên chi nhánh khác' });
    }

    // Lấy thống kê buổi dạy
    const completedSessions = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
    });

    const obj = teacher.toObject();
    const subjectIds = Array.isArray(obj.subjectIds) && obj.subjectIds.length
      ? obj.subjectIds.filter(Boolean)
      : resolveTeacherSubjectIds(obj);

    const Evaluation = require('../models/Evaluation');
    const ratingDocs = await Evaluation.find({
      type: 'teacher_rating',
      targetTeacherId: req.params.id,
    }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    const seen = new Set();
    const ratings = [];
    for (const r of ratingDocs) {
      const sid = String(r.studentId?._id || r.studentId || '');
      if (seen.has(sid)) continue;
      seen.add(sid);
      ratings.push(r);
    }

    return res.json({
      success: true,
      data: {
        ...obj,
        subjectIds,
        ratings,
        ratingCount: ratings.length,
        completedSessionsFromDB: completedSessions,
      },
    });
  } catch (error) {
    logger.error('[TEACHERS] Get by ID error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id ────────────────────────────────────────────────────
// Cập nhật thông tin cơ bản giảng viên (STAFF bị chặn, teacher tự sửa được)
router.put('/:id', [authMiddleware, branchFilter, ...teacherRouteGuard('update_profile')], async (req, res) => {
  try {
    // Teacher sửa chính mình → cho phép
    const isSelfEdit = req.user.id === req.params.id && req.user.role === 'teacher';
    // Admin/Staff: Super Admin, hoặc quyền Đào tạo / Quản lý Giảng viên
    if (!isSelfEdit && req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    if (!isSelfEdit && (req.user.role === 'admin' || req.user.role === 'staff')) {
      if (req.user.id !== 'admin') {
        const me = await Teacher.findById(req.user.id).select('adminRole permissions').lean();
        const canTraining = Array.isArray(me?.permissions) && me.permissions.includes('manage_training');
        const canManageTeachers = Array.isArray(me?.permissions) && me.permissions.includes(PERMISSIONS.MANAGE_TEACHERS);
        if (me?.adminRole !== 'SUPER_ADMIN' && !canTraining && !canManageTeachers) {
          return res.status(403).json({
            success: false,
            message: '403 Forbidden — Chỉ Super Admin hoặc tài khoản có quyền Đào tạo / Quản lý Giảng viên mới được sửa thông tin giảng viên.',
          });
        }
      }
    }

    // Branch isolation: assertTeacherBranchAccess (trusted req.userBranchId)

    const isAdminRole = (req.user.role === 'admin' || req.user.role === 'staff');
    const attemptedExamFields = attemptedTeacherExamFields(req.body);
    if (attemptedExamFields.length) {
      return res.status(isSelfEdit ? 403 : 400).json({
        success: false,
        message: isSelfEdit
          ? 'Giảng viên không được tự ghi điểm, trạng thái thi hoặc trạng thái duyệt'
          : 'Dùng endpoint chấm điểm/duyệt chuyên biệt cho các trường kết quả thi',
        fields: attemptedExamFields,
      });
    }

    const allowedFields = isAdminRole 
      ? [
          'name', 'phone', 'zalo', 'email', 'specialty', 'subjectIds', 'voiceRegion', 'bio', 'startDate', 'address',
          'bankAccount', 'avatar', 'baseSalaryPerSession', 'customStarBonusAmount',
          'assignedClasses', 'assignedStudents',
          'branchId', 'branchCode',
        ]
      : isSelfEdit
        ? [
            'zalo', 'email', 'bio', 'voiceRegion', 'bankAccount', 'avatar', 'address',
          ]
        : [
          'zalo', 'email', 'bio', 'voiceRegion', 'bankAccount', 'avatar', 'address',
        ];

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'voiceRegion')) {
      updates.voiceRegion = normalizeVoiceRegion(updates.voiceRegion);
    }
    // Chuyên môn / subjectIds: chỉ Admin / Staff được sửa
    if (isAdminRole && req.body.subjectIds !== undefined) {
      updates.subjectIds = Array.isArray(req.body.subjectIds)
        ? [...new Set(req.body.subjectIds.map((id) => String(id).trim()).filter(Boolean))]
        : [];
      if (!updates.subjectIds.length) {
        const spec = req.body.specialty ?? updates.specialty;
        if (spec) updates.subjectIds = resolveTeacherSubjectIds({ specialty: spec, subjectIds: [] });
      }
      if (req.body.specialty === undefined && updates.subjectIds.length) {
        updates.specialty = specialtyFromSubjectIds(updates.subjectIds);
      }
    }

    // Luôn có ngày/giờ thi khi ghi nhận đạt/trượt trắc nghiệm (tránh cột "Ngày thi" N/A trên admin)
    if (
      (updates.testStatus === 'passed' || updates.testStatus === 'failed') &&
      (updates.testDate === undefined || updates.testDate === null)
    ) {
      updates.testDate = new Date();
    }

    // Security check: teacher cannot set their own status to 'active'
    if (req.user.role === 'teacher' && updates.status === 'active') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tự kích hoạt tài khoản chính thức' });
    }

    // Auto-Approve Logic: Nếu Admin gán chi nhánh hoặc xếp lớp, tự động duyệt
    if (isAdminRole) {
      const isAssigningStudents = updates.assignedClasses?.length > 0 || updates.assignedStudents?.length > 0;
      
      if (isAssigningStudents) {
        updates.status = 'active';
        // Remove test exemption here if they want strict testing, or keep it if assigning students implies exemption
        // updates.testStatus = 'exempt'; 
      }
    }

    const prev = await Teacher.findById(req.params.id).select(
      'status tokenVersion phone zalo email testStatus testScore name specialty subjectIds '
      + 'baseSalaryPerSession customStarBonusAmount branchId branchCode bankAccount address bio startDate practicalStatus',
    ).lean();
    if (!prev) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    if (updates.phone !== undefined || updates.zalo !== undefined || updates.email !== undefined) {
      if (updates.phone !== undefined) {
        const { normalizeVNPhone } = require('../utils/phoneIdentity');
        const canonicalPhone = normalizeVNPhone(updates.phone);
        if (!canonicalPhone) {
          return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
        }
        updates.phone = canonicalPhone;
      }
      try {
        const { assertUniqueContact } = require('../utils/uniqueContact');
        await assertUniqueContact({
          phone: updates.phone !== undefined ? updates.phone : prev.phone,
          zalo: updates.zalo !== undefined ? updates.zalo : (prev.zalo || prev.phone),
          email: updates.email !== undefined ? updates.email : prev.email,
          excludeRole: 'teacher',
          excludeId: req.params.id,
        });
      } catch (dupErr) {
        if (dupErr.status === 409) {
          return res.status(409).json({ success: false, message: dupErr.message });
        }
        throw dupErr;
      }
    }

    const nextStatus = updates.status !== undefined ? String(updates.status).toLowerCase() : null;
    const prevStatus = String(prev.status || '').toLowerCase();
    const locking = nextStatus && ['suspended', 'inactive'].includes(nextStatus)
      && !['suspended', 'inactive'].includes(prevStatus);

    const updateOps = { $set: updates };
    if (locking) {
      updateOps.$inc = { tokenVersion: 1 };
      updateOps.$unset = { ...(updateOps.$unset || {}), refreshToken: 1 };
    }

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, updateOps, {
      returnDocument: 'after',
      runValidators: true,
    }).select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    const io = req.app.get('io');
    if (io) {
      emitDataRefresh(io, { type: 'teacher', id: teacher._id }, {
        branchId: teacher.branchId,
        userIds: [teacher._id],
      });
      if (locking) {
        emitUser(io, teacher._id, 'auth:forceLogout', {
          userId: String(teacher._id),
          role: 'teacher',
          reason: 'account_disabled',
        });
      }

      // Thông báo khi GV thi đạt / trượt (lần đầu ghi nhận hoặc đổi trạng thái)
      const nextTest = String(updates.testStatus || '').toLowerCase();
      const prevTest = String(prev.testStatus || '').toLowerCase();
      if ((nextTest === 'passed' || nextTest === 'failed') && nextTest !== prevTest) {
        const score = teacher.testScore != null ? Number(teacher.testScore) : null;
        const scoreText = Number.isFinite(score) ? ` (${score}/100)` : '';
        if (nextTest === 'passed') {
          NotificationService.notifyAdmins(
            io,
            '🎉 Giảng viên thi đạt',
            `GV ${teacher.name} đã thi đạt${scoreText}.`,
            { teacherId: teacher._id, testStatus: 'passed', testScore: score },
            '/admin#training',
          ).catch((err) => logger.warn('[TEACHERS] notify exam pass:', err.message));
          NotificationService.send(io, {
            type: 'EXAM',
            title: '🎉 Bạn đã thi đạt',
            content: `Chúc mừng! Kết quả thi của bạn: ĐẠT${scoreText}.`,
            receivers: String(teacher._id),
            payload: { teacherId: String(teacher._id), testStatus: 'passed' },
            link: '/teacher/test',
          }).catch((err) => logger.warn('[TEACHERS] notify self exam:', err.message));
        } else {
          NotificationService.notifyAdmins(
            io,
            '❌ Giảng viên thi chưa đạt',
            `GV ${teacher.name} thi chưa đạt${scoreText}.`,
            { teacherId: teacher._id, testStatus: 'failed', testScore: score },
            '/admin#training',
          ).catch((err) => logger.warn('[TEACHERS] notify exam fail:', err.message));
        }
      }

      // Admin đổi lương / hồ sơ → chuông cho GV (không ảnh hưởng self-edit)
      if (isAdminRole) {
        const { notifyTeacherAdminUpdates } = require('../services/teacherAdminNotifier');
        notifyTeacherAdminUpdates(io, {
          teacherId: teacher._id,
          updates,
          prev,
          isAdminActor: true,
        }).catch((err) => logger.warn('[TEACHERS] notify admin updates: %s', err.message));
      }
    }

    return res.json({
      success: true,
      message: `Đã cập nhật giảng viên ${teacher.name}`,
      data: teacher,
      meta: {
        changes: require('../utils/systemLogChangeSummary').summarizeTeacherUpdates(updates, prev),
        previous: {
          name: prev.name,
          phone: prev.phone,
          email: prev.email,
          specialty: prev.specialty,
          baseSalaryPerSession: prev.baseSalaryPerSession,
          customStarBonusAmount: prev.customStarBonusAmount,
          status: prev.status,
          branchCode: prev.branchCode,
        },
      },
    });
  } catch (error) {
    logger.error('[TEACHERS] Update error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/score ──────────────────────────────────────────────
// Admin nhập điểm bài test Onboarding cho giảng viên
router.put('/:id/score', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('score'),
], async (req, res) => {
  try {
    const { testScore, testNotes } = req.body;

    if (testScore === undefined || testScore === null || !Number.isFinite(Number(testScore))) {
      return res.status(400).json({ success: false, message: 'Thiếu testScore' });
    }
    const scoreNum = Number(testScore);
    if (scoreNum < 0 || scoreNum > 100) {
      return res.status(400).json({ success: false, message: 'Điểm phải trong khoảng 0-100' });
    }

    const prev = await Teacher.findById(req.params.id).select('testScore name').lean();
    if (!prev) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }
    const oldScore = prev.testScore != null ? Number(prev.testScore) : null;
    const newStatus = scoreNum >= 80 ? 'tested_passed' : 'tested_failed';

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          testScore: scoreNum,
          testNotes: testNotes || '',
          testDate: new Date(),
          status: newStatus,
        },
        $push: {
          scoreHistory: {
            at: new Date(),
            oldScore,
            newScore: scoreNum,
            actorUserId: String(req.user?.id || ''),
            actorRole: String(req.user?.role || ''),
            actorName: String(req.user?.name || ''),
            note: String(testNotes || '').slice(0, 300),
          },
        },
      },
      { returnDocument: 'after' },
    ).select('-password -refreshToken');

    try {
      const { writeAudit } = require('../services/auditLogService');
      await writeAudit({
        action: 'teacher.score_change',
        actorUserId: String(req.user?.id || ''),
        actorRole: String(req.user?.role || ''),
        entityType: 'teacher',
        entityId: String(teacher._id),
        teacherId: teacher._id,
        oldValue: { oldScore },
        newValue: { newScore: scoreNum },
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (auditErr) {
      logger.warn('[TEACHERS] score audit: %s', auditErr.message);
    }

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // Thông báo real-time cho giảng viên + branch (không global)
    const io = req.app.get('io');
    if (io) {
      emitTeacherEvent(io, teacher, 'teacher:scored', {
        teacherId:  teacher._id.toString(),
        testScore: scoreNum,
        passed:     scoreNum >= 80,
        message:    scoreNum >= 80
          ? `🎉 Chúc mừng! Bạn đạt ${scoreNum}/100 điểm. Đã qua bài test!`
          : `❌ Bạn đạt ${scoreNum}/100 điểm. Chưa đạt yêu cầu (>=80). Vui lòng liên hệ Admin.`,
      });
    }

    return res.json({
      success: true,
      message: `Đã lưu điểm ${scoreNum}/100 cho ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    logger.error('[TEACHERS] Score error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/approve ────────────────────────────────────────────
// Admin duyệt giảng viên — STRICT: chỉ khi testScore >= 80
router.put('/:id/approve', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('approve'),
], async (req, res) => {
  try {
    const teacherCheck = await Teacher.findById(req.params.id);
    if (!teacherCheck) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // STRICT LOGIC (Workflow 1): Không thể approve nếu điểm < 80
    if (!Number.isFinite(Number(teacherCheck.testScore)) || Number(teacherCheck.testScore) < 80) {
      return res.status(403).json({
        success: false,
        message: `Không thể cấp quyền! Điểm bài test: ${teacherCheck.testScore}/100 (yêu cầu ≥ 80).`,
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        status: 'active',
        approvedAt: new Date(),
        approvedBy: String(req.user?.id || 'admin'),
        approvalMode: 'workflow',
        approvalNote: '',
        suspendedBy: null,
        suspendedAt: null,
      },
      { returnDocument: 'after' }
    ).select('-password -refreshToken');

    // Thông báo real-time (branch + teacher)
    const io = req.app.get('io');
    if (io) {
      emitTeacherEvent(io, teacher, 'teacher:approved', {
        teacherId: teacher._id.toString(),
        name:      teacher.name,
        message:   '🎊 Tài khoản của bạn đã được Admin phê duyệt! Bạn có thể bắt đầu giảng dạy.',
      });
    }

    try {
      const workflowService = require('../services/workflowService');
      await workflowService.completeOpenForEntity('teacher_approval', teacher._id, {
        action: 'approve',
        user: req.user,
        note: 'Duyệt từ API teachers/approve',
      });
    } catch (wfErr) {
      logger.warn({ err: wfErr.message }, '[TEACHERS] workflow sync');
    }

    return res.json({
      success: true,
      message: `Đã phê duyệt giảng viên ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    logger.error('[TEACHERS] Approve error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/grant-exam-access ──────────────────────────────────
router.put('/:id/grant-exam-access', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('grant_exam_access'),
], async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndUpdate(req.params.id, {
      status: 'pending',
      testScore: 0,
      testStatus: null,
      testDate: null,
      practicalFile: null,
      practicalStatus: 'none',
      lockReason: null,
      faceViolationCount: 0,
    }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken');
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    const io = req.app.get('io');
    if (io) emitTeacherEvent(io, teacher, 'teacher:updated', {
      teacherId: String(teacher._id),
      status: 'pending',
      message: 'Bạn đã được cấp quyền truy cập bài thi giảng viên.',
    });
    return res.json({ success: true, message: `Đã cấp quyền thi cho ${teacher.name}`, data: teacher });
  } catch (error) {
    logger.error('[TEACHERS] Grant exam access error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/review-practical ───────────────────────────────────
router.put('/:id/review-practical', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('review_practical'),
], async (req, res) => {
  try {
    const teacher = await Teacher.findOneAndUpdate(
      {
        _id: req.params.id,
        testStatus: 'passed',
        practicalStatus: 'submitted',
      },
      { $set: { practicalStatus: 'reviewed', status: 'pending' } },
      { returnDocument: 'after', runValidators: true },
    ).select('-password -refreshToken');
    if (!teacher) {
      const existing = await Teacher.findById(req.params.id).select('testStatus practicalStatus').lean();
      return res.status(existing ? 409 : 404).json({
        success: false,
        message: existing
          ? 'Bài thực hành không ở trạng thái chờ kiểm tra'
          : 'Không tìm thấy giảng viên',
      });
    }
    const io = req.app.get('io');
    if (io) emitTeacherEvent(io, teacher, 'teacher:updated', {
      teacherId: String(teacher._id),
      status: 'pending',
      practicalStatus: 'reviewed',
      message: 'Bài thực hành đã được kiểm tra.',
    });
    return res.json({ success: true, data: teacher });
  } catch (error) {
    logger.error('[TEACHERS] Review practical error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/manual-activate ───────────────────────────────────
router.put('/:id/manual-activate', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('manual_activate'),
], async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (note.length < 5) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do cấp quyền thủ công (ít nhất 5 ký tự).' });
    }
    const teacher = await Teacher.findByIdAndUpdate(req.params.id, {
      status: 'active',
      approvedAt: new Date(),
      approvedBy: String(req.user?.id || 'admin'),
      approvalMode: 'manual',
      approvalNote: note,
      suspendedBy: null,
      suspendedAt: null,
      lockReason: null,
    }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken');
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    try {
      const { writeAudit } = require('../services/auditLogService');
      await writeAudit({
        action: 'teacher.manual_activate',
        actorUserId: String(req.user?.id || ''),
        actorRole: String(req.user?.role || ''),
        entityType: 'teacher',
        entityId: String(teacher._id),
        metadata: { note },
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (auditErr) {
      logger.warn('[TEACHERS] manual activate audit: %s', auditErr.message);
    }
    const io = req.app.get('io');
    if (io) emitTeacherEvent(io, teacher, 'teacher:approved', {
      teacherId: String(teacher._id),
      name: teacher.name,
      manual: true,
      message: 'Tài khoản của bạn đã được cấp quyền giảng dạy thủ công.',
    });
    return res.json({ success: true, message: `Đã cấp quyền thủ công cho ${teacher.name}`, data: teacher });
  } catch (error) {
    logger.error('[TEACHERS] Manual activate error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/suspend ───────────────────────────────────────────
router.put('/:id/suspend', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('suspend'),
], async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do tạm ngưng (ít nhất 5 ký tự).' });
    }
    const teacher = await Teacher.findByIdAndUpdate(req.params.id, {
      status: 'suspended',
      lockReason: reason,
      suspendedBy: String(req.user?.id || 'admin'),
      suspendedAt: new Date(),
      $inc: { tokenVersion: 1 },
    }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken');
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    try {
      const { writeAudit } = require('../services/auditLogService');
      await writeAudit({
        action: 'teacher.suspend',
        actorUserId: String(req.user?.id || ''),
        actorRole: String(req.user?.role || ''),
        entityType: 'teacher',
        entityId: String(teacher._id),
        metadata: { reason },
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (auditErr) {
      logger.warn('[TEACHERS] suspend audit: %s', auditErr.message);
    }
    const io = req.app.get('io');
    if (io) emitTeacherEvent(io, teacher, 'teacher:updated', {
      teacherId: String(teacher._id),
      status: 'suspended',
      message: 'Quyền giảng dạy của bạn đã tạm ngưng.',
    });
    return res.json({ success: true, message: `Đã tạm ngưng quyền của ${teacher.name}`, data: teacher });
  } catch (error) {
    logger.error('[TEACHERS] Suspend error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/reactivate ────────────────────────────────────────
router.put('/:id/reactivate', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('reactivate'),
], async (req, res) => {
  try {
    const teacher = await Teacher.findOneAndUpdate({ _id: req.params.id, status: 'suspended' }, {
      status: 'active',
      lockReason: null,
      suspendedBy: null,
      suspendedAt: null,
      approvedAt: new Date(),
      approvedBy: String(req.user?.id || 'admin'),
      $inc: { tokenVersion: 1 },
    }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken');
    if (!teacher) return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên đang tạm ngưng' });
    try {
      const { writeAudit } = require('../services/auditLogService');
      await writeAudit({
        action: 'teacher.reactivate',
        actorUserId: String(req.user?.id || ''),
        actorRole: String(req.user?.role || ''),
        entityType: 'teacher',
        entityId: String(teacher._id),
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (auditErr) {
      logger.warn('[TEACHERS] reactivate audit: %s', auditErr.message);
    }
    const io = req.app.get('io');
    if (io) emitTeacherEvent(io, teacher, 'teacher:updated', {
      teacherId: String(teacher._id),
      status: 'active',
      message: 'Quyền giảng dạy của bạn đã được hoạt động lại.',
    });
    return res.json({ success: true, message: `Đã hoạt động lại quyền của ${teacher.name}`, data: teacher });
  } catch (error) {
    logger.error('[TEACHERS] Reactivate error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/teachers/:id/submit-practical ──────────────────────────────────
// Giảng viên nộp file thực hành (Workflow 1 Phase 2)
router.post('/:id/submit-practical', authMiddleware, ...teacherRouteGuard('submit_practical'), async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không thể nộp giùm người khác' });
    }
    const { fileUrl } = req.body;
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'Thiếu fileUrl' });
    }
    const normalizedFileUrl = String(fileUrl).trim();
    if (!normalizedFileUrl.startsWith('/uploads/practical/')) {
      return res.status(400).json({ success: false, message: 'fileUrl bài thực hành không hợp lệ' });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      {
        _id: req.params.id,
        testStatus: 'passed',
        practicalStatus: { $nin: ['approved', 'reviewed'] },
      },
      {
        practicalFile: normalizedFileUrl,
        practicalStatus: 'submitted',
        status: 'practical_submitted',
      },
      { returnDocument: 'after' }
    ).select('-password');

    if (!teacher) {
      const exists = await Teacher.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? 'Chỉ được nộp thực hành sau khi server chấm đạt trắc nghiệm'
          : 'Không tìm thấy giảng viên',
      });
    }

    // Thông báo Admin có file mới (branch-scoped)
    const io = req.app.get('io');
    if (io) {
      emitTeacherEvent(io, teacher, 'teacher:practical_submitted', {
        teacherId:   teacher._id.toString(),
        teacherName: teacher.name,
        fileUrl: normalizedFileUrl,
        message: `📁 Giảng viên ${teacher.name} đã nộp bài thực hành`,
      });
      NotificationService.notifyAdmins(
        io,
        '📁 GV nộp bài thực hành',
        `Giảng viên ${teacher.name} đã nộp bài thực hành.`,
        { teacherId: teacher._id, fileUrl: normalizedFileUrl },
        '/admin#training',
      ).catch((err) => logger.warn('[TEACHERS] notify practical:', err.message));
    }

    try {
      const workflowService = require('../services/workflowService');
      await workflowService.start({
        definitionKey: 'teacher_approval',
        entityId: teacher._id,
        entityLabel: teacher.name,
        title: 'Duyệt GV: ' + teacher.name,
        payload: { testScore: teacher.testScore, practicalFileUrl: normalizedFileUrl },
        createdBy: String(req.user.id || ''),
      });
    } catch (wfErr) {
      logger.warn({ err: wfErr.message }, '[TEACHERS] workflow start');
    }

    return res.json({ success: true, data: teacher });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Server-controlled negative transition for timeout/proctor violations in practical phase.
router.post('/:id/practical-forfeit', authMiddleware, ...teacherRouteGuard('submit_practical'), async (req, res) => {
  try {
    if (req.user?.role !== 'teacher' || String(req.user.id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'Không thể hủy bài của giáo viên khác' });
    }
    const reasonType = req.body?.reasonType === 'expired' ? 'expired' : 'cancelled';
    const lockReason = String(req.body?.reason || 'Bài thực hành bị hủy').slice(0, 300);
    const teacher = await Teacher.findOneAndUpdate(
      {
        _id: req.params.id,
        testStatus: 'passed',
        practicalStatus: { $nin: ['approved', 'reviewed'] },
      },
      {
        $set: {
          status: 'Locked',
          lockReason,
          practicalStatus: reasonType,
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).select('-password -refreshToken');
    if (!teacher) {
      const existing = await Teacher.findById(req.params.id)
        .select('practicalStatus status lockReason')
        .lean();
      if (existing && ['expired', 'cancelled'].includes(existing.practicalStatus)) {
        return res.json({ success: true, data: existing, idempotent: true });
      }
      return res.status(existing ? 409 : 404).json({
        success: false,
        message: existing ? 'Trạng thái bài thực hành không cho phép thao tác này' : 'Không tìm thấy giảng viên',
      });
    }
    return res.json({ success: true, data: teacher, idempotent: false });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/reject ─────────────────────────────────────────────
// Admin từ chối / tạm dừng giảng viên
router.put('/:id/reject', [
  authMiddleware,
  branchFilter,
  ...teacherWriteGuard('reject'),
], async (req, res) => {
  try {
    const { reason } = req.body;

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        status: 'suspended',
        rejectedReason: reason || '',
        rejectedAt: new Date(),
      },
      { returnDocument: 'after' }
    ).select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    try {
      const workflowService = require('../services/workflowService');
      await workflowService.completeOpenForEntity('teacher_approval', teacher._id, {
        action: 'reject',
        user: req.user,
        note: reason || 'Từ chối từ API teachers/reject',
      });
    } catch (wfErr) {
      logger.warn({ err: wfErr.message }, '[TEACHERS] workflow reject sync');
    }

    const io = req.app.get('io');
    if (io) {
      emitTeacherEvent(io, teacher, 'teacher:rejected', {
        teacherId: teacher._id.toString(),
        reason,
        message: `❌ Tài khoản bị từ chối. Lý do: ${reason || 'Không đáp ứng yêu cầu'}`,
      });
    }

    return res.json({
      success: true,
      message: `Đã từ chối giảng viên ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    logger.error('[TEACHERS] Reject error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── DELETE /api/teachers/:id ─────────────────────────────────────────────────
// Admin xóa giảng viên (STAFF bị chặn)
router.delete('/:id', [authMiddleware, ...teacherRouteGuard('delete')], async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }
    const cascade = await purgeTeacherSideEffects(teacher._id, { teacherName: teacher.name });
    await Teacher.findByIdAndDelete(teacher._id);
    return res.json({
      success: true,
      message: `Đã xóa giảng viên ${teacher.name}`,
      cascade,
    });
  } catch (error) {
    logger.error('[TEACHERS] Delete error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id/finance ──────────────────────────────────────────────
router.get('/:id/finance', authMiddleware, ...teacherRouteGuard('finance_self'), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập thông tin này' });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Tổng buổi đã dạy (Trạng thái completed)
    const totalSessions = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
    });

    // Buổi đã dạy nhưng chưa thanh toán
    const pendingSessionsCount = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: { $ne: true }
    });

    // Chưa nhận = pendingSessionsCount * salary_per_session
    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const unpaidAmount = pendingSessionsCount * salaryPerSession;

    // Tổng đã nhận = Tổng tiền từ các giao dịch thành công của giảng viên
    const transactionsContext = await Transaction.aggregate([
      { $match: { 
          teacherId: new mongoose.Types.ObjectId(req.params.id), 
          status: 'confirmed' 
      }},
      { $group: { _id: null, totalString: { $sum: "$amount" } }}
    ]);
    const paidAmount = transactionsContext.length > 0 ? transactionsContext[0].totalString : 0;

    return res.json({
      success: true,
      data: {
        totalSessions,
        unpaidAmount,
        paidAmount,
        salaryPerSession
      }
    });
  } catch (error) {
    logger.error('[FINANCE] Get stats error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id/finance/pending ──────────────────────────────────────
// Lấy số buổi còn nợ thanh toán + list FIFO (kèm số buổi HV) + thưởng sao
router.get('/:id/finance/pending', authMiddleware, ...teacherRouteGuard('finance_pending'), async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const teacherOid = req.params.id;
    const pending = await Schedule.find({
      teacherId: teacherOid,
      status: 'completed',
      is_paid_to_teacher: { $ne: true },
    }).sort({ date: 1, createdAt: 1 }).lean();

    const pendingSessionsCount = pending.length;
    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const unpaidAmount = pendingSessionsCount * salaryPerSession;
    const starBonus = await computeStarBonusSummary(teacher);

    // Số buổi thứ mấy của HV (trong khóa, theo lịch completed của GV này)
    const studentIds = [...new Set(
      pending.map((s) => (s.studentId ? String(s.studentId) : '')).filter(Boolean)
    )];
    const sessionNoMap = new Map();
    if (studentIds.length > 0) {
      const allCompleted = await Schedule.find({
        teacherId: teacherOid,
        status: 'completed',
        studentId: { $in: studentIds },
      }).sort({ date: 1, createdAt: 1 }).select('_id studentId course').lean();

      const groups = Object.create(null);
      for (const s of allCompleted) {
        const key = `${s.studentId || ''}|${s.course || ''}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
      }
      for (const list of Object.values(groups)) {
        list.forEach((s, i) => sessionNoMap.set(String(s._id), i + 1));
      }
    }

    const pendingSessions = pending.map((s) => ({
      id: s._id,
      date: s.date,
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      course: s.course || '',
      studentId: s.studentId || null,
      studentName: s.studentName || '',
      sessionNo: sessionNoMap.get(String(s._id)) || null,
    }));

    return res.json({
      success: true,
      data: {
        pendingSessionsCount,
        salaryPerSession,
        unpaidAmount,
        starBonus,
        pendingSessions,
        bankInfo: {
          bankName: teacher.bankAccount?.bankName || '',
          accountNumber: teacher.bankAccount?.accountNumber || '',
          accountHolder: teacher.bankAccount?.accountHolder || teacher.name || '',
          bankCode: teacher.bankAccount?.bankCode || '',
        }
      }
    });
  } catch (error) {
    logger.error('[FINANCE] Get pending error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/finance/pay-flexible ──────────────────────────────────
// Thanh toán linh hoạt: Admin tự chọn số buổi và số tiền, FIFO (cũ nhất trước)
// Có thể cộng thưởng sao tích lũy (includeStarBonus)
router.put('/:id/finance/pay-flexible', [authMiddleware, ...teacherRouteGuard('finance_pay_flexible')], async (req, res) => {
  try {
    const { sessionsCount, amount, note, includeStarBonus, starBonusMonths } = req.body;
    const idempotencyKey = String(
      req.headers['idempotency-key'] || req.body.idempotencyKey || ''
    ).trim() || null;

    const paidCount = Math.max(0, Number(sessionsCount) || 0);
    const wantBonus = includeStarBonus === true || includeStarBonus === 'true' || includeStarBonus === 1;

    if (paidCount <= 0 && !wantBonus) {
      return res.status(400).json({ success: false, message: 'Số buổi thanh toán phải lớn hơn 0 (hoặc bật thưởng sao)' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền thanh toán phải lớn hơn 0' });
    }
    if (Number(amount) > 500000000) {
      return res.status(400).json({ success: false, message: `Số tiền vượt giới hạn 500 triệu/lần` });
    }

    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey }).lean();
      if (existing) {
        return res.json({
          success: true,
          message: 'Giao dịch đã tồn tại (idempotent)',
          data: {
            paidSessions: paidCount,
            markedSessions: 0,
            totalAmount: existing.amount,
            starBonusAmount: existing.starBonusAmount || 0,
            starBonusMonths: existing.starBonusMonths || [],
            transaction: existing,
            idempotent: true,
          },
        });
      }
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    let bonusPayout = { payoutMonths: [], payoutBonusAmount: 0 };
    if (wantBonus) {
      bonusPayout = await resolveBonusForPayout(
        teacher,
        Array.isArray(starBonusMonths) ? starBonusMonths : null
      );
      if (paidCount <= 0 && bonusPayout.payoutBonusAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có thưởng sao đủ điều kiện để thanh toán',
        });
      }
    }
    const starBonusAmount = Number(bonusPayout.payoutBonusAmount) || 0;
    const starBonusMonthKeys = Array.isArray(bonusPayout.payoutMonths) ? bonusPayout.payoutMonths : [];

    // Tìm buổi chưa thanh toán theo FIFO (chỉ tính các buổi đã hoàn thành - completed)
    let sessionIds = [];
    let actualCount = 0;
    let claimedSessions = [];
    if (paidCount > 0) {
      const pendingSessions = await Schedule.find({
        teacherId: req.params.id,
        status: 'completed',
        is_paid_to_teacher: { $ne: true }
      }).sort({ date: 1, createdAt: 1 }).limit(paidCount);

      claimedSessions = pendingSessions;
      sessionIds = pendingSessions.map(s => s._id);

      if (sessionIds.length > 0) {
        const claim = await Schedule.updateMany(
          {
            _id: { $in: sessionIds },
            status: 'completed',
            is_paid_to_teacher: { $ne: true },
          },
          { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
        );
        actualCount = claim.modifiedCount || 0;
      }
    }

    const now = new Date();
    const monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    const bonusNote = starBonusAmount > 0
      ? ` + thưởng sao ${starBonusAmount.toLocaleString('vi-VN')}đ (${starBonusMonthKeys.join(', ')})`
      : '';
    const fifoNote = claimedSessions.length
      ? claimedSessions.map((s) => {
          const name = s.studentName || 'HV';
          const d = s.date ? new Date(s.date).toLocaleDateString('vi-VN') : '';
          return d ? `Buổi - ${name} (${d})` : `Buổi - ${name}`;
        }).join('; ')
      : '';
    const defaultDesc = paidCount > 0
      ? `${fifoNote || `Thù lao ${paidCount} buổi dạy`}${bonusNote}`
      : `Thưởng sao giảng viên${bonusNote}`;

    let transaction;
    try {
      transaction = await Transaction.create({
        teacherId: req.params.id,
        teacherName: teacher.name,
        teacherPhone: teacher.phone || '',
        amount: Number(amount),
        description: note || defaultDesc,
        month: monthLabel,
        status: 'confirmed',
        confirmedBy: req.user?.name || 'Admin',
        confirmedAt: now,
        bankName: teacher.bankAccount?.bankName || '',
        bankAccount: teacher.bankAccount?.accountNumber || '',
        note: note || '',
        starBonusAmount,
        starBonusMonths: starBonusMonthKeys,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    } catch (createErr) {
      // Rollback claim nếu tạo phiếu chi thất bại (tránh buổi bị đánh dấu paid mà không có ledger)
      if (actualCount > 0 && sessionIds.length > 0 && !(createErr?.code === 11000 && idempotencyKey)) {
        try {
          await Schedule.updateMany(
            { _id: { $in: sessionIds }, is_paid_to_teacher: true },
            { $set: { is_paid_to_teacher: false, paymentStatus: 'unpaid' } }
          );
        } catch (rollbackErr) {
          logger.error('[TEACHERS] Pay rollback failed:', rollbackErr);
        }
      }
      if (createErr?.code === 11000 && idempotencyKey) {
        const existing = await Transaction.findOne({ idempotencyKey }).lean();
        if (existing) {
          return res.json({
            success: true,
            message: 'Giao dịch đã tồn tại (idempotent)',
            data: {
              paidSessions: paidCount,
              markedSessions: actualCount,
              totalAmount: existing.amount,
              starBonusAmount: existing.starBonusAmount || 0,
              starBonusMonths: existing.starBonusMonths || [],
              transaction: existing,
              idempotent: true,
            },
          });
        }
      }
      throw createErr;
    }

    // P2: post Ledger salary — fail-closed (rollback Transaction + sessions nếu Ledger lỗi)
    try {
      await postSalary({
        teacher,
        amount: Number(amount),
        transaction,
        branchId: teacher.branchId || null,
        idempotencyKey: `salary:tx:${transaction._id}`,
        sourceRef: `tx:${transaction._id}`,
        actor: { id: req.user?.id || req.user?._id || '', role: req.user?.role || 'admin', name: req.user?.name || '' },
        note: note || defaultDesc,
        metadata: {
          sessionsCount: paidCount,
          sessionIds: sessionIds.map(String),
          starBonusAmount,
          starBonusMonths: starBonusMonthKeys,
        },
      });
    } catch (ledgerErr) {
      logger.error('[FINANCE] salary ledger (pay-flexible) FAILED — rollback: %s', ledgerErr.message);
      try {
        await Transaction.findByIdAndUpdate(transaction._id, { status: 'cancelled' });
        if (sessionIds.length > 0) {
          await Schedule.updateMany(
            { _id: { $in: sessionIds }, is_paid_to_teacher: true },
            { $set: { is_paid_to_teacher: false, paymentStatus: 'unpaid' } }
          );
        }
      } catch (rbErr) {
        logger.error('[FINANCE] pay-flexible rollback failed: %s', rbErr.message);
      }
      return res.status(500).json({
        success: false,
        message: 'Ghi sổ lương thất bại — đã hủy phiếu chi. Thử lại.',
      });
    }

    // Đánh dấu tháng thưởng đã chi sau khi Ledger OK
    if (starBonusMonthKeys.length > 0) {
      try {
        await Teacher.findByIdAndUpdate(req.params.id, {
          $addToSet: { starBonusPaidMonths: { $each: starBonusMonthKeys } },
        });
      } catch (bonusMarkErr) {
        logger.error('[FINANCE] Mark starBonusPaidMonths failed: %s', bonusMarkErr.message);
      }
    }

    const io = req.app.get('io');
    if (io) {
      const financeScope = { branchId: teacher.branchId, userIds: [teacher._id] };
      const financeMsg = `Admin đã thanh toán ${Number(amount).toLocaleString('vi-VN')}đ`
        + (paidCount > 0 ? ` cho ${paidCount} buổi` : '')
        + (starBonusAmount > 0 ? ` (gồm thưởng sao ${starBonusAmount.toLocaleString('vi-VN')}đ)` : '')
        + '.';
      emitFinanceEvent(io, financeScope, 'teacher:financeUpdated', {
        teacherId: req.params.id,
        message: financeMsg,
      });
      emitFinanceEvent(io, financeScope, 'transactions:new', transaction);
      emitFinanceEvent(io, financeScope, 'revenue:updated', { amount: Number(amount), type: 'salary' });

      NotificationService.send(io, {
        type: 'FINANCE',
        title: '✅ Lương đã được thanh toán',
        content: financeMsg,
        receivers: String(teacher._id),
        payload: { transactionId: transaction._id, amount: Number(amount), sessionsCount: paidCount },
        link: '/teacher/finance',
      }).catch((err) => logger.warn('[FINANCE] notify teacher pay-flexible: %s', err.message));
    }

    return res.json({
      success: true,
      message: paidCount > 0
        ? `Thanh toán thành công ${paidCount} buổi`
          + (starBonusAmount > 0 ? ` + thưởng sao ${starBonusAmount.toLocaleString('vi-VN')}đ` : '')
        : `Thanh toán thưởng sao ${starBonusAmount.toLocaleString('vi-VN')}đ`,
      data: {
        paidSessions: paidCount,
        markedSessions: actualCount,
        totalAmount: Number(amount),
        starBonusAmount,
        starBonusMonths: starBonusMonthKeys,
        transaction,
      }
    });
  } catch (error) {
    logger.error('[FINANCE] Flexible pay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
});

// ─── PUT /api/teachers/:id/finance/pay-all ──────────────────────────────────────
router.put('/:id/finance/pay-all', [authMiddleware, ...teacherRouteGuard('finance_pay_all')], async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Tìm các buổi chưa thanh toán
    const pendingSessionsCount = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: { $ne: true }
    });

    if (pendingSessionsCount === 0) {
      return res.status(400).json({ success: false, message: 'Không có buổi dạy nào cần thanh toán' });
    }

    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const estimatedAmount = pendingSessionsCount * salaryPerSession;

    // Validation: Không cho phép thanh toán 0đ hoặc số phi lý (> 500 triệu/lần)
    if (estimatedAmount <= 0) {
      return res.status(400).json({ success: false, message: `Giảng viên chưa được cấu hình mức lương/buổi. Vui lòng Admin cập nhật trường "Lương/buổi" trước khi thanh toán.` });
    }
    if (estimatedAmount > 500000000) {
      return res.status(400).json({ success: false, message: `Số tiền thanh toán (${estimatedAmount.toLocaleString('vi-VN')}đ) vượt quá giới hạn 500 triệu. Vui lòng kiểm tra lại mức lương/buổi.` });
    }

    // Claim atomic theo danh sách _id đã chọn — rollback chỉ các id này nếu create fail
    const pendingSessions = await Schedule.find({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: { $ne: true }
    }).select('_id').lean();

    const sessionIds = pendingSessions.map((s) => s._id);
    if (sessionIds.length === 0) {
      return res.status(409).json({ success: false, message: 'Các buổi đã được thanh toán bởi yêu cầu khác' });
    }

    const claim = await Schedule.updateMany(
      {
        _id: { $in: sessionIds },
        status: 'completed',
        is_paid_to_teacher: { $ne: true }
      },
      { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
    );

    const paidCount = claim.modifiedCount || 0;
    if (paidCount === 0) {
      return res.status(409).json({ success: false, message: 'Các buổi đã được thanh toán bởi yêu cầu khác' });
    }

    const totalAmount = paidCount * salaryPerSession;

    // Tạo giao dịch thanh toán
    const now = new Date();
    let transaction;
    try {
      transaction = await Transaction.create({
        teacherId: req.params.id,
        teacherName: teacher.name,
        teacherPhone: teacher.phone,
        amount: totalAmount,
        description: `Thanh toán thù lao ${paidCount} buổi dạy`,
        month: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
        status: 'confirmed',
        confirmedBy: req.user.name || 'Admin',
        confirmedAt: now,
        bankName: teacher.bankAccount?.bankName || '',
        bankAccount: teacher.bankAccount?.accountNumber || ''
      });
    } catch (createErr) {
      try {
        await Schedule.updateMany(
          { _id: { $in: sessionIds }, is_paid_to_teacher: true },
          { $set: { is_paid_to_teacher: false, paymentStatus: 'unpaid' } }
        );
      } catch (rollbackErr) {
        logger.error('[FINANCE] Pay-all rollback failed:', rollbackErr);
      }
      throw createErr;
    }

    try {
      await postSalary({
        teacher,
        amount: totalAmount,
        transaction,
        branchId: teacher.branchId || null,
        idempotencyKey: `salary:tx:${transaction._id}`,
        sourceRef: `tx:${transaction._id}`,
        actor: { id: req.user?.id || req.user?._id || '', role: req.user?.role || 'admin', name: req.user?.name || '' },
        note: `Thanh toán thù lao ${paidCount} buổi dạy`,
        metadata: { sessionsCount: paidCount, sessionIds: sessionIds.map(String) },
      });
    } catch (ledgerErr) {
      logger.error('[FINANCE] salary ledger (pay-all) FAILED — rollback: %s', ledgerErr.message);
      try {
        await Transaction.findByIdAndUpdate(transaction._id, { status: 'cancelled' });
        await Schedule.updateMany(
          { _id: { $in: sessionIds }, is_paid_to_teacher: true },
          { $set: { is_paid_to_teacher: false, paymentStatus: 'unpaid' } }
        );
      } catch (rbErr) {
        logger.error('[FINANCE] pay-all rollback failed: %s', rbErr.message);
      }
      return res.status(500).json({
        success: false,
        message: 'Ghi sổ lương thất bại — đã hủy phiếu chi. Thử lại.',
      });
    }

    const io = req.app.get('io');
    if (io) {
      const financeScope = { branchId: teacher.branchId, userIds: [teacher._id] };
      const financeMsg = `Admin đã thanh toán ${totalAmount.toLocaleString('vi-VN')}đ cho ${paidCount} buổi dạy.`;
      emitFinanceEvent(io, financeScope, 'teacher:financeUpdated', {
        teacherId: req.params.id,
        message: financeMsg,
      });
      emitFinanceEvent(io, financeScope, 'transactions:new', transaction);
      emitFinanceEvent(io, financeScope, 'revenue:updated', { amount: totalAmount, type: 'salary' });

      NotificationService.send(io, {
        type: 'FINANCE',
        title: '✅ Lương đã được thanh toán',
        content: financeMsg,
        receivers: String(teacher._id),
        payload: { transactionId: transaction._id, amount: totalAmount, sessionsCount: paidCount },
        link: '/teacher/finance',
      }).catch((err) => logger.warn('[FINANCE] notify teacher pay-all: %s', err.message));
    }

    return res.json({
      success: true,
      message: 'Đã thanh toán thành công',
      data: {
        paidSessions: paidCount,
        totalAmount,
        transaction
      }
    });
  } catch (error) {
    logger.error('[FINANCE] Pay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
