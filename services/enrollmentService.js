const mongoose = require('mongoose');
const { resolveExamSubjectsForCourse } = require('./examSubjectCatalog');

function sanitizeTeacherAlert(raw) {
  return String(raw || '').trim().slice(0, 500);
}

function teacherIdStr(teacherId) {
  if (!teacherId) return '';
  if (typeof teacherId === 'object') return String(teacherId._id || teacherId.id || '');
  return String(teacherId);
}

function legacyEnrollmentFromStudent(student) {
  const doc = student.toObject ? student.toObject() : student;
  const tid = teacherIdStr(doc.teacherId);
  const completed = doc.completedSessions != null
    ? doc.completedSessions
    : Math.max(0, (doc.totalSessions || 12) - (doc.remainingSessions ?? doc.totalSessions ?? 12));
  return {
    courseName: doc.course,
    teacherId: tid || doc.teacherId,
    teacherName: doc.teacherId?.name || doc.teacherName || '',
    price: doc.price,
    paid: doc.paid,
    paidAt: doc.paidAt,
    totalSessions: doc.totalSessions || 12,
    remainingSessions: doc.remainingSessions ?? Math.max(0, (doc.totalSessions || 12) - completed),
    completedSessions: completed,
    avgGrade: doc.avgGrade || 0,
    grades: doc.grades || [],
    linkHoc: doc.linkHoc || '',
    nextClass: doc.nextClass || '',
    nextClassTime: doc.nextClassTime || '',
    status: (doc.remainingSessions ?? 1) <= 0 || doc.status === 'Hoàn thành' ? 'completed' : 'active',
    isPrimary: true,
    registeredAt: doc.createdAt,
    examSubjects: [],
    requireWebcam: doc.requireWebcam === true,
    examUnlocked: !!doc.studentExamUnlocked,
  };
}

/**
 * Resolve enrollment by Mongo _id, primary alias, or client synthetic id `enr-N`
 * (used when legacy HV only has root.course and the UI invents enr-0).
 */
function resolveEnrollmentIndex(enrollments, enrollmentId) {
  const list = Array.isArray(enrollments) ? enrollments : [];
  const id = String(enrollmentId || '').trim();
  if (!id || !list.length) return -1;

  const byId = list.findIndex((e) => String(e?._id || '') === id);
  if (byId >= 0) return byId;

  if (id === 'main') {
    const primary = list.findIndex((e) => e?.isPrimary);
    return primary >= 0 ? primary : 0;
  }

  const synthetic = /^enr-(\d+)$/i.exec(id);
  if (synthetic) {
    const idx = Number(synthetic[1]);
    if (Number.isInteger(idx) && idx >= 0 && idx < list.length) return idx;
  }
  return -1;
}

async function resolveEnrollmentExamSubjects({ courseName, courseId }) {
  const Course = require('../models/Course');
  const { getCachedSettings } = require('./settingsCache');
  let course = null;
  if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
    course = await Course.findById(courseId).lean();
  }
  if (!course && courseName) {
    const escaped = String(courseName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    course = await Course.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).lean();
  }
  const settings = await getCachedSettings();
  const custom = settings?.examSubjectsCustomRaw;
  return resolveExamSubjectsForCourse(course || { name: courseName }, custom);
}

function isPlaceholderCourseName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === '(đã hủy)' || n === 'chưa xếp lớp';
}

/**
 * HV còn ≥1 khóa usable (active | completed | paused) → được vào Dashboard.
 * Hủy / hoàn / pending_payment / placeholder → phải đăng ký lại (/dangkykhoahoc).
 * Khớp client hasLearningAccessEnrollment.
 */
function studentHasLearningAccess(student) {
  if (!student) return false;
  const list = getEnrollmentsFromStudent(student);
  return list.some((e) => {
    if (e?.learningAccess === false) return false;
    const st = String(e?.status || 'active').toLowerCase();
    if (st === 'cancelled' || st === 'refunded' || st === 'pending_payment') return false;
    if (st !== 'active' && st !== 'completed' && st !== 'paused' && st !== 'hoàn thành') return false;
    const label = e?.courseName || e?.name || e?.course || '';
    return !isPlaceholderCourseName(label);
  });
}

