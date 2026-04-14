const express = require('express');
const Evaluation = require('../models/Evaluation');

const router = express.Router();

// ─── ADMIN lấy danh sách phản hồi mật ──────────────────────────────────────
router.get('/admin', async (req, res) => {
  try {
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
router.get('/teacher/:teacherId', async (req, res) => {
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
router.post('/', async (req, res) => {
  try {
    const { studentId, targetTeacherId, courseId, type, criteria, content, studentName, teacherName, courseName, milestone } = req.body;
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
           const newNotif = await Notification.create({
             type: 'EVALUATION',
             title: '⭐ Đánh giá mới từ học viên',
             content: `Học viên ${studentInfo?.name || 'Vô danh'} vừa gửi một đánh giá chất lượng.`,
             receivers: [targetTeacherId.toString()],
             payload: { studentId, evaluationId: newEval._id, type: 'evaluation' }
           });
           
           io.to(targetTeacherId.toString()).emit('RECEIVE_NOTIFICATION', {
             _id: newNotif._id,
             type: 'evaluation',
             title: newNotif.title,
             message: newNotif.content,
             time: new Date(),
             userId: targetTeacherId.toString(),
             read: false,
             link: '/teacher#reviews'
           });
        }
      }
    }
    return res.json({ success: true, data: newEval });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── Đánh dấu đã đọc đánh giá ───────────────────────────────────────────────
router.post('/:id/read', async (req, res) => {
  try {
    const ev = await Evaluation.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    
    ev.read = true;
    ev.isReadByAdmin = true;
    await ev.save();
    
    return res.json({ success: true, message: 'Đã đánh dấu đã xem' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
