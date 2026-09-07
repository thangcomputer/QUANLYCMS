/** Client helpers */
import { itemMatchesSubjectIds, resolveItemExamSubjects } from './trainingSubjectFilter.js';

export function teacherIdStr(teacherId) {
  if (!teacherId) return '';
  if (typeof teacherId === 'object') return String(teacherId._id || teacherId.id || '');
  return String(teacherId);
}

export function teacherNameFromRef(teacherId, teacherName) {
  if (teacherName && String(teacherName).trim()) return String(teacherName).trim();
  if (teacherId && typeof teacherId === 'object') {
    return String(teacherId.name || teacherId.teacherName || '').trim();
  }
  return '';
}

/** Gắn tên GV từ danh sách teachers khi enrollment chỉ có teacherId */
export function enrichEnrollmentsWithTeachers(enrollments, teachers) {
  const list = Array.isArray(enrollments) ? enrollments : [];
  const teacherList = Array.isArray(teachers) ? teachers : [];
  return list.map((e) => {
    const tid = teacherIdStr(e.teacherId);
    let name = teacherNameFromRef(e.teacherId, e.teacherName);
    if (!name && tid) {
      const found = teacherList.find((t) => String(t.id || t._id) === tid);
      name = found?.name || '';
    }
    return { ...e, teacherId: tid, teacherName: name };
  });
}

/** Tên GV duy nhất (trùng thì 1, khác thì phẩy) */
export function uniqueTeacherNames(enrollments) {
  const names = [];
  const seen = new Set();
  (enrollments || []).forEach((e) => {
    const n = String(e?.teacherName || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(n);
  });
  return names;
}

export function formatTeacherDisplay(names, { prefix = 'Thầy ' } = {}) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return 'Chưa phân công';
  return list.map((n) => (n.startsWith('Thầy ') || n.startsWith('Cô ') ? n : `${prefix}${n}`)).join(', ');
}

export function getClientEnrollments(student) {
  if (!student) return [];
  if (Array.isArray(student.courses) && student.courses.length > 0) {
    return student.courses.map((c, idx) => ({
      ...c,
      id: c.id || c.enrollmentId || `course-${idx}`,
      enrollmentId: c.enrollmentId || c.id || `course-${idx}`,
      courseName: c.courseName || c.name,
      name: c.name || c.courseName,
      teacherId: teacherIdStr(c.teacherId),
      teacherName: teacherNameFromRef(c.teacherId, c.teacherName),
      cancelledAt: c.cancelledAt || null,
      cancelReason: c.cancelReason || '',
      refundedAmount: Number(c.refundedAmount) || 0,
    }));
  }
  if (Array.isArray(student.enrollments) && student.enrollments.length > 0) {
    return student.enrollments.map((e, idx) => ({
      id: e._id ? String(e._id) : `enr-${idx}`,
      enrollmentId: e._id ? String(e._id) : `enr-${idx}`,
      name: e.courseName, courseName: e.courseName,
      courseId: e.courseId ? String(e.courseId) : '',
      examSubjects: Array.isArray(e.examSubjects) ? e.examSubjects : [],
      teacherId: teacherIdStr(e.teacherId),
      teacherName: teacherNameFromRef(e.teacherId, e.teacherName),
      completedSessions: e.completedSessions ?? Math.max(0, (e.totalSessions || 12) - (e.remainingSessions ?? 0)),
      totalSessions: e.totalSessions || 12, remainingSessions: e.remainingSessions,
      avgGrade: e.avgGrade || 0, grades: e.grades || [], linkHoc: e.linkHoc || '',
      nextClass: e.nextClass || '', nextClassTime: e.nextClassTime || '',
      paid: e.paid, price: e.price, status: e.status || 'active',
      teacherAlert: e.teacherAlert || '',
      cancelledAt: e.cancelledAt || null,
      cancelReason: e.cancelReason || '',
      refundedAmount: Number(e.refundedAmount) || 0,
      learningAccess: e.learningAccess !== false,
      registeredAt: e.registeredAt, isPrimary: e.isPrimary,
      requireWebcam: e.requireWebcam === true,
      examUnlocked: e.examUnlocked === true,
    }));
  }
  if (student.course && String(student.course).trim()) {
    const tid = teacherIdStr(student.teacherId);
    const completed = student.completedSessions ?? Math.max(0, (student.totalSessions || 12) - (student.remainingSessions ?? 0));
    return [{ id: 'main', enrollmentId: 'main', name: student.course, courseName: student.course,
      courseId: '', examSubjects: [], teacherId: tid,
      teacherName: teacherNameFromRef(student.teacherId, student.teacherName),
      completedSessions: completed, totalSessions: student.totalSessions || 12, remainingSessions: student.remainingSessions,
      avgGrade: student.avgGrade || 0, grades: student.grades || [], linkHoc: student.linkHoc || '',
      nextClass: student.nextClass || '', nextClassTime: student.nextClassTime || '',
      teacherAlert: student.teacherAlert || '',
      paid: student.paid, price: student.price,
      status: student.status === 'Ho\u00E0n th\u00E0nh' ? 'completed' : 'active',
      registeredAt: student.createdAt, isPrimary: true,
      requireWebcam: student.requireWebcam === true,
      examUnlocked: !!student.studentExamUnlocked,
    }];
  }
  return [];
}

