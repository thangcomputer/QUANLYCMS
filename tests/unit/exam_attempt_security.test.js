'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createExamAttempt,
  gradeExamAttempt,
  stripExamSecrets,
  resolveExamBankAccess,
  verifyAttemptToken,
  decideStudentAttemptStart,
} = require('../../services/examAttemptService');

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'unit-test-only-exam-signing-secret-123456789';

test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

const studentBank = [
  {
    id: 'word-1',
    section: 'word',
    type: 'multiple',
    q: 'Câu 1',
    options: ['Sai', 'Đúng', 'Khác'],
    correct: 1,
    explanation: 'Không được gửi',
    nested: { correctAnswer: 1, label: 'safe' },
  },
  {
    id: 'word-2',
    section: 'word',
    type: 'multiple',
    q: 'Câu 2',
    options: ['A', 'B'],
    answer: 'A',
  },
  {
    id: 'excel-1',
    section: 'excel',
    type: 'multiple',
    q: 'Ngoài môn',
    options: ['A', 'B'],
    correct: 0,
  },
];

function containsSecretKey(value) {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => (
    ['answer', 'correct', 'correctanswer', 'correctanswers', 'iscorrect', 'explanation', 'sampleanswer']
      .includes(key.toLowerCase())
    || containsSecretKey(child)
  ));
}

test('candidate DTO recursively removes answer keys without mutating bank', () => {
  const original = structuredClone(studentBank);
  const attempt = createExamAttempt({
    kind: 'student',
    userId: 'student-a',
    subjectIds: ['word'],
    bank: studentBank,
    attemptId: 'attempt-safe-dto',
    ttlSeconds: 600,
  });

  assert.equal(attempt.questions.length, 2);
  assert.equal(containsSecretKey(attempt.questions), false);
  assert.deepEqual(studentBank, original);

  const nested = stripExamSecrets({
    options: [{ text: 'A', isCorrect: true }],
    explanation: 'secret',
  });
  assert.deepEqual(nested, { options: [{ text: 'A' }] });
});

test('exam bank role matrix separates management bank from candidate delivery', () => {
  assert.deepEqual(resolveExamBankAccess('student', 'student', false), {
    allowed: true,
    includeManagementBank: false,
  });
  assert.equal(resolveExamBankAccess('student', 'teacher', false).allowed, false);
  assert.equal(resolveExamBankAccess('student', 'staff', false).allowed, false);
  assert.equal(resolveExamBankAccess('student', 'staff', true).includeManagementBank, true);
  assert.equal(resolveExamBankAccess('student', 'admin', true).includeManagementBank, true);

  assert.equal(resolveExamBankAccess('teacher', 'student', false).allowed, false);
  assert.deepEqual(resolveExamBankAccess('teacher', 'teacher', false), {
    allowed: true,
    includeManagementBank: false,
  });
  assert.equal(resolveExamBankAccess('teacher', 'staff', false).allowed, false);
  assert.equal(resolveExamBankAccess('teacher', 'staff', true).includeManagementBank, true);
  assert.equal(resolveExamBankAccess('teacher', 'admin', true).includeManagementBank, true);
});

test('server grading ignores forged result fields and uses the real denominator', () => {
  const attempt = createExamAttempt({
    kind: 'student',
    userId: 'student-a',
    subjectIds: ['word'],
    bank: studentBank,
    attemptId: 'attempt-grade',
    ttlSeconds: 600,
  });
  const wrongAnswers = attempt.questions.map((question) => ({
    questionId: question.id,
    selectedOption: null,
  }));
  const graded = gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-a' },
    bank: studentBank,
    answers: wrongAnswers,
    score: 100,
    total: 1,
    status: 'dat',
  });

  assert.equal(graded.result.correct, 0);
  assert.equal(graded.result.total, 2);
  assert.equal(graded.result.passed, false);
});

test('server rejects outside, duplicate, missing and cross-user answers', () => {
  const attempt = createExamAttempt({
    kind: 'student',
    userId: 'student-a',
    subjectIds: ['word'],
    bank: studentBank,
    attemptId: 'attempt-invalid',
    ttlSeconds: 600,
  });
  const validShape = attempt.questions.map((question) => ({
    questionId: question.id,
    selectedOption: null,
  }));

  assert.throws(() => gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-b' },
    bank: studentBank,
    answers: validShape,
  }), (err) => err.status === 403);

  assert.throws(() => gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-a' },
    bank: studentBank,
    answers: validShape.slice(0, 1),
  }), (err) => err.code === 'ANSWER_COUNT_MISMATCH');

  assert.throws(() => gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-a' },
    bank: studentBank,
    answers: [
      validShape[0],
      { questionId: validShape[0].questionId, selectedOption: null },
    ],
  }), (err) => err.code === 'DUPLICATE_QUESTION_ID');

  assert.throws(() => gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-a' },
    bank: studentBank,
    answers: [
      validShape[0],
      { questionId: 'outside-question', selectedOption: 0 },
    ],
  }), (err) => err.code === 'ANSWER_COUNT_MISMATCH');
});