function getEnrollmentsFromStudent(student) {
  const doc = student.toObject ? student.toObject() : { ...student };
  if (Array.isArray(doc.enrollments) && doc.enrollments.length > 0) {
    return doc.enrollments.map((e) => ({
      ...e,
      courseName: e.courseName || e.course,
      teacherId: e.teacherId,
      teacherName: e.teacherName || e.teacherId?.name || '',
    }));
  }
  // Không invent enrollment active từ placeholder sau hủy / chưa xếp lớp
  if (doc.course && !isPlaceholderCourseName(doc.course)) {
    return [legacyEnrollmentFromStudent(doc)];
  }
  return [];
}

function toClientCourse(enrollment, index) {
  const id = enrollment._id ? String(enrollment._id) : `enr-${index}`;
  const completed = enrollment.completedSessions != null
    ? enrollment.completedSessions
    : Math.max(0, (enrollment.totalSessions || 12) - (enrollment.remainingSessions ?? 0));
  return {
    id,
    enrollmentId: id,
    name: enrollment.courseName,
    courseName: enrollment.courseName,
    courseId: enrollment.courseId ? String(enrollment.courseId) : '',
    examSubjects: Array.isArray(enrollment.examSubjects) ? enrollment.examSubjects : [],
    teacherId: teacherIdStr(enrollment.teacherId),
    teacherName: enrollment.teacherName
      || (enrollment.teacherId && typeof enrollment.teacherId === 'object' ? (enrollment.teacherId.name || '') : '')
      || '',
    completedSessions: completed,
    totalSessions: enrollment.totalSessions || 12,
    remainingSessions: enrollment.remainingSessions ?? Math.max(0, (enrollment.totalSessions || 12) - completed),
    avgGrade: enrollment.avgGrade || 0,
    grades: enrollment.grades || [],
    linkHoc: enrollment.linkHoc || '',
    nextClass: enrollment.nextClass || '',
    nextClassTime: enrollment.nextClassTime || '',
    paid: (enrollment.status === 'cancelled' || enrollment.status === 'refunded')
      ? false
      : enrollment.paid,
    price: enrollment.price,
    status: enrollment.status || (completed >= (enrollment.totalSessions || 12) ? 'completed' : 'active'),
    registeredAt: enrollment.registeredAt,
    isPrimary: enrollment.isPrimary,
    requireWebcam: enrollment.requireWebcam === true,
    examUnlocked: enrollment.examUnlocked === true,
    teacherAlert: sanitizeTeacherAlert(enrollment.teacherAlert),
    cancelledAt: enrollment.cancelledAt || null,
    cancelReason: enrollment.cancelReason || '',
    refundedAmount: Number(enrollment.refundedAmount) || 0,
  };
}

