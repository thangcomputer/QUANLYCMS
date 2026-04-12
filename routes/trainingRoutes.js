const express = require('express');
const router = express.Router();
const TrainingCourse = require('../models/TrainingCourse');
const TrainingLesson = require('../models/TrainingLesson');
const TrainingProgress = require('../models/TrainingProgress');
const { authMiddleware } = require('../middleware/auth');

// Lấy danh sách khóa đào tạo
router.get('/courses', authMiddleware, async (req, res) => {
  try {
    const courses = await TrainingCourse.find({ isActive: true });
    res.json({ success: true, data: courses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy danh sách bài học của 1 khóa (Kèm trạng thái khóa/mở)
router.get('/courses/:id/lessons', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const courseId = req.params.id;

    // 1. Lấy tất cả bài học theo thứ tự
    const lessons = await TrainingLesson.find({ courseId, isActive: true }).sort({ orderIndex: 1 });

    // 2. Lấy tiến độ của user cho khóa này
    const progress = await TrainingProgress.find({ userId, courseId });
    const completedLessonIds = progress
      .filter(p => p.status === 'completed')
      .map(p => String(p.lessonId));

    // 3. Xử lý logic Mở khóa tuần tự
    let lastWasCompleted = true; // Bài đầu tiên luôn được mở nếu xét mặc định
    
    const lessonsWithStatus = lessons.map((lesson, index) => {
      const isCompleted = completedLessonIds.includes(String(lesson._id));
      
      // Logic: Bài đầu tiên (index 0) luôn mở. 
      // Các bài sau chỉ mở nếu bài trước đó đã completed.
      const isUnlocked = index === 0 || lastWasCompleted;
      
      // Cập nhật trạng thái cho bài tiếp theo
      lastWasCompleted = isCompleted;

      return {
        ...lesson.toObject(),
        isCompleted,
        isUnlocked
      };
    });

    res.json({ success: true, data: lessonsWithStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Hoàn thành bài học
router.post('/complete-lesson', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { lessonId, courseId } = req.body;

    if (!lessonId || !courseId) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bài học' });
    }

    // Upsert tiến độ
    await TrainingProgress.findOneAndUpdate(
      { userId, lessonId },
      { 
        status: 'completed', 
        courseId,
        completedAt: new Date(),
        lastWatchedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Chúc mừng! Bạn đã hoàn thành bài học này.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// [ADMIN] Theo dõi tiến độ đào tạo của tất cả giảng viên
router.get('/admin/progress/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    const lessons = await TrainingLesson.find({ courseId, isActive: true }).sort({ orderIndex: 1 });
    const totalLessons = lessons.length;
    const lessonIds = lessons.map(l => l._id);

    // Tổng hợp tiến độ theo từng userId
    const allProgress = await TrainingProgress.find({
      courseId,
      lessonId: { $in: lessonIds },
      status: 'completed',
    }).lean();

    // Group theo userId
    const progressMap = {};
    allProgress.forEach(p => {
      const uid = String(p.userId);
      if (!progressMap[uid]) progressMap[uid] = { completedCount: 0, lastActivity: null };
      progressMap[uid].completedCount += 1;
      if (!progressMap[uid].lastActivity || p.completedAt > progressMap[uid].lastActivity) {
        progressMap[uid].lastActivity = p.completedAt;
      }
    });

    const Teacher = require('../models/Teacher');
    const teachers = await Teacher.find({}).select('name phone status').lean();

    const result = teachers.map(t => {
      const uid = String(t._id);
      const prog = progressMap[uid] || { completedCount: 0, lastActivity: null };
      const pct = totalLessons > 0 ? Math.round((prog.completedCount / totalLessons) * 100) : 0;
      return {
        teacherId: uid,
        teacherName: t.name,
        teacherPhone: t.phone,
        status: t.status,
        completedLessons: prog.completedCount,
        totalLessons,
        progressPct: pct,
        isCertified: pct === 100,
        lastActivity: prog.lastActivity,
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
