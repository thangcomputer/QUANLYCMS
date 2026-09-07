'use strict';

const crypto = require('crypto');

const STUDENT_PASS_PERCENT = 50;
const TEACHER_PASS_PERCENT = 80;
const TEACHER_SECTION_PASS_PERCENT = 50;

const SUBJECT_ALIASES = {
  coban: ['coban', 'computer', 'basic', 'maytinh', 'windows'],
  word: ['word'],
  excel: ['excel'],
  powerpoint: ['powerpoint', 'ppt', 'pp'],
  canva: ['canva'],
  situation: ['situation', 'supham', 'su-pham', 'pedagogy'],
};

const SECRET_FIELD_NAMES = new Set([
  'answer',
  'correct',
  'correctanswer',
  'correctanswers',
  'iscorrect',
  'explanation',
  'sampleanswer',
  'answerkey',
  'key',
]);

function fail(message, status = 400, code = 'INVALID_EXAM_ATTEMPT') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(String(value), 'base64url').toString('utf8');
}

function signingSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 16) fail('Máy chủ chưa cấu hình khóa ký kỳ thi', 503, 'EXAM_SIGNING_UNAVAILABLE');
  return secret;
}

function signPayload(payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyAttemptToken(token, expected = {}, options = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) fail('Attempt token không hợp lệ', 401, 'INVALID_ATTEMPT_TOKEN');
  const [body, suppliedSignature] = parts;
  const expectedSignature = crypto.createHmac('sha256', signingSecret()).update(body).digest();
  let supplied;
  try {
    supplied = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    fail('Attempt token không hợp lệ', 401, 'INVALID_ATTEMPT_TOKEN');
  }
  if (supplied.length !== expectedSignature.length || !crypto.timingSafeEqual(supplied, expectedSignature)) {
    fail('Attempt token không hợp lệ', 401, 'INVALID_ATTEMPT_TOKEN');
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(body));
  } catch {
    fail('Attempt token không hợp lệ', 401, 'INVALID_ATTEMPT_TOKEN');
  }
  if (payload.v !== 1 || !payload.attemptId || !payload.userId || !Array.isArray(payload.questionIds)) {
    fail('Attempt token thiếu dữ liệu bắt buộc', 401, 'INVALID_ATTEMPT_TOKEN');
  }
  if (
    !Number.isFinite(Number(payload.expiresAt))
    || (!options.allowExpired && Date.now() > Number(payload.expiresAt))
  ) {
    fail('Lượt thi đã hết hạn', 409, 'ATTEMPT_EXPIRED');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (value != null && String(payload[key]) !== String(value)) {
      fail('Attempt token không thuộc phiên hiện tại', 403, 'ATTEMPT_OWNERSHIP_MISMATCH');
    }
  }
  return payload;
}

function expandSubjectMatchIds(subjectId) {
  const wanted = String(subjectId || '').trim().toLowerCase();
  if (!wanted) return [];
  const ids = new Set([wanted, ...(SUBJECT_ALIASES[wanted] || [])]);
  // Môn custom "Word NC" / "Excel NC" dùng chung ngân hàng word/excel/powerpoint
  if (wanted.endsWith('-nc') && wanted.length > 3) {
    const base = wanted.slice(0, -3);
    ids.add(base);
    (SUBJECT_ALIASES[base] || []).forEach((alias) => ids.add(alias));
  }
  return [...ids];
}

function questionMatchesSubject(section, subjectId) {
  const actual = String(section || '').trim().toLowerCase();
  if (!actual) return false;
  return expandSubjectMatchIds(subjectId).includes(actual);
}

function resolveExamBankAccess(kind, role, canManage) {
  const normalizedRole = String(role || '').toLowerCase();
  if (canManage && ['admin', 'staff'].includes(normalizedRole)) {
    return { allowed: true, includeManagementBank: true };
  }
  if (kind === 'student' && normalizedRole === 'student') {
    return { allowed: true, includeManagementBank: false };
  }
  if (kind === 'teacher' && normalizedRole === 'teacher') {
    return { allowed: true, includeManagementBank: false };
  }
  return { allowed: false, includeManagementBank: false };
}

