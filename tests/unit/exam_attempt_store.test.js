'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rewriteNullSafeTracNghiemFields,
  claimStudentAttempt,
  claimTeacherAttempt,
} = require('../../services/examAttemptStore');

/** Mimic MongoDB: cannot create a subfield on a null parent. */
function applyDottedSet(target, path, value) {
  const parts = String(path).split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== 'object') {
      throw new Error(
        `Cannot create field '${parts[i + 1]}' in element {${key}: ${JSON.stringify(cur[key])}}`,
      );
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

test('student attempt atomic claim allows one concurrent writer', async () => {
  const state = {
    _id: 'student-1',
    examProgress: [{
      id: 'word',
      attemptId: 'attempt-1',
      attemptStatus: 'active',
    }],
  };
  let writes = 0;
  const StudentModel = {
    findOneAndUpdate(filter, update) {
      const expected = filter.examProgress.$elemMatch;
      const entry = state.examProgress.find((item) => (
        item.id === expected.id
        && item.attemptId === expected.attemptId
        && item.attemptStatus === expected.attemptStatus
      ));
      if (!entry) return Promise.resolve(null);
      entry.attemptStatus = update.$set['examProgress.$.attemptStatus'];
      writes += 1;
      return Promise.resolve(structuredClone(state));
    },
  };

  const input = {
    studentId: 'student-1',
    subjectId: 'word',
    attemptId: 'attempt-1',
    setFields: { 'examProgress.$.attemptStatus': 'submitted' },
  };
  const results = await Promise.all([
    claimStudentAttempt(StudentModel, input),
    claimStudentAttempt(StudentModel, input),
  ]);

  assert.equal(writes, 1);
  assert.equal(results.filter(Boolean).length, 1);
});

test('teacher attempt atomic claim allows one concurrent writer', async () => {
  const state = {
    _id: 'teacher-1',
    examAttemptId: 'attempt-1',
    examAttemptStatus: 'active',
  };
  let writes = 0;
  const TeacherModel = {
    findOneAndUpdate(filter, update) {
      const matched = state._id === filter._id
        && state.examAttemptId === filter.examAttemptId
        && state.examAttemptStatus === filter.examAttemptStatus;
      const promise = matched
        ? (() => {
          state.examAttemptStatus = update.$set.examAttemptStatus;
          writes += 1;
          return Promise.resolve(structuredClone(state));
        })()
        : Promise.resolve(null);
      promise.select = () => promise;
      return promise;
    },
  };

  const input = {
    teacherId: 'teacher-1',
    attemptId: 'attempt-1',
    setFields: { examAttemptStatus: 'submitted' },
  };
  const results = await Promise.all([
    claimTeacherAttempt(TeacherModel, input),
    claimTeacherAttempt(TeacherModel, input),
  ]);

  assert.equal(writes, 1);
  assert.equal(results.filter(Boolean).length, 1);
});

test('rewriteNullSafeTracNghiemFields replaces dotted score/total with whole object', () => {
  const rewritten = rewriteNullSafeTracNghiemFields({
    'examProgress.$.tracNghiem.score': 18,
    'examProgress.$.tracNghiem.total': 30,
    'examProgress.$.status': 'dang_thi',
    'examProgress.$.attemptStatus': 'submitted',
  });
  assert.deepEqual(rewritten['examProgress.$.tracNghiem'], { score: 18, total: 30 });
  assert.equal(rewritten['examProgress.$.status'], 'dang_thi');
  assert.equal(rewritten['examProgress.$.attemptStatus'], 'submitted');
  assert.equal('examProgress.$.tracNghiem.score' in rewritten, false);
  assert.equal('examProgress.$.tracNghiem.total' in rewritten, false);
});

test('submit $set on null tracNghiem: dotted path fails, rewritten object succeeds', () => {
  const entry = { id: 'coban', status: 'dang_thi', tracNghiem: null, attemptStatus: 'active' };

  assert.throws(
    () => applyDottedSet(entry, 'tracNghiem.score', 18),
    /Cannot create field 'score' in element \{tracNghiem: null\}/,
  );

  const rewritten = rewriteNullSafeTracNghiemFields({
    'examProgress.$.tracNghiem.score': 18,
    'examProgress.$.tracNghiem.total': 30,
  });
  applyDottedSet(entry, 'tracNghiem', rewritten['examProgress.$.tracNghiem']);
  assert.deepEqual(entry.tracNghiem, { score: 18, total: 30 });
});

test('claimStudentAttempt writes whole tracNghiem when parent is null', async () => {
  const state = {
    _id: 'student-2',
    examProgress: [{
      id: 'coban',
      attemptId: 'attempt-2',
      attemptStatus: 'active',
      tracNghiem: null,
    }],
  };
  const StudentModel = {
    findOneAndUpdate(filter, update) {
      const expected = filter.examProgress.$elemMatch;
      const entry = state.examProgress.find((item) => (
        item.id === expected.id
        && item.attemptId === expected.attemptId
        && item.attemptStatus === expected.attemptStatus
      ));
      if (!entry) return Promise.resolve(null);
      const set = update.$set || {};
      assert.ok(set['examProgress.$.tracNghiem']);
      assert.equal('examProgress.$.tracNghiem.score' in set, false);
      entry.tracNghiem = set['examProgress.$.tracNghiem'];
      entry.attemptStatus = set['examProgress.$.attemptStatus'];
      return Promise.resolve(structuredClone(state));
    },
  };

  const result = await claimStudentAttempt(StudentModel, {
    studentId: 'student-2',
    subjectId: 'coban',
    attemptId: 'attempt-2',
    setFields: {
      'examProgress.$.tracNghiem.score': 12,
      'examProgress.$.tracNghiem.total': 30,
      'examProgress.$.attemptStatus': 'submitted',
    },
  });

  assert.equal(result.examProgress[0].tracNghiem.score, 12);
  assert.equal(result.examProgress[0].tracNghiem.total, 30);
  assert.equal(result.examProgress[0].attemptStatus, 'submitted');
});
