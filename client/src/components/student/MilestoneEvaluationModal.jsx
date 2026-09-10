import React, { useState } from 'react';
import { Star, Building2, UserRound } from 'lucide-react';
import NavArrow from '../ui/NavArrow';
import { RATING_CRITERIA as DEFAULT_RATING_CRITERIA } from '../../context/useDataRatings';

const EMPTY = {
  satisfied: 'yes',
  lessonClear: 'yes',
  centerSupport: 'yes',
  centerFacility: 'yes',
  comment: '',
};

function pickPublicCriteria(source = {}) {
  const next = {};
  Object.keys(DEFAULT_RATING_CRITERIA).forEach((key) => {
    if (source[key]) next[key] = source[key];
  });
  return next;
}

/**
 * lesson_1 → đánh giá giảng viên (1 lần sau buổi đầu) — gửi Admin
 * course_end → một popup: bước 1 trung tâm (Admin), bước 2 GV công khai
 * startStep: 'teacher' khi resume (đã gửi trung tâm, chưa gửi GV)
 */
export function MilestoneEvaluationModal({
  milestone,
  startStep,
  studentId,
  teacherId,
  teacherName,
  courseName,
  onClose,
  onSubmit,
  rateTeacher,
  RATING_CRITERIA = DEFAULT_RATING_CRITERIA,
  existingPublicRating,
  onPublicRated,
}) {
  const isCourseEnd = milestone === 'course_end' || milestone === 'course_end_teacher';
  const existingCriteria = pickPublicCriteria(
    existingPublicRating?.criteria || existingPublicRating || {},
  );
  const alreadyPubliclyRated = Boolean(
    existingPublicRating?.criteria?.stars
    || existingPublicRating?.criteria?.teaching
    || Object.keys(RATING_CRITERIA || {}).every((k) => existingCriteria[k]),
  );

  const initialStep = startStep === 'teacher' || milestone === 'course_end_teacher'
    ? 'teacher'
    : (isCourseEnd ? 'center' : 'teacher');
  const [step, setStep] = useState(initialStep);
  const [feedback, setFeedback] = useState(EMPTY);
  const [ratingCriteria, setRatingCriteria] = useState(existingCriteria);
  const [ratingComment, setRatingComment] = useState(
    existingPublicRating?.comment || existingPublicRating?.content || '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const markTeacherMilestone = (criteria, comment) => onSubmit({
    studentId,
    teacherId,
    milestone: 'course_end_teacher',
    courseName,
    criteria: { ...criteria, publicRated: true },
    comment: comment || '',
  });

  const submitCenter = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        studentId,
        teacherId,
        milestone: 'course_end_center',
        courseName,
        criteria: {
          centerSupport: feedback.centerSupport,
          centerFacility: feedback.centerFacility,
        },
        comment: feedback.comment,
      });
      // Luôn sang bước GV (prefill nếu đã đánh giá ở tab) — lần cuối trước khi khóa
      setFeedback(EMPTY);
      setStep('teacher');
    } catch (err) {
      setError(err?.message || 'Không gửi được đánh giá. Thử lại nhé.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLesson1Teacher = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        studentId,
        teacherId,
        milestone: 'lesson_1',
        courseName,
        criteria: {
          satisfied: feedback.satisfied,
          lessonClear: feedback.lessonClear,
        },
        comment: feedback.comment,
      });
      onClose();
    } catch (err) {
      setError(err?.message || 'Không gửi được đánh giá. Thử lại nhé.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPublicTeacher = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (teacherId && typeof rateTeacher === 'function') {
        await rateTeacher(teacherId, studentId, ratingCriteria, ratingComment, {
          courseName,
          finalizeCourseEnd: true,
        });
      }
      // Đánh dấu cuối khóa → khóa không cho sửa/gửi lại sau này
      await markTeacherMilestone(ratingCriteria, ratingComment);
      if (typeof onPublicRated === 'function') onPublicRated(ratingCriteria, ratingComment);
      onClose();
    } catch (err) {
      setError(err?.message || 'Không gửi được đánh giá. Thử lại nhé.');
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === 'center'
    ? 'Đánh giá trung tâm'
    : (isCourseEnd ? 'Đánh giá giảng viên' : 'Đánh giá chất lượng');

  const subtitle = step === 'center'
    ? 'Gửi Admin — đánh giá trung tâm sau khi hoàn thành khóa'
    : (milestone === 'lesson_1'
      ? 'Buổi học đầu tiên — gửi Admin (GV không thấy)'
      : 'Bước cuối — đánh giá công khai (Thầy/Cô thấy sao)');

  const canSubmitCenter = feedback.comment.trim().length > 0;
  const canSubmitLesson1 = feedback.comment.trim().length > 0;
  const canSubmitPublic = Object.keys(RATING_CRITERIA || {}).every((k) => ratingCriteria[k]);
  const teacherLabel = (teacherName || '').trim();
  const isPublicTeacherStep = isCourseEnd && step === 'teacher';
  const isCompactHeader = isPublicTeacherStep;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in duration-300">
        <div className={`bg-gradient-to-r from-red-600 to-red-500 text-center text-white relative ${
          isCompactHeader ? 'px-4 py-4' : 'px-6 py-8'
        }`}>
          {!isCompactHeader ? (
            <p className="text-sm mt-1">Khóa học: {courseName}</p>
          ) : null}
          <div className={`bg-white/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner ${
            isCompactHeader ? 'w-10 h-10 mb-2' : 'w-16 h-16 mb-4'
          }`}>
            {step === 'center'
              ? <Building2 size={isCompactHeader ? 20 : 32} className="text-white" />
              : <Star size={isCompactHeader ? 20 : 32} className="fill-white text-white" />}
          </div>
          <h3 className={`font-black uppercase tracking-tight ${isCompactHeader ? 'text-base' : 'text-xl'}`}>
            {title}
          </h3>
          <p className={`text-red-100 font-medium italic ${isCompactHeader ? 'text-[10px] mt-0.5' : 'text-xs mt-1'}`}>
            {subtitle}
          </p>
          {isCourseEnd ? (
            <p className={`font-bold text-white/80 uppercase tracking-wider ${
              isCompactHeader ? 'text-[10px] mt-1' : 'text-[11px] mt-2'
            }`}>
              Bước {step === 'center' ? '1/2 · Trung tâm' : '2/2 · Giảng viên'}
            </p>
          ) : null}
        </div>

        <div className={isPublicTeacherStep ? 'p-4 space-y-3' : 'p-6 space-y-6'}>
          {error ? (
            <p className="text-xs font-bold text-red-600 text-center bg-red-50 rounded-xl px-3 py-2">{error}</p>
          ) : null}

          {step === 'center' ? (
            <>
              <p className="text-sm text-gray-600 leading-relaxed text-center font-medium">
                Bạn đã hoàn thành khóa học. Hãy đánh giá trung tâm trước nhé.
              </p>
              <div className="space-y-4">
                <YesNoRow
                  label="Hỗ trợ / tư vấn của trung tâm?"
                  value={feedback.centerSupport}
                  yesLabel="TỐT"
                  noLabel="CHƯA TỐT"
                  onChange={(v) => setFeedback({ ...feedback, centerSupport: v })}
                />
                <YesNoRow
                  label="Cơ sở vật chất / lịch học?"
                  value={feedback.centerFacility}
                  yesLabel="HÀI LÒNG"
                  noLabel="CHƯA"
                  onChange={(v) => setFeedback({ ...feedback, centerFacility: v })}
                />
                <textarea
                  value={feedback.comment}
                  onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                  placeholder="Góp ý cho trung tâm (bắt buộc)..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm outline-none focus:border-red-400 focus:bg-white transition-all h-24 italic"
                />
              </div>
              <button
                type="button"
                onClick={submitCenter}
                disabled={!canSubmitCenter || submitting}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 py-4 rounded-2xl text-white font-black text-sm shadow-xl shadow-red-100 active:scale-95 transition transform disabled:opacity-50 inline-flex items-center justify-center gap-1"
              >
                TIẾP TỤC
                <NavArrow size={16} className="text-white" />
                {alreadyPubliclyRated ? 'CHỈNH SỬA ĐÁNH GIÁ GV' : 'ĐÁNH GIÁ GIẢNG VIÊN'}
              </button>
            </>
          ) : !isCourseEnd ? (
            <>
              <p className="text-sm text-gray-600 leading-relaxed text-center font-medium inline-flex items-center justify-center gap-2 w-full">
                <UserRound size={16} className="text-red-500" />
                Chào buổi học đầu tiên! Cho Admin biết cảm nhận về Thầy/Cô.
              </p>
              <div className="space-y-4">
                <YesNoRow
                  label="Bạn hài lòng với Thầy?"
                  value={feedback.satisfied}
                  yesLabel="HÀI LÒNG"
                  noLabel="CHƯA"
                  onChange={(v) => setFeedback({ ...feedback, satisfied: v })}
                />
                <YesNoRow
                  label="Giảng bài dễ hiểu?"
                  value={feedback.lessonClear}
                  yesLabel="RẤT HIỂU"
                  noLabel="HƠI KHÓ"
                  onChange={(v) => setFeedback({ ...feedback, lessonClear: v })}
                />
                <textarea
                  value={feedback.comment}
                  onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                  placeholder="Lời nhắn riêng cho Admin (bắt buộc)..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm outline-none focus:border-red-400 focus:bg-white transition-all h-24 italic"
                />
              </div>
              <button
                type="button"
                onClick={submitLesson1Teacher}
                disabled={!canSubmitLesson1 || submitting}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 py-4 rounded-2xl text-white font-black text-sm shadow-xl shadow-red-100 active:scale-95 transition transform disabled:opacity-50"
              >
                GỬI ĐÁNH GIÁ
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-600 text-center font-medium truncate">
                {teacherLabel || 'Giảng viên'} · công khai
              </p>
              {alreadyPubliclyRated ? (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center font-semibold leading-snug">
                  Đã có đánh giá trước đó — chỉnh sửa lần cuối rồi gửi để khóa.
                </p>
              ) : null}
              <div className="space-y-1.5">
                {Object.entries(RATING_CRITERIA || {}).map(([catKey, cat]) => (
                  <div
                    key={catKey}
                    className="flex flex-col gap-1.5 px-2.5 py-2 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">
                      {cat.label}
                    </p>
                    <div className={`grid gap-1 ${cat.options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {cat.options.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setRatingCriteria((prev) => ({ ...prev, [catKey]: opt.key }))}
                          className={`min-h-[30px] px-1 py-1.5 rounded-lg text-[10px] font-black leading-tight transition-all ${
                            ratingCriteria[catKey] === opt.key
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-white text-gray-500 border border-gray-200 hover:border-red-200 hover:text-red-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Lời nhắn (tùy chọn)..."
                rows={2}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs outline-none focus:border-red-400 focus:bg-white transition-all resize-none italic"
              />
              <button
                type="button"
                onClick={submitPublicTeacher}
                disabled={!canSubmitPublic || submitting}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 py-3 rounded-xl text-white font-black text-sm shadow-lg shadow-red-100 active:scale-95 transition transform disabled:opacity-50"
              >
                {submitting
                  ? 'ĐANG GỬI…'
                  : (alreadyPubliclyRated ? 'GỬI & KHÓA ĐÁNH GIÁ' : 'GỬI ĐÁNH GIÁ')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function YesNoRow({ label, value, yesLabel, noLabel, onChange }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
      <span className="text-xs font-bold text-gray-700">{label}</span>
      <div className="flex gap-2">
        {['yes', 'no'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-3 py-1 rounded-full text-xs font-black transition-all ${
              value === v
                ? 'bg-red-500 text-white shadow-md shadow-red-200'
                : 'bg-white text-gray-400 border border-gray-200'
            }`}
          >
            {v === 'yes' ? yesLabel : noLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