function isEssayQuestion(question) {
  const type = String(question?.type || '').trim().toLowerCase();
  if (['essay', 'tu_luan', 'tuluan'].includes(type)) return true;
  if (['multiple', 'mc', 'tracnghiem'].includes(type)) return false;
  return Boolean(
    question?.practiceFileName
    || question?.sampleAnswer
    || question?.attachedFileUrl
    || question?.practiceFileUrl,
  );
}

function answerSource(question) {
  if (question?.correct !== undefined) return question.correct;
  if (question?.answer !== undefined) return question.answer;
  if (question?.correctAnswer !== undefined) return question.correctAnswer;
  if (Array.isArray(question?.correctAnswers) && question.correctAnswers.length === 1) {
    return question.correctAnswers[0];
  }
  return undefined;
}

function normalizeCorrectIndex(raw, options) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0 && raw < options.length) return Math.floor(raw);
    if (raw >= 1 && raw <= options.length) return Math.floor(raw - 1);
  }
  const value = String(raw ?? '').trim();
  if (/^[A-Z]$/i.test(value)) {
    const idx = value.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    if (n >= 1 && n <= options.length) return n - 1;
    if (n >= 0 && n < options.length) return n;
  }
  const byText = options.findIndex((option) => option === value);
  return byText >= 0 ? byText : null;
}

function optionText(option) {
  if (option == null) return '';
  if (typeof option === 'string' || typeof option === 'number') return String(option).trim();
  if (typeof option === 'object') {
    return String(option.text ?? option.label ?? option.value ?? '').trim();
  }
  return '';
}

function stableQuestionId(question, index, scope) {
  const direct = question?.id ?? question?._id ?? question?.questionId;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const seed = {
    scope,
    index,
    section: question?.section || '',
    text: question?.q || question?.text || question?.questionText || '',
    options: (question?.options || []).map(optionText),
  };
  return `exam_${sha256(stableJson(seed)).slice(0, 24)}`;
}

function normalizeBank(bank, scope = 'exam') {
  const seen = new Set();
  return (Array.isArray(bank) ? bank : []).map((question, index) => {
    const id = stableQuestionId(question, index, scope);
    if (seen.has(id)) fail(`ID câu hỏi bị trùng: ${id}`, 503, 'DUPLICATE_BANK_QUESTION_ID');
    seen.add(id);
    const options = (Array.isArray(question?.options) ? question.options : [])
      .map(optionText)
      .filter(Boolean);
    const essay = isEssayQuestion(question);
    const correctIndex = essay ? null : normalizeCorrectIndex(answerSource(question), options);
    return {
      id,
      section: String(question?.section || '').trim().toLowerCase(),
      type: essay ? 'essay' : 'multiple',
      text: String(question?.q || question?.text || question?.questionText || '').trim(),
      options,
      correctIndex,
      imageUrl: String(question?.imageUrl || '').trim(),
      attachedFileUrl: String(question?.attachedFileUrl || question?.practiceFileUrl || '').trim(),
      attachedFileName: String(
        question?.attachedFileName || question?.practiceFileName || question?.attachedFile || '',
      ).trim(),
    };
  });
}

function stripExamSecrets(value) {
  if (Array.isArray(value)) return value.map(stripExamSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(String(key).toLowerCase())) continue;
    out[key] = stripExamSecrets(child);
  }
  return out;
}

function deterministicOrder(items, seed, idOf) {
  return [...items].sort((a, b) => {
    const ah = sha256(`${seed}:${idOf(a)}`);
    const bh = sha256(`${seed}:${idOf(b)}`);
    return ah.localeCompare(bh);
  });
}

