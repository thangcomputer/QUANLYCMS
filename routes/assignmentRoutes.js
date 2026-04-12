const express = require('express');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

const router = express.Router();

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
      // Emit to students in course room
      io.to(`course_${req.body.courseId}`).emit('assignment:new', newAssignment);
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
    }
    return res.json({ success: true, data: submission });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
