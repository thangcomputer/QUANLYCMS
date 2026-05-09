const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Tự động tạo thư mục uploads/assignments nếu chưa có
const uploadDir = path.join(__dirname, '..', 'uploads', 'assignments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình Multer cho Bài tập (Giới hạn 3MB)
const ALLOWED_ASSIGNMENT_EXT = new Set([
  '.zip', '.rar', '.tar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png',
]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = ALLOWED_ASSIGNMENT_EXT.has(rawExt) ? rawExt : '';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeField = String(file.fieldname || 'file').replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${safeField}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // Giới hạn 3MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_ASSIGNMENT_EXT.has(ext)) {
      return cb(new Error('Định dạng file không được phép. Chỉ hỗ trợ ZIP/RAR/PDF/DOC/XLS/PPT/JPG/PNG.'));
    }
    const mime = String(file.mimetype || '').toLowerCase();
    const okMime = /^(application\/(zip|x-(rar|7z)-compressed|x-tar|pdf|msword|vnd\.|octet-stream)|image\/(jpeg|png))/.test(mime);
    if (!okMime) {
      return cb(new Error('MIME type không khớp định dạng cho phép.'));
    }
    cb(null, true);
  }
});

// ─── Tải file đính kèm/nộp bài chung ─────────────────────────────────────────
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file để tải lên' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/assignments/${req.file.filename}`;
    return res.json({ success: true, fileUrl, message: 'Tải file lên thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server khi tải file' });
  }
});

// Error handling cho multer lỗi kích thước
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File tải lên quá lớn. Xin vui lòng giới hạn dưới 3MB!' });
    }
  } else if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

