import React, { useState } from 'react';
import {
  Award, Bell, ChevronRight, Clock, FileText, Monitor,
  CheckCircle, XCircle, Lock, Trophy, User, LogOut,
  BarChart2, BookOpen, Play
} from 'lucide-react';
import { useData } from '../context/DataContext';

// ─── Student info from session (DEPRECATED: Use student from DataContext) ────
// Keeping for backward compatibility if needed, but should use DataContext instead.

const SUBJECT_ICONS = {
  coban:       { icon: '💻', bg: 'bg-slate-600', label: 'Máy vi tính (Cơ bản)' },
  word:        { icon: '🅦', bg: 'bg-blue-600', label: 'Microsoft Word' },
  excel:       { icon: '🅔', bg: 'bg-green-600', label: 'Microsoft Excel' },
  powerpoint:  { icon: '🅟', bg: 'bg-orange-500', label: 'Microsoft PowerPoint' },
};

// ─── Default clean state cho học viên mới ─────────────────────────────────────
const DEFAULT_SUBJECTS = [
  { id: 'coban',       status: 'chua_thi', tracNghiem: null, thucHanh: 'chua_nop', lockUntil: null },
  { id: 'word',        status: 'chua_thi', tracNghiem: null, thucHanh: 'chua_nop', lockUntil: null },
  { id: 'excel',       status: 'chua_thi', tracNghiem: null, thucHanh: 'chua_nop', lockUntil: null },
  { id: 'powerpoint',  status: 'chua_thi', tracNghiem: null, thucHanh: 'chua_nop', lockUntil: null },
];

