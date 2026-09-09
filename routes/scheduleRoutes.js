const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Student  = require('../models/Student');
const Teacher  = require('../models/Teacher');
const ScheduleHistory = require('../models/ScheduleHistory');
const { authMiddleware, branchFilter } = require('../middleware/auth');
const logger = require('../config/logger');
const { studentMatchesTeacher } = require('../services/enrollmentService');
const { emitScheduleEvent, emitDataRefresh } = require('../utils/realtimeEmit');
const { policyShadowSchedule } = require('../middleware/policyShadowSchedule');
const { schedulesCutoverGate } = require('../middleware/schedulesCutoverGate');
const { buildActivityEntry } = require('../utils/studentActivityLog');

/** Phase 7.21: policyShadowSchedule → schedulesCutoverGate */
function schedulesGuard(action) {
  return [policyShadowSchedule(action), schedulesCutoverGate(action)];
}

function isAdminOrStaff(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'staff';
}

async function teacherCanAccessStudent(teacherId, studentId) {
  const student = await Student.findById(studentId)
    .select('teacherId enrollments')
    .lean();
  if (!student) return false;
  if (studentMatchesTeacher(student, teacherId)) return true;
  const teacher = await Teacher.findById(teacherId).select('assignedStudents').lean();
  const assigned = (teacher?.assignedStudents || []).map((id) => String(id));
  return assigned.includes(String(studentId));
}

