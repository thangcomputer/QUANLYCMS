const express = require('express');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');

const router = express.Router();

// ─── Lấy danh sách giao bài (Theo Course) ──────────────────────────────────
router.get('/course/:courseId', async (req, res) => {
  try {
    const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: assignments });
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
      // Emit to students in course room
      io.to(`course_${req.body.courseId}`).emit('assignment:new', newAssignment);
    }
    return res.json({ success: true, data: newAssignment });
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
    if (io) {
      // Emit to teacher
      io.to(`teacher_${teacherId}`).emit('submission:new', submission);
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

    const io = req.app.get('io');
    if (io) {
      // Emit to student
      io.to(`student_${submission.studentId}`).emit('submission:graded', submission);
    }
    return res.json({ success: true, data: submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