// ─── Countdown Hook ───────────────────────────────────────────────────────────
function useCountdown(target) {
  const [remaining, setRemaining] = React.useState('');
  React.useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setRemaining('00:00:00'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${d} ngày ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  return remaining;
}

const SubjectCard = ({ subject, onStart, isGlobalApproved }) => {
  const meta = SUBJECT_ICONS[subject.id];
  const countdown = useCountdown(subject.lockUntil);

  const isApproved = isGlobalApproved || subject.meetsMilestone;
  const isLockedCountDown = subject.lockUntil && subject.lockUntil > Date.now();

  const statusBadge = () => {
    if (isLockedCountDown) {
      return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">RỚT</span>;
    }
    switch (subject.status) {
      case 'dat':       return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ĐẬU</span>;
      case 'khong_dat': return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">RỚT</span>;
      case 'dang_thi':  return <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">ĐANG THI</span>;
      case 'dang_khoa': return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">ĐANG KHÓA</span>;
      default:          return <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">CHƯA THI</span>;
    }
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
    if (subject.thucHanh === 'da_nop') {
      if (subject.essayScore !== null && subject.essayScore !== undefined) {
        // Đã chấm điểm → hiện điểm
        return (
          <span className={`text-sm font-semibold ${subject.essayScore >= 5 ? 'text-green-600' : 'text-red-500'}`}>
            {subject.essayScore}/10
          </span>
        );
      }
      // Đã nộp nhưng chưa chấm
      return <span className="text-sm text-amber-600 font-semibold">Chờ chấm điểm</span>;
    }
    if (subject.thucHanh === 'chua_nop') return <span className="text-sm text-gray-400">Chưa nộp</span>;
    return <span className="text-sm text-red-500">Chưa nộp bài</span>;
  };

  const isLocked = subject.status === 'dang_khoa';
  const canStart  = isApproved && !isLocked && !isLockedCountDown && (subject.status === 'chua_thi' || !subject.status);
  const isOngoing = isApproved && !isLocked && !isLockedCountDown && subject.status === 'dang_thi';
  const canRetry  = isApproved && !isLocked && !isLockedCountDown && subject.status === 'khong_dat';
  const isPassed  = subject.status === 'dat';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all duration-200 overflow-hidden ${
      !isApproved || isLocked || isLockedCountDown ? 'opacity-80 border-gray-200 bg-gray-50' : 'hover:shadow-md'
    }`}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${(!isApproved || isLocked || isLockedCountDown) ? 'bg-gray-200' : meta.bg} rounded-xl flex items-center justify-center shadow-sm transition-colors`}>
              <span className={`font-black text-xl ${(!isApproved || isLocked || isLockedCountDown) ? 'text-gray-400' : 'text-white'}`}>
                  {subject.id === 'word' ? 'W' : subject.id === 'excel' ? 'X' : subject.id === 'powerpoint' ? 'P' : 'C'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base leading-tight">{meta.label}</h3>
            </div>
          </div>
          {statusBadge()}
        </div>

        {/* Stats */}
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

      {/* Admin chưa duyệt hoặc chưa đủ mốc */}
      {!isApproved && (
        <div className="mx-5 mb-3 flex items-center justify-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2.5">
          <Lock size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-600 font-bold">Mở khóa sau {subject.requiredSessions || 0} buổi học</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-5 pb-5 pt-2">
        {isLockedCountDown ? (
          <button
            disabled
            className="w-full py-2.5 bg-gray-100 border border-gray-200 text-gray-400 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 cursor-not-allowed uppercase tracking-wide"
          >
            <Clock size={15} /> Mở khóa sau: {countdown}
          </button>
        ) : (
          <>
            {canStart && (
              <button
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-blue-100"
              >
                {(subject.attemptCount || 0) > 0 ? <><Play size={15} /> Thi lại</> : 'Vào thi ngay'}
              </button>
            )}
            {canRetry && (
               <button
                 onClick={() => onStart(subject.id)}
                 className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-blue-100"
               >
                 <Play size={15} /> Thi lại
               </button>
            )}
            {isOngoing && (
              <button
                onClick={() => onStart(subject.id)}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-orange-100"
              >
                <Play size={15} /> Tiếp tục thi
              </button>
            )}
            {isPassed && (
              <button
                disabled
                className="w-full py-2.5 bg-gray-50 border border-gray-100 text-gray-400 font-bold rounded-xl text-sm flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
              >
                <CheckCircle size={15} /> Đã hoàn thành
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Score Modal ──────────────────────────────────────────────────────────────
const ScoreModal = ({ subjects, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-white" />
          <h2 className="text-white font-black text-lg">BẢNG ĐIỂM CỦA TÔI</h2>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-2xl font-bold leading-none">×</button>
      </div>
      <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
        {subjects.map(s => {
          const meta = SUBJECT_ICONS[s.id];
          const tn = s.tracNghiem;
          const tnPct = tn ? Math.round((tn.score / tn.total) * 100) : null;
          const hasEssay = s.thucHanh === 'da_nop';
          const essayScore = s.essayScore;
          const attempt = s.attemptCount || 0;
          return (
            <div key={s.id} className="rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden">
              {/* Subject header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${meta.bg} rounded-xl flex items-center justify-center`}>
                    <span className="text-white font-black text-sm">{s.id === 'word' ? 'W' : s.id === 'excel' ? 'X' : s.id === 'powerpoint' ? 'P' : 'C'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-800 text-sm">{meta.label}</span>
                    {attempt > 0 && <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">Lần {attempt + 1}</span>}
                  </div>
                </div>
                {s.status === 'dat' && <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">ĐẠT</span>}
                {s.status === 'khong_dat' && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">CHƯA ĐẠT</span>}
                {(!s.status || s.status === 'chua_thi') && <span className="text-[10px] font-bold text-gray-400">Chưa thi</span>}
              </div>
              {/* Scores row */}
              {(tn || hasEssay) && (
                <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                  {/* Trắc nghiệm */}
                  <div className="flex-1 px-4 py-3 text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Trắc nghiệm</p>
                    {tn ? (
                      <>
                        <p className={`text-xl font-black ${tnPct >= 50 ? 'text-green-600' : 'text-red-500'}`}>{tn.score}/{tn.total}</p>
                        <p className="text-[10px] text-gray-400 font-semibold">{tnPct}%</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-300 font-bold">--</p>
                    )}
                  </div>
                  {/* Tự luận */}
                  <div className="flex-1 px-4 py-3 text-center">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Thực hành</p>
                    {essayScore !== null && essayScore !== undefined ? (
                      <>
                        <p className={`text-xl font-black ${essayScore >= 5 ? 'text-green-600' : 'text-red-500'}`}>{essayScore}/10</p>
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
        })}
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const StudentExamRoom = ({ onNavigate, onStartExam }) => {
  const [showScores, setShowScores] = useState(false);
  const [notifications] = useState(0);

  // Lấy thông tin HV và tiến độ thi từ DataContext
  const { students, updateStudent } = useData();
  const session = (() => { try { return JSON.parse(localStorage.getItem('student_user') || '{}'); } catch { return {}; } })();
  const student = students.find(s => s.id === session.id);

  // Tiến độ thi per-student: load từ student.examProgress hoặc reset về mặc định
  const buildSubjects = (ep) => DEFAULT_SUBJECTS.map(def => {
    const saved = (ep || []).find(s => s.id === def.id);
    return saved ? { ...def, ...saved, lockUntil: saved.lockUntil ? new Date(saved.lockUntil).getTime() : null } : { ...def };
  });

  const [subjects, setSubjects] = useState(() => buildSubjects(student?.examProgress));

  // Chỉ Sync One-Way TỪ DataContext → local state để tránh vĩnh viễn Infinite Loop Update
  React.useEffect(() => {
    if (student?.examProgress && Array.isArray(student.examProgress)) {
      setSubjects(buildSubjects(student.examProgress));
    }
  }, [JSON.stringify(student?.examProgress)]);

  // Luồng 1: Admin ghi đè mở toàn bộ
  const isAdminApproved = student?.studentExamUnlocked === true;

  // Luồng 2: Mở khóa dựa trên tỷ lệ "cuốn chiếu" Milestone
  const totalSessions = student?.totalSessions || 12;
  const completedSessions = student?.completedSessions || 0;
  // Công thức: tổng buổi / 4 (vì có 4 môn logic tuần tự)
  const milestoneInterval = Math.max(1, Math.floor(totalSessions / 4));

  const subjectsWithMilestones = subjects.map((subj, idx) => {
    const requiredSessions = milestoneInterval * (idx + 1);
    const meetsMilestone = completedSessions >= requiredSessions;
    return { ...subj, requiredSessions, meetsMilestone };
  });

  const handleStart = (subjectId) => {
    if (onStartExam) onStartExam(subjectId);
  };




  return (
    <div className="bg-transparent font-sans h-full">
      {/* Navbar removed - using DashboardLayout header */}
      <div className="pt-6"></div>

      {/* ── Main Content ── */}
      <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto">
        {/* Page Title Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-800">Danh sách môn thi</h1>
            <p className="text-sm text-gray-500 mt-1">Chọn môn thi để bắt đầu làm bài. Hệ thống sẽ tự động giám sát qua Camera.</p>
          </div>
          <button
            onClick={() => setShowScores(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95 shadow-lg shadow-red-100 self-start sm:self-auto"
          >
            <Trophy size={16} /> XEM ĐIỂM CỦA TÔI
          </button>
        </div>

        {/* Subject Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
          {subjectsWithMilestones.map(s => (
            <SubjectCard key={s.id} subject={s} onStart={handleStart} isGlobalApproved={isAdminApproved} />
          ))}
        </div>

        {/* Info Banner */}
        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
          <BarChart2 size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-700">Điều kiện đạt môn thi</p>
            <p className="text-xs text-blue-600 mt-1">Trắc nghiệm: đạt tối thiểu 50% số câu · Thực hành: nộp file đúng định dạng · Cả hai phần phải đạt mới tính qua môn.</p>
          </div>
        </div>
      </div>

      {/* ── Score Modal ── */}
      {showScores && <ScoreModal subjects={subjects} onClose={() => setShowScores(false)} />}
    </div>
  );
};

export default StudentExamRoom;