// ─── Lấy danh sách giao bài (Theo Course) ──────────────────────────────────
router.get('/course/:courseId', authMiddleware, async (req, res) => {
  try {
    const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
    
    // Dành cho giáo viên: kèm theo submissions của bài đó
    const data = await Promise.all(assignments.map(async (a) => {
      const subs = await Submission.find({ assignmentId: a._id }).populate('studentId', 'name email avatar');
      return { ...a.toObject(), submissions: subs };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    logger.error("error GET /course/:courseId:", err);
    return res.status(500).json({ success: false, message: 'Lỗi server', err: err.message });
  }
});

// ─── Lấy Bài tập cho Học viên (Kèm Submission cá nhân) ─────────────────────
router.get('/student/:studentId/course/:courseId', authMiddleware, async (req, res) => {
  try {
    // Authorization: Học viên chỉ xem bài của mình
    if (req.user.role === 'student' && String(req.user.id || req.user._id) !== String(req.params.studentId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem bài tập của học viên khác' });
    }

    // Course matching: tolerate case/whitespace differences, and handle "course code" vs "full label"
    // Examples:
    // - stored courseId: "THVP" while student.course: "THVP NÂNG CAO (12 BUỔI)"
    // - stored courseId: "THVP Nâng Cao" vs "THVP  NÂNG   CAO"
    const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rawCourse = String(req.params.courseId || '');
    const normalizedCourse = rawCourse.trim().replace(/\s+/g, ' ');
    const spaced = escapeRegex(normalizedCourse).replace(/\\ /g, '\\s+');
    const exactCourseRegex = new RegExp(`^${spaced}$`, 'i');

    // Try to extract a short "course code" token (e.g. THVP, MOS, AUTOCAD, PYTHON)
    const token = (normalizedCourse.match(/[A-Z0-9]{2,}/) || [])[0] || '';
    const tokenRegex = token ? new RegExp(escapeRegex(token), 'i') : null;

    // Chỉ bài giao đích danh cho học viên này (bài cũ không có studentId không còn hiển thị ở đây)
    const sid = String(req.params.studentId || '');
    const studentOnlyScope = {
      $or: [
        { studentId: sid },
        ...(mongoose.Types.ObjectId.isValid(sid)
          ? [{ studentId: new mongoose.Types.ObjectId(sid) }]
          : []),
      ],
    };

    const assignments = await Assignment.find({
      $and: [
        {
          $or: [
            { courseId: { $regex: exactCourseRegex } },
            { courseId: { $regex: new RegExp(escapeRegex(normalizedCourse), 'i') } },
            ...(tokenRegex ? [{ courseId: { $regex: tokenRegex } }] : []),
          ],
        },
        studentOnlyScope,
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200);
    const data = await Promise.all(assignments.map(async (a) => {
      const sub = await Submission.findOne({ assignmentId: a._id, studentId: req.params.studentId });
      return { ...a.toObject(), mySubmission: sub };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Giáo viên tạo bài tập ─────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền tạo bài tập' });
    }

    const role = String(req.user.role || '').toLowerCase();
    const userId = String(req.user.id || req.user._id || '');
    const userName = String(req.user.name || req.user.fullName || req.user.username || '').trim();

    const payload = { ...req.body };
    if (payload.studentId != null && String(payload.studentId).trim() !== '') {
      const rawSid = String(payload.studentId).trim();
      if (mongoose.Types.ObjectId.isValid(rawSid)) {
        payload.studentId = rawSid;
      } else {
        delete payload.studentId;
      }
    } else {
      payload.studentId = null;
    }
    // Teacher tạo bài → tự gán teacherId nếu thiếu
    if (role === 'teacher' && !payload.teacherId) payload.teacherId = userId;
    // Admin/Staff tạo bài → teacherId optional (null)
    if ((role === 'admin' || role === 'staff') && (payload.teacherId === 'admin' || payload.teacherId === '')) {
      payload.teacherId = null;
    }

    payload.assignedById = userId;
    payload.assignedByRole = role;
    payload.assignedByName = userName || (role === 'teacher' ? 'Giảng viên' : 'Admin');

    const newAssignment = new Assignment(payload);
    await newAssignment.save();

    const io = req.app.get('io');
    if (io) {
      if (newAssignment.studentId) {
        io.to(`student_${newAssignment.studentId}`).emit('assignment:new', newAssignment);
      } else {
        io.to(`course_${req.body.courseId}`).emit('assignment:new', newAssignment);
      }

      try {
        const NotificationService = require('../services/NotificationService');

        let studentIds;
        if (newAssignment.studentId) {
          studentIds = [newAssignment.studentId.toString()];
        } else {
          const students = await Student.find({ course: req.body.courseId }, '_id');
          studentIds = students.map(s => s._id.toString());
        }

        if (studentIds.length > 0) {
          await NotificationService.send(io, {
            type: 'COURSE',
            title: '📝 Bài tập mới',
            content: `${newAssignment.assignedByRole === 'teacher' ? 'Giảng viên' : 'Admin'} vừa giao bài tập mới: "${newAssignment.title}"`,
            receivers: studentIds,
            link: '/student#materials'
          });
        }

        io.emit('data:refresh', { type: 'assignment', action: 'create' });
      } catch (e) {
        logger.error('Error sending notif for new assignment:', e);
      }
    }
    return res.json({ success: true, data: newAssignment });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Giáo viên cập nhật bài tập ────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa bài tập' });
    }

    const updated = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });
    
    const io = req.app.get('io');
    if (io) io.to(`course_${updated.courseId}`).emit('assignment:updated', updated);
    
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Giáo viên xóa bài tập ─────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa bài tập' });
    }

    const deleted = await Assignment.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });
    
    await Submission.deleteMany({ assignmentId: req.params.id });
    
    const io = req.app.get('io');
    if (io) io.to(`course_${deleted.courseId}`).emit('assignment:deleted', deleted._id);
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Học viên nộp bài ──────────────────────────────────────────────────────
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { studentId, teacherId, submittedFileUrl } = req.body;

    const assignmentForSubmit = await Assignment.findById(req.params.id);
    if (!assignmentForSubmit) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' });
    }
    if (assignmentForSubmit.studentId && String(assignmentForSubmit.studentId) !== String(studentId)) {
      return res.status(403).json({ success: false, message: 'Bài tập này không được giao cho bạn' });
    }

    if (req.user.role === 'student' && !assignmentForSubmit.studentId) {
      return res.status(403).json({
        success: false,
        message: 'Bài tập không gắn học viên. Vui lòng nhờ giảng viên giao lại bài.',
      });
    }

    // Authorization: Học viên chỉ được nộp bài cho chính mình
    if (req.user.role === 'student' && String(req.user.id || req.user._id) !== String(studentId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền nộp bài cho học viên khác' });
    }

    let submission = await Submission.findOneAndUpdate(
      { assignmentId: req.params.id, studentId },
      { submittedFileUrl, status: 'submitted', teacherId, submittedAt: new Date() },
      { new: true, upsert: true }
    );

    const io = req.app.get('io');
    const Notification = require('../models/Notification');
    const student = await Student.findById(studentId);
    
    if (teacherId && teacherId !== 'current') {
      const assignment = assignmentForSubmit;
      
      await Notification.create({
        type: 'COURSE',
        title: '📋 Bài tập mới được nộp',
        content: `Học viên ${student?.name || 'Vô danh'} vừa nộp bài tập.`,
        receivers: [teacherId.toString()],
        payload: { studentId, assignmentId: req.params.id, type: 'assignment' },
        path: `/teacher#assignments?courseId=${assignment?.courseId || ''}&assignmentId=${req.params.id}&studentId=${studentId}`
      });

      if (io) {
        const NotificationService = require('../services/NotificationService');
        // Broadcast specific event
        io.to(`teacher_${teacherId}`).emit('submission:new', submission);
        
        // Broadcast general notification
        await NotificationService.send(io, {
          type: 'COURSE',
          title: '📋 Bài tập mới được nộp',
          content: `Học viên ${student?.name || 'Vô danh'} vừa nộp bài tập.`,
          receivers: teacherId.toString(),
          payload: { studentId, assignmentId: req.params.id },
          link: `/teacher#assignments?courseId=${assignment?.courseId || ''}&assignmentId=${req.params.id}&studentId=${studentId}`
        });

        io.emit('data:refresh', { type: 'submission', action: 'create' });
      }
    }
    return res.json({ success: true, data: submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Giáo viên chấm điểm ───────────────────────────────────────────────────
router.put('/submissions/:submissionId/grade', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền chấm điểm' });
    }

    const { grade, teacherFeedback } = req.body;
    const submission = await Submission.findByIdAndUpdate(
      req.params.submissionId,
      { grade, teacherFeedback, status: 'graded' },
      { new: true }
    );

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài nộp' });
    }

    // Lấy thông tin Assignment để làm "note" (VD: Chấm bài: Thực hành Excel Buổi 3)
    const assignment = await Assignment.findById(submission.assignmentId);
    if (assignment) {
      await Student.findByIdAndUpdate(submission.studentId, {
        $push: {
          grades: {
            date: new Date().toISOString(),
            note: `Bài nộp: ${assignment.title} - ${teacherFeedback}`,
            grade: grade
          }
        }
      });
    }

    const io = req.app.get('io');
    if (io) {
      // Emit to student
      io.to(`student_${submission.studentId}`).emit('submission:graded', submission);
      
      try {
        const NotificationService = require('../services/NotificationService');
        await NotificationService.send(io, {
          type: 'EVALUATION',
          title: '✅ Bài tập đã được chấm',
          content: `Giảng viên đã chấm điểm bài tập "${assignment?.title || 'không tên'}". Điểm: ${grade}/10.`,
          receivers: submission.studentId.toString(),
          link: '/student#materials'
        });
        
        io.emit('data:refresh', { type: 'submission', id: submission._id });
      } catch (e) {
        logger.error('Error sending notif for grading:', e);
      }
    }
    return res.json({ success: true, data: submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
