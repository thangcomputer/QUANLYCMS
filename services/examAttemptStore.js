'use strict';

/**
 * MongoDB cannot $set dotted paths on a null parent:
 *   { tracNghiem: null } + $set 'tracNghiem.score' → Plan executor error.
 * Rewrite nested score/total into a whole object so submit/forfeit work
 * for older examProgress rows that stored tracNghiem as null.
 */
function rewriteNullSafeTracNghiemFields(setFields = {}) {
  const out = { ...setFields };
  const scoreKey = 'examProgress.$.tracNghiem.score';
  const totalKey = 'examProgress.$.tracNghiem.total';
  if (!(scoreKey in out) && !(totalKey in out)) return out;

  const score = Number(out[scoreKey]);
  const total = Number(out[totalKey]);
  delete out[scoreKey];
  delete out[totalKey];
  out['examProgress.$.tracNghiem'] = {
    score: Number.isFinite(score) ? score : 0,
    total: Number.isFinite(total) ? total : 0,
  };
  return out;
}

function claimStudentAttempt(StudentModel, {
  studentId,
  subjectId,
  attemptId,
  setFields,
}) {
  return StudentModel.findOneAndUpdate(
    {
      _id: studentId,
      examProgress: {
        $elemMatch: {
          id: subjectId,
          attemptId,
          attemptStatus: 'active',
        },
      },
    },
    { $set: rewriteNullSafeTracNghiemFields(setFields) },
    { returnDocument: 'after', runValidators: true },
  );
}

/**
 * Hủy lượt thi còn mở (chưa chốt điểm) không cần attemptToken —
 * dùng khi học viên tải lại trang / đóng tab / mở lượt mới.
 */
function claimStudentOpenAttempt(StudentModel, {
  studentId,
  subjectId,
  attemptId = '',
  setFields,
}) {
  const elemMatch = {
    id: subjectId,
    status: { $nin: ['dat', 'khong_dat'] },
    attemptStatus: { $in: ['active', 'submitted'] },
  };
  if (attemptId) elemMatch.attemptId = attemptId;
  return StudentModel.findOneAndUpdate(
    { _id: studentId, examProgress: { $elemMatch: elemMatch } },
    { $set: rewriteNullSafeTracNghiemFields(setFields) },
    { returnDocument: 'after', runValidators: true },
  );
}

function claimTeacherAttempt(TeacherModel, {
  teacherId,
  attemptId,
  setFields,
}) {
  return TeacherModel.findOneAndUpdate(
    {
      _id: teacherId,
      examAttemptId: attemptId,
      examAttemptStatus: 'active',
    },
    { $set: setFields },
    { returnDocument: 'after', runValidators: true },
  );
}

module.exports = {
  rewriteNullSafeTracNghiemFields,
  claimStudentAttempt,
  claimStudentOpenAttempt,
  claimTeacherAttempt,
};
