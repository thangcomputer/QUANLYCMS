'use strict';
const { scheduleRepository } = require('./../repositories');
const Schedule = require('./../models/Schedule'); // Temp for new Schedule
const Student  = require('./../../student/models/Student');
const Teacher  = require('./../../teacher/models/Teacher');
const { scheduleHistoryRepository } = require('./../repositories');
const ScheduleHistory = require('./../models/ScheduleHistory'); // Temp for new ScheduleHistory
const logger = require('./../../../config/logger');
const { studentMatchesTeacher } = require('./../../enrollment/services/enrollmentService');

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
  const existing = await scheduleRepository.findMany(filter)
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
}) {
  if (!io || !studentId) return;
  const courseName = String(course || '').trim();
  const match = {
    studentId,
    status: 'completed',
    ...(courseName ? { course: courseName } : {}),
  };
  const completedSessions = await scheduleRepository.count(match);
  const student = await Student.findById(studentId)
    .select('name course totalSessions enrollments')
    .lean();
  const name = studentName || student?.name || 'Học viên';
  let totalRequired = student?.totalSessions || 12;
  if (courseName && Array.isArray(student?.enrollments)) {
    const enr = student.enrollments.find(
      (e) => String(e.courseName || e.course || '').trim().toLowerCase() === courseName.toLowerCase(),
    );
    if (enr?.totalSessions) totalRequired = enr.totalSessions;
  }
  const notifDate = date
    ? new Date(date).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN');
  const gv = teacherName || 'Giảng viên';
  const courseLabel = courseName || student?.course || 'khóa học';
  const progress = `${completedSessions}/${totalRequired}`;
  await NotificationService.send(io, {
    type: 'SCHEDULE',
    title: '✅ Đã điểm danh buổi học',
    content: `${gv} đã điểm danh bạn ngày ${notifDate} (${courseLabel} · buổi ${progress}).`,
    receivers: String(studentId),
    payload: { studentId: String(studentId), course: courseLabel, completedSessions, totalRequired },
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
/** Thông báo HV hoàn thành khóa (HV + Admin) + socket pháo hoa. */
async function notifyCourseCompleted(io, {
  studentId, studentName, courseName, completedSessions, totalRequired, enrollmentId,
}) {
  if (!io || !studentId) return;
  const NotificationService = require('../../notification/services/NotificationService');
  const {
    resolveCelebrationShowAfter,
    emitCourseCelebrationSocket,
  } = require('../../../services/courseCelebration');
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
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const enrollments = student.enrollments || [];
    if (!enrollments.length) {
      const completedSessions = await scheduleRepository.count({
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
        if (justUnlocked) {
          NotificationService.send(io, {
            type: 'EXAM',
            title: '🎉 Phòng thi đã được mở khóa!',
            content: `Chúc mừng! Bạn đã hoàn thành ${completedSessions} buổi học. Phòng thi đã được mở khóa!`,
            receivers: student._id.toString(),
            link: '/student/exam',
          });
          io.emit('exam:unlocked', {
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
        io.emit('data:refresh', { type: 'student', id: student._id });
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
      const completedSessions = await scheduleRepository.count({
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
      if (justUnlockedAny) {
        NotificationService.send(io, {
          type: 'EXAM',
          title: '🎉 Phòng thi đã được mở khóa!',
          content: 'Bạn đã hoàn thành đủ buổi học của khóa. Phòng thi khóa học đó đã được mở khóa!',
          receivers: student._id.toString(),
          link: '/student/exam',
        });
        io.emit('exam:unlocked', {
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
      io.emit('data:refresh', { type: 'student', id: student._id });
    }
  } catch (err) {
    logger.error('[SCHEDULE] checkAndUnlockExam error:', err.message);
  }
}
// ─── GET /api/schedules ────────────────────────────────────────────────────────
// Admin/Staff: Lấy lịch học (STAFF chỉ thấy chi nhánh của mình)

class AttendanceApplicationService {
  async get_root(data) {
  try {
    const { status, date, teacherId, studentId, page, limit } = data.query;
    const filter = { ...data.branchFilter }; // {} for admin, {branchId:...} for staff
    const role = String(data.currentUser.role || '').toLowerCase();

    // Scope theo role — chặn IDOR dump toàn bộ lịch
    if (role === 'teacher') {
      filter.teacherId = data.currentUser.id;
    } else if (role === 'student') {
      filter.studentId = data.currentUser.id;
    } else if (!isAdminOrStaff(data.currentUser)) {
      return { _status: 403, _body: { success: false, message: 'Không có quyền xem lịch' } };
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
    const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10) || 500));
    const skip = (pageNum - 1) * limitNum;

    const [schedules, total] = await Promise.all([
      scheduleRepository.findMany(filter)
        .populate('teacherId', 'name phone')
        .populate('studentId', 'name course phone zalo')
        .sort({ date: 1, startTime: 1 })
        .skip(skip)
        .limit(limitNum),
      scheduleRepository.count(filter),
    ]);

    return { _status: 200, _body: {
      success: true,
      count: schedules.length,
      total,
      page: pageNum,
      limit: limitNum,
      data: schedules,
    } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async get_stats(data) {
  try {
    const role = String(data.currentUser.role || '').toLowerCase();
    let bf = { ...data.branchFilter };
    if (role === 'teacher') bf = { teacherId: data.currentUser.id };
    else if (role === 'student') bf = { studentId: data.currentUser.id };
    else if (!isAdminOrStaff(data.currentUser)) {
      return { _status: 403, _body: { success: false, message: 'Không có quyền' } };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [total, scheduled, completed, cancelled, thisMonth] = await Promise.all([
      scheduleRepository.count(bf),
      scheduleRepository.count({ ...bf, status: 'scheduled' }),
      scheduleRepository.count({ ...bf, status: 'completed' }),
      scheduleRepository.count({ ...bf, status: 'cancelled' }),
      scheduleRepository.count({ ...bf, date: { $gte: startOfMonth, $lte: endOfMonth }, status: { $ne: 'cancelled' } }),
    ]);

    return { _status: 200, _body: { success: true, data: { total, scheduled, completed, cancelled, thisMonth } } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async get_teacher_teacherId(data) {
  try {
    const { status, month } = data.query;
    const filter = { teacherId: data.teacherId };
    
    // Authorization: Chỉ chính GV đó hoặc Admin mới được xem
    if (data.currentUser.role !== 'admin' && data.currentUser.role !== 'staff' && String(data.currentUser.id) !== String(data.teacherId)) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền xem lịch của người khác' } };
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

    const schedules = await scheduleRepository.findMany(filter)
      .populate('studentId', 'name course zalo')
      .sort({ date: 1, startTime: 1 });

    return { _status: 200, _body: { success: true, count: schedules.length, data: schedules } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async get_student_studentId(data) {
  try {
    const role = String(data.currentUser.role || '').toLowerCase();
    // Authorization: HV chỉ xem mình; Admin/Staff xem; Teacher chỉ HV được gán
    if (role === 'student' && String(data.currentUser.id) !== String(data.studentId)) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền xem lịch của học viên khác' } };
    }
    if (role === 'teacher') {
      const ok = await teacherCanAccessStudent(data.currentUser.id, data.studentId);
      if (!ok) {
        return { _status: 403, _body: { success: false, message: 'Bạn không có quyền xem lịch học viên này' } };
      }
    } else if (role !== 'student' && !isAdminOrStaff(data.currentUser)) {
      return { _status: 403, _body: { success: false, message: 'Không có quyền' } };
    }

    const schedules = await scheduleRepository.findMany({ studentId: data.studentId })
      .populate('teacherId', 'name phone avatar specialty')
      .sort({ date: 1, startTime: 1 });

    // Thống kê buổi học
    const completed = schedules.filter(s => s.status === 'completed').length;
    const upcoming  = schedules.filter(s => s.status === 'scheduled').length;

    return { _status: 200, _body: {
      success: true,
      data: schedules,
      stats: { total: schedules.length, completed, upcoming },
    } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async post_root(data) {
  try {
    // Authorization: Chỉ Admin, Staff, hoặc Teacher mới được tạo lịch
    if (!['admin', 'staff', 'teacher'].includes(data.currentUser.role)) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền tạo lịch học' } };
    }
    let {
      teacherId, teacherName: teacherNameInput,
      studentId, studentName: studentNameInput,
      date, startTime, endTime,
      course, linkHoc, note, topic, status
    } = data.body;

    // Teacher chỉ được tạo lịch cho chính mình + HV được gán
    if (data.currentUser.role === 'teacher') {
      teacherId = data.currentUser.id;
      const ok = await teacherCanAccessStudent(data.currentUser.id, studentId);
      if (!ok) {
        return { _status: 403, _body: { success: false, message: 'Bạn chỉ được tạo lịch cho học viên được phân công' } };
      }
    }

    if (!teacherId || !studentId || !date || !startTime) {
      return { _status: 400, _body: {
        success: false,
        message: 'Thiếu thông tin bắt buộc: teacherId, studentId, date, startTime',
      } };
    }

    // Validate ObjectId format
    const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id));
    if (!isValidObjectId(teacherId)) {
      return { _status: 400, _body: { success: false, message: `teacherId không hợp lệ: "${teacherId}"` } };
    }
    if (!isValidObjectId(studentId)) {
      return { _status: 400, _body: { success: false, message: `studentId không hợp lệ: "${studentId}". Vui lòng chọn học viên từ danh sách.` } };
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
      return { _status: 400, _body: { success: false, message: 'Thiếu thông tin khóa học (course)' } };
    }

    // Mỗi buổi cố định 1h30 — nếu thiếu/lệch endTime thì chuẩn hóa theo startTime
    const resolvedEndTime = endTimeFromStartOrDefault(startTime, endTime);

    const timeErr = assertEndAfterStart(startTime, resolvedEndTime);
    if (timeErr) {
      return { _status: 400, _body: { success: false, message: timeErr } };
    }

    const studentClash = await findStudentScheduleClash({
      studentId, date, startTime, endTime: resolvedEndTime,
    });
    if (studentClash) {
      return { _status: 409, _body: { success: false, message: formatStudentClashMessage(studentClash) } };
    }

    // ✅ ARCHITECTURAL UPGRADE: Anti-Clash Logic (Chống trùng lịch Giảng viên)
    const existingClash = await scheduleRepository.findOne({
      teacherId,
      date: new Date(date),
      startTime,
      status: { $ne: 'cancelled' }
    });
    
    if (existingClash) {
      return { _status: 409, _body: { 
        success: false, 
        message: `TRÙNG LỊCH: Giảng viên đã có lịch dạy vào ${startTime} ngày ${new Date(date).toLocaleDateString('vi-VN')} (Học viên: ${existingClash.studentName}).` 
      } };
    }

    // ✅ COOLDOWN 12H: Chống điểm danh trùng lặp giữa Admin và Giảng viên
    // Chỉ áp dụng khi tạo schedule với status = 'completed' (tức là đang điểm danh)
    const incomingStatus = status || 'scheduled';
    if (incomingStatus === 'completed') {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const lastAttendance = await scheduleRepository.findOne({
        studentId,
        course: courseFinal,
        status: 'completed',
        createdAt: { $gte: twelveHoursAgo },
      }).sort({ createdAt: -1 });

      if (lastAttendance) {
        const diffMs = Date.now() - new Date(lastAttendance.createdAt).getTime();
        const diffHrs = (diffMs / (1000 * 60 * 60)).toFixed(1);
        const remainHrs = (12 - parseFloat(diffHrs)).toFixed(1);
        return { _status: 400, _body: {
          success: false,
          cooldown: true,
          message: `Học viên này đã được điểm danh. Vui lòng thử lại sau ${remainHrs} tiếng.`,
          lastAttendanceAt: lastAttendance.createdAt,
          remainingHours: parseFloat(remainHrs),
        } };
      }
    }

    let finalPaidToTeacher = false;
    let paymentStatus = 'pending';
    const studentDoc = await Student.findById(studentId).lean();
    if (studentDoc && studentDoc.teacher_payment_status === 'PAID_IN_ADVANCE') {
       finalPaidToTeacher = true;
       paymentStatus = 'paid';
    }

    const schedule = await scheduleRepository.create({
      teacherId, teacherName,
      studentId, studentName,
      date: new Date(date),
      startTime, endTime: resolvedEndTime,
      course: courseFinal, 
      linkHoc: linkHoc || '',
      note: note || topic || '',
      status: status || 'scheduled',
      is_paid_to_teacher: finalPaidToTeacher,
      paymentStatus: paymentStatus,
    });

    // Ghi bản ghi ScheduleHistory kèm tên học viên
    try {
      const actor = data.currentUser || {};
      await scheduleHistoryRepository.create({
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
    const io = data.app.get('io');
    if (io) {
      const NotificationService = require('../../notification/services/NotificationService');
      if (studentId) {
        const notifDate = new Date(date).toLocaleDateString('vi-VN');
        if (schedule.status === 'completed') {
          notifyAttendanceTaken(io, {
            studentId,
            studentName,
            teacherName: teacherName || schedule.teacherName || data.currentUser?.name,
            course: courseFinal,
            date,
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

    return { _status: 201, _body: { success: true, data: schedule } };

    // 📝 GHI AUDIT LOG: CREATED
    scheduleHistoryRepository.create({
      scheduleId: schedule._id,
      actorId: teacherId,
      actorName: teacherName,
      actorRole: data.currentUser?.role || 'teacher',
      action: 'CREATED',
      reason: '',
      oldValue: null,
      newValue: { status: schedule.status, date: schedule.date, startTime, endTime: resolvedEndTime, studentId, course: courseFinal },
      studentName,
      teacherName,
      scheduledDate: schedule.date,
      course: courseFinal,
    }).catch(e => logger.error('[ScheduleHistory] CREATED log err:', e));

  } catch (err) {
    logger.error('[SCHEDULE] Create error:', err);
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async put_scheduleId(data) {
  try {
    // Authorization:
    // - Admin/Staff/Teacher: sửa lịch đầy đủ
    // - Student: chỉ được gửi ghi chú (studentNote) cho lịch của chính mình
    const role = String(data.currentUser.role || '').toLowerCase();
    const isStaffSide = ['admin', 'staff', 'teacher'].includes(role);
    const isStudent = role === 'student';

    if (!isStaffSide && !isStudent) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền chỉnh sửa lịch học' } };
    }
    const { status, note, linkHoc, startTime, endTime, date, topic } = data.body;

    const schedule = await scheduleRepository.findById(data.scheduleId);
    if (!schedule) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy lịch học' } };
    }

    // Teacher chỉ sửa lịch của mình
    if (role === 'teacher' && String(schedule.teacherId) !== String(data.currentUser.id)) {
      return { _status: 403, _body: { success: false, message: 'Bạn chỉ được chỉnh sửa lịch của chính mình' } };
    }

    const effectiveStart = startTime || schedule.startTime;
    // Khi đổi giờ bắt đầu (hoặc gửi endTime), luôn khóa kết thúc = start + 1h30
    const effectiveEnd = (startTime || endTime !== undefined)
      ? endTimeFromStartOrDefault(effectiveStart, endTime)
      : (schedule.endTime || endTimeFromStartOrDefault(effectiveStart));
    const effectiveDate = date || schedule.date;
    const timeErr = assertEndAfterStart(effectiveStart, effectiveEnd);
    if (timeErr) {
      return { _status: 400, _body: { success: false, message: timeErr } };
    }

    const timeFieldsChanging = Boolean(startTime || endTime !== undefined || date);
    if (timeFieldsChanging) {
      const studentClash = await findStudentScheduleClash({
        studentId: schedule.studentId,
        date: effectiveDate,
        startTime: effectiveStart,
        endTime: effectiveEnd,
        excludeScheduleId: schedule._id,
      });
      if (studentClash) {
        return { _status: 409, _body: { success: false, message: formatStudentClashMessage(studentClash) } };
      }
    }

    // Student restriction: chỉ cho phép cập nhật studentNote/hasUnreadStudentNote, đúng lịch của chính mình
    if (isStudent) {
      const myId = String(data.currentUser.id || data.currentUser._id);
      const scheduleStudentId = schedule.studentId ? String(schedule.studentId) : '';
      const onlyStudentNoteChange =
        Object.keys(data.body || {}).every((k) => ['studentNote', 'hasUnreadStudentNote'].includes(k));

      if (!scheduleStudentId || scheduleStudentId !== myId) {
        return { _status: 403, _body: { success: false, message: 'Bạn chỉ có thể gửi ghi chú cho lịch của chính mình' } };
      }
      if (!('studentNote' in data.body) && !('hasUnreadStudentNote' in data.body)) {
        return { _status: 400, _body: { success: false, message: 'Thiếu studentNote' } };
      }
      if (!onlyStudentNoteChange) {
        return { _status: 403, _body: { success: false, message: 'Bạn chỉ được phép cập nhật ghi chú học viên' } };
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
    if (noteVal !== undefined) updates.note = String(noteVal).trim();
    if ('studentNote' in data.body) {
      const nextStudentNote = String((data.studentNote ?? data.body.studentNote) || '').trim();
      updates.studentNote = nextStudentNote;
      updates.hasUnreadStudentNote = Boolean(nextStudentNote);
    }
    if ('hasUnreadStudentNote' in data.body) {
      // Giảng viên click vào xem thì tắt cờ đi
      updates.hasUnreadStudentNote = data.hasUnreadStudentNote;
    }

    if (Object.keys(updates).length === 0) {
      return { _status: 400, _body: { success: false, message: 'Không có thông tin để cập nhật' } };
    }
    if (status === 'cancelled' && String(schedule.status) !== 'cancelled') {
      updates.cancelledAt = new Date();
    }

    const io = data.app.get('io');
    if (schedule.studentId && io) {
      const NotificationService = require('../../notification/services/NotificationService');
      const notifDate = new Date(schedule.date).toLocaleDateString();
      
      if (status === 'cancelled' && schedule.status !== 'cancelled') {
         // Persist cancel reason into `note` so student UI can render it
         const cancelReason = String(data.body?.cancelReason || data.body?.reason || data.body?.note || '').trim();
         if (cancelReason) updates.note = cancelReason;

         NotificationService.send(io, {
           type: 'SCHEDULE',
           title: '❌ Lịch học bị hủy',
           content: cancelReason
             ? `Lịch học ngày ${notifDate} đã bị hủy. Lý do: ${cancelReason}`
             : `Lịch học ngày ${notifDate} đã bị hủy.`,
           receivers: schedule.studentId.toString(),
           payload: { scheduleId: schedule._id.toString(), reason: cancelReason },
           link: '/student#schedule'
         });

         // Emit cancelled event so clients refetch / update UI immediately
         io.emit('schedule:cancelled', { scheduleId: schedule._id.toString(), reason: cancelReason });
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

    const updated = await scheduleRepository.updateById(
      data.scheduleId,
      updates,
      { returnDocument: 'after', runValidators: true }
    ).populate([
      { path: 'teacherId', select: 'name phone' },
      { path: 'studentId', select: 'name course totalSessions studentExamUnlocked' },
    ]);

    // BUSINESS LOGIC: Nếu đánh dấu hoàn thành → kiểm tra unlock thi
    if (status === 'completed' && schedule.status !== 'completed' && schedule.studentId) {
      if (io) {
        notifyAttendanceTaken(io, {
          studentId: schedule.studentId,
          studentName: schedule.studentName || updated?.studentId?.name,
          teacherName: schedule.teacherName || data.currentUser?.name,
          course: schedule.course,
          date: schedule.date,
        }).catch((e) => logger.warn('[SCHEDULE] attendance notify:', e.message));
      }
      await checkAndUnlockExam(schedule.studentId.toString(), io, schedule.course);

      // Cập nhật remainingSessions của học viên (Tách biệt logic trừ buổi và cộng buổi)
      const student = await Student.findById(schedule.studentId);
      if (student) {
        // Automatically mark as paid if Admin paid in advance
        if (student.teacher_payment_status === 'PAID_IN_ADVANCE') {
           await scheduleRepository.updateById(schedule._id, { 
             is_paid_to_teacher: true,
             paymentStatus: 'paid'
           });
        }
      }
    }

    // BUSINESS LOGIC: Gửi thông báo chuông cho Giảng viên nếu Học viên gửi Ghi chú (studentNote)
    if ('studentNote' in data.body && String((data.studentNote ?? data.body.studentNote) || '').trim() && schedule.teacherId && io) {
      try {
         const NotificationService = require('../../notification/services/NotificationService');
         await NotificationService.send(io, {
           type: 'SYSTEM',
           title: '📝 Ghi chú mới từ học viên',
           content: `Học viên ${schedule.studentName} vừa để lại ghi chú trên lịch học ngày ${new Date(schedule.date).toLocaleDateString('vi-VN')}.`,
           receivers: [schedule.teacherId.toString()],
           payload: { scheduleId: schedule._id, studentId: schedule.studentId, type: 'schedule' },
           link: '/teacher#schedule',
         });

         // Báo cập nhật calendar
         io.emit('schedule:updated', schedule._id);
      } catch (e) {
         logger.error('[SCHEDULE] Notify error:', e);
      }
    }

    return { _status: 200, _body: { success: true, data: updated } };
  } catch (err) {
    logger.error('[SCHEDULE] Update error:', err);
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async delete_scheduleId(data) {
  try {
    // Authorization: Chỉ Admin/Staff mới được xóa vĩnh viễn lịch
    if (!['admin', 'staff'].includes(data.currentUser.role)) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền xóa lịch học' } };
    }
    const schedule = await scheduleRepository.deleteById(data.scheduleId);
    if (!schedule) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy lịch học' } };
    }
    return { _status: 200, _body: { success: true, message: 'Đã xóa lịch học' } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async patch_scheduleId_cancel(data) {
  try {
    const { reason = '' } = data.body;
    const schedule = await scheduleRepository.findById(data.scheduleId);
    if (!schedule) return { _status: 404, _body: { success: false, message: 'Không tìm thấy lịch học' } };

    // Authorization: Chỉ Admin/Staff/Teacher được hủy lịch
    if (!['admin', 'staff', 'teacher'].includes(String(data.currentUser?.role || '').toLowerCase())) {
      return { _status: 403, _body: { success: false, message: 'Bạn không có quyền hủy lịch học' } };
    }
    if (String(data.currentUser.role).toLowerCase() === 'teacher'
        && String(schedule.teacherId) !== String(data.currentUser.id)) {
      return { _status: 403, _body: { success: false, message: 'Bạn chỉ được hủy lịch của chính mình' } };
    }

    if (schedule.status === 'cancelled') {
      return { _status: 400, _body: { success: false, message: 'Lịch này đã bị hủy rồi' } };
    }
    if (schedule.status === 'completed') {
      return { _status: 400, _body: { success: false, message: 'Không thể hủy lịch đã hoàn thành' } };
    }
    // Ngăn hủy lịch trong quá khứ (chỉ cho hủy lịch tương lai)
    const schedDate = new Date(schedule.date);
    schedDate.setHours(23, 59, 59, 999);
    if (schedDate < new Date()) {
      return { _status: 400, _body: { success: false, message: 'Không thể hủy lịch trong quá khứ' } };
    }

    const oldValue = { status: schedule.status, note: schedule.note || '' };
    schedule.status = 'cancelled';
    // Persist reason so Student UI can show it (frontend currently renders `sch.note`)
    if (typeof reason === 'string' && reason.trim()) {
      schedule.note = reason.trim();
    }
    await schedule.save();

    const actor = data.currentUser || {};
    await scheduleHistoryRepository.create({
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

    const io = data.app.get('io');
    if (io) {
      io.emit('schedule:cancelled', { scheduleId: schedule._id.toString(), reason });

      // Notify student with reason (if any)
      if (schedule.studentId) {
        try {
          const NotificationService = require('../../notification/services/NotificationService');
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

    return { _status: 200, _body: { success: true, data: schedule } };
  } catch (err) {
    logger.error('[SCHEDULE] Cancel error:', err);
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

  async get_history_teacherId(data) {
  try {
    const { teacherId } = data.params;
    if (!isAdminOrStaff(data.currentUser) && String(data.currentUser.id) !== String(teacherId)) {
      return { _status: 403, _body: { success: false, message: 'Không có quyền xem lịch sử lịch dạy này' } };
    }
    const { limit = 50, action } = data.query;
    const filter = { actorId: teacherId };
    if (action) filter.action = action;

    const history = await scheduleHistoryRepository.findMany(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Tự động bổ sung studentName cho các bản ghi lịch sử cũ nếu chưa có
    const missingSchedIds = history.filter(h => !h.studentName && h.scheduleId).map(h => h.scheduleId);
    if (missingSchedIds.length > 0) {
      const schedules = await scheduleRepository.findMany({ _id: { $in: missingSchedIds } }).select('_id studentName studentId').lean();
      const missingStudentIds = schedules.filter(s => !s.studentName && s.studentId).map(s => s.studentId);
      const students = missingStudentIds.length > 0 ? await Student.find({ _id: { $in: missingStudentIds } }).select('_id name').lean() : [];
      const studentMap = new Map(students.map(s => [s._id.toString(), s.name]));

      const schedMap = new Map(schedules.map(s => [
        s._id.toString(),
        s.studentName || studentMap.get(s.studentId?.toString()) || 'Học viên'
      ]));

      for (const h of history) {
        if (!h.studentName && h.scheduleId && schedMap.has(h.scheduleId.toString())) {
          h.studentName = schedMap.get(h.scheduleId.toString());
        }
      }
    }

    // Thống kê nhanh
    const stats = {
      total: history.length,
      created: history.filter(h => h.action === 'CREATED').length,
      cancelled: history.filter(h => h.action === 'CANCELLED').length,
      cancelRate: history.length > 0
        ? Math.round((history.filter(h => h.action === 'CANCELLED').length / history.length) * 100)
        : 0,
    };

    return { _status: 200, _body: { success: true, data: history, stats } };
  } catch (err) {
    return { _status: 500, _body: { success: false, message: err.message } };
  }
}

}

module.exports = new AttendanceApplicationService();