function buildAttemptSet(bank, { kind, subjectIds, attemptId }) {
  const normalized = normalizeBank(bank, kind);
  const wanted = [...new Set((subjectIds || []).map((id) => String(id).trim().toLowerCase()).filter(Boolean))];
  const assigned = normalized.filter((question) => (
    wanted.some((subjectId) => questionMatchesSubject(question.section, subjectId))
  ));
  const mc = assigned.filter((question) => (
    question.type === 'multiple'
    && question.options.length >= 2
    && question.correctIndex != null
    && question.correctIndex >= 0
    && question.correctIndex < question.options.length
  ));
  if (!mc.length) fail('Không tải được bộ câu hỏi hợp lệ', 503, 'EXAM_BANK_UNAVAILABLE');

  const orderedMc = deterministicOrder(mc, `${attemptId}:questions`, (question) => question.id);
  const orderedEssays = deterministicOrder(
    assigned.filter((question) => question.type === 'essay'),
    `${attemptId}:essays`,
    (question) => question.id,
  );

  const internalMc = orderedMc.map((question) => {
    const indexedOptions = question.options.map((text, originalIndex) => ({ text, originalIndex }));
    const shuffled = deterministicOrder(
      indexedOptions,
      `${attemptId}:${question.id}:options`,
      (option) => option.originalIndex,
    );
    return {
      ...question,
      options: shuffled.map((option) => option.text),
      correctDisplayIndex: shuffled.findIndex((option) => option.originalIndex === question.correctIndex),
    };
  });

  const publicMc = internalMc.map((question) => ({
    id: question.id,
    q: question.text,
    text: question.text,
    questionText: question.text,
    options: [...question.options],
    section: question.section,
    type: 'multiple',
    imageUrl: question.imageUrl,
  }));
  const publicEssays = orderedEssays.map((question) => ({
    id: question.id,
    q: question.text,
    text: question.text,
    questionText: question.text,
    options: [],
    section: question.section,
    type: 'essay',
    imageUrl: question.imageUrl,
    attachedFileUrl: question.attachedFileUrl,
    attachedFileName: question.attachedFileName,
  }));

  const bankHash = sha256(stableJson(normalized.map((question) => ({
    id: question.id,
    section: question.section,
    type: question.type,
    text: question.text,
    options: question.options,
    correctIndex: question.correctIndex,
  }))));

  return {
    bankHash,
    internalMc,
    publicQuestions: stripExamSecrets([...publicMc, ...publicEssays]),
  };
}

function createExamAttempt({
  kind,
  userId,
  subjectIds,
  bank,
  attemptId = crypto.randomUUID(),
  ttlSeconds = 90 * 60,
}) {
  if (!['student', 'teacher'].includes(kind)) fail('Loại kỳ thi không hợp lệ');
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) fail('Thiếu người dự thi');
  const set = buildAttemptSet(bank, { kind, subjectIds, attemptId });
  const issuedAt = Date.now();
  const expiresAt = issuedAt + Math.max(1, Number(ttlSeconds) || 0) * 1000;
  const payload = {
    v: 1,
    kind,
    userId: cleanUserId,
    attemptId,
    subjectIds: [...new Set((subjectIds || []).map(String))],
    questionIds: set.internalMc.map((question) => question.id),
    bankHash: set.bankHash,
    issuedAt,
    expiresAt,
  };
  return {
    attemptId,
    attemptToken: signPayload(payload),
    issuedAt,
    expiresAt,
    questions: set.publicQuestions,
    questionCount: set.internalMc.length,
  };
}

