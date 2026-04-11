const express = require('express');
const Evaluation = require('../models/Evaluation');

const router = express.Router();

// ─── ADMIN lấy danh sách phản hồi mật ──────────────────────────────────────
router.get('/admin', async (req, res) => {
  try {
    const evals = await Evaluation.find({ type: 'admin_feedback' }).sort({ createdAt: -1 });
    return res.json({ success: true, data: evals });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Lấy Review Công khai của Giáo viên ────────────────────────────────────
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const evals = await Evaluation.find({ type: 'teacher_rating', targetTeacherId: req.params.teacherId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: evals });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Học viên gửi đánh giá ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { studentId, targetTeacherId, courseId, type, criteria, content } = req.body;
    const newEval = new Evaluation({
      studentId, targetTeacherId, courseId, type, criteria, content
    });
    
    await newEval.save();

    const io = req.app.get('io');
    if (io) {
      if (type === 'admin_feedback') {
        io.to('admin_room').emit('evaluation:admin_feedback', newEval);
      } else {
        io.to(`teacher_${targetTeacherId}`).emit('evaluation:teacher_rating', newEval);
      }
    }
    return res.json({ success: true, data: newEval });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
