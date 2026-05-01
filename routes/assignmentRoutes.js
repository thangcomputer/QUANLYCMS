const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

const router = express.Router();

// Tự động tạo thư mục uploads/assignments nếu chưa có
const uploadDir = path.join(__dirname, '..', 'uploads', 'assignments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình Multer cho Bài tập (Giới hạn 3MB)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // Giới hạn 3MB
  fileFilter: (req, file, cb) => {
    // Chỉ cho phép các định dạng cơ bản: zip, rar, pdf, doc, docx, xls, xlsx, v.v
    const allowed = /zip|rar|tar|7z|pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('Chỉ hỗ trợ file Văn bản, Cờ, hoặc Nén (Tối đa 3MB)!'));
  }
});

// ─── Tải file đính kèm/nộp bài chung ─────────────────────────────────────────
router.post('/upload', upload.single('file'), (req, res) => {
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
router.get('/course/:courseId', async (req, res) => {
  try {
    const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
    // Dành cho giáo viên: kèm theo submissions của bài đó
    const data = await Promise.all(assignments.map(async (a) => {
      const subs = await Submission.find({ assignmentId: a._id }).populate('studentId', 'name email avatar');
      return { ...a.toObject(), submissions: subs };
    }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error("error GET /course/:courseId:", err);
    return res.status(500).json({ success: false, message: 'Lỗi server', err: err.message });
  }
});

// ─── Lấy Bài tập cho Học viên (Kèm Submission cá nhân) ─────────────────────
router.get('/student/:studentId/course/:courseId', async (req, res) => {
  try {
    const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
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
router.post('/', async (req, res) => {
  try {
    const newAssignment = new Assignment(req.body);
    await newAssignment.save();

    const io = req.app.get('io');
    if (io) {
      // Emit generic event to room
      io.to(`course_${req.body.courseId}`).emit('assignment:new', newAssignment);
      
      try {
        const NotificationService = require('../services/NotificationService');
        const Student = require('../models/Student');
        
        // Find all students in this course
        const students = await Student.find({ course: req.body.courseId }, '_id');
        const studentIds = students.map(s => s._id.toString());
        
        if (studentIds.length > 0) {
          await NotificationService.send(io, {
            type: 'COURSE',
            title: '📝 Bài tập mới',
            content: `Giảng viên vừa giao bài tập mới: "${newAssignment.title}"`,
            receivers: studentIds,
            link: '/student#materials'
          });
        }
        
        io.emit('data:refresh', { type: 'assignment', action: 'create' });
      } catch (e) {
        console.error('Error sending notif for new assignment:', e);
      }
    }
    return res.json({ success: true, data: newAssignment });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Giáo viên cập nhật bài tập ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
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
router.delete('/:id', async (req, res) => {
  try {
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
router.post('/:id/submit', async (req, res) => {
  try {
    const { studentId, teacherId, submittedFileUrl } = req.body;
    let submission = await Submission.findOneAndUpdate(
      { assignmentId: req.params.id, studentId },
      { submittedFileUrl, status: 'submitted', teacherId, submittedAt: new Date() },
      { new: true, upsert: true }
    );

    const io = req.app.get('io');
    const Notification = require('../models/Notification');
    const Student = require('../models/Student');
    const student = await Student.findById(studentId);
    
    if (teacherId && teacherId !== 'current') {
      const newNotif = await Notification.create({
        type: 'COURSE',
        title: '📋 Bài tập mới được nộp',
        content: `Học viên ${student?.name || 'Vô danh'} vừa nộp bài tập.`,
        receivers: [teacherId.toString()],
        payload: { studentId, assignmentId: req.params.id, type: 'assignment' }
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
          link: '/teacher#assignments'
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
router.put('/submissions/:submissionId/grade', async (req, res) => {
  try {
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
        console.error('Error sending notif for grading:', e);
      }
    }
    return res.json({ success: true, data: submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
