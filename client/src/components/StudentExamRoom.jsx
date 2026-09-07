import React, { useState, useMemo } from 'react';
import CmsSelect from './ui/CmsSelect';
import {
  Award, Bell, ChevronRight, Clock, FileText, Monitor,
  CheckCircle, XCircle, Lock, Trophy, User, LogOut,
  BarChart2, BookOpen, Play, Filter
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { getClientEnrollments } from '../utils/enrollments';
import {
  getSubjectIdsForStudent,
  getSubjectIdsForCourseFilter,
  resolveExamFilterStatus,
  buildExamSubjectsFromProgress,
  getExamSubjectMeta,
  getExamSubjectInitials,
  isExamUnlockedForSubject,
  isExamProgressLocked,
  canEnterCertificationExam,
  canStartCertificationSubject,
} from '../utils/examSubjects';
import { useIsDesktopExamDevice } from '../utils/examDevice';
import StudentQuizList from './student/StudentQuizList';
import api from '../services/api';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'chua_thi', label: 'Chưa thi' },
  { value: 'da_thi', label: 'Đã thi' },
  { value: 'rot', label: 'Rớt' },
];
function lockUntilMs(target) {
  if (target == null || target === '') return 0;
  if (typeof target === 'number' && Number.isFinite(target)) return target;
  const n = new Date(target).getTime();
  return Number.isFinite(n) ? n : 0;
}

