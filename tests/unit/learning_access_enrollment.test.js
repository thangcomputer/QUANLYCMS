'use strict';

/**
 * Unit tests for Student Learning Access Gate SoT.
 * Mirrors client/src/utils/enrollments.js learning helpers:
 *   hasLearningAccessEnrollment = structured enrollments/courses with
 *   status active|completed|paused (not cancelled/refunded/pending_payment)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function isPlaceholderCourseName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === '(đã hủy)' || n === 'chưa xếp lớp';
}

function getClientEnrollments(student) {
  if (!student) return [];
  if (Array.isArray(student.courses) && student.courses.length > 0) {
    return student.courses.map((c, idx) => ({
      ...c,
      status: c.status || 'active',
      enrollmentId: c.enrollmentId || c.id || `course-${idx}`,
      courseName: c.courseName || c.name,
      name: c.name || c.courseName,
    }));
  }
  if (Array.isArray(student.enrollments) && student.enrollments.length > 0) {
    return student.enrollments.map((e, idx) => ({
      ...e,
      status: e.status || 'active',
      enrollmentId: e._id ? String(e._id) : `enr-${idx}`,
      courseName: e.courseName || e.course,
      name: e.courseName || e.course,
    }));
  }
  if (student.course && String(student.course).trim()) {
    return [{
      status: student.status === 'Hoàn thành' ? 'completed' : 'active',
      enrollmentId: 'main',
      courseName: student.course,
      name: student.course,
    }];
  }
  return [];
}

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

function getActiveClientEnrollments(student) {
  return getClientEnrollments(student).filter(
    (e) => e?.status !== 'cancelled' && e?.status !== 'refunded',
  );
}

function getLearningAccessEnrollments(student) {
  if (!student) return [];
  let list = getStructuredClientEnrollments(student);
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
    return !isPlaceholderCourseName(e?.courseName || e?.name || '');
  });
}

function hasLearningAccessEnrollment(student) {
  return getLearningAccessEnrollments(student).length > 0;
}

describe('hasLearningAccessEnrollment SoT (active|completed|paused)', () => {
  it('allows when ≥1 enrollment is active', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [{ courseName: 'A', status: 'active' }],
    }), true);
  });

  it('allows completed-only (HV học xong vẫn vào learning)', () => {
    const student = { enrollments: [{ courseName: 'A', status: 'completed' }] };
    assert.equal(hasLearningAccessEnrollment(student), true);
    assert.equal(getActiveClientEnrollments(student).length, 1);
  });

  it('allows paused', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [{ courseName: 'A', status: 'paused' }],
    }), true);
  });

  it('blocks cancelled-only', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [{ courseName: 'A', status: 'cancelled', refundedAmount: 4_000_000 }],
    }), false);
  });

  it('blocks refunded-only', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [{ courseName: 'A', status: 'refunded' }],
    }), false);
  });

  it('blocks learningAccess false even if completed', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [{ courseName: 'A', status: 'completed', learningAccess: false }],
    }), false);
  });

  it('allows multi-course when one remains active after cancel', () => {
    assert.equal(hasLearningAccessEnrollment({
      enrollments: [
        { courseName: 'Old', status: 'cancelled' },
        { courseName: 'New', status: 'active' },
      ],
    }), true);
  });

  it('blocks empty / no enrollments', () => {
    assert.equal(hasLearningAccessEnrollment(null), false);
    assert.equal(hasLearningAccessEnrollment({}), false);
    assert.equal(hasLearningAccessEnrollment({ enrollments: [] }), false);
  });

  it('uses courses[] when present', () => {
    assert.equal(hasLearningAccessEnrollment({
      courses: [{ name: 'X', status: 'cancelled' }],
    }), false);
    assert.equal(hasLearningAccessEnrollment({
      courses: [{ name: 'X', status: 'active' }],
    }), true);
    assert.equal(hasLearningAccessEnrollment({
      courses: [{ name: 'X', status: 'completed' }],
    }), true);
  });

  it('does NOT invent access from placeholder root course', () => {
    assert.equal(hasLearningAccessEnrollment({
      course: '(Đã hủy)',
      enrollments: [],
    }), false);
    assert.equal(hasLearningAccessEnrollment({
      course: 'Chưa xếp lớp',
    }), false);
  });

  it('allows legacy root course when completed / đang học', () => {
    assert.equal(hasLearningAccessEnrollment({
      course: 'IC3 SPARK',
      status: 'Hoàn thành',
      enrollments: [],
      courses: [],
    }), true);
    assert.equal(hasLearningAccessEnrollment({
      course: 'IC3 SPARK',
      status: 'Đang học',
      enrollments: [],
      courses: [],
    }), true);
  });

  it('blocks placeholder course name even if status active', () => {
    assert.equal(hasLearningAccessEnrollment({
      courses: [{ name: '(Đã hủy)', status: 'active' }],
    }), false);
  });

  it('blocks cancelled enrollments even when root course still set', () => {
    assert.equal(hasLearningAccessEnrollment({
      course: '(Đã hủy)',
      enrollments: [{ courseName: 'IC3', status: 'cancelled' }],
    }), false);
  });
});

describe('static: student learning routes gated vs ungated', () => {
  const root = path.join(__dirname, '..', '..');
  const appSrc = fs.readFileSync(path.join(root, 'client', 'src', 'App.jsx'), 'utf8');
  const sidebarSrc = fs.readFileSync(path.join(root, 'client', 'src', 'components', 'AppSidebar.jsx'), 'utf8');
  const enrollmentsSrc = fs.readFileSync(path.join(root, 'client', 'src', 'utils', 'enrollments.js'), 'utf8');
  const gateSrc = fs.readFileSync(
    path.join(root, 'client', 'src', 'components', 'student', 'StudentLearningAccessGate.jsx'),
    'utf8',
  );

  it('exports hasLearningAccessEnrollment helper without inventing cancel placeholders', () => {
    assert.match(enrollmentsSrc, /export function hasLearningAccessEnrollment/);
    assert.match(enrollmentsSrc, /getStructuredClientEnrollments/);
    assert.match(enrollmentsSrc, /isPlaceholderCourseName/);
    assert.match(enrollmentsSrc, /completed/);
  });

  it('gates /student and exam routes; leaves inbox/feed/news ungated', () => {
    assert.match(appSrc, /StudentLearningAccessGate/);
    assert.match(appSrc, /path="\/student"/);
    assert.match(appSrc, /path="\/student\/exam"/);
    assert.match(appSrc, /path="\/student\/exam\/:subjectId"/);

    const inboxBlock = appSrc.slice(appSrc.indexOf('path="/student/inbox"'), appSrc.indexOf('path="/student/feed"'));
    assert.doesNotMatch(inboxBlock, /StudentLearningAccessGate/);

    const feedBlock = appSrc.slice(appSrc.indexOf('path="/student/feed"'), appSrc.indexOf('path="/student/news"'));
    assert.doesNotMatch(feedBlock, /StudentLearningAccessGate/);
  });

  it('sidebar marks learning items requiresLearningAccess', () => {
    assert.match(sidebarSrc, /requiresLearningAccess:\s*true/);
    assert.match(sidebarSrc, /hasLearningAccessEnrollment/);
  });

  it('gate kick-out: hết khóa usable → logout + redirect đăng ký lại', () => {
    assert.match(gateSrc, /isStudentsLoading/);
    assert.match(gateSrc, /mustKick/);
    assert.match(gateSrc, /hasLearningAccessEnrollment/);
    assert.match(gateSrc, /dangkykhoahoc/);
    assert.match(gateSrc, /window\.location\.replace/);
    assert.match(gateSrc, /clearTokens\('student'\)/);
    // Chỉ kick khi đã có hồ sơ và không còn enrollment usable
    assert.match(gateSrc, /student && !hasLearningAccessEnrollment\(student\)/);
  });
});