/** Chỉ khóa đang hoạt động (ẩn khóa đã hủy khỏi danh sách ngoài / gán GV / học phí list). */
export function getActiveClientEnrollments(student) {
  return getClientEnrollments(student).filter((e) => e?.status !== 'cancelled' && e?.status !== 'refunded');
}

/** Placeholder root course — không tính là đang đăng ký khóa. */
export function isPlaceholderCourseName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === '(đã hủy)' || n === 'chưa xếp lớp';
}

/**
 * Chỉ lấy enrollments/courses có cấu trúc — KHÔNG invent từ root student.course.
 * (Root course sau hủy = "(Đã hủy)" vẫn bị getClientEnrollments coi là active nếu fallback.)
 */
function getStructuredClientEnrollments(student) {
  if (!student) return [];
  if (Array.isArray(student.courses) && student.courses.length > 0) {
    return getClientEnrollments({ ...student, course: undefined });
  }
  if (Array.isArray(student.enrollments) && student.enrollments.length > 0) {
    return getClientEnrollments({ ...student, courses: undefined, course: undefined });
  }
  return [];
}

/**
 * Learning Dashboard access SoT:
 * ≥1 enrollment/course còn quyền học: active | completed | paused.
 * Chặn: cancelled / refunded / pending_payment / learningAccess === false / placeholder.
 * HV hoàn thành hết khóa vẫn vào learning (ôn / thi / tài liệu).
 */
export function getLearningAccessEnrollments(student) {
  if (!student) return [];
  let list = getStructuredClientEnrollments(student);
  // Legacy: chỉ có root course (không enrollments/courses[]) — vẫn xét, nhưng không mở cho placeholder hủy.
  if (!list.length) {
    const hasStruct = (Array.isArray(student.enrollments) && student.enrollments.length > 0)
      || (Array.isArray(student.courses) && student.courses.length > 0);
    if (!hasStruct) {
      list = getClientEnrollments(student);
    }
  }
  return list.filter((e) => {
    if (e?.learningAccess === false) return false;
    const st = String(e?.status || 'active').toLowerCase();
    if (st === 'cancelled' || st === 'refunded' || st === 'pending_payment') return false;
    if (st !== 'active' && st !== 'completed' && st !== 'paused' && st !== 'hoàn thành') return false;
    const label = e?.courseName || e?.name || '';
    return !isPlaceholderCourseName(label);
  });
}

export function hasLearningAccessEnrollment(student) {
  return getLearningAccessEnrollments(student).length > 0;
}

function isEnrollmentPaidFlag(e) {
  return e?.paid === true || e?.paid === 'Đã đóng phí' || e?.paid === 'true' || e?.paid === 1;
}

/**
 * Sidebar badge «Học Viên»: chỉ HV còn khóa đang học và chưa đóng phí.
 * Không đếm HV đã hoàn/hủy hết khóa (paid root thường false sau refund).
 */
export function isUnpaidTuitionAlertStudent(student) {
  if (!student) return false;
  const enrollments = getClientEnrollments(student);
  const learning = enrollments.filter((e) => {
    const st = String(e?.status || '').toLowerCase();
    return st !== 'cancelled' && st !== 'refunded';
  });
  if (learning.length > 0) {
    return learning.some((e) => !isEnrollmentPaidFlag(e));
  }
  // Legacy: no enrollments, not cancelled root, unpaid
  const rootSt = String(student.status || '').toLowerCase();
  if (rootSt === 'cancelled' || rootSt === 'refunded') return false;
  if (Number(student.refundedAmount) > 0) return false;
  if (!String(student.course || '').trim()) return false;
  return !(student.paid === true || student.paid === 'Đã đóng phí' || student.paid === 'true');
}