function formatLockCountdown(targetMs, now = Date.now()) {
  if (!targetMs) return '';
  const diff = targetMs - now;
  if (diff <= 0) return '00:00:00';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${d} ngày ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useCountdown(target) {
  const targetMs = lockUntilMs(target);
  const [remaining, setRemaining] = React.useState(() => formatLockCountdown(targetMs));

  React.useEffect(() => {
    if (!targetMs) {
      setRemaining('');
      return undefined;
    }
    const tick = () => setRemaining(formatLockCountdown(targetMs));
    tick();
    const t = setInterval(tick, 1000);
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      tick();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [targetMs]);

  return remaining;
}

const SubjectCard = ({ subject, onStart, isGlobalApproved, examSubjectsCatalog, allowStartExam = true }) => {
  const meta = getExamSubjectMeta(subject.id, examSubjectsCatalog);
  const initials = getExamSubjectInitials(meta);
  const countdown = useCountdown(subject.lockUntil);

  const isApproved = isGlobalApproved || subject.meetsMilestone;
  const isLockedCountDown = lockUntilMs(subject.lockUntil) > Date.now();

  const tnScore = subject.tracNghiem?.score ?? null;
  const tnTotal = subject.tracNghiem?.total ?? 30;
  const tnPct = subject.tracNghiem && tnTotal > 0 ? Math.round((tnScore / tnTotal) * 100) : null;
  const tnFailed = tnPct !== null && tnPct < 50;

  const statusBadge = () => {
    if (isLockedCountDown || subject.status === 'khong_dat' || tnFailed) {
      return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">RỚT</span>;
    }
    if (subject.thucHanh === 'da_nop' && (subject.essayScore === null || subject.essayScore === undefined)) {
      return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">CHỜ CHẤM</span>;
    }
    if (subject.status === 'dat' && (tnPct === null || tnPct >= 50) && (subject.essayScore == null || subject.essayScore >= 5)) {
      return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ĐẬU</span>;
    }
    if (subject.status === 'dang_thi') {
      return <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">ĐANG THI</span>;
    }
    if (subject.status === 'dang_khoa') {
      return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">ĐANG KHÓA</span>;
    }
    return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">CHƯA THI</span>;
  };

  const tracNghiemDisplay = () => {
    if (!subject.tracNghiem) return <span className="text-sm text-gray-400">Chưa làm</span>;
    const { score, total } = subject.tracNghiem;
    const pct = Math.round((score / total) * 100);
    return (
      <span className={`text-sm font-semibold ${pct >= 50 ? 'text-green-600' : 'text-red-500'}`}>
        {score}/{total}
      </span>
    );
  };

  const thucHanhDisplay = () => {
    if (subject.status === 'dat' && subject.thucHanh !== 'da_nop') {
      return <span className="text-sm text-slate-400">Không yêu cầu</span>;
    }
    if (subject.thucHanh === 'da_nop') {
      if (subject.essayScore !== null && subject.essayScore !== undefined) {
        return (
          <span className={`text-sm font-semibold ${subject.essayScore >= 5 ? 'text-green-600' : 'text-red-500'}`}>
            {subject.essayScore}/10
          </span>
        );
      }
      return <span className="text-sm text-amber-600 font-semibold">Chờ chấm điểm</span>;
    }
    if (subject.thucHanh === 'chua_nop') return <span className="text-sm text-gray-400">Chưa nộp</span>;
    return <span className="text-sm text-red-500">Chưa nộp bài</span>;
  };

  const isLocked = subject.status === 'dang_khoa';
  const failedLocked = isExamProgressLocked(subject);
  const awaitingGrade =
    subject.thucHanh === 'da_nop' &&
    (subject.essayScore === null || subject.essayScore === undefined);
  const canStart  = allowStartExam && isApproved && canEnterCertificationExam(subject) && (subject.status === 'chua_thi' || !subject.status);
  // Chỉ "Tiếp tục thi" khi đã có điểm trắc nghiệm và còn phần thực hành.
  // Trắc nghiệm chưa nộp mà thoát/tải lại trang => lượt thi bị hủy, không cho vào lại.
  const isOngoing =
    allowStartExam &&
    isApproved &&
    canEnterCertificationExam(subject) &&
    subject.status === 'dang_thi' &&
    !awaitingGrade &&
    subject.attemptStatus !== 'active';
  // Không tự "Thi lại" khi khong_dat — phải admin mở khóa (reset status)
  const canRetry = false;
  const isPassed  = subject.status === 'dat';
  const isAwaitingGrade = awaitingGrade && !isPassed && subject.status !== 'khong_dat';
  const wouldBeAbleToStart =
    isApproved && canEnterCertificationExam(subject) &&
    (subject.status === 'chua_thi' || !subject.status || (subject.status === 'dang_thi' && !awaitingGrade));

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden ${
      !isApproved || failedLocked ? 'opacity-80 border-gray-200 bg-gray-50' : 'hover:shadow-md'
    }`}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 shrink-0 ${(!isApproved || failedLocked) ? 'bg-gray-200' : meta.bg} rounded-xl flex items-center justify-center shadow-sm transition-colors`}>
              <span className={`font-black leading-none tracking-tight ${initials.length > 2 ? 'text-sm' : 'text-lg'} ${(!isApproved || failedLocked) ? 'text-gray-400' : 'text-white'}`}>
                {initials}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 text-base leading-tight break-words">{meta.label}</h3>
            </div>
          </div>
          <div className="shrink-0">{statusBadge()}</div>
        </div>

        {/* Stats — luôn xem được trên mọi thiết bị */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileText size={14} />
              <span>Trắc nghiệm</span>
            </div>
            {tracNghiemDisplay()}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Monitor size={14} />
              <span>Thực hành</span>
            </div>
            {thucHanhDisplay()}
          </div>
        </div>
      </div>

      {!isApproved && (
        <div className="mx-5 mb-3 flex items-center justify-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5">
          <Lock size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-600 font-bold">Mở khóa sau {subject.requiredSessions || 0} buổi học</span>
        </div>
      )}

      <div className="px-5 pb-5 pt-2">
        {isLockedCountDown ? (
          <button
            type="button"
            disabled
            className="w-full py-2.5 bg-gray-100 border border-gray-200 text-gray-400 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 cursor-not-allowed uppercase tracking-wide"
          >
            <Clock size={15} /> Mở khóa sau: {countdown}
          </button>
        ) : failedLocked ? (
          <button
            type="button"
            disabled
            className="w-full py-2.5 bg-red-50 border border-red-200 text-red-600 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Lock size={15} /> Đã rớt — chờ admin mở khóa
          </button>
        ) : isAwaitingGrade ? (
          <button
            type="button"
            disabled
            className="w-full py-2.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <Clock size={15} /> Đang chờ chấm
          </button>
        ) : !allowStartExam && wouldBeAbleToStart ? (
          <div className="w-full py-2.5 px-3 bg-amber-50 border border-amber-200 text-amber-800 font-semibold rounded-xl text-xs flex items-start justify-center gap-2 text-center leading-snug">
            <Monitor size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>Thi chỉ dành cho máy tính (laptop/desktop). Trên điện thoại/máy tính bảng bạn chỉ xem được điểm.</span>
          </div>
        ) : (
          <>
            {canStart && (
              <button
                type="button"
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-red-100"
              >
                {(subject.attemptCount || 0) > 0 ? <><Play size={15} /> Thi lại</> : 'Vào thi ngay'}
              </button>
            )}
            {canRetry && (
               <button
                 type="button"
                 onClick={() => onStart(subject.id)}
                 className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-red-100"
               >
                 <Play size={15} /> Thi lại
               </button>
            )}
            {isOngoing && (
              <button
                type="button"
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-orange-100"
              >
                <Play size={15} /> Tiếp tục thi
              </button>
            )}
            {isPassed && (
              <button
                type="button"
                disabled
                className="w-full py-2.5 bg-gray-50 border border-gray-100 text-gray-400 font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
              >
                <CheckCircle size={15} /> Đã hoàn thành
              </button>
            )}
            {!canStart && !canRetry && !isOngoing && !isPassed && subject.attemptStatus === 'active' && (
              <button
                type="button"
                disabled
                className="w-full py-2.5 bg-red-50 border border-red-200 text-red-600 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Lock size={15} /> Lượt thi đã kết thúc — chờ admin mở khóa
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Score Modal ──────────────────────────────────────────────────────────────
const ScoreModal = ({ subjects, onClose, inline = false }) => {
  const [activeTab, setActiveTab] = React.useState('quizzes'); // trắc nghiệm trước
  const [quizzes, setQuizzes] = React.useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = React.useState(false);

  React.useEffect(() => {
    if (activeTab === 'quizzes') {
      setLoadingQuizzes(true);
      api.quizzes.getStudentQuizzes()
        .then((res) => {
          if (res.success) setQuizzes(res.data || []);
        })
        .catch(() => {})
        .finally(() => setLoadingQuizzes(false));
    }
  }, [activeTab]);

  const panel = (
      <div
        className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${
          inline ? 'w-full' : 'w-full max-w-lg shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-600 text-white shadow-sm">
            <Trophy size={15} className="shrink-0" aria-hidden="true" />
            <h2 className="font-black text-xs sm:text-sm whitespace-nowrap">Nhật ký điểm số</h2>
          </div>
          {!inline && onClose ? (
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none">×</button>
          ) : null}
        </div>

        {/* Tab: Trắc nghiệm trước · Chứng nhận sau */}
        <div className="flex gap-1 bg-slate-100 p-1.5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('quizzes')}
            className={`flex-1 py-2 px-2 text-[11px] font-black uppercase tracking-wide rounded-xl transition ${
              activeTab === 'quizzes' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Trắc nghiệm GV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cert')}
            className={`flex-1 py-2 px-2 text-[11px] font-black uppercase tracking-wide rounded-xl transition ${
              activeTab === 'cert' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Thi chứng nhận
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-2.5 max-h-[65vh] overflow-y-auto">
          {activeTab === 'cert' ? (
            subjects.map(s => {
              const meta = getExamSubjectMeta(s.id);
              const tn = s.tracNghiem;
              const tnPct = tn ? Math.round((tn.score / tn.total) * 100) : null;
              const hasEssay = s.thucHanh === 'da_nop';
              const essayScore = s.essayScore;
              const attempt = s.attemptCount || 0;
              return (
                <div key={s.id} className="rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 ${meta.bg} rounded-lg flex items-center justify-center shrink-0`}>
                        <span className="text-white font-black text-xs">{meta.short}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-gray-800 text-sm truncate block">{meta.label}</span>
                        {attempt > 0 && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">Lần {attempt + 1}</span>}
                      </div>
                    </div>
                    {s.status === 'dat' && <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 shrink-0">ĐẠT</span>}
                    {s.status === 'khong_dat' && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 shrink-0">CHƯA ĐẠT</span>}
                    {(!s.status || s.status === 'chua_thi') && <span className="text-[10px] font-bold text-gray-400 shrink-0">Chưa thi</span>}
                  </div>
                  {(tn || hasEssay) && (
                    <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                      <div className="flex-1 px-3 py-2.5 text-center">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Trắc nghiệm</p>
                        {tn ? (
                          <>
                            <p className={`text-lg font-black ${tnPct >= 50 ? 'text-green-600' : 'text-red-500'}`}>{tn.score}/{tn.total}</p>
                            <p className="text-[10px] text-gray-400 font-semibold">{tnPct}%</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-300 font-bold">--</p>
                        )}
                      </div>
                      <div className="flex-1 px-3 py-2.5 text-center">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Thực hành</p>
                        {essayScore !== null && essayScore !== undefined ? (
                          <>
                            <p className={`text-lg font-black ${essayScore >= 5 ? 'text-green-600' : 'text-red-500'}`}>{essayScore}/10</p>
                            <p className="text-[10px] text-gray-400 font-semibold">Đã chấm</p>
                          </>
                        ) : hasEssay ? (
                          <>
                            <p className="text-sm font-bold text-amber-500">⏳</p>
                            <p className="text-[10px] text-amber-500 font-semibold">Chờ chấm</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-300 font-bold">--</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            loadingQuizzes ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold">Đang tải nhật ký điểm số...</div>
            ) : quizzes.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">Chưa có nhật ký bài trắc nghiệm nào từ Giảng viên.</div>
            ) : (
              quizzes.map((q) => {
                const sub = q.mySubmission;
                const isPassed = sub?.status === 'passed' || (sub?.score != null && sub.score >= 70);
                return (
                  <div key={q._id} className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 truncate">
                        {q.courseName || 'Bài thi bài học'}
                      </span>
                      {sub ? (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border shrink-0 ${
                          isPassed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded shrink-0">Chưa làm</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{q.title}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">Giảng viên: {q.teacherName || 'GV'}</p>
                    </div>
                    {sub && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs gap-2">
                        <span className="text-slate-500 font-medium truncate">
                          Nộp lúc: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : '---'}
                        </span>
                        <span className={`font-black text-sm shrink-0 ${isPassed ? 'text-emerald-600' : 'text-red-600'}`}>
                          {sub.correctCount ?? 0}/{sub.totalQuestions ?? 0} ({sub.score ?? 0}%)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
  );

  if (inline) return panel;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      {panel}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const StudentExamRoom = ({
  onNavigate,
  onStartExam,
}) => {
  const [roomTab, setRoomTab] = useState('quiz'); // quiz | cert | scores
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const allowStartExam = useIsDesktopExamDevice();

  // Lấy thông tin HV và tiến độ thi từ DataContext
  const { students, updateStudent, examSubjectsCatalog } = useData();
  const session = (() => { try { return JSON.parse(localStorage.getItem('student_user') || '{}'); } catch { return {}; } })();
  const student = students.find(
    (s) => String(s.id) === String(session.id) || String(s._id) === String(session.id)
  );
  const myStudentId = session.id || session._id || student?._id || student?.id;

  React.useEffect(() => {
    if (!myStudentId || typeof updateStudent !== 'function') return undefined;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await api.students.getById(myStudentId);
        const data = res?.data || res;
        if (cancelled || !data || !Array.isArray(data.examProgress)) return;
        // Lượt thi bỏ dở (tải lại trang / đóng tab) phải chốt RỚT ngay khi về phòng thi
        const stale = data.examProgress.filter((e) => (
          String(e?.status) === 'dang_thi' && String(e?.attemptStatus) === 'active'
        ));
        if (stale.length) {
          await Promise.all(stale.map((e) => api.students
            .abandonExamAttempt(myStudentId, { subjectId: e.id, reason: 'Rời phòng thi khi đang làm bài' })
            .catch(() => null)));
          if (cancelled) return;
          const after = await api.students.getById(myStudentId).catch(() => null);
          const fresh = after?.data || after;
          if (!cancelled && Array.isArray(fresh?.examProgress)) {
            updateStudent(myStudentId, { examProgress: fresh.examProgress }, { localOnly: true });
            return;
          }
        }
        updateStudent(myStudentId, { examProgress: data.examProgress }, { localOnly: true });
      } catch { /* ignore */ }
    };
    pull();
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pull();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [myStudentId, updateStudent]);

  const enrollments = useMemo(() => getClientEnrollments(student), [student]);

  const courseOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Tất cả khóa học' }];
    enrollments.forEach((e) => {
      if (e.cancelledAt || e.status === 'cancelled' || e.status === 'refunded') return;
      const name = e.courseName || e.name;
      if (name && !opts.some((o) => o.value === name)) {
        opts.push({ value: name, label: name });
      }
    });
    if (opts.length === 1 && student?.course) {
      opts.push({ value: student.course, label: student.course });
    }
    return opts;
  }, [enrollments, student?.course]);

  // Tiến độ thi per-student: theo các khóa đang học
  const studentSubjectIds = useMemo(
    () => getSubjectIdsForStudent(enrollments, student?.course, examSubjectsCatalog),
    [enrollments, student?.course, examSubjectsCatalog]
  );

  const buildSubjects = React.useCallback(
    (ep) => buildExamSubjectsFromProgress(ep, studentSubjectIds),
    [studentSubjectIds]
  );

  const [subjects, setSubjects] = useState(() => buildSubjects(student?.examProgress));

  React.useEffect(() => {
    setSubjects(buildSubjects(student?.examProgress));
  }, [student?.examProgress, buildSubjects]);

  const progressScope = useMemo(() => {
    if (filterCourse === 'all') {
      return {
        completedSessions: student?.completedSessions || 0,
        totalSessions: student?.totalSessions || 12,
      };
    }
    const enr = enrollments.find((e) => (e.courseName || e.name) === filterCourse);
    return {
      completedSessions: enr?.completedSessions ?? student?.completedSessions ?? 0,
      totalSessions: enr?.totalSessions ?? student?.totalSessions ?? 12,
    };
  }, [filterCourse, enrollments, student?.completedSessions, student?.totalSessions]);

  // Luồng 2: Mở khóa dựa trên tỷ lệ "cuốn chiếu" Milestone
  const { completedSessions, totalSessions } = progressScope;

  const allowedSubjectIds = useMemo(
    () => getSubjectIdsForCourseFilter(enrollments, filterCourse, student?.course, examSubjectsCatalog),
    [filterCourse, enrollments, student?.course, examSubjectsCatalog]
  );

  // Luồng 1: Admin mở khóa theo từng khóa học (fallback root studentExamUnlocked)
  const isSubjectCourseUnlocked = useMemo(() => {
    const map = {};
    allowedSubjectIds.forEach((id) => {
      map[id] = isExamUnlockedForSubject(
        enrollments,
        id,
        examSubjectsCatalog,
        student?.studentExamUnlocked === true
      );
    });
    return map;
  }, [allowedSubjectIds, enrollments, examSubjectsCatalog, student?.studentExamUnlocked]);

  const subjectFilterOptions = useMemo(
    () => allowedSubjectIds.map((id) => ({ id, label: getExamSubjectMeta(id, examSubjectsCatalog).label })),
    [allowedSubjectIds, examSubjectsCatalog]
  );

  React.useEffect(() => {
    if (filterSubject !== 'all' && !allowedSubjectIds.includes(filterSubject)) {
      setFilterSubject('all');
    }
  }, [filterCourse, allowedSubjectIds, filterSubject]);

  const scopedSubjects = useMemo(
    () => subjects.filter((s) => allowedSubjectIds.includes(s.id)),
    [subjects, allowedSubjectIds]
  );

  const subjectsWithMilestones = useMemo(() => {
    const count = Math.max(1, scopedSubjects.length);
    const interval = Math.max(1, Math.floor(totalSessions / count));
    return scopedSubjects.map((subj, idx) => ({
      ...subj,
      requiredSessions: interval * (idx + 1),
      meetsMilestone: completedSessions >= interval * (idx + 1),
    }));
  }, [scopedSubjects, totalSessions, completedSessions]);

  const filteredSubjects = useMemo(() => {
    return subjectsWithMilestones.filter((subj) => {
      if (filterSubject !== 'all' && subj.id !== filterSubject) return false;
      if (filterStatus !== 'all' && resolveExamFilterStatus(subj) !== filterStatus) return false;
      return true;
    });
  }, [subjectsWithMilestones, filterSubject, filterStatus]);

  const statusCounts = useMemo(() => ({
    all: subjectsWithMilestones.length,
    chua_thi: subjectsWithMilestones.filter((s) => resolveExamFilterStatus(s) === 'chua_thi').length,
    da_thi: subjectsWithMilestones.filter((s) => resolveExamFilterStatus(s) === 'da_thi').length,
    rot: subjectsWithMilestones.filter((s) => resolveExamFilterStatus(s) === 'rot').length,
  }), [subjectsWithMilestones]);

  const handleStart = (subjectId) => {
    if (!allowStartExam) return;
    const entry = subjects.find((s) => String(s.id) === String(subjectId));
    if (!canStartCertificationSubject({
      student,
      enrollments,
      subjectId,
      catalog: examSubjectsCatalog,
      examProgressEntry: entry,
    })) return;
    if (onStartExam) onStartExam(subjectId);
  };




  return (
    <div className="bg-transparent font-sans h-full min-w-0 w-full max-w-full overflow-x-hidden">
      <div className="w-full min-w-0 py-1 sm:py-2 text-left space-y-4">
        {/* 3 cột: trắc nghiệm · chứng nhận · xem điểm */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setRoomTab('quiz')}
            className={`min-h-[7.5rem] p-5 rounded-2xl text-left shadow-sm transition-all border-2 ${
              roomTab === 'quiz'
                ? 'bg-white border-red-500 ring-2 ring-red-100'
                : 'bg-white border-slate-100 hover:border-red-300'
            }`}
          >
            <Trophy size={22} className="text-red-600 mb-2" />
            <p className="font-black text-slate-800 text-base">Trắc nghiệm buổi học</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Bài do giảng viên giao theo buổi học</p>
          </button>
          <button
            type="button"
            onClick={() => setRoomTab('cert')}
            className={`min-h-[7.5rem] p-5 rounded-2xl text-left shadow-sm transition-all border-2 ${
              roomTab === 'cert'
                ? 'bg-white border-red-500 ring-2 ring-red-100'
                : 'bg-white border-slate-100 hover:border-red-300'
            }`}
          >
            <Monitor size={22} className="text-red-600 mb-2" />
            <p className="font-black text-slate-800 text-base">Thi chứng nhận môn học</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Thi có camera · theo tiến độ khóa học</p>
          </button>
          <button
            type="button"
            onClick={() => setRoomTab('scores')}
            className={`min-h-[7.5rem] p-5 rounded-2xl text-left shadow-sm transition-all border-2 ${
              roomTab === 'scores'
                ? 'bg-white border-red-500 ring-2 ring-red-100'
                : 'bg-white border-slate-100 hover:border-red-300'
            }`}
          >
            <Award size={22} className="text-red-600 mb-2" />
            <p className="font-black text-slate-800 text-base">Xem điểm của tôi</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">Nhật ký điểm trắc nghiệm &amp; chứng nhận</p>
          </button>
        </div>

        {roomTab === 'quiz' ? (
          <StudentQuizList />
        ) : roomTab === 'scores' ? (
          <div className="mt-4 sm:mt-6">
            <ScoreModal subjects={subjects} inline />
          </div>
        ) : (
          <>
            
        {!allowStartExam && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
            <Monitor size={18} className="shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-bold">Thi chỉ dành cho máy tính (laptop/desktop)</p>
              <p className="text-xs mt-1 leading-relaxed text-amber-800/90">
                Trên điện thoại và máy tính bảng bạn vẫn xem được điểm, trạng thái môn thi. Để làm bài thi, vui lòng dùng laptop hoặc máy tính để bàn.
              </p>
            </div>
          </div>
        )}

        {/* Bộ lọc */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 mb-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-gray-700 uppercase tracking-wide">
            <Filter size={16} className="text-blue-600" />
            Lọc danh sách
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Khóa học</label>
              <CmsSelect
                value={filterCourse}
                onChange={(e) => setFilterCourse(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:border-blue-400 outline-none"
              >
                {courseOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </CmsSelect>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Môn thi</label>
              <CmsSelect
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:border-blue-400 outline-none"
              >
                <option value="all">Tất cả môn thi</option>
                {subjectFilterOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </CmsSelect>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Trạng thái</label>
              <CmsSelect
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:border-blue-400 outline-none"
              >
                {STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </CmsSelect>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {STATUS_FILTERS.filter((f) => f.value !== 'all').map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterStatus(filterStatus === f.value ? 'all' : f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-all ${
                  filterStatus === f.value
                    ? f.value === 'rot'
                      ? 'bg-red-600 text-white border-red-600'
                      : f.value === 'da_thi'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-red-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {f.label} ({statusCounts[f.value] || 0})
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 font-medium">
            Hiển thị <span className="font-black text-gray-800">{filteredSubjects.length}</span>
            {' / '}
            <span className="font-black text-gray-800">{allowedSubjectIds.length}</span> môn thi
            {filterCourse !== 'all' ? ` · Khóa: ${filterCourse}` : ''}
          </p>
        </div>

        {/* Subject Cards Grid */}
        {filteredSubjects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {filteredSubjects.map(s => (
            <SubjectCard key={s.id} subject={s} onStart={handleStart} isGlobalApproved={!!isSubjectCourseUnlocked[s.id]} examSubjectsCatalog={examSubjectsCatalog} allowStartExam={allowStartExam} />
          ))}
        </div>
        ) : (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="font-bold text-gray-600">Không có môn thi phù hợp bộ lọc</p>
          <p className="text-sm text-gray-400 mt-1">
            {filterCourse !== 'all' && allowedSubjectIds.length === 0
              ? 'Khóa học này chưa có bài thi trên hệ thống.'
              : 'Thử đổi khóa học, môn thi hoặc trạng thái lọc.'}
          </p>
          <button
            type="button"
            onClick={() => { setFilterCourse('all'); setFilterSubject('all'); setFilterStatus('all'); }}
            className="mt-4 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-blue-100"
          >
            Xóa bộ lọc
          </button>
        </div>
        )}

            {/* Info Banner */}
            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
              <BarChart2 size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-700">Điều kiện đạt môn thi</p>
                <p className="text-xs text-blue-600 mt-1">Trắc nghiệm: đạt tối thiểu 50% số câu · Thực hành: nộp file đúng định dạng · Cả hai phần phải đạt mới tính qua môn.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentExamRoom;
