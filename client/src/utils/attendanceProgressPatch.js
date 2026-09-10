import { normalizeCourseKey } from './examSubjects';

function courseKey(name) {
  return normalizeCourseKey(String(name || '').trim());
}

function numOrNaN(value) {
  if (value == null || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function capSessions(done, total) {
  const t = Number(total) > 0 ? Number(total) : 12;
  return Math.max(0, Math.min(t, Math.max(0, Number(done) || 0)));
}

function nextCompleted(prevDone, total, { targetDone, revert, incrementIfMissing }) {
  const prev = Math.max(0, Number(prevDone) || 0);
  const cap = Number(total) > 0 ? Number(total) : 12;
  if (revert) {
    if (Number.isFinite(targetDone) && targetDone > 0) {
      return prev === targetDone ? Math.max(0, prev - 1) : prev;
    }
    return prev;
  }
  if (Number.isFinite(targetDone) && targetDone > 0) {
    return Math.min(cap, Math.max(prev, targetDone));
  }
  if (incrementIfMissing) {
    return Math.min(cap, prev + 1);
  }
  return prev;
}

function enrollmentMatches(enr, course) {
  const want = courseKey(course);
  if (!want) return false;
  return courseKey(enr?.courseName || enr?.course || enr?.name) === want;
}

/**
 * Cập nhật completedSessions trên root + enrollment khớp khóa.
 * Math.max theo số buổi đích — gọi nhiều lần (API + socket) không cộng đôi.
 */
export function applyAttendanceProgressToStudents(prev, payload, options = {}) {
  const list = Array.isArray(prev) ? prev : [];
  if (!payload) return list;
  const studentId = String(payload.studentId?._id || payload.studentId || '');
  if (!studentId) return list;

  const course = String(payload.course || payload.courseName || '').trim();
  const targetDone = numOrNaN(
    payload.completedSessions != null ? payload.completedSessions : payload.sessionNumber,
  );
  const explicitTotal = numOrNaN(payload.totalSessions);
  const revert = options.revert === true;
  const incrementIfMissing = options.incrementIfMissing === true && !revert;
  const lockCheckIn = options.lockCheckIn === true && !revert;
  const skipProgress = options.skipProgress === true;

  const progressOpts = { targetDone, revert, incrementIfMissing };

  return list.map((s) => {
    if (String(s._id || s.id) !== studentId) return s;

    if (skipProgress) {
      if (!lockCheckIn) return s;
      return {
        ...s,
        can_check_in: false,
        remaining_cooldown_hours: 12,
        last_attendance_at: payload.attendedAt || payload.last_attendance_at || new Date().toISOString(),
      };
    }
    const enrollments = Array.isArray(s.enrollments) ? s.enrollments : [];
    const courses = Array.isArray(s.courses) ? s.courses : [];

    const patchEnr = (e) => {
      const et = Number(e.totalSessions) > 0
        ? Number(e.totalSessions)
        : (Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : 12);
      const ed = nextCompleted(e.completedSessions, et, progressOpts);
      return {
        ...e,
        completedSessions: capSessions(ed, et),
        remainingSessions: Math.max(0, et - capSessions(ed, et)),
      };
    };

    const patchList = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return arr;
      const idxs = [];
      if (course) {
        arr.forEach((e, i) => {
          if (enrollmentMatches(e, course)) idxs.push(i);
        });
      }
      if (idxs.length === 0 && arr.length === 1) idxs.push(0);
      if (!idxs.length) return arr;
      const set = new Set(idxs);
      return arr.map((e, i) => (set.has(i) ? patchEnr(e) : e));
    };

    const nextEnrollments = patchList(enrollments);
    const nextCourses = patchList(courses);
    const source = (nextCourses.length ? nextCourses : nextEnrollments);
    const matched = course
      ? source.filter((e) => enrollmentMatches(e, course))
      : (source.length === 1 ? source : []);
    const primaryMatch = matched[0] || (source.length === 1 ? source[0] : null);

    const rootTotal = Number(s.totalSessions) > 0
      ? Number(s.totalSessions)
      : (Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : 12);

    const syncRoot = Boolean(primaryMatch) && (
      source.length === 1
      || primaryMatch.isPrimary
      || courseKey(s.course) === courseKey(primaryMatch.courseName || primaryMatch.course || primaryMatch.name)
    );

    let nextRootDone = nextCompleted(s.completedSessions, rootTotal, progressOpts);
    if (syncRoot) {
      nextRootDone = primaryMatch.completedSessions;
    } else if (matched.length && !syncRoot) {
      nextRootDone = Number(s.completedSessions) || 0;
    }

    const patched = {
      ...s,
      completedSessions: capSessions(nextRootDone, rootTotal),
      remainingSessions: Math.max(0, rootTotal - capSessions(nextRootDone, rootTotal)),
      ...(nextEnrollments !== enrollments ? { enrollments: nextEnrollments } : {}),
      ...(nextCourses !== courses ? { courses: nextCourses } : {}),
    };

    if (lockCheckIn) {
      patched.can_check_in = false;
      patched.remaining_cooldown_hours = 12;
      patched.last_attendance_at = payload.attendedAt || payload.last_attendance_at || new Date().toISOString();
      const lockEnrollment = (enrollment) => (
        course && enrollmentMatches(enrollment, course)
          ? {
              ...enrollment,
              can_check_in: false,
              remaining_cooldown_hours: 12,
              last_attendance_at: patched.last_attendance_at,
            }
          : enrollment
      );
      if (Array.isArray(patched.enrollments)) {
        patched.enrollments = patched.enrollments.map(lockEnrollment);
      }
      if (Array.isArray(patched.courses)) {
        patched.courses = patched.courses.map(lockEnrollment);
      }
    }
    return patched;
  });
}
