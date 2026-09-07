const express = require('express');
const router = express.Router();
const LessonQuiz = require('../models/LessonQuiz');
const Student = require('../models/Student');
const quizGenerator = require('../shared/ai/QuizGeneratorProvider');
const { authMiddleware, branchFilter } = require('../middleware/auth');
const Teacher = require('../models/Teacher');
const logger = require('../config/logger');
const { policyShadowQuizAdminRead } = require('../middleware/policyShadowQuizAdminRead');
const { policyShadowQuiz } = require('../middleware/policyShadowQuiz');
const { quizzesCutoverGate } = require('../middleware/quizzesCutoverGate');
const { scheduleQuizAssignedNotify } = require('../services/quizAssignedNotifier');
const {
  studentAssignedToQuiz,
  quizWindow,
  existingSubmissionPayload,
  studentCourseNames,
  claimQuizSubmission,
} = require('../services/quizAccess');

/** Phase 7.22: policyShadowQuiz → quizzesCutoverGate */
function quizzesGuard(action) {
  return [policyShadowQuiz(action), quizzesCutoverGate(action)];
}

/** Phase 7.22: admin/all uses quizAdminReadPolicy shadow */
function quizzesAdminGuard() {
  return [policyShadowQuizAdminRead(), quizzesCutoverGate('admin_read')];
}

// ── GET /api/quizzes/teacher: Lấy danh sách trắc nghiệm do giảng viên tạo ─────
router.get('/teacher', [authMiddleware, ...quizzesGuard('teacher_list')], async (req, res) => {
  try {
    const teacherId = req.user.id || req.user._id;
    const quizzes = await LessonQuiz.find({ teacherId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: quizzes });
  } catch (err) {
    logger.error('[QUIZ] Teacher fetch error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải danh sách trắc nghiệm' });
  }
});

// ── POST /api/quizzes/create: Giảng viên tạo bài trắc nghiệm mới ──────────────
router.post('/create', [authMiddleware, ...quizzesGuard('create')], async (req, res) => {
  try {
    const teacherId = req.user.id || req.user._id;
    const teacherName = req.user.name || 'Giảng viên';
    const { title, courseName, targetStudentIds, timeLimitMinutes, startTime, deadline, questions } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên bài thi và ít nhất 1 câu hỏi' });
    }

    const quiz = await LessonQuiz.create({
      title,
      courseName: courseName || '',
      teacherId,
      teacherName,
      targetStudentIds: Array.isArray(targetStudentIds) ? targetStudentIds : [],
      timeLimitMinutes: Math.max(1, parseInt(timeLimitMinutes) || 15),
      startTime: startTime ? new Date(startTime) : new Date(),
      deadline: deadline ? new Date(deadline) : null,
      questions,
      status: 'active',
    });

    // ~10s after create: popup invite for assigned students (online now or after login poll)
    scheduleQuizAssignedNotify({
      quiz,
      notifyUser: typeof req.app.notifyUser === 'function' ? req.app.notifyUser.bind(req.app) : null,
      io: req.app.get('io'),
    });

    return res.json({ success: true, data: quiz, message: 'Tạo bài trắc nghiệm thành công' });
  } catch (err) {
    logger.error('[QUIZ] Create error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi tạo bài trắc nghiệm' });
  }
});

