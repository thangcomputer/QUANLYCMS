/**
 * Phiên làm bài "sống" chỉ tồn tại trong bộ nhớ tab.
 * Tải lại trang / mở tab khác => mất id => server tính RỚT (không cho thi tiếp).
 */
const liveAttempts = new Map();
const startRequests = new Map();

function liveKey(studentId, subjectId) {
  return `${String(studentId || '')}:${String(subjectId || '')}`;
}

export function getLiveExamAttemptId(studentId, subjectId) {
  return liveAttempts.get(liveKey(studentId, subjectId)) || '';
}

export function rememberLiveExamAttempt(studentId, subjectId, attemptId) {
  const id = String(attemptId || '').trim();
  if (!studentId || !subjectId || !id) return;
  liveAttempts.set(liveKey(studentId, subjectId), id);
}

export function clearLiveExamAttempt(studentId, subjectId) {
  const key = liveKey(studentId, subjectId);
  liveAttempts.delete(key);
  startRequests.delete(key);
}

/** Gộp các lần gọi mở lượt thi song song (StrictMode / remount) thành một request. */
export function shareExamAttemptStart(studentId, subjectId, starter) {
  const key = liveKey(studentId, subjectId);
  const pending = startRequests.get(key);
  if (pending) return pending;
  const request = Promise.resolve()
    .then(starter)
    .finally(() => { startRequests.delete(key); });
  startRequests.set(key, request);
  return request;
}