function parseTimeToMinutes(raw) {
  if (raw == null || raw === '') return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

const SESSION_DURATION_MINS = 90;

function addMinutesToTimeHHmm(time, addMins) {
  const mins = parseTimeToMinutes(time);
  if (mins == null) return '';
  const total = Math.min(mins + addMins, 23 * 60 + 59);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Buổi học cố định 1h30 — luôn suy ra end từ start */
function endTimeFromStartOrDefault(startTime, endTime) {
  const fromStart = addMinutesToTimeHHmm(startTime, SESSION_DURATION_MINS);
  if (!fromStart) return String(endTime || '').trim();
  return fromStart;
}

function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = parseTimeToMinutes(start1);
  const s2 = parseTimeToMinutes(start2);
  if (s1 == null || s2 == null) return false;
  const e1 = parseTimeToMinutes(end1) ?? (s1 + SESSION_DURATION_MINS);
  const e2 = parseTimeToMinutes(end2) ?? (s2 + SESSION_DURATION_MINS);
  return s1 < e2 && s2 < e1;
}

function dayRange(dateInput) {
  const d = new Date(dateInput);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function findStudentScheduleClash({ studentId, date, startTime, endTime, excludeScheduleId }) {
  const { start, end } = dayRange(date);
  const filter = {
    studentId,
    date: { $gte: start, $lte: end },
    status: { $ne: 'cancelled' },
  };
  if (excludeScheduleId) filter._id = { $ne: excludeScheduleId };

  const existing = await Schedule.find(filter)
    .select('startTime endTime studentName course teacherName')
    .lean();

  return existing.find((ex) => timeRangesOverlap(startTime, endTime, ex.startTime, ex.endTime)) || null;
}

function formatStudentClashMessage(clash) {
  const course = clash.course ? ` (${clash.course})` : '';
  const end = clash.endTime ? ` - ${clash.endTime}` : '';
  return `TRÙNG LỊCH: Học viên đã có buổi học${course} từ ${clash.startTime}${end} trong ngày này.`;
}

function assertEndAfterStart(startTime, endTime) {
  const end = String(endTime || '').trim();
  if (!end) return null;
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return 'Giờ bắt đầu hoặc kết thúc không hợp lệ';
  if (e <= s) return 'Giờ kết thúc phải lớn hơn giờ bắt đầu';
  return null;
}

/** Thông báo điểm danh: HV + Admin (GV nào · HV nào · buổi thứ mấy). */
async function notifyAttendanceTaken(io, {
  studentId, studentName, teacherName, course, date,
  extraPayload = null,
}) {
  if (!io || !studentId) return;
  const NotificationService = require('../services/NotificationService');
  const { normCourseName } = require('../services/enrollmentService');
  const courseName = String(course || '').trim();
  const courseKey = normCourseName(courseName);
  const sid = mongoose.Types.ObjectId.isValid(studentId)
    ? new mongoose.Types.ObjectId(studentId)
    : studentId;
  let completedCalendar = 0;
  try {
    const rows = await Schedule.aggregate([
      { $match: { studentId: sid, status: 'completed' } },
      { $group: { _id: '$course', completed: { $sum: 1 } } },
    ]);
    rows.forEach((r) => {
      const key = normCourseName(r._id);
      if (courseKey && key !== courseKey) return;
      completedCalendar += Number(r.completed) || 0;
    });
  } catch {
    completedCalendar = await Schedule.countDocuments({
      studentId: sid,
      status: 'completed',
      ...(courseName ? { course: courseName } : {}),
    });
  }
  const student = await Student.findById(studentId)
    .select('name course totalSessions enrollments completedSessions')
    .lean();
  const name = studentName || student?.name || 'Học viên';
  let totalRequired = student?.totalSessions || 12;
  let storedDone = Number(student?.completedSessions) || 0;
  if (courseKey && Array.isArray(student?.enrollments)) {
    const enr = student.enrollments.find(
      (e) => normCourseName(e.courseName || e.course) === courseKey,
    );
    if (enr?.totalSessions) totalRequired = enr.totalSessions;
    if (enr?.completedSessions != null) {
      storedDone = Math.max(storedDone, Number(enr.completedSessions) || 0);
    }
  }
  // Tiến độ hiển thị = max(lịch completed, buổi Admin ghi trên hồ sơ)
  const completedSessions = Math.max(completedCalendar, storedDone);
  const notifDate = date
    ? new Date(date).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN');
  const gv = teacherName || 'Giảng viên';
  const courseLabel = courseName || student?.course || 'khóa học';
  const progress = `${completedSessions}/${totalRequired}`;
  const extras = extraPayload && typeof extraPayload === 'object' ? extraPayload : {};

  await NotificationService.send(io, {
    type: 'SCHEDULE',
    title: '✅ Đã điểm danh buổi học',
    content: `${gv} đã điểm danh bạn ngày ${notifDate} (${courseLabel} · buổi ${progress}).`,
    receivers: String(studentId),
    payload: {
      ...extras,
      kind: 'attendance_taken',
      studentId: String(studentId),
      course: extras.course || courseLabel,
      completedSessions,
      totalRequired,
      sessionNumber: extras.sessionNumber || completedSessions,
      totalSessions: extras.totalSessions || totalRequired,
      teacherName: extras.teacherName || gv,
    },
    link: '/student#schedule',
  });

  await NotificationService.notifyAdmins(
    io,
    '📋 Điểm danh buổi học',
    `GV ${gv} điểm danh HV ${name} — ${courseLabel}: buổi ${progress}.`,
    {
      studentId: String(studentId),
      teacherName: gv,
      course: courseLabel,
      completedSessions,
      totalRequired,
    },
    '/admin/students',
  );

  return { completedSessions, totalRequired, courseLabel, name };
}

/** Thông báo HV hoàn thành khóa (HV + Admin) + socket pháo hoa (sau hết giờ lịch). */
async function notifyCourseCompleted(io, {
  studentId, studentName, courseName, completedSessions, totalRequired, enrollmentId,
}) {
  if (!io || !studentId) return;
  const NotificationService = require('../services/NotificationService');
  const {
    resolveCelebrationShowAfter,
    emitCourseCelebrationSocket,
  } = require('../services/courseCelebration');
  const name = studentName || 'Học viên';
  const course = courseName || 'khóa học';
  const progress = `${completedSessions}/${totalRequired}`;
  const showAfter = await resolveCelebrationShowAfter(studentId, course);
  const payload = {
    studentId: String(studentId),
    course,
    courseName: course,
    completedSessions,
    totalRequired,
    enrollmentId: enrollmentId ? String(enrollmentId) : null,
    showAfter,
  };

  await NotificationService.send(io, {
    type: 'COURSE',
    title: '🎓 Hoàn thành khóa học',
    content: `Chúc mừng! Bạn đã hoàn thành khóa ${course} (${progress} buổi).`,
    receivers: String(studentId),
    payload,
    link: '/student',
  });

  await NotificationService.notifyAdmins(
    io,
    '🎓 Học viên hoàn thành khóa',
    `HV ${name} đã hoàn thành khóa ${course} (${progress} buổi).`,
    payload,
    '/admin/students',
  );
  emitCourseCelebrationSocket(io, payload);
}

// ─── Helper: Kiểm tra và tự động Unlock Thi cho Học Viên ─────────────────────
// Workflow 2: Đếm buổi hoàn thành theo từng khóa → set enrollment.examUnlocked
async function checkAndUnlockExam(studentId, io, courseNameHint) {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;

    if (!student.enrollments?.length && student.course) {
      const { legacyEnrollmentFromStudent } = require('../services/enrollmentService');
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }

    const enrollments = student.enrollments || [];
    if (!enrollments.length) {
      const completedSessions = await Schedule.countDocuments({
        studentId,
        course: student.course,
        status: 'completed',
      });
      const totalRequired = student.totalSessions || 12;
      if (completedSessions < totalRequired) return;

      const justUnlocked = !student.studentExamUnlocked;
      const justCompleted = String(student.status || '') !== 'Hoàn thành';
      if (!justUnlocked && !justCompleted) return;

      const statusPatch = {};
      if (justUnlocked) statusPatch.studentExamUnlocked = true;
      if (justCompleted) {
        statusPatch.status = 'Hoàn thành';
        statusPatch.courseCelebrationSeen = false;
      }
      if (Object.keys(statusPatch).length) {
        await Student.findByIdAndUpdate(studentId, statusPatch);
      }

      if (io) {
        const NotificationService = require('../services/NotificationService');
        if (justUnlocked) {
          NotificationService.send(io, {
            type: 'EXAM',
            title: '🎉 Phòng thi đã được mở khóa!',
            content: `Chúc mừng! Bạn đã hoàn thành ${completedSessions} buổi học. Phòng thi đã được mở khóa!`,
            receivers: student._id.toString(),
            link: '/student/exam',
          });
          emitScheduleEvent(io, {
            branchId: student.branchId,
            studentId: student._id,
            teacherId: student.teacherId,
          }, 'exam:unlocked', {
            studentId: student._id.toString(),
            studentName: student.name,
          });
        }
        if (justCompleted) {
          await notifyCourseCompleted(io, {
            studentId: student._id,
            studentName: student.name,
            courseName: student.course,
            completedSessions,
            totalRequired,
          });
        }
        emitDataRefresh(io, { type: 'student', id: student._id }, {
          branchId: student.branchId,
          userIds: [student._id, student.teacherId].filter(Boolean),
        });
      }
      logger.info(`✅ [SCHEDULE] Unlock thi cho HV: ${student.name} (${completedSessions}/${totalRequired} buổi)`);
      return;
    }

    let changed = false;
    let justUnlockedAny = false;
    const completedCourses = [];
    const hint = String(courseNameHint || '').trim().toLowerCase();
    for (let i = 0; i < enrollments.length; i++) {
      const enr = enrollments[i];
      const courseName = enr.courseName || enr.course || '';
      if (hint && String(courseName).trim().toLowerCase() !== hint) continue;

      const completedSessions = await Schedule.countDocuments({
        studentId,
        course: courseName || student.course,
        status: 'completed',
      });
      const totalRequired = enr.totalSessions || student.totalSessions || 12;
      if (completedSessions < totalRequired) continue;

      const wasUnlocked = enr.examUnlocked === true;
      const wasCompleted = String(enr.status || '').toLowerCase() === 'completed'
        || String(enr.status || '') === 'Hoàn thành';
      if (!wasUnlocked) {
        student.enrollments[i].examUnlocked = true;
        changed = true;
        justUnlockedAny = true;
      }
      if (!wasCompleted) {
        student.enrollments[i].status = 'completed';
        student.enrollments[i].courseCelebrationSeen = false;
        changed = true;
        completedCourses.push({
          courseName,
          completedSessions,
          totalRequired,
          enrollmentId: student.enrollments[i]._id,
        });
      }
      logger.info(`✅ [SCHEDULE] Unlock thi khóa "${courseName}" cho HV: ${student.name} (${completedSessions}/${totalRequired} buổi)`);
    }

    if (!changed) return;

    student.studentExamUnlocked = (student.enrollments || []).some((e) => e.examUnlocked === true);
    if ((student.enrollments || []).every((e) => {
      const st = String(e.status || '').toLowerCase();
      return st === 'completed' || e.status === 'Hoàn thành';
    })) {
      student.status = 'Hoàn thành';
    }
    student.markModified('enrollments');
    await student.save({ validateModifiedOnly: true });

    if (io) {
      const NotificationService = require('../services/NotificationService');
      if (justUnlockedAny) {
        NotificationService.send(io, {
          type: 'EXAM',
          title: '🎉 Phòng thi đã được mở khóa!',
          content: 'Bạn đã hoàn thành đủ buổi học của khóa. Phòng thi khóa học đó đã được mở khóa!',
          receivers: student._id.toString(),
          link: '/student/exam',
        });
        emitScheduleEvent(io, {
          branchId: student.branchId,
          studentId: student._id,
          teacherId: student.teacherId,
        }, 'exam:unlocked', {
          studentId: student._id.toString(),
          studentName: student.name,
        });
      }
      for (const c of completedCourses) {
        await notifyCourseCompleted(io, {
          studentId: student._id,
          studentName: student.name,
          courseName: c.courseName || student.course,
          completedSessions: c.completedSessions,
          totalRequired: c.totalRequired,
          enrollmentId: c.enrollmentId,
        });
      }
      emitDataRefresh(io, { type: 'student', id: student._id }, {
        branchId: student.branchId,
        userIds: [student._id, student.teacherId].filter(Boolean),
      });
    }
  } catch (err) {
    logger.error('[SCHEDULE] checkAndUnlockExam error:', err.message);
  }
}

// ─── GET /api/schedules ────────────────────────────────────────────────────────
// Admin/Staff: Lấy lịch học (STAFF chỉ thấy chi nhánh của mình)
router.get('/', [authMiddleware, branchFilter, ...schedulesGuard('list')], async (req, res) => {
  try {
    const { status, date, teacherId, studentId, page, limit } = req.query;
    const filter = { ...req.branchFilter }; // {} for admin, {branchId:...} for staff
    const role = String(req.user.role || '').toLowerCase();

    // Scope theo role — chặn IDOR dump toàn bộ lịch
    if (role === 'teacher') {
      filter.teacherId = req.user.id;
    } else if (role === 'student') {
      filter.studentId = req.user.id;
    } else if (!isAdminOrStaff(req.user)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem lịch' });
    } else {
      if (teacherId) filter.teacherId = teacherId;
      if (studentId) filter.studentId = studentId;
    }

    if (status)    filter.status    = status;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.date = { $gte: d, $lt: nextDay };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const skip = (pageNum - 1) * limitNum;

    const [schedules, total] = await Promise.all([
      Schedule.find(filter)
        .populate('teacherId', 'name phone')
        .populate('studentId', 'name course phone zalo')
        // Ưu tiên ca mới — tránh limit 500 chỉ còn lịch cũ, mất lịch hủy / ca gần đây
        .sort({ date: -1, startTime: -1 })
        .skip(skip)
        .limit(limitNum),
      Schedule.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: schedules.length,
      total,
      page: pageNum,
      limit: limitNum,
      data: schedules,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/stats (branch-aware, secured) ────────────────────────
router.get('/stats', [authMiddleware, branchFilter, ...schedulesGuard('stats')], async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    let bf = { ...req.branchFilter };
    if (role === 'teacher') bf = { teacherId: req.user.id };
    else if (role === 'student') bf = { studentId: req.user.id };
    else if (!isAdminOrStaff(req.user)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

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
router.get('/teacher/:teacherId', [authMiddleware, ...schedulesGuard('get_teacher')], async (req, res) => {
  try {
    const { status, month } = req.query;
    const filter = { teacherId: req.params.teacherId };
    
    // Authorization: Chỉ chính GV đó hoặc Admin mới được xem
    if (req.user.role !== 'admin' && req.user.role !== 'staff' && String(req.user.id) !== String(req.params.teacherId)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch của người khác' });
    }

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

    // Overdue attendance → idempotent admin notify (non-blocking)
    const io = req.app.get('io');
    if (io) {
      const { maybeNotifyOverdueAttendance, resolveAttendanceState } = (() => {
        const svc = require('../services/attendanceService');
        const win = require('../services/attendanceWindow');
        return {
          maybeNotifyOverdueAttendance: svc.maybeNotifyOverdueAttendance,
          resolveAttendanceState: win.resolveAttendanceState,
        };
      })();
      Promise.all(
        schedules
          .filter((s) => String(s.status) === 'scheduled' && !s.reminderSent)
          .filter((s) => resolveAttendanceState(s).state === 'OVERDUE_ATTENDANCE')
          .slice(0, 20)
          .map((s) => maybeNotifyOverdueAttendance(io, s).catch(() => null)),
      ).catch(() => null);
    }

    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function pickSessionNumber(...candidates) {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function buildAttendanceConfirmPayload(sch) {
  const d = sch.date ? new Date(sch.date) : null;
  const weekday = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' })
    : '';
  const dateLabel = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '';
  const start = sch.startTime || '';
  const end = sch.endTime || '';
  const sessionNumber = pickSessionNumber(
    sch.sessionOrdinalPreview,
    sch.sessionNumber,
    sch.completedSessions,
  );
  const totalSessions = pickSessionNumber(sch.sessionTotalPreview, sch.totalSessions) || null;
  return {
    scheduleId: String(sch._id || sch.id),
    studentId: String(sch.studentId?._id || sch.studentId || ''),
    teacherId: String(sch.teacherId?._id || sch.teacherId || ''),
    teacherName: sch.teacherName || sch.teacherId?.name || 'Giảng viên',
    studentName: sch.studentName || sch.studentId?.name || '',
    course: sch.course || '',
    date: sch.date,
    dateLabel,
    weekday,
    startTime: start,
    endTime: end,
    timeRange: end ? `${start} - ${end}` : start,
    sessionNumber,
    sessionOrdinalPreview: sessionNumber,
    completedSessions: sessionNumber,
    totalSessions,
    sessionTotalPreview: totalSessions,
    studentConfirmStatus: sch.studentConfirmStatus || 'none',
    studentConfirmedAt: sch.studentConfirmedAt || null,
    note: sch.attendancePendingNote || sch.note || '',
  };
}

/** Đảm bảo có số buổi trước khi gửi thông báo (kể cả buổi Admin từ chối / đã hủy). */
async function ensureAttendanceSessionPreview(sch) {
  if (!sch) return sch;
  if (pickSessionNumber(sch.sessionOrdinalPreview)) return sch;
  const { refreshScheduleSessionPreview, resolveSessionOrdinalForSchedule } = require('../services/attendanceService');
  await refreshScheduleSessionPreview(sch);
  if (pickSessionNumber(sch.sessionOrdinalPreview)) return sch;
  const sid = sch.studentId?._id || sch.studentId;
  if (!sid) return sch;
  try {
    const Student = require('../models/Student');
    const student = await Student.findById(sid)
      .select('enrollments course status totalSessions completedSessions')
      .lean();
    if (!student) return sch;
    const progress = await resolveSessionOrdinalForSchedule(student, sch);
    const next = pickSessionNumber(progress?.sessionOrdinal) || 1;
    const total = pickSessionNumber(progress?.sessionTotal, sch.sessionTotalPreview) || 12;
    sch.sessionOrdinalPreview = next;
    sch.sessionTotalPreview = total;
    const id = sch._id || sch.id;
    if (id) {
      await require('../models/Schedule').updateOne(
        { _id: id },
        { $set: { sessionOrdinalPreview: next, sessionTotalPreview: total } },
      ).catch(() => {});
    }
  } catch { /* giữ sch */ }
  return sch;
}

async function emitAttendanceConfirmEvents(io, sch, eventName, extra = {}) {
  if (!io || !sch) return;
  await ensureAttendanceSessionPreview(sch);
  const payload = { ...buildAttendanceConfirmPayload(sch), ...extra };
  const sid = payload.studentId;
  const tid = payload.teacherId;
  try {
    if (sid) {
      io.to(sid).emit(eventName, payload);
      io.to(`student_${sid}`).emit(eventName, payload);
    }
    if (tid) {
      io.to(tid).emit(eventName, payload);
      io.to(`teacher_${tid}`).emit(eventName, payload);
    }
    emitScheduleEvent(io, {
      branchId: sch.branchId,
      teacherId: sch.teacherId,
      studentId: sch.studentId,
    }, eventName, payload);
  } catch (e) {
    logger.warn('[SCHEDULE] confirm emit:', e.message);
  }
}

// HV: lịch đang chờ xác nhận / đang tranh chấp (để mở đúng modal khi bấm thông báo cũ)
router.get('/pending-confirm', [authMiddleware], async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (role !== 'student') {
      return res.status(403).json({ success: false, message: 'Chỉ học viên' });
    }
    const uid = req.user.id || req.user._id;
    const list = await Schedule.find({
      studentId: uid,
      status: 'scheduled',
      studentConfirmStatus: { $in: ['pending', 'disputed'] },
    }).sort({ studentConfirmRequestedAt: -1 }).limit(10).lean();
    const { refreshScheduleSessionPreview } = require('../services/attendanceService');
    const enriched = [];
    for (const sch of list) {
      // eslint-disable-next-line no-await-in-loop
      enriched.push(await refreshScheduleSessionPreview(sch));
    }
    res.json({
      success: true,
      data: enriched.map(buildAttendanceConfirmPayload),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: danh sách tranh chấp điểm danh
router.get('/disputes', [authMiddleware], async (req, res) => {
  try {
    if (!isAdminOrStaff(req.user)) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin/Staff' });
    }
    const list = await Schedule.find({
      status: 'scheduled',
      studentConfirmStatus: 'disputed',
    }).sort({ studentConfirmedAt: -1 }).limit(100).lean();
    const { refreshScheduleSessionPreview } = require('../services/attendanceService');
    const enriched = [];
    for (const sch of list) {
      // eslint-disable-next-line no-await-in-loop
      enriched.push(await refreshScheduleSessionPreview(sch));
    }
    res.json({ success: true, data: enriched.map(buildAttendanceConfirmPayload) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/student/:studentId ─────────────────────────────────────
// Học viên xem lịch học của mình
router.get('/student/:studentId', [authMiddleware, ...schedulesGuard('get_student')], async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    // Authorization: HV chỉ xem mình; Admin/Staff xem; Teacher chỉ HV được gán
    if (role === 'student' && String(req.user.id) !== String(req.params.studentId)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch của học viên khác' });
    }
    if (role === 'teacher') {
      const ok = await teacherCanAccessStudent(req.user.id, req.params.studentId);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch học viên này' });
      }
    } else if (role !== 'student' && !isAdminOrStaff(req.user)) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

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
router.post('/', [authMiddleware, ...schedulesGuard('create')], async (req, res) => {
  try {
    // Authorization: Chỉ Admin, Staff, hoặc Teacher mới được tạo lịch
    if (!['admin', 'staff', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tạo lịch học' });
    }
    let {
      teacherId, teacherName: teacherNameInput,
      studentId, studentName: studentNameInput,
      date, startTime, endTime,
      course, linkHoc, note, topic, status
    } = req.body;

    // Teacher chỉ được tạo lịch cho chính mình + HV được gán
    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
      const ok = await teacherCanAccessStudent(req.user.id, studentId);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được tạo lịch cho học viên được phân công' });
      }
    }

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

    // Mỗi buổi cố định 1h30 — nếu thiếu/lệch endTime thì chuẩn hóa theo startTime
    const resolvedEndTime = endTimeFromStartOrDefault(startTime, endTime);

    const timeErr = assertEndAfterStart(startTime, resolvedEndTime);
    if (timeErr) {
      return res.status(400).json({ success: false, message: timeErr });
    }

    // Shared SoT: enrollment session cap + student daily limit + teacher time overlap
    {
      const {
        validateScheduleCreate,
        sendSchedulingError,
      } = require('../services/schedulingValidation');
      try {
        await validateScheduleCreate({
          studentId,
          teacherId,
          courseName: courseFinal,
          date,
          startTime,
          endTime: resolvedEndTime,
        });
      } catch (valErr) {
        if (valErr.code) return sendSchedulingError(res, valErr);
        throw valErr;
      }
    }

    // ✅ COOLDOWN 12H: Chống điểm danh trùng lặp giữa Admin và Giảng viên
    // Chỉ áp dụng khi tạo schedule với status = 'completed' (tức là đang điểm danh)
    const incomingStatus = status || 'scheduled';
    if (incomingStatus === 'completed') {
      // Server-time attendance window (teachers cannot bypass after grace)
      const { assertAttendanceAllowed } = require('../services/attendanceWindow');
      const lateReason = String(req.body?.lateReason || '').trim();
      try {
        if (String(req.user.role || '').toLowerCase() === 'teacher') {
          assertAttendanceAllowed(
            {
              date,
              startTime,
              endTime: resolvedEndTime,
              status: 'scheduled',
            },
            { lateReason },
          );
        }
      } catch (winErr) {
        if (winErr.code) {
          return res.status(winErr.status || 409).json({
            success: false,
            code: winErr.code,
            message: winErr.message,
          });
        }
        throw winErr;
      }

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
      startTime, endTime: resolvedEndTime,
      course: courseFinal, 
      linkHoc: linkHoc || '',
      note: (() => {
        if (incomingStatus === 'completed') {
          const late = String(req.body?.lateReason || '').trim();
          if (late) return `[LATE] ${late}`;
        }
        return note || topic || '';
      })(),
      status: status || 'scheduled',
      is_paid_to_teacher: finalPaidToTeacher,
      paymentStatus: paymentStatus,
      branchId: studentDoc?.branchId || null,
    });

    // Ghi bản ghi ScheduleHistory kèm tên học viên
    try {
      const actor = req.user || {};
      await ScheduleHistory.create({
        scheduleId: schedule._id,
        actorId: actor.id || actor._id || teacherId,
        actorName: actor.name || teacherName || 'Unknown',
        actorRole: actor.role || 'teacher',
        action: 'CREATED',
        newValue: {
          status: schedule.status,
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
        },
        studentName: studentName || 'Học viên',
        teacherName: teacherName || 'Giảng viên',
        scheduledDate: schedule.date,
        course: courseFinal,
      });
    } catch (histErr) {
      logger.warn('[SCHEDULE] Create history log error:', histErr.message);
    }

    // Populate để trả về đầy đủ
    await schedule.populate([
      { path: 'teacherId', select: 'name phone' },
      { path: 'studentId', select: 'name course' },
    ]);

    // Thông báo real-time
    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      if (studentId) {
        const notifDate = new Date(date).toLocaleDateString('vi-VN');
        if (schedule.status === 'completed') {
          notifyAttendanceTaken(io, {
            studentId,
            studentName,
            teacherName: teacherName || schedule.teacherName || req.user?.name,
            course: courseFinal,
            date,
            extraPayload: buildAttendanceConfirmPayload(schedule),
          }).catch((e) => logger.warn('[SCHEDULE] attendance notify:', e.message));
          checkAndUnlockExam(studentId.toString(), io, courseFinal)
            .catch((e) => logger.warn('[SCHEDULE] unlock after create:', e.message));
        } else {
          NotificationService.send(io, {
            type: 'SCHEDULE',
            title: '📅 Lịch học mới',
            content: `Lịch học mới vào ngày ${notifDate} lúc ${startTime} đã được thêm.`,
            receivers: studentId.toString(),
            link: '/student#schedule',
          });
        }
      }

      const scheduleScope = {
        branchId: schedule.branchId || studentDoc?.branchId || null,
        teacherId: schedule.teacherId,
        studentId: studentId,
      };
      emitScheduleEvent(io, scheduleScope, 'schedule:new', {
        studentId: studentId.toString(),
        schedule,
      });
      emitDataRefresh(io, { type: 'schedule', action: 'create' }, {
        branchId: schedule.branchId,
        userIds: [schedule.teacherId, studentId].filter(Boolean),
      });

      // Điểm danh: lock attendance scoped (không broadcast toàn hệ thống)
      if (schedule.status === 'completed') {
        emitScheduleEvent(io, scheduleScope, 'attendance:locked', {
          studentId: studentId.toString(),
          course: courseFinal,
          lockedUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          attendedAt: new Date().toISOString(),
          can_check_in: false,
        });
      }
    }

    res.status(201).json({ success: true, data: schedule });

    // (ScheduleHistory CREATED đã được ghi ở trên – không ghi lần 2)

  } catch (err) {
    logger.error('[SCHEDULE] Create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/schedules/:scheduleId ───────────────────────────────────────────
// Cập nhật lịch học (hoàn thành, huỷ, điểm danh...)
router.put('/:scheduleId', [authMiddleware, ...schedulesGuard('update')], async (req, res) => {
  try {
    // Authorization:
    // - Admin/Staff/Teacher: sửa lịch đầy đủ
    // - Student: chỉ được gửi ghi chú (studentNote) cho lịch của chính mình
    const role = String(req.user.role || '').toLowerCase();
    const isStaffSide = ['admin', 'staff', 'teacher'].includes(role);
    const isStudent = role === 'student';

    if (!isStaffSide && !isStudent) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa lịch học' });
    }
    const { status, note, linkHoc, startTime, endTime, date, topic, lateReason } = req.body;
    const isRejectMakeup = Boolean(req.body.rejectMakeup);

    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }

    if (isRejectMakeup) {
      if (!isAdminOrStaff(req.user)) {
        return res.status(403).json({ success: false, message: 'Chỉ Admin/Staff từ chối điểm danh bù' });
      }
      if (String(schedule.status) === 'completed') {
        return res.status(409).json({
          success: false,
          message: 'Buổi đã được tính — không thể từ chối điểm danh bù.',
        });
      }
      if (String(schedule.status) === 'cancelled') {
        return res.status(409).json({ success: false, message: 'Buổi này đã hủy.' });
      }
    }

    // Teacher chỉ sửa lịch của mình
    if (role === 'teacher' && String(schedule.teacherId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được chỉnh sửa lịch của chính mình' });
    }

    // ── Canonical attendance: GV → chờ HV xác nhận; Admin makeup → completed ngay ──
    if (status === 'completed' && schedule.status !== 'completed') {
      try {
        const ioAttend = req.app.get('io');
        const actor = {
          id: req.user.id || req.user._id,
          role: req.user.role,
          name: req.user.name,
        };
        const isAdminMakeup = Boolean(req.body.adminMakeup || req.body.makeup);
        const teacherNeedsStudentConfirm = role === 'teacher' && !isAdminMakeup;

        if (teacherNeedsStudentConfirm || req.body.awaitStudentConfirm) {
          const { requestStudentAttendanceConfirm } = require('../services/attendanceService');
          const NotificationService = require('../services/NotificationService');
          const result = await requestStudentAttendanceConfirm({
            schedule,
            actor,
            lateReason: lateReason || note,
            note: note !== undefined ? note : undefined,
            grade: req.body.grade,
          });

          if (ioAttend && result.schedule?.studentId) {
            const payload = buildAttendanceConfirmPayload(result.schedule);
            await NotificationService.send(ioAttend, {
              type: 'SCHEDULE',
              title: '📋 Xác nhận điểm danh buổi học',
              content: `${payload.teacherName} đã điểm danh buổi ${payload.sessionNumber || '?'} — vui lòng xác nhận Đồng ý / Không đồng ý.`,
              receivers: String(payload.studentId),
              payload: { kind: 'attendance_confirm_pending', ...payload },
              link: '/student',
            }).catch((e) => logger.warn('[SCHEDULE] confirm notif:', e.message));

            emitAttendanceConfirmEvents(ioAttend, result.schedule, 'attendance:awaiting-confirm')
              .catch((e) => logger.warn('[SCHEDULE] confirm socket:', e.message));

            emitScheduleEvent(ioAttend, {
              branchId: result.schedule.branchId,
              teacherId: result.schedule.teacherId,
              studentId: result.schedule.studentId,
            }, 'schedule:updated', result.schedule);

            // Khóa điểm danh lại (chưa tính buổi)
            emitScheduleEvent(ioAttend, {
              branchId: result.schedule.branchId,
              teacherId: result.schedule.teacherId,
              studentId: result.schedule.studentId,
            }, 'attendance:locked', {
              studentId: String(result.schedule.studentId._id || result.schedule.studentId),
              course: result.schedule.course,
              can_check_in: false,
              awaitingConfirm: true,
              meta: result.meta,
            });
          }

          return res.json({
            success: true,
            data: result.schedule,
            awaitingStudentConfirm: true,
            meta: result.meta,
          });
        }

        const { completeScheduleAttendance } = require('../services/attendanceService');
        const result = await completeScheduleAttendance({
          schedule,
          actor,
          lateReason: lateReason || note,
          note: note !== undefined ? note : undefined,
          io: ioAttend,
          forceAdminMakeup: isAdminMakeup,
        });

        if (ioAttend && result.schedule?.studentId) {
          notifyAttendanceTaken(ioAttend, {
            studentId: result.schedule.studentId._id || result.schedule.studentId,
            studentName: result.schedule.studentName || result.schedule.studentId?.name,
            teacherName: result.schedule.teacherName || req.user?.name,
            course: result.schedule.course,
            date: result.schedule.date,
            extraPayload: buildAttendanceConfirmPayload(result.schedule),
          }).catch((e) => logger.warn('[SCHEDULE] attendance notify:', e.message));

          if (isAdminMakeup && result.schedule.teacherId) {
            const { notifyTeacherAdminMakeup } = require('../services/teacherAdminNotifier');
            notifyTeacherAdminMakeup(ioAttend, result.schedule, req.user, {
              completedSessions: result.meta?.completedSessions,
              totalSessions: result.meta?.totalSessions,
            })
              .catch((e) => logger.warn('[SCHEDULE] makeup teacher notify:', e.message));
          }
          if (result.schedule.teacherId) {
            const { maybeNotifyStarBonusEligibility } = require('../services/teacherAdminNotifier');
            maybeNotifyStarBonusEligibility(ioAttend, result.schedule.teacherId)
              .catch((e) => logger.warn('[SCHEDULE] starBonus after attendance:', e.message));
          }

          checkAndUnlockExam(
            String(result.schedule.studentId._id || result.schedule.studentId),
            ioAttend,
            result.schedule.course,
          ).catch((e) => logger.warn('[SCHEDULE] unlock:', e.message));

          emitScheduleEvent(ioAttend, {
            branchId: result.schedule.branchId,
            teacherId: result.schedule.teacherId,
            studentId: result.schedule.studentId,
          }, 'schedule:updated', result.schedule);

          emitScheduleEvent(ioAttend, {
            branchId: result.schedule.branchId,
            teacherId: result.schedule.teacherId,
            studentId: result.schedule.studentId,
          }, 'attendance:locked', {
            studentId: String(result.schedule.studentId._id || result.schedule.studentId),
            course: result.schedule.course,
            can_check_in: false,
            meta: result.meta,
          });
        }

        if (result.student?.teacher_payment_status === 'PAID_IN_ADVANCE') {
          await Schedule.findByIdAndUpdate(result.schedule._id, {
            is_paid_to_teacher: true,
            paymentStatus: 'paid',
          });
        }

        if (ioAttend && result.student) {
          emitDataRefresh(ioAttend, { type: 'student', id: result.student._id }, {
            branchId: result.student.branchId,
            userIds: [result.schedule.teacherId, result.student._id].filter(Boolean),
          });
        }

        return res.json({
          success: true,
          data: result.schedule,
          student: result.student
            ? {
              _id: result.student._id,
              completedSessions: result.student.completedSessions,
              remainingSessions: result.student.remainingSessions,
              totalSessions: result.student.totalSessions,
              enrollments: result.student.enrollments,
              courses: result.student.courses,
              status: result.student.status,
            }
            : undefined,
          meta: result.meta,
        });
      } catch (attErr) {
        if (attErr.code) {
          return res.status(attErr.status || 409).json({
            success: false,
            code: attErr.code,
            message: attErr.message,
          });
        }
        throw attErr;
      }
    }

    if (status === 'completed' && schedule.status === 'completed') {
      return res.status(409).json({
        success: false,
        code: 'ATTENDANCE_ALREADY_COMPLETED',
        message: 'Buổi học đã được điểm danh.',
        data: schedule,
      });
    }

    const effectiveStart = startTime || schedule.startTime;
    // Khi đổi giờ bắt đầu (hoặc gửi endTime), luôn khóa kết thúc = start + 1h30
    const effectiveEnd = (startTime || endTime !== undefined)
      ? endTimeFromStartOrDefault(effectiveStart, endTime)
      : (schedule.endTime || endTimeFromStartOrDefault(effectiveStart));
    const effectiveDate = date || schedule.date;
    const timeErr = assertEndAfterStart(effectiveStart, effectiveEnd);
    if (timeErr) {
      return res.status(400).json({ success: false, message: timeErr });
    }

    const timeFieldsChanging = Boolean(startTime || endTime !== undefined || date);
    if (timeFieldsChanging && isStaffSide) {
      const {
        validateScheduleReschedule,
        sendSchedulingError,
      } = require('../services/schedulingValidation');
      try {
        await validateScheduleReschedule({
          studentId: schedule.studentId,
          teacherId: schedule.teacherId,
          courseName: schedule.course,
          date: effectiveDate,
          startTime: effectiveStart,
          endTime: effectiveEnd,
          excludeScheduleId: schedule._id,
          originalDate: schedule.date,
        });
      } catch (valErr) {
        if (valErr.code) return sendSchedulingError(res, valErr);
        throw valErr;
      }
    }

    // Student restriction: chỉ cho phép cập nhật studentNote/hasUnreadStudentNote, đúng lịch của chính mình
    if (isStudent) {
      const myId = String(req.user.id || req.user._id);
      const scheduleStudentId = schedule.studentId ? String(schedule.studentId) : '';
      const onlyStudentNoteChange =
        Object.keys(req.body || {}).every((k) => ['studentNote', 'hasUnreadStudentNote'].includes(k));

      if (!scheduleStudentId || scheduleStudentId !== myId) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ có thể gửi ghi chú cho lịch của chính mình' });
      }
      if (!('studentNote' in req.body) && !('hasUnreadStudentNote' in req.body)) {
        return res.status(400).json({ success: false, message: 'Thiếu studentNote' });
      }
      if (!onlyStudentNoteChange) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ được phép cập nhật ghi chú học viên' });
      }
    }

    // Cập nhật các field được phép
    const updates = {};
    if (status)    updates.status    = status;
    if (linkHoc)   updates.linkHoc   = linkHoc;
    if (startTime) {
      updates.startTime = startTime;
      updates.endTime = endTimeFromStartOrDefault(startTime);
    } else if (endTime !== undefined) {
      updates.endTime = endTimeFromStartOrDefault(schedule.startTime, endTime);
    }
    if (date)      updates.date      = new Date(date);
    const noteVal = note !== undefined ? note : topic;
    if (req.body._lateNote) {
      updates.note = req.body._lateNote;
    } else if (noteVal !== undefined) {
      updates.note = String(noteVal).trim();
    }
    if ('studentNote' in req.body) {
      const nextStudentNote = String(req.body.studentNote || '').trim();
      updates.studentNote = nextStudentNote;
      updates.hasUnreadStudentNote = Boolean(nextStudentNote);
    }
    if ('hasUnreadStudentNote' in req.body && !('studentNote' in req.body)) {
      // Giảng viên click vào xem thì tắt cờ đi
      updates.hasUnreadStudentNote = req.body.hasUnreadStudentNote;
    }
    if (status === 'cancelled' && String(schedule.status) !== 'cancelled') {
      updates.cancelledAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Không có thông tin để cập nhật' });
    }

    const io = req.app.get('io');
    // Lý do hủy — ghi vào note trước khi save (emit socket sau DB write)
    const cancelReason = (status === 'cancelled' && schedule.status !== 'cancelled')
      ? String(req.body?.cancelReason || req.body?.reason || req.body?.note || '').trim()
      : '';
    if (cancelReason) updates.note = cancelReason;

    const updated = await Schedule.findByIdAndUpdate(
      req.params.scheduleId,
      updates,
      { returnDocument: 'after', runValidators: true }
    ).populate([
      { path: 'teacherId', select: 'name phone' },
      { path: 'studentId', select: 'name course totalSessions studentExamUnlocked' },
    ]);

    // Thông báo + realtime SAU khi DB commit — tránh HV refetch còn thấy lịch cũ
    if (schedule.studentId && io && updated) {
      const NotificationService = require('../services/NotificationService');
      const notifDate = new Date(updated.date || schedule.date).toLocaleDateString();
      const scheduleScope = {
        branchId: updated.branchId || schedule.branchId,
        teacherId: updated.teacherId?._id || updated.teacherId || schedule.teacherId,
        studentId: updated.studentId?._id || updated.studentId || schedule.studentId,
      };
      const plain = typeof updated.toObject === 'function' ? updated.toObject() : updated;
      const updatedPayload = {
        ...plain,
        _id: String(updated._id),
        id: String(updated._id),
        teacherId: scheduleScope.teacherId,
        studentId: scheduleScope.studentId,
      };

      if (status === 'cancelled' && schedule.status !== 'cancelled') {
         // Ghi ScheduleHistory CANCELLED (route PUT)
         ScheduleHistory.create({
           scheduleId: schedule._id,
           actorId: req.user?.id || req.user?._id || schedule.teacherId,
           actorName: req.user?.name || schedule.teacherName || 'Unknown',
           actorRole: req.user?.role || 'teacher',
           action: 'CANCELLED',
           reason: cancelReason,
           oldValue: { status: schedule.status, startTime: schedule.startTime, endTime: schedule.endTime },
           newValue: { status: 'cancelled', startTime: schedule.startTime, endTime: schedule.endTime },
           studentName: schedule.studentName || updated?.studentId?.name || 'Học viên',
           teacherName: schedule.teacherName || updated?.teacherId?.name || 'Giảng viên',
           scheduledDate: schedule.date,
           course: schedule.course,
         }).catch(e => logger.warn('[ScheduleHistory] PUT CANCELLED log err:', e.message));

         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '❌ Lịch học bị hủy',
           content: cancelReason
             ? `Lịch học ngày ${notifDate} đã bị hủy. Lý do: ${cancelReason}`
             : `Lịch học ngày ${notifDate} đã bị hủy.`,
           receivers: String(scheduleScope.studentId),
           payload: { scheduleId: String(updated._id), reason: cancelReason },
           link: '/student#schedule'
         }).catch((e) => logger.warn('[SCHEDULE] cancel notif:', e.message));

         if (isRejectMakeup && scheduleScope.teacherId) {
           const { notifyTeacherMakeupRejected } = require('../services/teacherAdminNotifier');
           notifyTeacherMakeupRejected(io, schedule, req.user).catch(() => {});
         }

         emitScheduleEvent(io, scheduleScope, 'schedule:cancelled', {
           ...updatedPayload,
           scheduleId: String(updated._id),
           reason: cancelReason,
           status: 'cancelled',
         });
      } else if (
        (startTime && startTime !== schedule.startTime)
        || (date && new Date(date).getTime() !== new Date(schedule.date).getTime())
        || (endTime !== undefined && String(endTime) !== String(schedule.endTime || ''))
      ) {
         // Ghi ScheduleHistory UPDATED (đổi giờ / ngày)
         ScheduleHistory.create({
           scheduleId: schedule._id,
           actorId: req.user?.id || req.user?._id || schedule.teacherId,
           actorName: req.user?.name || schedule.teacherName || 'Unknown',
           actorRole: req.user?.role || 'teacher',
           action: 'UPDATED',
           reason: `Đổi ca: ${schedule.startTime || '?'}–${schedule.endTime || '?'} → ${updated.startTime || schedule.startTime}–${updated.endTime || schedule.endTime}`,
           oldValue: { status: schedule.status, date: schedule.date, startTime: schedule.startTime, endTime: schedule.endTime },
           newValue: { status: updated.status, date: updated.date, startTime: updated.startTime, endTime: updated.endTime },
           studentName: schedule.studentName || updated?.studentId?.name || 'Học viên',
           teacherName: schedule.teacherName || updated?.teacherId?.name || 'Giảng viên',
           scheduledDate: updated.date || schedule.date,
           course: schedule.course,
         }).catch(e => logger.warn('[ScheduleHistory] PUT UPDATED log err:', e.message));

         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '🔄 Lịch học đã thay đổi',
           content: `Lịch học đã cập nhật thành: ${updated.startTime || schedule.startTime} ngày ${notifDate}.`,
           receivers: String(scheduleScope.studentId),
           link: '/student#schedule'
         }).catch((e) => logger.warn('[SCHEDULE] reschedule notif:', e.message));
      }

      // Đổi giờ/ngày/hủy/link/topic: HV + GV nhận document mới (trừ khi chỉ studentNote — emit riêng bên dưới)
      const onlyStudentNote =
        'studentNote' in req.body
        && Object.keys(updates).every((k) => ['studentNote', 'hasUnreadStudentNote'].includes(k));
      if (!onlyStudentNote) {
        emitScheduleEvent(io, scheduleScope, 'schedule:updated', updatedPayload);
        emitDataRefresh(io, { type: 'schedule', id: String(updated._id), action: status || 'update' }, {
          branchId: scheduleScope.branchId,
          userIds: [scheduleScope.teacherId, scheduleScope.studentId].filter(Boolean),
        });
      }
    }

    const slotChanged = Boolean(
      (startTime && startTime !== schedule.startTime)
      || (date && new Date(date).getTime() !== new Date(schedule.date).getTime())
    );
    if (schedule.studentId && slotChanged) {
      try {
        const oldD = new Date(schedule.date).toLocaleDateString('vi-VN');
        const newD = new Date(effectiveDate).toLocaleDateString('vi-VN');
        const oldT = [schedule.startTime, schedule.endTime].filter(Boolean).join('–');
        const newT = [effectiveStart, effectiveEnd].filter(Boolean).join('–');
        const changeNote = `Đổi lịch: ${oldD}${oldT ? ` · ${oldT}` : ''} → ${newD}${newT ? ` · ${newT}` : ''}`;
        await Student.findByIdAndUpdate(schedule.studentId, {
          $push: {
            activityLog: {
              $each: [buildActivityEntry({
                type: 'schedule_change',
                date: newD,
                note: changeNote,
                actor: req.user,
                scheduleId: schedule._id,
                course: schedule.course || '',
              })],
              $slice: -100,
            },
          },
        });
      } catch (e) {
        logger.warn('[SCHEDULE] activityLog change append failed:', e?.message || e);
      }
    }

    // BUSINESS LOGIC: Nếu đánh dấu hoàn thành → kiểm tra unlock thi
    if (status === 'completed' && schedule.status !== 'completed' && schedule.studentId) {
      if (io) {
        notifyAttendanceTaken(io, {
          studentId: schedule.studentId,
          studentName: schedule.studentName || updated?.studentId?.name,
          teacherName: schedule.teacherName || req.user?.name,
          course: schedule.course,
          date: schedule.date,
          extraPayload: buildAttendanceConfirmPayload(updated || schedule),
        }).catch((e) => logger.warn('[SCHEDULE] attendance notify:', e.message));
      }
      await checkAndUnlockExam(schedule.studentId.toString(), io, schedule.course);

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
    if ('studentNote' in req.body && io) {
      const nextStudentNote = String(req.body.studentNote || '').trim();
      const live = updated || schedule;
      try {
         if (nextStudentNote && schedule.teacherId) {
           const NotificationService = require('../services/NotificationService');
           await NotificationService.send(io, {
             type: 'SYSTEM',
             title: '📝 Ghi chú mới từ học viên',
             content: `Học viên ${schedule.studentName} vừa để lại ghi chú trên lịch học ngày ${new Date(schedule.date).toLocaleDateString('vi-VN')}.`,
             receivers: [schedule.teacherId.toString()],
             payload: {
               kind: 'student_schedule_note',
               type: 'schedule',
               scheduleId: schedule._id.toString(),
               studentId: schedule.studentId,
               studentName: schedule.studentName || '',
               studentNote: nextStudentNote,
               date: schedule.date,
               startTime: schedule.startTime || '',
               endTime: schedule.endTime || '',
               course: schedule.course || '',
             },
             link: '/teacher#schedule',
           });
         } else if (!nextStudentNote) {
           const NotificationService = require('../services/NotificationService');
           await NotificationService.retractStudentScheduleNotes(io, {
             scheduleId: schedule._id,
             teacherId: schedule.teacherId,
             studentName: schedule.studentName || '',
             dateLabel: new Date(schedule.date).toLocaleDateString('vi-VN'),
           });
         }

         const raw = live && typeof live.toObject === 'function' ? live.toObject() : live;
         emitScheduleEvent(io, {
           branchId: live.branchId || schedule.branchId,
           teacherId: live.teacherId || schedule.teacherId,
           studentId: live.studentId || schedule.studentId,
         }, 'schedule:updated', {
           ...(raw || {}),
           _id: String(live._id || schedule._id),
           id: String(live._id || schedule._id),
           studentNote: nextStudentNote,
           hasUnreadStudentNote: Boolean(nextStudentNote),
           teacherId: live.teacherId?._id || live.teacherId || schedule.teacherId,
           studentId: live.studentId?._id || live.studentId || schedule.studentId,
         });
      } catch (e) {
         logger.error('[SCHEDULE] Notify error:', e);
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error('[SCHEDULE] Update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/schedules/:scheduleId ────────────────────────────────────────
router.delete('/:scheduleId', [authMiddleware, ...schedulesGuard('delete')], async (req, res) => {
  try {
    // Authorization: Chỉ Admin/Staff mới được xóa vĩnh viễn lịch
    if (!['admin', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa lịch học' });
    }
    const schedule = await Schedule.findByIdAndDelete(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }
    res.json({ success: true, message: 'Đã xóa lịch học' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/schedules/:scheduleId/student-confirm ──────────────────────────
// HV: đồng ý / không đồng ý điểm danh
router.post('/:scheduleId/student-confirm', [authMiddleware], async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (role !== 'student') {
      return res.status(403).json({ success: false, message: 'Chỉ học viên xác nhận điểm danh' });
    }
    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }
    const { respondStudentAttendanceConfirm } = require('../services/attendanceService');
    const NotificationService = require('../services/NotificationService');
    const io = req.app.get('io');
    const result = await respondStudentAttendanceConfirm({
      schedule,
      actor: { id: req.user.id || req.user._id, role: req.user.role, name: req.user.name },
      decision: req.body.decision || req.body.action,
    });

    const sch = result.schedule;
    const { refreshScheduleSessionPreview } = require('../services/attendanceService');
    await refreshScheduleSessionPreview(sch);
    const payload = buildAttendanceConfirmPayload(sch);
    const tid = payload.teacherId;
    const sid = payload.studentId;

    if (result.meta?.disputed) {
      if (io) {
        await NotificationService.notifyAdmins(
          io,
          '⚠️ Tranh chấp điểm danh buổi học',
          `HV ${payload.studentName} không đồng ý điểm danh buổi ${payload.sessionNumber || '?'} — GV ${payload.teacherName} · ${payload.course} · ${payload.dateLabel} ${payload.timeRange}.`,
          { kind: 'attendance_dispute', ...payload },
          '/admin/students',
        ).catch((e) => logger.warn('[SCHEDULE] dispute admin notif:', e.message));

        if (tid) {
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: '⚠️ Học viên không đồng ý điểm danh',
            content: `HV ${payload.studentName} không xác nhận buổi ${payload.sessionNumber || '?'} — đang giải quyết (chờ Admin).`,
            receivers: tid,
            payload: { kind: 'attendance_dispute', ...payload },
            link: '/teacher#students',
          }).catch(() => {});
        }
        if (sid) {
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: 'Đã gửi tranh chấp điểm danh',
            content: `Buổi ${payload.sessionNumber || '?'} đang được Admin giải quyết. Chưa tính vào tiến độ.`,
            receivers: sid,
            payload: { kind: 'attendance_dispute', ...payload },
            link: '/student#schedule',
          }).catch(() => {});
        }
        await emitAttendanceConfirmEvents(io, sch, 'attendance:disputed');
      }
      return res.json({ success: true, disputed: true, data: sch, meta: result.meta });
    }

    // Accepted → completed
    if (io && sch?.studentId) {
      notifyAttendanceTaken(io, {
        studentId: sch.studentId._id || sch.studentId,
        studentName: sch.studentName || sch.studentId?.name,
        teacherName: sch.teacherName || sch.teacherId?.name,
        course: sch.course,
        date: sch.date,
        extraPayload: payload,
      }).catch(() => {});

      if (tid) {
        await NotificationService.send(io, {
          type: 'SCHEDULE',
          title: '✅ Học viên đã xác nhận điểm danh',
          content: `HV ${payload.studentName} đồng ý buổi ${payload.sessionNumber || '?'} — buổi đã được tính.`,
          receivers: tid,
          payload: { kind: 'attendance_confirmed', ...payload },
          link: '/teacher#students',
        }).catch(() => {});
      }

      if (sch.teacherId) {
        const { maybeNotifyStarBonusEligibility } = require('../services/teacherAdminNotifier');
        maybeNotifyStarBonusEligibility(io, sch.teacherId).catch(() => {});
      }
      checkAndUnlockExam(String(sch.studentId._id || sch.studentId), io, sch.course).catch(() => {});
      await emitAttendanceConfirmEvents(io, sch, 'attendance:confirmed', {
        completedSessions: result.meta?.completedSessions ?? payload.sessionNumber,
        totalSessions: result.meta?.totalSessions ?? payload.totalSessions,
      });
      emitScheduleEvent(io, {
        branchId: sch.branchId,
        teacherId: sch.teacherId,
        studentId: sch.studentId,
      }, 'schedule:updated', sch);
    }

    if (result.student?.teacher_payment_status === 'PAID_IN_ADVANCE') {
      await Schedule.findByIdAndUpdate(sch._id, { is_paid_to_teacher: true, paymentStatus: 'paid' });
    }

    return res.json({
      success: true,
      disputed: false,
      data: sch,
      student: result.student
        ? {
          _id: result.student._id,
          completedSessions: result.student.completedSessions,
          remainingSessions: result.student.remainingSessions,
          totalSessions: result.student.totalSessions,
          enrollments: result.student.enrollments,
          courses: result.student.courses,
          status: result.student.status,
        }
        : undefined,
      meta: result.meta,
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 409).json({ success: false, code: err.code, message: err.message });
    }
    logger.error('[SCHEDULE] student-confirm:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/schedules/:scheduleId/resolve-dispute ──────────────────────────
// Admin: chấp thuận / không chấp thuận buổi tranh chấp
router.post('/:scheduleId/resolve-dispute', [authMiddleware], async (req, res) => {
  try {
    if (!isAdminOrStaff(req.user)) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin/Staff xử lý tranh chấp' });
    }
    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }
    const { resolveAttendanceDispute } = require('../services/attendanceService');
    const NotificationService = require('../services/NotificationService');
    const io = req.app.get('io');
    const result = await resolveAttendanceDispute({
      schedule,
      actor: { id: req.user.id || req.user._id, role: req.user.role, name: req.user.name },
      decision: req.body.decision || req.body.action,
    });

    const sch = result.schedule;
    const { refreshScheduleSessionPreview } = require('../services/attendanceService');
    await refreshScheduleSessionPreview(sch);
    await ensureAttendanceSessionPreview(sch);
    const payload = buildAttendanceConfirmPayload(sch);
    const tid = payload.teacherId;
    const sid = payload.studentId;

    if (result.meta?.rejected) {
      if (io) {
        const sessionLabel = payload.sessionNumber != null ? String(payload.sessionNumber) : '?';
        const msg = `Buổi ${sessionLabel} (${payload.course}) ngày ${payload.dateLabel} không được chấp thuận — không tính vào tiến độ và lương buổi.`;
        if (tid) {
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: '❌ Buổi học không được tính',
            content: msg,
            receivers: tid,
            payload: { kind: 'attendance_rejected', rejected: true, ...payload },
            link: '/teacher#students',
          }).catch(() => {});
        }
        if (sid) {
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: '❌ Buổi học không được tính',
            content: msg,
            receivers: sid,
            payload: { kind: 'attendance_rejected', rejected: true, ...payload },
            link: '/student#schedule',
          }).catch(() => {});
        }
        await emitAttendanceConfirmEvents(io, sch, 'attendance:rejected', { rejected: true });
        emitScheduleEvent(io, {
          branchId: sch.branchId,
          teacherId: sch.teacherId,
          studentId: sch.studentId,
        }, 'schedule:updated', sch);
      }
      return res.json({ success: true, rejected: true, data: sch, meta: result.meta });
    }

    // Approved
    if (io && sch?.studentId) {
      notifyAttendanceTaken(io, {
        studentId: sch.studentId._id || sch.studentId,
        studentName: sch.studentName || sch.studentId?.name,
        teacherName: sch.teacherName || sch.teacherId?.name,
        course: sch.course,
        date: sch.date,
        extraPayload: payload,
      }).catch(() => {});

      const okMsg = `Admin đã chấp thuận buổi ${payload.sessionNumber || '?'} — buổi được tính vào tiến độ và lương.`;
      if (tid) {
        await NotificationService.send(io, {
          type: 'SCHEDULE',
          title: '✅ Admin chấp thuận điểm danh',
          content: okMsg,
          receivers: tid,
          payload: { kind: 'attendance_admin_approved', ...payload },
          link: '/teacher#students',
        }).catch(() => {});
      }
      if (sid) {
        await NotificationService.send(io, {
          type: 'SCHEDULE',
          title: '✅ Điểm danh đã được chấp thuận',
          content: okMsg,
          receivers: sid,
          payload: { kind: 'attendance_admin_approved', ...payload },
          link: '/student#schedule',
        }).catch(() => {});
      }

      if (sch.teacherId) {
        const { maybeNotifyStarBonusEligibility } = require('../services/teacherAdminNotifier');
        maybeNotifyStarBonusEligibility(io, sch.teacherId).catch(() => {});
      }
      checkAndUnlockExam(String(sch.studentId._id || sch.studentId), io, sch.course).catch(() => {});
      await emitAttendanceConfirmEvents(io, sch, 'attendance:confirmed', {
        completedSessions: result.meta?.completedSessions ?? payload.sessionNumber,
        totalSessions: result.meta?.totalSessions ?? payload.totalSessions,
      });
      emitScheduleEvent(io, {
        branchId: sch.branchId,
        teacherId: sch.teacherId,
        studentId: sch.studentId,
      }, 'schedule:updated', sch);
    }

    if (result.student?.teacher_payment_status === 'PAID_IN_ADVANCE') {
      await Schedule.findByIdAndUpdate(sch._id, { is_paid_to_teacher: true, paymentStatus: 'paid' });
    }

    return res.json({
      success: true,
      rejected: false,
      data: sch,
      student: result.student
        ? {
          _id: result.student._id,
          completedSessions: result.student.completedSessions,
          remainingSessions: result.student.remainingSessions,
          totalSessions: result.student.totalSessions,
          enrollments: result.student.enrollments,
          courses: result.student.courses,
          status: result.student.status,
        }
        : undefined,
      meta: result.meta,
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 409).json({ success: false, code: err.code, message: err.message });
    }
    logger.error('[SCHEDULE] resolve-dispute:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/schedules/:scheduleId/cancel ─────────────────────────────────
router.patch('/:scheduleId/cancel', [authMiddleware, ...schedulesGuard('cancel')], async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const schedule = await Schedule.findById(req.params.scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });

    // Authorization: Chỉ Admin/Staff/Teacher được hủy lịch
    if (!['admin', 'staff', 'teacher'].includes(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy lịch học' });
    }
    if (String(req.user.role).toLowerCase() === 'teacher'
        && String(schedule.teacherId) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ được hủy lịch của chính mình' });
    }

    if (schedule.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Lịch này đã bị hủy rồi' });
    }
    if (schedule.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Không thể hủy lịch đã hoàn thành — dùng Hủy điểm danh' });
    }
    // Cho phép hủy ca scheduled kể cả ngày đã qua (điểm danh bù / HV không học)

    const oldValue = { status: schedule.status, note: schedule.note || '' };
    schedule.status = 'cancelled';
    // Persist reason so Student UI can show it (frontend currently renders `sch.note`)
    if (typeof reason === 'string' && reason.trim()) {
      schedule.note = reason.trim();
    }
    await schedule.save();

    // Nhật ký HV: hủy ca (để tab Nhật ký GV hiện được)
    if (schedule.studentId) {
      try {
        const d = new Date(schedule.date).toLocaleDateString('vi-VN');
        const timeRange = [schedule.startTime, schedule.endTime].filter(Boolean).join('–');
        const reasonBit = (typeof reason === 'string' && reason.trim()) ? ` — ${reason.trim()}` : '';
        const cancelCaNote = timeRange
          ? `Hủy ca ngày ${d} · ${timeRange}${reasonBit}`
          : `Hủy ca ngày ${d}${reasonBit}`;
        await Student.findByIdAndUpdate(schedule.studentId, {
          $push: {
            activityLog: {
              $each: [buildActivityEntry({
                type: 'schedule_cancel',
                date: d,
                note: cancelCaNote,
                actor: req.user,
                scheduleId: schedule._id,
                course: schedule.course || '',
              })],
              $slice: -100,
            },
          },
        });
      } catch (e) {
        logger.warn('[SCHEDULE] activityLog cancel append failed:', e?.message || e);
      }
    }

    const actor = req.user || {};
    await ScheduleHistory.create({
      scheduleId: schedule._id,
      actorId: actor.id || actor._id || schedule.teacherId,
      actorName: actor.name || schedule.teacherName || 'Unknown',
      actorRole: actor.role || 'teacher',
      action: 'CANCELLED',
      reason,
      oldValue: { ...oldValue, startTime: schedule.startTime, endTime: schedule.endTime },
      newValue: { status: 'cancelled', startTime: schedule.startTime, endTime: schedule.endTime },
      studentName: schedule.studentName,
      teacherName: schedule.teacherName,
      scheduledDate: schedule.date,
      course: schedule.course,
    });

    const io = req.app.get('io');
    if (io) {
      const scheduleScope = {
        branchId: schedule.branchId,
        teacherId: schedule.teacherId,
        studentId: schedule.studentId,
      };
      const plain = typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;
      const cancelledPayload = {
        ...plain,
        _id: String(schedule._id),
        id: String(schedule._id),
        scheduleId: String(schedule._id),
        status: 'cancelled',
        reason: String(reason || ''),
        teacherId: schedule.teacherId,
        studentId: schedule.studentId,
      };
      emitScheduleEvent(io, scheduleScope, 'schedule:cancelled', cancelledPayload);
      emitScheduleEvent(io, scheduleScope, 'schedule:updated', cancelledPayload);
      emitDataRefresh(io, { type: 'schedule', id: String(schedule._id), action: 'cancelled' }, {
        branchId: schedule.branchId,
        userIds: [schedule.teacherId, schedule.studentId].filter(Boolean),
      });

      // Notify student with reason (if any)
      if (schedule.studentId) {
        try {
          const NotificationService = require('../services/NotificationService');
          const d = new Date(schedule.date).toLocaleDateString('vi-VN');
          await NotificationService.send(io, {
            type: 'SCHEDULE',
            title: '❌ Lịch học bị hủy',
            content: reason && String(reason).trim()
              ? `Lịch học ngày ${d} đã bị hủy. Lý do: ${String(reason).trim()}`
              : `Lịch học ngày ${d} đã bị hủy.`,
            receivers: schedule.studentId.toString(),
            payload: { scheduleId: schedule._id.toString(), type: 'schedule', reason: String(reason || '') },
            link: '/student#schedule'
          });
        } catch (e) {
          logger.error('[SCHEDULE] Cancel notify student error:', e);
        }
      }
    }

    res.json({ success: true, data: schedule });
  } catch (err) {
    logger.error('[SCHEDULE] Cancel error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/history/:teacherId ───────────────────────────────
// Trả về lịch sử sắp lịch của 1 giảng viên (cho Admin xem)
router.get('/history/:teacherId', [authMiddleware, ...schedulesGuard('history')], async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!isAdminOrStaff(req.user) && String(req.user.id) !== String(teacherId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem lịch sử lịch dạy này' });
    }
    const { limit = 50, action } = req.query;

    // Tìm tất cả scheduleId thuộc giảng viên này
    const teacherSchedules = await Schedule.find({ teacherId }).select('_id').lean();
    const scheduleIds = teacherSchedules.map(s => s._id);

    const filter = {
      $or: [
        { actorId: teacherId },
        { scheduleId: { $in: scheduleIds } },
      ],
    };
    if (action) filter.action = action;

    const history = await ScheduleHistory.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Loại bỏ bản ghi trùng (cùng scheduleId + action + cùng giây createdAt)
    const seen = new Set();
    const deduped = [];
    for (const h of history) {
      const key = `${h.scheduleId}_${h.action}_${Math.floor(new Date(h.createdAt).getTime() / 5000)}`;
      if (!seen.has(key)) { seen.add(key); deduped.push(h); }
    }
    const historyFinal = deduped.slice(0, Number(limit));

    // Tự động bổ sung studentName cho các bản ghi lịch sử cũ nếu chưa có
    const missingSchedIds = historyFinal.filter(h => !h.studentName && h.scheduleId).map(h => h.scheduleId);
    if (missingSchedIds.length > 0) {
      const schedules = await Schedule.find({ _id: { $in: missingSchedIds } }).select('_id studentName studentId').lean();
      const missingStudentIds = schedules.filter(s => !s.studentName && s.studentId).map(s => s.studentId);
      const students = missingStudentIds.length > 0 ? await Student.find({ _id: { $in: missingStudentIds } }).select('_id name').lean() : [];
      const studentMap = new Map(students.map(s => [s._id.toString(), s.name]));

      const schedMap = new Map(schedules.map(s => [
        s._id.toString(),
        s.studentName || studentMap.get(s.studentId?.toString()) || 'Học viên'
      ]));

      for (const h of historyFinal) {
        if (!h.studentName && h.scheduleId && schedMap.has(h.scheduleId.toString())) {
          h.studentName = schedMap.get(h.scheduleId.toString());
        }
      }
    }

    // Thống kê nhanh
    const createdCount = historyFinal.filter(h => h.action === 'CREATED').length;
    const cancelledCount = historyFinal.filter(h => h.action === 'CANCELLED').length;
    const updatedCount = historyFinal.filter(h => h.action === 'UPDATED').length;
    const stats = {
      total: historyFinal.length,
      created: createdCount,
      cancelled: cancelledCount,
      updated: updatedCount,
      cancelRate: createdCount > 0
        ? Math.round((cancelledCount / createdCount) * 100)
        : 0,
    };

    res.json({ success: true, data: historyFinal, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/schedules/:scheduleId ─────────────────────────────────────────────
router.get('/:scheduleId', [authMiddleware, ...schedulesGuard('list')], async (req, res) => {
  try {
    const id = String(req.params.scheduleId || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID lịch không hợp lệ' });
    }
    const schedule = await Schedule.findById(id).select(
      'studentNote hasUnreadStudentNote studentId teacherId studentName course date startTime endTime status',
    );
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch học' });
    }
    const role = String(req.user.role || '').toLowerCase();
    const uid = String(req.user.id || req.user._id);
    if (role === 'teacher' && String(schedule.teacherId) !== uid) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem lịch này' });
    }
    if (role === 'student' && String(schedule.studentId) !== uid) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem lịch này' });
    }
    if (!['teacher', 'student', 'admin', 'staff'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem lịch' });
    }
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