// ── POST /api/quizzes/generate-ai: Gemini sinh câu hỏi, GV duyệt trước khi tạo ─
router.post('/generate-ai', [authMiddleware, ...quizzesGuard('generate_ai')], async (req, res) => {
  try {
    const { topic, courseName, count, difficulty } = req.body || {};
    const data = await quizGenerator.generateForTeacher({
      topic: topic || '',
      courseName: courseName || '',
      count,
      difficulty,
    });
    return res.json({
      success: true,
      data,
      message: data.source === 'fallback'
        ? 'AI chưa sẵn sàng — đây là câu mẫu, hãy sửa trước khi giao bài'
        : `Đã soạn ${data.count} câu. Kiểm tra rồi bấm Tạo bài trắc nghiệm.`,
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[QUIZ] generate-ai');
    const status = err.status === 400 ? 400 : (err.status && err.status >= 400 && err.status < 600 ? err.status : 502);
    return res.status(status).json({
      success: false,
      message: err.message || 'Không tạo được câu hỏi AI',
      code: err.code,
    });
  }
});

// ── DELETE /api/quizzes/:id: Giảng viên xóa bài trắc nghiệm ────────────────────
router.delete('/:id', [authMiddleware, ...quizzesGuard('delete')], async (req, res) => {
  try {
    const quizId = req.params.id;
    const teacherId = req.user.id || req.user._id;
    const quiz = await LessonQuiz.findOneAndDelete({ _id: quizId, teacherId });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài trắc nghiệm' });
    }
    return res.json({ success: true, message: 'Đã xóa bài trắc nghiệm' });
  } catch (err) {
    logger.error('[QUIZ] Delete error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa bài trắc nghiệm' });
  }
});

// ── GET /api/quizzes/student: Lấy danh sách trắc nghiệm được giao cho Học viên ─
router.get('/student', [authMiddleware, ...quizzesGuard('student_list')], async (req, res) => {
  try {
    const studentId = req.user.id || req.user._id;
    const student = await Student.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const studentCourses = studentCourseNames(student);

    const quizzes = await LessonQuiz.find({
      status: 'active',
      $or: [
        { targetStudentIds: studentId },
        {
          $and: [
            {
              $or: [
                { targetStudentIds: { $size: 0 } },
                { targetStudentIds: { $exists: false } },
              ],
            },
            { courseName: { $in: studentCourses } },
          ],
        },
      ],
    }).sort({ createdAt: -1 }).lean();

    // Map thêm thông tin nộp bài của học viên này
    const result = quizzes.map(q => {
      const mySub = (q.submissions || []).find(s => String(s.studentId) === String(studentId));
      return {
        ...q,
        questionsCount: q.questions?.length || 0,
        mySubmission: mySub || null,
        // Giấu đáp án đúng khi gửi danh sách
        questions: undefined,
      };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[QUIZ] Student fetch error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi tải bài trắc nghiệm' });
  }
});

// ── GET /api/quizzes/:id: Học viên mở bài thi trắc nghiệm (Room Exam View) ────
router.get('/:id', [authMiddleware, ...quizzesGuard('get')], async (req, res) => {
  try {
    const quizId = req.params.id;
    const quiz = await LessonQuiz.findById(quizId).lean();
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài trắc nghiệm' });
    }

    // Không trả về đáp án đúng trước khi học viên nộp bài
    const safeQuestions = (quiz.questions || []).map(q => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options,
    }));

    const studentId = req.user.id || req.user._id;
    const isStudent = req.user.role === 'student';
    let student = null;
    if (isStudent) {
      student = await Student.findById(studentId).lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
      }
      if (!studentAssignedToQuiz(quiz, student)) {
        return res.status(403).json({ success: false, message: 'Bài trắc nghiệm này không dành cho bạn' });
      }
    }

    const mySub = (quiz.submissions || []).find(s => String(s.studentId) === String(studentId));
    const windowState = quizWindow(quiz);
    if (isStudent && !mySub) {
      if (windowState.notYetOpen) {
        return res.status(403).json({ success: false, message: 'Chưa đến giờ làm bài' });
      }
      if (windowState.expired) {
        return res.status(403).json({ success: false, message: 'Bài trắc nghiệm đã hết hạn' });
      }
    }

    return res.json({
      success: true,
      data: {
        _id: quiz._id,
        title: quiz.title,
        courseName: quiz.courseName,
        teacherName: quiz.teacherName,
        timeLimitMinutes: quiz.timeLimitMinutes,
        questions: safeQuestions,
        mySubmission: mySub || null,
        detailedReview: [],
      },
    });
  } catch (err) {
    logger.error('[QUIZ] Detail fetch error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi tải đề thi trắc nghiệm' });
  }
});

