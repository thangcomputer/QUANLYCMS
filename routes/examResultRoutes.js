const express    = require('express');
const router     = express.Router();
const ExamResult = require('../models/ExamResult');
const { authMiddleware } = require('../middleware/auth');
const NotificationService = require('../services/NotificationService');

// GET /api/exam-results — lấy tất cả (hoặc lọc theo type)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    
    // Authorization: Admin/Staff/Teacher có thể xem tất cả, Student chỉ xem của mình
    if (req.user.role === 'student') {
      filter.studentId = req.user.id;
    }

    const results = await ExamResult.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/exam-results — thêm kết quả thi mới
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Only Admin, Staff, or Teacher can create exam results
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền tạo kết quả thi' });
    }

    const result = new ExamResult(req.body);
    await result.save();

    // Notify student when an exam result is created/recorded
    const io = req.app.get('io');
    if (io && result.type === 'student' && result.studentId) {
      const subject = result.subject || 'bài thi';
      await NotificationService.send(io, {
        type: 'EXAM',
        title: '📝 Kết quả thi đã được ghi nhận',
        content: `Kết quả ${subject} của bạn đã được cập nhật. Vào mục Phòng Thi để xem chi tiết.`,
        receivers: String(result.studentId),
        payload: { examResultId: String(result._id), studentId: String(result.studentId), subject },
        link: '/student/exam'
      });
      io.emit('data:refresh', { type: 'examResult', id: result._id });
    }

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/exam-results/:id — cập nhật (chấm điểm)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền cập nhật kết quả thi' });
    }

    const result = await ExamResult.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy kết quả thi' });

    // Notify student when result is graded/updated (pass/fail, score)
    const io = req.app.get('io');
    if (io && result.type === 'student' && result.studentId) {
      const subject = result.subject || 'bài thi';
      const mc = (result.multipleChoiceTotal || 0) > 0
        ? `Trắc nghiệm: ${result.multipleChoiceCorrect || 0}/${result.multipleChoiceTotal}`
        : '';
      const essay = typeof result.essayScore === 'number'
        ? `Tự luận/Thực hành: ${result.essayScore}`
        : '';
      const parts = [mc, essay].filter(Boolean).join(' · ');
      const outcome = result.passed ? '✅ ĐẠT' : '❌ KHÔNG ĐẠT';
      await NotificationService.send(io, {
        type: 'EXAM',
        title: `📊 Kết quả thi: ${outcome}`,
        content: parts ? `${subject} — ${outcome}. ${parts}.` : `${subject} — ${outcome}.`,
        receivers: String(result.studentId),
        payload: { examResultId: String(result._id), studentId: String(result.studentId), subject, passed: Boolean(result.passed) },
        link: '/student/exam'
      });
      io.emit('data:refresh', { type: 'examResult', id: result._id });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/exam-results/:id — xóa
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xóa kết quả thi' });
    }

    const result = await ExamResult.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Không tìm thấy kết quả thi' });
    res.json({ success: true, message: 'Đã xóa kết quả thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