function normCourseName(name) {
  return String(name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function gradeDateKeys(raw) {
  if (!raw) return [];
  const keys = new Set([String(raw).trim()]);
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    keys.add(d.toLocaleDateString('vi-VN'));
    keys.add(d.toISOString().slice(0, 10));
  }
  // dd/mm/yyyy already in set if raw is that format
  return [...keys];
}

/**
 * Ghi/cập nhật nhật ký điểm danh vào enrollment + root grades.
 * Cùng ngày → cập nhật điểm/ghi chú (không bỏ qua khi đã có grade=0).
 */
function recordAttendanceGrade(studentDoc, {
  courseName,
  note,
  grade = 0,
  date = new Date(),
  actedAt = null,
} = {}) {
  if (!studentDoc) return false;
  const sessionDate = date instanceof Date ? date : new Date(date);
  const actionAt = actedAt
    ? (actedAt instanceof Date ? actedAt : new Date(actedAt))
    : new Date();
  const safeSession = Number.isNaN(sessionDate.getTime()) ? new Date() : sessionDate;
  const safeAction = Number.isNaN(actionAt.getTime()) ? new Date() : actionAt;
  const dateVN = safeSession.toLocaleDateString('vi-VN');
  const timeVN = safeAction.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const gradeNum = Number(grade);
  const entry = {
    date: dateVN,
    time: timeVN,
    at: safeAction,
    note: note || 'Đã điểm danh hoàn thành buổi học',
    grade: Number.isFinite(gradeNum) ? gradeNum : 0,
  };
  const entryKeys = new Set(gradeDateKeys(dateVN).concat(gradeDateKeys(safeSession)));

  const upsertGrades = (grades) => {
    const list = Array.isArray(grades) ? [...grades] : [];
    const idx = list.findIndex((g) => {
      const keys = gradeDateKeys(g.date);
      return keys.some((k) => entryKeys.has(k));
    });
    if (idx >= 0) {
      const prev = list[idx];
      const nextGrade = Number.isFinite(gradeNum) ? gradeNum : (Number(prev.grade) || 0);
      const nextNote = note || prev.note || entry.note;
      if (
        Number(prev.grade) === nextGrade
        && String(prev.note || '') === String(nextNote)
        && prev.at
      ) {
        return { list, changed: false };
      }
      list[idx] = {
        ...prev,
        grade: nextGrade,
        note: nextNote,
        date: prev.date || dateVN,
        time: timeVN,
        at: safeAction,
      };
      return { list, changed: true };
    }
    list.unshift(entry);
    return { list, changed: true };
  };

  let changed = false;
  const courseKey = normCourseName(courseName);

  if (Array.isArray(studentDoc.enrollments) && studentDoc.enrollments.length) {
    let idx = courseKey
      ? studentDoc.enrollments.findIndex((e) => normCourseName(e.courseName) === courseKey)
      : -1;
    if (idx < 0) {
      idx = studentDoc.enrollments.findIndex((e) => e.isPrimary);
    }
    if (idx < 0) idx = 0;

    const enrResult = upsertGrades(studentDoc.enrollments[idx].grades);
    if (enrResult.changed) {
      studentDoc.enrollments[idx].grades = enrResult.list;
      changed = true;
    }
    const valid = enrResult.list.filter((g) => Number(g.grade) > 0);
    if (valid.length) {
      studentDoc.enrollments[idx].avgGrade = Math.round(
        (valid.reduce((s, g) => s + Number(g.grade), 0) / valid.length) * 10
      ) / 10;
    }
    // Luôn đồng bộ root grades để HV đọc được
    const rootResult = upsertGrades(studentDoc.grades);
    if (rootResult.changed) {
      studentDoc.grades = rootResult.list;
      changed = true;
    }
    if (Number.isFinite(gradeNum) && gradeNum > 0) studentDoc.lastGrade = gradeNum;
    const rootValid = (studentDoc.grades || []).filter((g) => Number(g.grade) > 0);
    if (rootValid.length) {
      studentDoc.avgGrade = Math.round(
        (rootValid.reduce((s, g) => s + Number(g.grade), 0) / rootValid.length) * 10
      ) / 10;
    }
  } else {
    const rootResult = upsertGrades(studentDoc.grades);
    if (rootResult.changed) {
      studentDoc.grades = rootResult.list;
      changed = true;
    }
    if (Number.isFinite(gradeNum) && gradeNum > 0) studentDoc.lastGrade = gradeNum;
  }

  if (changed && typeof studentDoc.markModified === 'function') {
    studentDoc.markModified('enrollments');
    studentDoc.markModified('grades');
  }
  return changed;
}

async function applyEnrollmentStats(doc, studentId, Schedule) {
  const enrollments = getEnrollmentsFromStudent(doc);
  if (!enrollments.length) {
    doc.enrollments = [];
    doc.courses = [];
    return doc;
  }

  let sessionByCourse = {};
  if (Schedule && studentId) {
    const sid = mongoose.Types.ObjectId.isValid(studentId)
      ? new mongoose.Types.ObjectId(studentId)
      : studentId;
    const rows = await Schedule.aggregate([
      { $match: { studentId: sid, status: 'completed' } },
      { $group: { _id: '$course', completed: { $sum: 1 } } },
    ]);
    // Gom theo tên khóa đã chuẩn hóa (trim / hoa thường / bỏ dấu) — tránh lệch
    // "khóa học test" vs "Khóa học test" làm điểm danh bù không tăng tiến độ.
    sessionByCourse = {};
    rows.forEach((r) => {
      const key = normCourseName(r._id);
      if (!key) return;
      sessionByCourse[key] = (sessionByCourse[key] || 0) + (Number(r.completed) || 0);
    });
  }

  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    if (!Array.isArray(e.examSubjects) || !e.examSubjects.length) {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveEnrollmentExamSubjects({
        courseName: e.courseName || e.course,
        courseId: e.courseId,
      });
      enrollments[i] = { ...e, examSubjects: resolved };
    }
  }

  // Backfill teacherName khi chỉ có teacherId (HV không load danh sách GV)
  const missingNameIds = [...new Set(
    enrollments
      .filter((e) => teacherIdStr(e.teacherId) && !String(e.teacherName || '').trim())
      .map((e) => teacherIdStr(e.teacherId)),
  )].filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (missingNameIds.length) {
    try {
      const Teacher = require('../models/Teacher');
      const rows = await Teacher.find({ _id: { $in: missingNameIds } }).select('name').lean();
      const nameById = Object.fromEntries(rows.map((t) => [String(t._id), t.name || '']));
      enrollments.forEach((e, i) => {
        if (String(e.teacherName || '').trim()) return;
        const tid = teacherIdStr(e.teacherId);
        if (tid && nameById[tid]) enrollments[i] = { ...e, teacherName: nameById[tid] };
      });
    } catch (_) { /* ignore */ }
  }

  doc.enrollments = enrollments.map((e, idx) => {
    const courseName = e.courseName || e.course;
    // SoT tiến độ: tối đa giữa (1) số lịch completed theo khóa và (2) giá trị lưu trên enrollment.
    // → Điểm danh vẫn tăng tiến độ; Admin nhập tay "đã học" (migration / bù) không bị tụt về 0 khi chưa có lịch.
    const courseKey = normCourseName(courseName);
    const fromSchedule = courseKey ? sessionByCourse[courseKey] : undefined;
    const fromStored = Number(e.completedSessions) || 0;
    const completed = fromSchedule != null
      ? Math.max(Number(fromSchedule) || 0, fromStored)
      : fromStored;
    const total = e.totalSessions || 12;
    const enrGrades = (e.grades && e.grades.length)
      ? e.grades
      : ((e.isPrimary || enrollments.length === 1) ? (doc.grades || []) : (e.grades || []));
    const inheritUnlock = e.examUnlocked == null && !!(e.isPrimary || enrollments.length === 1) && !!doc.studentExamUnlocked;
    const inheritWebcamOn = e.requireWebcam == null && !!(e.isPrimary || enrollments.length === 1) && doc.requireWebcam === true;
    return {
      ...e,
      _id: e._id,
      courseName,
      teacherName: e.teacherName
        || (e.teacherId && typeof e.teacherId === 'object' ? (e.teacherId.name || '') : '')
        || '',
      completedSessions: completed,
      remainingSessions: Math.max(0, total - completed),
      status: (e.status === 'cancelled' || e.status === 'refunded')
        ? e.status
        : (completed >= total ? 'completed' : (e.status || 'active')),
      grades: enrGrades,
      requireWebcam: e.requireWebcam === true || inheritWebcamOn,
      examUnlocked: e.examUnlocked === true || inheritUnlock,
    };
  });

  doc.courses = doc.enrollments.map(toClientCourse);

  const activeEnrollments = doc.enrollments.filter((e) => e.status !== 'cancelled' && e.status !== 'refunded');
  const primary = activeEnrollments.find((e) => e.isPrimary) || activeEnrollments[0];
  if (primary) {
    doc.course = primary.courseName;
    doc.teacherId = primary.teacherId;
    doc.teacherName = primary.teacherName || doc.teacherName || '';
    doc.completedSessions = primary.completedSessions;
    doc.remainingSessions = primary.remainingSessions;
    doc.totalSessions = primary.totalSessions;
    doc.grades = primary.grades?.length ? primary.grades : doc.grades;
  } else {
    doc.course = '';
    doc.teacherId = null;
    doc.teacherName = '';
    doc.completedSessions = 0;
    doc.remainingSessions = 0;
    doc.totalSessions = 12;
  }

  const allNames = [];
  const seenN = new Set();
  doc.enrollments.filter((e) => e.status !== 'cancelled' && e.status !== 'refunded').forEach((e) => {
    const n = String(e.teacherName || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seenN.has(key)) return;
    seenN.add(key);
    allNames.push(n);
  });
  if (allNames.length) {
    doc.teacherNames = allNames;
    if (!doc.teacherName) doc.teacherName = allNames[0];
  }

  return doc;
}

