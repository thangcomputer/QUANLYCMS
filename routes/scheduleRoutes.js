const express  = require('express');
const router   = express.Router();
const Schedule = require('../models/Schedule');
const Student  = require('../models/Student');
const Teacher  = require('../models/Teacher');
const ScheduleHistory = require('../models/ScheduleHistory');
const { authMiddleware, branchFilter } = require('../middleware/auth');

// ─── Helper: Kiểm tra và tự động Unlock Thi cho Học Viên ─────────────────────
// Workflow 2: Đếm buổi hoàn thành → nếu >= totalSessions thì set studentExamUnlocked = true
async function checkAndUnlockExam(studentId, io) {
  try {
    const student = await Student.findById(studentId);
    if (!student || student.studentExamUnlocked) return;

    // Đếm số buổi đã hoàn thành
    const completedSessions = await Schedule.countDocuments({
      studentId,                 // 1. Đúng định danh học viên
      course: student.course,    // 2. Đúng khóa học hiện tại
      status: 'completed',       // 3. Trạng thái Đã điểm danh
    });

    // Lấy tổng số buổi cần thiết từ học viên
    const totalRequired = student.totalSessions || 12;

    if (completedSessions >= totalRequired) {
      await Student.findByIdAndUpdate(studentId, { studentExamUnlocked: true });

      // Thông báo real-time cho học viên
      if (io) {
        const NotificationService = require('../services/NotificationService');
        NotificationService.send(io, {
          type: 'EXAM',
          title: '🎉 Phòng thi đã được mở khóa!',
          content: `Chúc mừng! Bạn đã hoàn thành ${completedSessions} buổi học. Phòng thi đã được mở khóa!`,
          receivers: student._id.toString(),
          link: '/student/exam'
        });

        io.emit('exam:unlocked', {
          studentId: student._id.toString(),
          studentName: student.name,
        });
        io.emit('data:refresh', { type: 'student', id: student._id });
      }

      console.log(`✅ [SCHEDULE] Unlock thi cho HV: ${student.name} (${completedSessions}/${totalRequired} buổi)`);
    }
  } catch (err) {
    console.error('[SCHEDULE] checkAndUnlockExam error:', err.message);
  }
}