test('grading ignores extra essay rows appended after MC answers', () => {
  const bank = [
    ...studentBank,
    {
      id: 'word-essay',
      section: 'word',
      type: 'essay',
      q: 'Thực hành',
      sampleAnswer: 'secret',
    },
  ];
  const attempt = createExamAttempt({
    kind: 'student',
    userId: 'student-a',
    subjectIds: ['word'],
    bank,
    attemptId: 'attempt-ignore-essay',
    ttlSeconds: 600,
  });
  assert.equal(attempt.questionCount, 2);
  const mcAnswers = attempt.questions
    .filter((q) => q.type === 'multiple')
    .map((question) => ({ questionId: question.id, selectedOption: null }));
  const graded = gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'student', userId: 'student-a' },
    bank,
    answers: [
      ...mcAnswers,
      { questionId: 'word-essay', selectedOption: null },
    ],
  });
  assert.equal(graded.result.total, 2);
  assert.equal(graded.result.correct, 0);
});

test('teacher grading enforces overall and per-section thresholds on server', () => {
  const bank = [
    { id: 'w1', section: 'word', q: 'W1', options: ['A', 'B'], correct: 0 },
    { id: 'w2', section: 'word', q: 'W2', options: ['A', 'B'], correct: 0 },
    { id: 'e1', section: 'excel', q: 'E1', options: ['A', 'B'], correct: 0 },
    { id: 'e2', section: 'excel', q: 'E2', options: ['A', 'B'], correct: 0 },
    { id: 'e3', section: 'excel', q: 'E3', options: ['A', 'B'], correct: 0 },
  ];
  const attempt = createExamAttempt({
    kind: 'teacher',
    userId: 'teacher-a',
    subjectIds: ['word', 'excel'],
    bank,
    attemptId: 'teacher-attempt',
    ttlSeconds: 600,
  });
  const answers = attempt.questions.map((question) => ({
    questionId: question.id,
    selectedOption: null,
  }));
  const graded = gradeExamAttempt({
    token: attempt.attemptToken,
    expected: { kind: 'teacher', userId: 'teacher-a' },
    bank,
    answers,
  });

  assert.equal(graded.result.percentage, 0);
  assert.equal(graded.result.passed, false);
  assert.equal(graded.result.sectionFailures.some((item) => item.sectionId === 'word'), true);
  assert.equal(graded.result.sectionFailures.some((item) => item.sectionId === 'excel'), true);
});

test('expired signed token is accepted only for idempotent forfeit verification', () => {
  const realNow = Date.now;
  try {
    Date.now = () => 1_000;
    const attempt = createExamAttempt({
      kind: 'student',
      userId: 'student-a',
      subjectIds: ['word'],
      bank: studentBank,
      attemptId: 'attempt-expired-forfeit',
      ttlSeconds: 1,
    });
    Date.now = () => 3_000;

    assert.throws(() => verifyAttemptToken(attempt.attemptToken, {
      kind: 'student',
      userId: 'student-a',
    }), (err) => err.code === 'ATTEMPT_EXPIRED');

    const payload = verifyAttemptToken(attempt.attemptToken, {
      kind: 'student',
      userId: 'student-a',
    }, { allowExpired: true });
    assert.equal(payload.attemptId, 'attempt-expired-forfeit');
  } finally {
    Date.now = realNow;
  }
});

test('reload / new tab cannot resume a live attempt', () => {
  const active = {
    id: 'word',
    status: 'dang_thi',
    attemptId: 'attempt-live',
    attemptStatus: 'active',
  };
  // Cùng tab: còn giữ attemptId trong bộ nhớ → thi tiếp
  assert.deepEqual(
    decideStudentAttemptStart(active, 'attempt-live'),
    { action: 'resume', attemptId: 'attempt-live' },
  );
  // Tải lại trang / tab khác: mất attemptId → hủy bài
  assert.deepEqual(
    decideStudentAttemptStart(active, ''),
    { action: 'abandon', attemptId: 'attempt-live' },
  );
  // Đã nộp trắc nghiệm nhưng chưa thực hành cũng không được vào lại sau reload
  assert.equal(
    decideStudentAttemptStart({ ...active, attemptStatus: 'submitted' }, '').action,
    'abandon',
  );
});

test('decideStudentAttemptStart: chốt điểm / chờ chấm / lượt mới', () => {
  assert.equal(decideStudentAttemptStart({ id: 'word', status: 'khong_dat' }, '').action, 'closed');
  assert.equal(decideStudentAttemptStart({ id: 'word', status: 'dat' }, '').action, 'closed');
  assert.equal(
    decideStudentAttemptStart({ id: 'word', status: 'dang_thi', thucHanh: 'da_nop' }, '').action,
    'awaiting',
  );
  assert.equal(decideStudentAttemptStart({ id: 'word', status: 'chua_thi' }, '').action, 'create');
  assert.equal(decideStudentAttemptStart(undefined, '').action, 'create');
});

test('Word NC / Excel NC reuse the office question bank', () => {
  const attempt = createExamAttempt({
    kind: 'student',
    userId: 'student-nc',
    subjectIds: ['word-nc'],
    bank: studentBank,
    attemptId: 'attempt-word-nc',
    ttlSeconds: 600,
  });
  assert.equal(attempt.questionCount, 2);
  assert.ok(attempt.questions.every((q) => q.section === 'word'));
});