function studentMatchesTeacher(student, teacherId) {
  const tid = String(teacherId);
  if (teacherIdStr(student.teacherId) === tid) return true;
  const enrollments = getEnrollmentsFromStudent(student);
  return enrollments.some((e) => teacherIdStr(e.teacherId) === tid && e.status !== 'cancelled' && e.status !== 'refunded');
}

function expandStudentsForTeacher(students, teacherId) {
  const tid = String(teacherId);
  const result = [];

  students.forEach((student) => {
    const enrollments = getEnrollmentsFromStudent(student);
    // Giữ cả cancelled/refunded để GV vẫn thấy HV thôi học (UI khóa thao tác).
    const mine = enrollments.filter((e) => teacherIdStr(e.teacherId) === tid);

    if (mine.length > 0) {
      mine.forEach((enr, idx) => {
        const courseName = enr.courseName || enr.course;
        const completed = enr.completedSessions != null
          ? enr.completedSessions
          : Math.max(0, (enr.totalSessions || 12) - (enr.remainingSessions ?? 0));
        const st = String(enr.status || 'active').toLowerCase();
        const locked = st === 'cancelled' || st === 'refunded';
        result.push({
          ...student,
          id: student.id || student._id,
          _enrollmentKey: `${student._id || student.id}-${enr._id || idx}`,
          _enrollmentId: enr._id ? String(enr._id) : `enr-${idx}`,
          course: courseName,
          teacherId: teacherIdStr(enr.teacherId),
          teacherName: enr.teacherName,
          totalSessions: enr.totalSessions || 12,
          remainingSessions: enr.remainingSessions ?? Math.max(0, (enr.totalSessions || 12) - completed),
          completedSessions: completed,
          grades: enr.grades || [],
          linkHoc: enr.linkHoc || student.linkHoc,
          nextClass: enr.nextClass || student.nextClass,
          nextClassTime: enr.nextClassTime || student.nextClassTime,
          teacherAlert: sanitizeTeacherAlert(enr.teacherAlert),
          avgGrade: enr.avgGrade ?? student.avgGrade,
          paid: enr.paid ?? student.paid,
          price: enr.price ?? student.price,
          enrollmentStatus: st,
          interactionLocked: locked,
          status: locked ? 'Thôi học' : (student.status || 'Đang học'),
        });
      });
      return;
    }

    if (teacherIdStr(student.teacherId) === tid) {
      const rootSt = String(student.status || '').toLowerCase();
      const locked = rootSt === 'hủy' || rootSt === 'cancelled' || rootSt === 'refunded'
        || String(student.course || '').includes('Đã hủy');
      result.push({
        ...student,
        _enrollmentKey: String(student._id || student.id),
        enrollmentStatus: locked ? 'cancelled' : 'active',
        interactionLocked: locked,
        status: locked ? 'Thôi học' : student.status,
      });
    }
  });

  return result;
}