function gradeExamAttempt({ token, expected, bank, answers }) {
  const payload = verifyAttemptToken(token, expected);
  const set = buildAttemptSet(bank, {
    kind: payload.kind,
    subjectIds: payload.subjectIds,
    attemptId: payload.attemptId,
  });
  if (set.bankHash !== payload.bankHash) {
    fail('Ngân hàng đề đã thay đổi, lượt thi không thể chấm an toàn', 409, 'EXAM_BANK_CHANGED');
  }
  if (
    payload.questionIds.length !== set.internalMc.length
    || payload.questionIds.some((id, index) => id !== set.internalMc[index].id)
  ) {
    fail('Bộ câu hỏi không khớp attempt', 409, 'ATTEMPT_QUESTION_SET_CHANGED');
  }
  if (!Array.isArray(answers)) {
    fail('Phải gửi đúng một câu trả lời cho mỗi câu hỏi', 400, 'ANSWER_COUNT_MISMATCH');
  }

  const allowedIds = new Set(payload.questionIds.map(String));
  // Bỏ câu tự luận (publicQuestions ghép sau MC) — token chỉ chấm trắc nghiệm
  const mcAnswers = answers.filter((answer) => allowedIds.has(String(answer?.questionId || '').trim()));
  if (mcAnswers.length !== payload.questionIds.length) {
    fail('Phải gửi đúng một câu trả lời cho mỗi câu hỏi', 400, 'ANSWER_COUNT_MISMATCH');
  }

  const supplied = new Map();
  for (const answer of mcAnswers) {
    const questionId = String(answer?.questionId || '').trim();
    if (!questionId || supplied.has(questionId)) {
      fail('Question ID bị thiếu hoặc trùng', 400, 'DUPLICATE_QUESTION_ID');
    }
    if (!payload.questionIds.includes(questionId)) {
      fail('Question ID không thuộc bộ đề đã cấp', 400, 'QUESTION_OUTSIDE_ATTEMPT');
    }
    const rawSelected = answer?.selectedOption;
    const selectedOption = rawSelected === null || rawSelected === undefined || rawSelected === ''
      ? -1
      : Number(rawSelected);
    if (!Number.isInteger(selectedOption)) {
      fail('Phương án trả lời không hợp lệ', 400, 'INVALID_SELECTED_OPTION');
    }
    supplied.set(questionId, selectedOption);
  }

  let correct = 0;
  const sectionStats = {};
  for (const question of set.internalMc) {
    if (!supplied.has(question.id)) fail('Thiếu câu trả lời', 400, 'ANSWER_COUNT_MISMATCH');
    const selected = supplied.get(question.id);
    if (selected < -1 || selected >= question.options.length) {
      fail('Phương án trả lời ngoài phạm vi', 400, 'INVALID_SELECTED_OPTION');
    }
    if (!sectionStats[question.section]) sectionStats[question.section] = { correct: 0, total: 0 };
    sectionStats[question.section].total += 1;
    if (selected === question.correctDisplayIndex) {
      correct += 1;
      sectionStats[question.section].correct += 1;
    }
  }

  const total = set.internalMc.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const sectionFailures = Object.entries(sectionStats)
    .filter(([, stat]) => Math.round((stat.correct / stat.total) * 100) < TEACHER_SECTION_PASS_PERCENT)
    .map(([sectionId, stat]) => ({ sectionId, ...stat }));
  const passed = payload.kind === 'teacher'
    ? percentage >= TEACHER_PASS_PERCENT && sectionFailures.length === 0
    : percentage >= STUDENT_PASS_PERCENT;

  return {
    payload,
    result: {
      correct,
      total,
      percentage,
      passed,
      sectionFailures: payload.kind === 'teacher' ? sectionFailures : [],
    },
  };
}

/**
 * Reload / mở tab mới không được thi tiếp: chỉ resume khi client còn giữ
 * attemptId trong bộ nhớ phiên làm bài (mất khi tải lại trang).
 */
function decideStudentAttemptStart(entry, liveAttemptId) {
  const status = String(entry?.status || '');
  if (['dat', 'khong_dat'].includes(status)) return { action: 'closed', attemptId: '' };
  if (String(entry?.thucHanh || '') === 'da_nop') return { action: 'awaiting', attemptId: '' };

  const attemptId = String(entry?.attemptId || '');
  const attemptStatus = String(entry?.attemptStatus || '');
  const open = status === 'dang_thi' && ['active', 'submitted'].includes(attemptStatus);
  if (!open || !attemptId) return { action: 'create', attemptId: '' };
  if (String(liveAttemptId || '') === attemptId) return { action: 'resume', attemptId };
  return { action: 'abandon', attemptId };
}

module.exports = {
  STUDENT_PASS_PERCENT,
  TEACHER_PASS_PERCENT,
  TEACHER_SECTION_PASS_PERCENT,
  SECRET_FIELD_NAMES,
  stripExamSecrets,
  normalizeBank,
  createExamAttempt,
  verifyAttemptToken,
  gradeExamAttempt,
  questionMatchesSubject,
  resolveExamBankAccess,
  decideStudentAttemptStart,
};