// ─── GET /api/schedules ────────────────────────────────────────────────────────
// Admin/Staff: Lấy lịch học (STAFF chỉ thấy chi nhánh của mình)
router.get('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const { status, date, teacherId, studentId } = req.query;
    const filter = { ...req.branchFilter }; // {} for admin, {branchId:...} for staff

    if (status)    filter.status    = status;
    if (teacherId) filter.teacherId = teacherId;
    if (studentId) filter.studentId = studentId;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.date = { $gte: d, $lt: nextDay };
    }

    const schedules = await Schedule.find(filter)
      .populate('teacherId', 'name phone')
      .populate('studentId', 'name course phone zalo')
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/stats (branch-aware, secured) ────────────────────────
router.get('/stats', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const bf = req.branchFilter;  // {} for admin, {branchId:...} for STAFF
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [total, scheduled, completed, cancelled, thisMonth] = await Promise.all([
      Schedule.countDocuments(bf),
      Schedule.countDocuments({ ...bf, status: 'scheduled' }),
      Schedule.countDocuments({ ...bf, status: 'completed' }),
      Schedule.countDocuments({ ...bf, status: 'cancelled' }),
      Schedule.countDocuments({ ...bf, date: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } }),
    ]);

    res.json({ success: true, data: { total, scheduled, completed, cancelled, thisMonth } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/teacher/:teacherId ─────────────────────────────────────
// Giảng viên xem lịch dạy của mình
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const { status, month } = req.query;
    const filter = { teacherId: req.params.teacherId };
    if (status) filter.status = status;

    if (month) {
      // month = "YYYY-MM"
      const [year, m] = month.split('-').map(Number);
      filter.date = {
        $gte: new Date(year, m - 1, 1),
        $lt:  new Date(year, m,     1),
      };
    }

    const schedules = await Schedule.find(filter)
      .populate('studentId', 'name course zalo')
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/student/:studentId ─────────────────────────────────────
// Học viên xem lịch học của mình
router.get('/student/:studentId', async (req, res) => {
  try {
    const schedules = await Schedule.find({ studentId: req.params.studentId })
      .populate('teacherId', 'name phone avatar specialty')
      .sort({ date: 1, startTime: 1 });

    // Thống kê buổi học
    const completed = schedules.filter(s => s.status === 'completed').length;
    const upcoming  = schedules.filter(s => s.status === 'scheduled').length;

    res.json({
      success: true,
      data: schedules,
      stats: { total: schedules.length, completed, upcoming },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/schedules ───────────────────────────────────────────────────────
// Giảng viên / Admin tạo lịch học mới
router.post('/', async (req, res) => {
  try {
    const {
      teacherId, teacherName: teacherNameInput,
      studentId, studentName: studentNameInput,
      date, startTime, endTime,
      course, linkHoc, note, topic, status
    } = req.body;

    if (!teacherId || !studentId || !date || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: teacherId, studentId, date, startTime',
      });
    }

    // Validate ObjectId format
    const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id));
    if (!isValidObjectId(teacherId)) {
      return res.status(400).json({ success: false, message: `teacherId không hợp lệ: "${teacherId}"` });
    }
    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ success: false, message: `studentId không hợp lệ: "${studentId}". Vui lòng chọn học viên từ danh sách.` });
    }

    // Auto-lookup names nếu không được cung cấp
    let teacherName = teacherNameInput;
    let studentName = studentNameInput;
    let courseFinal = course;

    if (!teacherName || !studentName || !courseFinal) {
      const [teacher, student] = await Promise.all([
        !teacherName ? Teacher.findById(teacherId).select('name').lean() : null,
        (!studentName || !courseFinal) ? Student.findById(studentId).select('name course').lean() : null,
      ]);
      if (!teacherName) teacherName = teacher?.name || 'Giảng viên';
      if (!studentName) studentName = student?.name || 'Học viên';
      if (!courseFinal) courseFinal = student?.course || '';
    }

    if (!courseFinal) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin khóa học (course)' });
    }

    // ✅ ARCHITECTURAL UPGRADE: Anti-Clash Logic (Chống trùng lịch Giảng viên)
    const existingClash = await Schedule.findOne({
      teacherId,
      date: new Date(date),
      startTime,
      status: { $ne: 'cancelled' }
    });
    
    if (existingClash) {
      return res.status(409).json({ 
        success: false, 
        message: `TRÙNG LỊCH: Giảng viên đã có lịch dạy vào ${startTime} ngày ${new Date(date).toLocaleDateString('vi-VN')} (Học viên: ${existingClash.studentName}).` 
      });
    }

    // ✅ COOLDOWN 12H: Chống điểm danh trùng lặp giữa Admin và Giảng viên
    // Chỉ áp dụng khi tạo schedule với status = 'completed' (tức là đang điểm danh)
    const incomingStatus = status || 'scheduled';
    if (incomingStatus === 'completed') {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const lastAttendance = await Schedule.findOne({
        studentId,
        course: courseFinal,
        status: 'completed',
        createdAt: { $gte: twelveHoursAgo },
      }).sort({ createdAt: -1 });

      if (lastAttendance) {
        const diffMs = Date.now() - new Date(lastAttendance.createdAt).getTime();
        const diffHrs = (diffMs / (1000 * 60 * 60)).toFixed(1);
        const remainHrs = (12 - parseFloat(diffHrs)).toFixed(1);
        return res.status(400).json({
          success: false,
          cooldown: true,
          message: `Học viên này đã được điểm danh. Vui lòng thử lại sau ${remainHrs} tiếng.`,
          lastAttendanceAt: lastAttendance.createdAt,
          remainingHours: parseFloat(remainHrs),
        });
      }
    }

    let finalPaidToTeacher = false;
    let paymentStatus = 'pending';
    const studentDoc = await Student.findById(studentId).lean();
    if (studentDoc && studentDoc.teacher_payment_status === 'PAID_IN_ADVANCE') {
       finalPaidToTeacher = true;
       paymentStatus = 'paid';
    }

    const schedule = await Schedule.create({
      teacherId, teacherName,
      studentId, studentName,
      date: new Date(date),
      startTime, endTime: endTime || '',
      course: courseFinal, 
      linkHoc: linkHoc || '',
      note: note || topic || '',
      status: status || 'scheduled',
      is_paid_to_teacher: finalPaidToTeacher,
      paymentStatus: paymentStatus,
    });

    // Populate để trả về đầy đủ
    await schedule.populate([
      { path: 'teacherId', select: 'name phone' },
      { path: 'studentId', select: 'name course' },
    ]);

    // Thông báo real-time cho học viên
    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      if (studentId) {
         const notifDate = new Date(date).toLocaleDateString('vi-VN');
         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '📅 Lịch học mới',
           content: `Lịch học mới vào ngày ${notifDate} lúc ${startTime} đã được thêm.`,
           receivers: studentId.toString(),
           link: '/student#schedule'
         });
      }
      
      io.emit('schedule:new', {
        studentId: studentId.toString(),
        schedule,
      });
      io.emit('data:refresh', { type: 'schedule', action: 'create' });

      // 🔐 Nếu là điểm danh (status=completed), broadcast lock cho toàn hệ thống
      if (schedule.status === 'completed') {
        io.emit('attendance:locked', {
          studentId: studentId.toString(),
          course: courseFinal,
          lockedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          attendedAt: new Date().toISOString(),
          can_check_in: false,
        });
      }
    }

    res.status(201).json({ success: true, data: schedule });

    // 📝 GHI AUDIT LOG: CREATED
    ScheduleHistory.create({
      scheduleId: schedule._id,
      actorId: teacherId,
      actorName: teacherName,
      actorRole: req.user?.role || 'teacher',
      action: 'CREATED',
      reason: '',
      oldValue: null,
      newValue: { status: schedule.status, date: schedule.date, startTime, endTime: endTime || '', studentId, course: courseFinal },
      studentName,
      teacherName,
      scheduledDate: schedule.date,
      course: courseFinal,
    }).catch(e => console.error('[ScheduleHistory] CREATED log err:', e));

  } catch (err) {
    console.error('[SCHEDULE] Create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/schedules/:scheduleId ───────────────────────────────────────────
// Cập nhật lịch học (hoàn thành, huỷ, điểm danh...)
router.put('/:scheduleId', async (req, res) => {
  try {
    const { status, note, linkHoc, startTime, endTime, date } = req.body;

    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }

    // Cập nhật các field được phép
    const updates = {};
    if (status)    updates.status    = status;
    if (note)      updates.note      = note;
    if (linkHoc)   updates.linkHoc   = linkHoc;
    if (startTime) updates.startTime = startTime;
    if (endTime)   updates.endTime   = endTime;
    if (date)      updates.date      = new Date(date);
    if ('studentNote' in req.body) {
      updates.studentNote = req.body.studentNote;
      updates.hasUnreadStudentNote = true; // Bật cờ có tin nhắn mới cho Giảng viên
    }
    if ('hasUnreadStudentNote' in req.body) {
      // Giảng viên click vào xem thì tắt cờ đi
      updates.hasUnreadStudentNote = req.body.hasUnreadStudentNote;
    }

    const io = req.app.get('io');
    if (schedule.studentId && io) {
      const NotificationService = require('../services/NotificationService');
      const notifDate = new Date(schedule.date).toLocaleDateString();
      
      if (status === 'cancelled' && schedule.status !== 'cancelled') {
         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '❌ Lịch học bị hủy',
           content: `Lịch học ngày ${notifDate} đã bị hủy.`,
           receivers: schedule.studentId.toString(),
           link: '/student#schedule'
         });
      }
      else if (status === 'completed' && schedule.status !== 'completed') {
         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '✅ Hệ thống đã điểm danh',
           content: `Giảng viên đã điểm danh buổi học ngày ${notifDate}.`,
           receivers: schedule.studentId.toString(),
           link: '/student#schedule'
         });
      }
      else if ((startTime && startTime !== schedule.startTime) || (date && new Date(date).getTime() !== schedule.date.getTime())) {
         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '🔄 Lịch học đã thay đổi',
           content: `Lịch học đã cập nhật thành: ${startTime || schedule.startTime} ngày ${date ? new Date(date).toLocaleDateString() : notifDate}.`,
           receivers: schedule.studentId.toString(),
           link: '/student#schedule'
         });
      }
    }

    const updated = await Schedule.findByIdAndUpdate(
      req.params.scheduleId,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'teacherId', select: 'name phone' },
      { path: 'studentId', select: 'name course totalSessions studentExamUnlocked' },
    ]);

    // BUSINESS LOGIC: Nếu đánh dấu hoàn thành → kiểm tra unlock thi
    if (status === 'completed' && schedule.studentId) {
      await checkAndUnlockExam(schedule.studentId.toString(), io);

      // Cập nhật remainingSessions của học viên (Tách biệt logic trừ buổi và cộng buổi)
      const student = await Student.findById(schedule.studentId);
      if (student) {
        // Automatically mark as paid if Admin paid in advance
        if (student.teacher_payment_status === 'PAID_IN_ADVANCE') {
           await Schedule.findByIdAndUpdate(schedule._id, { 
             is_paid_to_teacher: true,
             paymentStatus: 'paid'
           });
        }
      }
    }

    // BUSINESS LOGIC: Gửi thông báo chuông cho Giảng viên nếu Học viên gửi Ghi chú (studentNote)
    if ('studentNote' in req.body && schedule.teacherId && io) {
      try {
         const NotificationService = require('../services/NotificationService');
         await NotificationService.send(io, {
           type: 'SYSTEM',
           title: '📝 Ghi chú mới từ học viên',
           content: `Học viên ${schedule.studentName} vừa để lại ghi chú trên lịch học ngày ${new Date(schedule.date).toLocaleDateString('vi-VN')}.`,
           receivers: [schedule.teacherId.toString()],
           payload: { scheduleId: schedule._id, studentId: schedule.studentId, type: 'schedule' }
         });
         
         // Báo chuông
         io.to(schedule.teacherId.toString()).emit('RECEIVE_NOTIFICATION', {
           _id: newNotif._id,
           type: 'schedule',
           title: newNotif.title,
           message: newNotif.content,
           time: new Date(),
           userId: schedule.teacherId.toString()
         });

         // Báo cập nhật calendar
         io.emit('schedule:updated', schedule._id);
      } catch (e) {
         console.error('[SCHEDULE] Notify error:', e);
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[SCHEDULE] Update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/schedules/:scheduleId ────────────────────────────────────────
router.delete('/:scheduleId', async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }
    res.json({ success: true, message: 'Đã xóa lịch học' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/schedules/:scheduleId/cancel ─────────────────────────────────
router.patch('/:scheduleId/cancel', authMiddleware, async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });

    if (schedule.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Lịch này đã bị hủy rồi' });
    }
    if (schedule.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Không thể hủy lịch đã hoàn thành' });
    }
    // Ngăn hủy lịch trong quá khứ (chỉ cho hủy lịch tương lai)
    const schedDate = new Date(schedule.date);
    schedDate.setHours(23, 59, 59, 999);
    if (schedDate < new Date()) {
      return res.status(400).json({ success: false, message: 'Không thể hủy lịch trong quá khứ' });
    }

    const oldValue = { status: schedule.status };
    schedule.status = 'cancelled';
    await schedule.save();

    const actor = req.user || {};
    await ScheduleHistory.create({
      scheduleId: schedule._id,
      actorId: actor.id || actor._id || schedule.teacherId,
      actorName: actor.name || schedule.teacherName || 'Unknown',
      actorRole: actor.role || 'teacher',
      action: 'CANCELLED',
      reason,
      oldValue: { status: schedule.status, startTime: schedule.startTime, endTime: schedule.endTime },
      newValue: { status: 'cancelled', startTime: schedule.startTime, endTime: schedule.endTime },
      studentName: schedule.studentName,
      teacherName: schedule.teacherName,
      scheduledDate: schedule.date,
      course: schedule.course,
    });

    const io = req.app.get('io');
    if (io) io.emit('schedule:cancelled', { scheduleId: schedule._id.toString(), reason });

    res.json({ success: true, data: schedule });
  } catch (err) {
    console.error('[SCHEDULE] Cancel error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/history/:teacherId ───────────────────────────────
// Trả về lịch sử sắp lịch của 1 giảng viên (cho Admin xem)
router.get('/history/:teacherId', authMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { limit = 50, action } = req.query;
    const filter = { actorId: teacherId };
    if (action) filter.action = action;

    const history = await ScheduleHistory.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Thống kê nhanh
    const stats = {
      total: history.length,
      created: history.filter(h => h.action === 'CREATED').length,
      cancelled: history.filter(h => h.action === 'CANCELLED').length,
      cancelRate: history.length > 0
        ? Math.round((history.filter(h => h.action === 'CANCELLED').length / history.length) * 100)
        : 0,
    };

    res.json({ success: true, data: history, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