/**
 * Mirror primary/active enrollment onto Student root fields.
 * When no active enrollment remains, Student.course must stay non-empty (schema required).
 */
function syncStudentFromPrimaryEnrollment(student) {
  if (!student?.enrollments?.length) {
    return;
  }
  const list = student.enrollments;
  const active = list.filter((e) => e?.status !== 'cancelled' && e?.status !== 'refunded');
  if (!active.length) {
    student.course = '(Đã hủy)';
    student.price = 0;
    student.paid = false;
    student.paidAt = undefined;
    student.teacherId = null;
    student.teacherName = '';
    student.completedSessions = 0;
    student.remainingSessions = 0;
    student.totalSessions = 12;
    return;
  }
  const primary = active.find((e) => e.isPrimary) || active[0];
  if (!primary) return;
  student.course = primary.courseName;
  student.price = Number(primary.price) || 0;
  student.paid = !!primary.paid;
  student.teacherId = primary.teacherId || null;
  student.teacherName = primary.teacherName || '';
  if (primary.paidAt) student.paidAt = primary.paidAt;
  student.totalSessions = primary.totalSessions || 12;
  student.remainingSessions = primary.remainingSessions ?? primary.totalSessions ?? 12;
  student.completedSessions = primary.completedSessions || 0;
}