export function expandStudentsForTeacher(students, teacherId) {
  const tid = String(teacherId); const result = [];
  (students || []).filter(Boolean).forEach((student) => {
    const enrollments = getClientEnrollments(student);
    // Giữ cancelled/refunded → GV vẫn thấy HV thôi học (UI khóa).
    const mine = enrollments.filter((e) => String(e.teacherId) === tid);
    if (mine.length > 0) {
      mine.forEach((enr, idx) => {
        const st = String(enr?.status || 'active').toLowerCase();
        const locked = st === 'cancelled' || st === 'refunded';
        result.push({
          ...student,
          id: student.id || student._id,
          _enrollmentKey: `${student._id || student.id}-${enr.enrollmentId || idx}`,
          _enrollmentId: enr.enrollmentId || `enr-${idx}`,
          course: enr.courseName,
          teacherId: enr.teacherId,
          teacherName: enr.teacherName,
          totalSessions: enr.totalSessions || 12,
          remainingSessions: enr.remainingSessions ?? Math.max(0, (enr.totalSessions || 12) - (Number(enr.completedSessions) || 0)),
          completedSessions: enr.completedSessions ?? Math.max(0, (enr.totalSessions || 12) - (enr.remainingSessions ?? 0)),
          examSubjects: enr.examSubjects || [],
          grades: enr.grades?.length ? enr.grades : (enr.isPrimary ? student.grades : []),
          linkHoc: enr.linkHoc || student.linkHoc,
          nextClass: enr.nextClass || student.nextClass,
          nextClassTime: enr.nextClassTime || student.nextClassTime,
          teacherAlert: enr.teacherAlert || '',
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
export function scopeStudentToEnrollment(student, enrollment) {
  if (!student || !enrollment) return student;
  const name = String(enrollment.teacherName || '').trim();
  const teacherLabel = name
    ? (name.startsWith('Thầy ') || name.startsWith('Cô ') ? name : `Thầy ${name}`)
    : 'Chưa phân công';
  return { ...student, course: enrollment.courseName || enrollment.name, teacherId: enrollment.teacherId || '',
    teacher: teacherLabel, teacherName: name,
    completedSessions: enrollment.completedSessions ?? 0,
    totalSessions: enrollment.totalSessions ?? 12,
    remainingSessions: enrollment.remainingSessions ?? Math.max(0, (enrollment.totalSessions || 12) - (enrollment.completedSessions || 0)),
    avgGrade: enrollment.avgGrade ?? student.avgGrade,
    lastGrade: enrollment.isPrimary ? student.lastGrade : (enrollment.avgGrade ?? 0),
    grades: enrollment.grades?.length ? enrollment.grades : (enrollment.isPrimary ? student.grades : []),
    linkHoc: enrollment.linkHoc || student.linkHoc, nextClass: enrollment.nextClass || student.nextClass,
    nextClassTime: enrollment.nextClassTime || student.nextClassTime,
    teacherAlert: enrollment.teacherAlert || student.teacherAlert || '',
    paid: enrollment.paid ?? student.paid, price: enrollment.price ?? student.price,
    activeEnrollmentId: enrollment.enrollmentId || enrollment.id };
}

/** SUM học phí đã thu của mọi khóa — đồng bộ BI / báo cáo doanh thu. */
export function sumClientPaidTuition(student) {
  if (!student) return 0;
  const list = getClientEnrollments(student);
  const isPaidEnr = (e) =>
    e?.paid === true
    || e?.paid === 'Đã đóng phí'
    || e?.paid === 'true'
    || e?.paid === 1;

  if (list.length > 0) {
    const fromPaid = list
      .filter(isPaidEnr)
      .reduce((s, e) => s + (Number(e.price) || 0), 0);
    if (fromPaid > 0) return fromPaid;
    const paidAmount = Number(student.paidAmount) || 0;
    if (paidAmount > 0) return paidAmount;
    if (student.paid) return list.reduce((s, e) => s + (Number(e.price) || 0), 0);
    return 0;
  }
  if (!student.paid) return 0;
  const paidAmount = Number(student.paidAmount) || 0;
  if (paidAmount > 0) return paidAmount;
  return Number(student.price) || 0;
}

/** Flatten HV → từng dòng khóa học (dùng tab Tài chính).
 * Active: Đã nộp / Chưa nộp.
 * Cancelled: chỉ hiện dòng Hoàn khi refundedAmount > 0 (hủy không hoàn ≠ thanh toán / ≠ hoàn).
 */
export function expandFinanceEnrollmentRows(students) {
  const rows = [];
  const isPaidEnr = (e) =>
    e?.paid === true
    || e?.paid === 'Đã đóng phí'
    || e?.paid === 'true'
    || e?.paid === 1;

  (students || []).forEach((student) => {
    const sid = student.id || student._id;
    const studentCode = String(student.studentCode || '').trim();
    const all = getClientEnrollments(student);
    const active = all.filter((e) => e?.status !== 'cancelled' && e?.status !== 'refunded');
    const cancelled = all.filter((e) => e?.status === 'cancelled' || e?.status === 'refunded');

    if (active.length === 0 && cancelled.length === 0) {
      rows.push({
        key: String(sid),
        studentId: sid,
        studentCode,
        studentName: student.name || '—',
        courseName: student.course || '—',
        price: Number(student.price) || 0,
        paid: !!student.paid,
        paymentMethod: student.paymentMethod || 'transfer',
        kind: 'tuition',
        enrollmentId: null,
        isLegacy: true,
      });
      return;
    }

    // Chỉ khóa còn hiệu lực — khóa đã hủy không còn hiện "Đã nộp"
    active.forEach((enr, idx) => {
      const enrId = enr.enrollmentId || enr.id;
      rows.push({
        key: `${sid}-${enrId || idx}`,
        studentId: sid,
        studentCode,
        studentName: student.name || '—',
        courseName: enr.courseName || enr.name || student.course || '—',
        price: Number(enr.price) || 0,
        paid: isPaidEnr(enr),
        paymentMethod: student.paymentMethod || 'transfer',
        kind: 'tuition',
        enrollmentId: enrId && enrId !== 'main' ? enrId : null,
        isLegacy: !enrId || enrId === 'main',
      });
    });

    // Chỉ hiện hoàn khi thực sự hoàn tiền (> 0)
    cancelled.forEach((enr, idx) => {
      const refundAmt = Math.abs(Number(enr.refundedAmount) || 0);
      if (!(refundAmt > 0)) return;
      const enrId = enr.enrollmentId || enr.id;
      const courseName = enr.courseName || enr.name || 'Khóa học';
      const coursePrice = Number(enr.price) || 0;
      rows.push({
        key: `${sid}-refund-${enrId || idx}`,
        studentId: sid,
        studentCode,
        studentName: student.name || '—',
        courseName: `${courseName} — Hoàn học phí`,
        price: -refundAmt,
        paid: false,
        paymentMethod: student.paymentMethod || 'transfer',
        kind: 'refund',
        enrollmentId: enrId && enrId !== 'main' ? enrId : null,
        isLegacy: false,
        originalPrice: coursePrice,
      });
    });
  });
  return rows;
}

/** Tổng: đã thu khóa active − hoàn thực tế (không cộng khóa hủy như doanh thu). */
export function summarizeFinanceEnrollmentRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const tuitionPaid = list.filter((r) => r.kind !== 'refund' && r.paid);
  const tuitionUnpaid = list.filter((r) => r.kind !== 'refund' && !r.paid);
  const refunds = list.filter((r) => r.kind === 'refund');

  const collectedActive = tuitionPaid.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const debt = tuitionUnpaid.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const refunded = refunds.reduce((s, r) => s + Math.abs(Number(r.price) || 0), 0);
  // Net enrollment-view = active paid − refunds (không cộng lại giá khóa đã hủy)
  const net = collectedActive - refunded;
  const listed = collectedActive + debt;

  return {
    collectedActive,
    cancelledGross: 0,
    gross: collectedActive,
    refunded,
    net,
    debt,
    listed,
  };
}

export function sumClientListedTuition(student) {
  if (!student) return 0;
  const list = getClientEnrollments(student);
  if (list.length > 0) {
    return list.reduce((s, e) => s + (Number(e.price) || 0), 0);
  }
  return Number(student.price) || 0;
}

export function filterSchedulesByCourse(schedules, courseName) {
  if (!courseName) return schedules || [];
  const want = normCourseKey(courseName);
  return (schedules || []).filter((s) => normCourseKey(s.course) === want);
}

function normCourseKey(name) {
  return String(name || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function getStudentCourseAccessKeys(enrollments, fallbackCourse) {
  const keys = new Set();
  (enrollments || []).forEach((e) => {
    if (e.courseId) keys.add(`id:${String(e.courseId)}`);
    const name = e.courseName || e.name;
    if (name) keys.add(`name:${normCourseKey(name)}`);
  });
  if (fallbackCourse) keys.add(`name:${normCourseKey(fallbackCourse)}`);
  return keys;
}

export function studentCanAccessTrainingItem(item, accessKeys, enrollments, fallbackCourse) {
  if (!item) return false;
  const { courseId: cid, courseName: cname } = item;
  if (!cid && !cname) return false; // Sửa lỗi: Không tự động cho phép nếu không có khóa cụ thể (để bộ lọc môn xử lý)
  if (cid && accessKeys.has(`id:${String(cid)}`)) return true;
  if (cname && accessKeys.has(`name:${normCourseKey(cname)}`)) return true;
  const enrolled = (enrollments || []).some((e) => {
    if (cid && e.courseId && String(e.courseId) === String(cid)) return true;
    const en = e.courseName || e.name;
    return cname && en && normCourseKey(en) === normCourseKey(cname);
  });
  if (enrolled) return true;
  return !!(fallbackCourse && cname && normCourseKey(fallbackCourse) === normCourseKey(cname));
}

function matchesActiveCourse(item, activeCourseName, enrollments) {
  if (!activeCourseName || activeCourseName === 'all') return true;
  const activeNorm = normCourseKey(activeCourseName);
  if (item.courseName && normCourseKey(item.courseName) === activeNorm) return true;
  const enr = (enrollments || []).find((e) => normCourseKey(e.courseName || e.name) === activeNorm);
  if (item.courseId && enr?.courseId && String(item.courseId) === String(enr.courseId)) return true;
  return false;
}

export function filterStudentTrainingFiles(files, { enrollments, fallbackCourse, activeCourseName, allowedSubjectIds, catalog } = {}) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];

  const accessKeys = getStudentCourseAccessKeys(enrollments, fallbackCourse);
  const hasEnrollment = !!(enrollments?.length || fallbackCourse);

  return list.filter((f) => {
    // 1) Khớp môn thi/môn học của khóa HV đang học (Excel, Word, PowerPoint, Canva...) -> Hiển thị ngay
    if (allowedSubjectIds?.length && itemMatchesSubjectIds(f, allowedSubjectIds, catalog)) {
      return true;
    }

    // 2) Gắn đúng khóa enrollment (id / tên khóa)
    if (studentCanAccessTrainingItem(f, accessKeys, enrollments, fallbackCourse)) {
      return matchesActiveCourse(f, activeCourseName, enrollments);
    }

    // 3) Tài liệu chung chưa gắn môn cụ thể
    if (hasEnrollment && !resolveItemExamSubjects(f, catalog).length) {
      return matchesActiveCourse(f, activeCourseName, enrollments);
    }

    return false;
  });
}

export function filterStudentTrainingVideos(videos, { enrollments, fallbackCourse, allowedSubjectIds, catalog } = {}) {
  const list = Array.isArray(videos) ? videos : [];
  if (!list.length) return [];

  const accessKeys = getStudentCourseAccessKeys(enrollments, fallbackCourse);
  const hasEnrollment = !!(enrollments?.length || fallbackCourse);

  return list.filter((v) => {
    // 1) Khớp môn thi của khóa HV đang học (cách chính để thấy video Admin xuất bản)
    if (allowedSubjectIds?.length && itemMatchesSubjectIds(v, allowedSubjectIds, catalog)) {
      return true;
    }

    // 2) Gắn trực tiếp theo enrollment (id / tên khóa)
    const id = v.id || v._id;
    if (id && accessKeys.has(`id:${String(id)}`)) return true;
    if (v.title && accessKeys.has(`name:${normCourseKey(v.title)}`)) return true;
    const linkedByEnrollment = (enrollments || []).some((e) => {
      if (id && e.courseId && String(e.courseId) === String(id)) return true;
      const en = e.courseName || e.name;
      return v.title && en && normCourseKey(en) === normCourseKey(v.title);
    });
    if (linkedByEnrollment) return true;
    if (fallbackCourse && v.title && normCourseKey(fallbackCourse) === normCourseKey(v.title)) return true;

    // 3) Nội dung chung chưa gắn môn: HV đã xếp lớp được xem
    if (hasEnrollment) {
      const itemSubs = resolveItemExamSubjects(v, catalog);
      if (!itemSubs.length) return true;
    }

    return false;
  });
}
