'use strict';
const { lessonQuizRepository } = require('./../repositories');
const Student = require('./../../student/models/Student');
const logger = require('./../../../config/logger');
const { scheduleQuizAssignedNotify } = require('./../../../services/quizAssignedNotifier');
const { studentCourseNames } = require('./../../../services/quizAccess');

class QuizApplicationService {
  async get_teacher(data) {
    try {
      const teacherId = data.currentUser.id || data.currentUser._id;
      const quizzes = await lessonQuizRepository.findMany({ teacherId })
        .sort({ createdAt: -1 })
        .lean();
      return { _status: 200, _body: { success: true, data: quizzes } };
    } catch (err) {
      logger.error('[QUIZ] Teacher fetch error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi máy chủ khi tải danh sách trắc nghiệm' } };
    }
  }

  async post_create(data) {
    try {
      const teacherId = data.currentUser.id || data.currentUser._id;
      const teacherName = data.currentUser.name || 'Giảng viên';
      const { title, courseName, targetStudentIds, timeLimitMinutes, startTime, deadline, questions } = data.body;

      if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
        return { _status: 400, _body: { success: false, message: 'Vui lòng nhập tên bài thi và ít nhất 1 câu hỏi' } };
      }

      const quiz = await lessonQuizRepository.create({
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

      const notifyUser = data.app && typeof data.app.notifyUser === 'function'
        ? data.app.notifyUser.bind(data.app)
        : null;
      scheduleQuizAssignedNotify({ quiz, notifyUser });

      return { _status: 200, _body: { success: true, data: quiz, message: 'Tạo bài trắc nghiệm thành công' } };
    } catch (err) {
      logger.error('[QUIZ] Create error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi khi tạo bài trắc nghiệm' } };
    }
  }

  async delete_id(data) {
    try {
      const quizId = data.id;
      const teacherId = data.currentUser.id || data.currentUser._id;
      const quiz = await lessonQuizRepository.deleteOne({ _id: quizId, teacherId });
      if (!quiz) {
        return { _status: 404, _body: { success: false, message: 'Không tìm thấy bài trắc nghiệm' } };
      }
      return { _status: 200, _body: { success: true, message: 'Đã xóa bài trắc nghiệm' } };
    } catch (err) {
      logger.error('[QUIZ] Delete error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi khi xóa bài trắc nghiệm' } };
    }
  }

  async get_student(data) {
    try {
      const studentId = data.currentUser.id || data.currentUser._id;
      const student = await Student.findById(studentId).lean();
      if (!student) {
        return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
      }

      const studentCourses = studentCourseNames(student);

      const quizzes = await lessonQuizRepository.findMany({
        status: 'active',
        $or: [
          { targetStudentIds: studentId },
          { targetStudentIds: { $size: 0 }, courseName: { $in: studentCourses } },
          { targetStudentIds: { $exists: false } },
        ],
      }).sort({ createdAt: -1 }).lean();

      const result = quizzes.map(q => {
        const mySub = (q.submissions || []).find(s => String(s.studentId) === String(studentId));
        return {
          ...q,
          questionsCount: q.questions?.length || 0,
          mySubmission: mySub || null,
          questions: undefined,
        };
      });

      return { _status: 200, _body: { success: true, data: result } };
    } catch (err) {
      logger.error('[QUIZ] Student fetch error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi khi tải bài trắc nghiệm' } };
    }
  }

  async get_id(data) {
    try {
      const quizId = data.id;
      const quiz = await lessonQuizRepository.findById(quizId).lean();
      if (!quiz) {
        return { _status: 404, _body: { success: false, message: 'Không tìm thấy bài trắc nghiệm' } };
      }

      const safeQuestions = (quiz.questions || []).map(q => ({
        _id: q._id,
        questionText: q.questionText,
        options: q.options,
      }));

      const studentId = data.currentUser.id || data.currentUser._id;
      const mySub = (quiz.submissions || []).find(s => String(s.studentId) === String(studentId));

      return {
        _status: 200,
        _body: {
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
        },
      };
    } catch (err) {
      logger.error('[QUIZ] Detail fetch error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi khi tải đề thi trắc nghiệm' } };
    }
  }

  async post_id_submit(data) {
    try {
      const quizId = data.id;
      const studentId = data.currentUser.id || data.currentUser._id;
      const { answers, forfeit, exitReason } = data.body || {};
      const isForfeit = forfeit === true || forfeit === 'true' || forfeit === 1;

      const quiz = await lessonQuizRepository.findById(quizId);
      if (!quiz) {
        return { _status: 404, _body: { success: false, message: 'Bài trắc nghiệm không tồn tại' } };
      }

      const student = await Student.findById(studentId);
      if (!student) {
        return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
      }

      const existingIndex = quiz.submissions.findIndex(s => String(s.studentId) === String(studentId));
      const existing = existingIndex >= 0 ? quiz.submissions[existingIndex] : null;

      if (existing?.forfeit) {
        return {
          _status: 403,
          _body: {
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
          },
        };
      }

      if (isForfeit && existing && !existing.forfeit) {
        return {
          _status: 200,
          _body: {
            success: true,
            message: 'Bài đã nộp trước đó',
            data: {
              score: existing.score,
              correctCount: existing.correctCount,
              totalQuestions: existing.totalQuestions,
              status: existing.status,
              forfeit: false,
              exitReason: '',
              submittedAt: existing.submittedAt,
              detailedReview: [],
            },
          },
        };
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

      if (existingIndex >= 0) {
        quiz.submissions[existingIndex] = submissionData;
      } else {
        quiz.submissions.push(submissionData);
      }

      await quiz.save();

      try {
        const teacherId = quiz.teacherId ? String(quiz.teacherId) : '';
        const io = data.app && typeof data.app.get === 'function' ? data.app.get('io') : null;
        if (teacherId) {
          const NotificationService = require('./../../../services/NotificationService');
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

      return {
        _status: 200,
        _body: {
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
        },
      };
    } catch (err) {
      logger.error('[QUIZ] Submit error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi khi chấm điểm nộp bài' } };
    }
  }

  async get_admin_all(data) {
    try {
      const quizzes = await lessonQuizRepository.findMany()
        .sort({ createdAt: -1 })
        .lean();

      return { _status: 200, _body: { success: true, data: quizzes } };
    } catch (err) {
      logger.error('[QUIZ] Admin fetch all error:', err.message);
      return { _status: 500, _body: { success: false, message: 'Lỗi máy chủ khi tải lịch sử trắc nghiệm Admin' } };
    }
  }
}

module.exports = new QuizApplicationService();