/**
 * Sau hoàn phí / đăng ký lại: gắn enrollment mới sạch (0 buổi), root sync khóa mới.
 * Không xóa lịch completed cũ (để admin trả lương GV).
 */
async function applyReEnrollmentAfterPayment(studentDoc, {
  courseName = '',
  courseId = null,
  branchId = null,
  branchCode = '',
  amount = 0,
  totalSessions = 12,
  learningMode = 'OFFLINE',
} = {}) {
  if (!studentDoc) return null;
  const sessions = Number(totalSessions) > 0 ? Number(totalSessions) : 12;
  const list = Array.isArray(studentDoc.enrollments) ? [...studentDoc.enrollments] : [];
  list.forEach((e) => {
    if (!e) return;
    e.isPrimary = false;
  });

  const newEnrollment = {
    courseName: courseName || 'Khóa học mới',
    courseId: courseId || null,
    branchId: branchId || studentDoc.branchId || null,
    status: 'active',
    paid: true,
    price: Number(amount) || 0,
    paidAmount: Number(amount) || 0,
    paidAt: new Date(),
    totalSessions: sessions,
    remainingSessions: sessions,
    completedSessions: 0,
    grades: [],
    avgGrade: 0,
    linkHoc: '',
    nextClass: '',
    nextClassTime: '',
    teacherId: null,
    teacherName: '',
    learningMode: learningMode || 'OFFLINE',
    registeredAt: new Date(),
    learningAccess: true,
    isPrimary: true,
    examUnlocked: false,
    requireWebcam: false,
  };
  list.push(newEnrollment);
  studentDoc.enrollments = list;
  studentDoc.markModified?.('enrollments');

  if (branchId) {
    studentDoc.branchId = branchId;
    studentDoc.branchCode = branchCode || studentDoc.branchCode || '';
  }
  studentDoc.course = newEnrollment.courseName;
  studentDoc.courseId = courseId || studentDoc.courseId;
  studentDoc.price = Number(amount) || 0;
  studentDoc.paid = true;
  studentDoc.paidAmount = Number(amount) || 0;
  studentDoc.paidAt = new Date();
  studentDoc.status = 'Active';
  studentDoc.totalSessions = sessions;
  studentDoc.remainingSessions = sessions;
  studentDoc.completedSessions = 0;
  studentDoc.grades = [];
  studentDoc.avgGrade = 0;
  studentDoc.lastGrade = 0;
  studentDoc.linkHoc = '';
  studentDoc.nextClass = '';
  studentDoc.nextClassTime = '';
  studentDoc.teacherId = null;
  studentDoc.teacherName = '';
  studentDoc.notes = '';
  studentDoc.markModified?.('grades');
  return newEnrollment;
}

module.exports = {
  legacyEnrollmentFromStudent,
  resolveEnrollmentIndex,
  getEnrollmentsFromStudent,
  studentHasLearningAccess,
  toClientCourse,
  applyEnrollmentStats,
  studentMatchesTeacher,
  expandStudentsForTeacher,
  applyReEnrollmentAfterPayment,
  teacherIdStr,
  sanitizeTeacherAlert,
  resolveEnrollmentExamSubjects,
  recordAttendanceGrade,
  normCourseName,
  syncStudentFromPrimaryEnrollment,
};