// ── POST /api/quizzes/:id/submit: Nộp bài trắc nghiệm & Chấm điểm tự động ──────
router.post('/:id/submit', [authMiddleware, ...quizzesGuard('submit')], async (req, res) => {
  try {
    const quizId = req.params.id;
    const studentId = req.user.id || req.user._id;
    const { answers, forfeit, exitReason } = req.body || {};
    const isForfeit = forfeit === true || forfeit === 'true' || forfeit === 1;

    const quiz = await LessonQuiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Bài trắc nghiệm không tồn tại' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const existingIndex = quiz.submissions.findIndex(s => String(s.studentId) === String(studentId));
    const existing = existingIndex >= 0 ? quiz.submissions[existingIndex] : null;

    if (!studentAssignedToQuiz(quiz, student)) {
      return res.status(403).json({ success: false, message: 'Bài trắc nghiệm này không dành cho bạn' });
    }

    const windowState = quizWindow(quiz);
    if (!existing && windowState.notYetOpen) {
      return res.status(403).json({ success: false, message: 'Chưa đến giờ làm bài' });
    }

    if (existing?.forfeit) {
      return res.status(403).json({
        success: false,
        message: 'Bạn đã bị tính RỚT do thoát giữa giờ. Không thể làm lại bài này.',
        code: 'QUIZ_FORFEITED',
        data: {
          score: existing.score,
          correctCount: existing.correctCount,
          totalQuestions: existing.totalQuestions,
          status: existing.status,
          forfeit: true,
          exitReason: existing.exitReason || '',
          submittedAt: existing.submittedAt,
        },
      });
    }

    // Đã nộp bình thường rồi — giữ bài cũ (kể cả forfeit muộn / nộp lại)
    if (existing && !existing.forfeit) {
      return res.json({
        success: true,
        message: 'Bài đã nộp trước đó',
        data: existingSubmissionPayload(existing),
      });
    }

    const totalQuestions = quiz.questions.length;
    const userAnswers = Array.isArray(answers) ? answers : [];
    let correctCount = 0;
    let score = 0;
    let status = 'failed';
    let reason = '';

    if (isForfeit) {
      correctCount = 0;
      score = 0;
      status = 'failed';
      reason = String(exitReason || 'Thoát giữa giờ làm bài').slice(0, 200);
    } else {
      quiz.questions.forEach((q, idx) => {
        if (userAnswers[idx] === q.correctAnswer) {
          correctCount += 1;
        }
      });
      score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      status = score >= 70 ? 'passed' : 'failed';
    }

    const submissionData = {
      studentId: student._id,
      studentName: student.name,
      studentPhone: student.phone || student.zalo || '',
      answers: isForfeit ? [] : userAnswers,
      score,
      correctCount,
      totalQuestions,
      submittedAt: new Date(),
      status,
      forfeit: isForfeit,
      exitReason: reason,
    };

    // Atomic claim: concurrent requests for the same student cannot both append.
    const claim = await claimQuizSubmission(
      LessonQuiz,
      quizId,
      student._id,
      submissionData,
    );
    if (!claim.created) {
      const concurrentExisting = claim.existing;
      if (concurrentExisting?.forfeit) {
        return res.status(403).json({
          success: false,
          message: 'Bạn đã bị tính RỚT do thoát giữa giờ. Không thể làm lại bài này.',
          code: 'QUIZ_FORFEITED',
          data: existingSubmissionPayload(concurrentExisting),
        });
      }
      if (concurrentExisting) {
        return res.json({
          success: true,
          message: 'Bài đã được ghi nhận trước đó',
          data: {
            ...existingSubmissionPayload(concurrentExisting),
            idempotent: true,
          },
        });
      }
      return res.status(409).json({
        success: false,
        message: 'Không thể xác nhận quyền ghi bài nộp',
      });
    }

    // Thông báo GV (bỏ qua forfeit trùng khi đã nộp bình thường — đã return sớm ở trên)
    try {
      const teacherId = quiz.teacherId ? String(quiz.teacherId) : '';
      if (teacherId) {
        const NotificationService = require('../services/NotificationService');
        const io = req.app.get('io');
        const title = isForfeit
          ? '⚠️ Học viên thoát giữa giờ trắc nghiệm'
          : '📝 Học viên đã nộp trắc nghiệm';
        const content = isForfeit
          ? `${student.name || 'Học viên'} — "${quiz.title}": RỚT (thoát giữa giờ).`
          : `${student.name || 'Học viên'} — "${quiz.title}": ${score}% (${correctCount}/${totalQuestions} câu) · ${status === 'passed' ? 'ĐẠT' : 'CHƯA ĐẠT'}.`;
        await NotificationService.send(io, {
          type: 'COURSE',
          title,
          content,
          receivers: teacherId,
          payload: {
            quizId: String(quiz._id),
            studentId: String(studentId),
            score,
            status,
            forfeit: isForfeit,
          },
          link: '/teacher#students',
        });
        if (io) {
          io.to(`teacher_${teacherId}`).emit('quiz:submitted', {
            quizId: String(quiz._id),
            studentId: String(studentId),
            studentName: student.name,
            title: quiz.title,
            score,
            status,
            forfeit: isForfeit,
          });
        }
      }
    } catch (notifyErr) {
      logger.warn({ err: notifyErr.message }, '[QUIZ] notify teacher on submit');
    }

    try {
      const NotificationService = require('../services/NotificationService');
      const io = req.app.get('io');
      const stuTitle = isForfeit
        ? '⚠️ Kết quả: Rớt (thoát giữa giờ)'
        : '📝 Đã nộp bài trắc nghiệm';
      const stuContent = isForfeit
        ? `Bạn đã bị tính rớt do thoát giữa giờ bài thi "${quiz.title}".`
        : `Bạn đã nộp bài "${quiz.title}". Điểm: ${score}% (${correctCount}/${totalQuestions}) · ${status === 'passed' ? 'ĐẠT' : 'CHƯA ĐẠT'}.`;
      
      await NotificationService.send(io, {
        type: 'EXAM',
        title: stuTitle,
        content: stuContent,
        receivers: [String(studentId)],
        payload: { quizId: String(quiz._id) },
        link: '/student/exam',
      });
    } catch (stuErr) {
      logger.warn('[QUIZ] Send student notification error:', stuErr.message);
    }

    return res.json({
      success: true,
      message: isForfeit ? 'Đã ghi nhận RỚT do thoát giữa giờ' : 'Nộp bài thành công',
      data: {
        score,
        correctCount,
        totalQuestions,
        status,
        forfeit: isForfeit,
        exitReason: reason,
        submittedAt: submissionData.submittedAt,
        detailedReview: [],
      },
    });
  } catch (err) {
    logger.error('[QUIZ] Submit error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi khi chấm điểm nộp bài' });
  }
});

// ── GET /api/quizzes/admin/all: Admin xem lịch sử trắc nghiệm (MANAGE_TRAINING)
// Flow: auth → branchFilter → policyShadowQuizAdminRead → quizzesCutoverGate → handler
// Legacy fallback: checkPermission(MANAGE_TRAINING); branch scope remains handler-owned.
router.get('/admin/all', [
  authMiddleware,
  branchFilter,
  ...quizzesAdminGuard(),
], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    // Scope by teacher branch when staff is branch-bound (quiz has no branchId field)
    if (req.userBranchId) {
      const teacherIds = await Teacher.find({
        $or: [
          { branchId: req.userBranchId },
          { branchId: null },
        ],
      }).select('_id').lean();
      filter.teacherId = { $in: teacherIds.map((t) => t._id) };
    }

    const [quizzes, total] = await Promise.all([
      LessonQuiz.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LessonQuiz.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: quizzes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    logger.error('[QUIZ] Admin fetch all error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải lịch sử trắc nghiệm Admin' });
  }
});

module.exports = router;
