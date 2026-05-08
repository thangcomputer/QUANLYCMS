const express = require('express');
const Evaluation = require('../models/Evaluation');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── ADMIN lấy danh sách phản hồi mật ──────────────────────────────────────
router.get('/admin', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    }

    const evals = await Evaluation.find({ type: 'admin_feedback' }).sort({ createdAt: -1 });
    const data = evals.map(e => ({
      ...e.toObject(),
      id: e._id,
      date: new Date(e.createdAt).toLocaleDateString('vi-VN')
    }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Lấy Review Công khai của Giáo viên ────────────────────────────────────
router.get('/teacher/:teacherId', authMiddleware, async (req, res) => {
  try {
    const evals = await Evaluation.find({ type: 'teacher_rating', targetTeacherId: req.params.teacherId }).sort({ createdAt: -1 });
    const data = evals.map(e => ({
      ...e.toObject(),
      id: e._id,
      date: new Date(e.createdAt).toLocaleDateString('vi-VN')
    }));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Học viên gửi đánh giá ──────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { studentId, targetTeacherId, courseId, type, criteria, content, studentName, teacherName, courseName, milestone } = req.body;
    
    // Authorization: Học viên chỉ gửi đánh giá cho chính mình
    if (req.user.role === 'student' && String(req.user.id) !== String(studentId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền gửi đánh giá thay người khác' });
    }

    const newEval = new Evaluation({
      studentId, targetTeacherId, courseId, type, criteria, content, studentName, teacherName, courseName, milestone
    });
    
    await newEval.save();

    const io = req.app.get('io');
    const Notification = require('../models/Notification');
    const Student = require('../models/Student');
    const studentInfo = await Student.findById(studentId);

    if (io) {
      if (type === 'admin_feedback') {
        io.to('admin_room').emit('evaluation:admin_feedback', newEval);
      } else {
        io.to(`teacher_${targetTeacherId}`).emit('evaluation:teacher_rating', newEval);
        
        // Notify Teacher
        if (targetTeacherId && targetTeacherId !== 'current') {
           const NotificationService = require('../services/NotificationService');
           await NotificationService.send(io, {
             type: 'EVALUATION',
             title: '⭐ Đánh giá mới từ học viên',
             content: `Học viên ${studentInfo?.name || 'Vô danh'} đã đánh giá bạn.`,
             receivers: targetTeacherId.toString(),
             payload: { evaluationId: newEval._id },
             link: '/teacher'
           });
           
           io.emit('data:refresh', { type: 'evaluation', targetId: targetTeacherId });
        }
      }
    }
    return res.json({ success: true, data: newEval });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Đánh dấu đã đọc đánh giá ───────────────────────────────────────────────
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'staff' && req.user.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const ev = await Evaluation.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    
    // Authorization: GV chỉ được đánh dấu đã đọc đánh giá của mình
    if (req.user.role === 'teacher' && String(ev.targetTeacherId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    ev.read = true;
    ev.isReadByAdmin = (req.user.role === 'admin' || req.user.role === 'staff');
    await ev.save();
    
    return res.json({ success: true, message: 'Đã đánh dấu đã xem' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
