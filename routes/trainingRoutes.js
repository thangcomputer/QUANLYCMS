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

    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne() || {};
    const data = settings.trainingRawData || { videos: [] };
    const course = data.videos.find(c => String(c.id || c._id) === courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Khóa học không tồn tại' });
    
    // Normalize lessons from course structure
    let lessons = [];
    if (course.lessons && course.lessons.length > 0) lessons = course.lessons;
    else if (course.videos && course.videos.length > 0) lessons = course.videos;
    else if (course.chapters && course.chapters.length > 0) {
      course.chapters.forEach(ch => {
        if (ch.lessons) lessons.push(...ch.lessons.map(l => ({ ...l, chapterTitle: ch.title })));
      });
    }

    if (lessons.length === 0 && (course.videoUrl || course.url || course.youtubeUrl || course.link)) {
      lessons = [{ _id: `v-${course.id || course._id}`, title: course.title, videoUrl: course.videoUrl || course.url || course.youtubeUrl || course.link, duration: course.duration || 0 }];
    }

    // Assign consistent _id to each lesson (if not present, use its generated ID)
    lessons = lessons.map((l, i) => ({ ...l, _id: l.id || l._id || `ls-${i}` }));

    // 2. Lấy tiến độ của user cho khóa này
    const progress = await TrainingProgress.find({ userId, courseId });
    const completedLessonIds = progress
      .filter(p => p.status === 'completed')
      .map(p => String(p.lessonId));

    // Map watchedSeconds theo lessonId
    const watchedSecondsMap = {};
    progress.forEach(p => { watchedSecondsMap[String(p.lessonId)] = p.watchedSeconds || 0; });

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
        ...lesson,
        isCompleted,
        isUnlocked,
        watchedSeconds: watchedSecondsMap[String(lesson._id)] || 0,
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
    const { lessonId, courseId, watchedSeconds } = req.body;

    if (!lessonId || !courseId) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bài học' });
    }

    // Upsert tiến độ (kèm watchedSeconds)
    await TrainingProgress.findOneAndUpdate(
      { userId, lessonId },
      { 
        status: 'completed', 
        courseId,
        watchedSeconds: watchedSeconds || 0,
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

// Lấy tổng quan phần trăm hoàn thành của TẤT CẢ khóa học của người dùng hiện tại
router.get('/progress/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const progress = await TrainingProgress.find({ userId, status: 'completed' });
    
    // Đếm số bài đã hoàn thành theo từng khóa
    const completedByCourse = {};
    progress.forEach(p => {
      const cId = String(p.courseId);
      if (!completedByCourse[cId]) completedByCourse[cId] = new Set();
      completedByCourse[cId].add(String(p.lessonId));
    });

    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne() || {};
    const courses = (settings.trainingRawData && settings.trainingRawData.videos) || [];

    const progressMap = {};
    courses.forEach(course => {
      const cId = String(course.id || course._id);
      let courseLessons = course.lessons || course.videos || [];
      if (courseLessons.length === 0 && course.chapters) {
        course.chapters.forEach(ch => {
          if (ch.lessons) courseLessons.push(...ch.lessons);
        });
      }
      // Single video course fallback
      if (courseLessons.length === 0 && (course.videoUrl || course.url || course.youtubeUrl || course.link)) {
         courseLessons = [{ id: `v-${course.id || course._id}` }];
      }
      const total = courseLessons.length;
      const completed = completedByCourse[cId] ? completedByCourse[cId].size : 0;
      progressMap[cId] = total > 0 ? Math.round((completed / total) * 100) : 0;
    });

    res.json({ success: true, data: progressMap });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ⏱ Lưu tiến độ xem tạm thời (auto-save mỗi 30s — chống F5 reset bộ đếm)
router.post('/save-watch-progress', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { lessonId, courseId, watchedSeconds } = req.body;

    if (!lessonId || !courseId || watchedSeconds == null) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });
    }

    // Chỉ cập nhật watchedSeconds nếu chưa completed (tránh ghi đè bài đã hoàn thành)
    await TrainingProgress.findOneAndUpdate(
      { userId, lessonId, status: { $ne: 'completed' } },
      { watchedSeconds, courseId, lastWatchedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true });
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
