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
  word:        { icon: '🅦', bg: 'bg-blue-600', label: 'Microsoft Word' },
  excel:       { icon: '🅔', bg: 'bg-green-600', label: 'Microsoft Excel' },
  powerpoint:  { icon: '🅟', bg: 'bg-orange-500', label: 'Microsoft PowerPoint' },
};

// ─── Default clean state cho học viên mới ─────────────────────────────────────
const DEFAULT_SUBJECTS = [
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

// ─── Subject Card ─────────────────────────────────────────────────────────────
const SubjectCard = ({ subject, onStart, isGlobalApproved }) => {
  const meta = SUBJECT_ICONS[subject.id];
  const countdown = useCountdown(subject.lockUntil);

  const isApproved = subject.approved || isGlobalApproved;

  const statusBadge = () => {
    switch (subject.status) {
      case 'dat':       return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">ĐÃ ĐẠT</span>;
      case 'khong_dat': return <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">KHÔNG ĐẠT</span>;
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
    if (subject.thucHanh === 'da_nop') return <span className="text-sm text-green-600 font-semibold">Đã nộp</span>;
    if (subject.thucHanh === 'chua_nop') return <span className="text-sm text-gray-400">Chưa nộp</span>;
    return <span className="text-sm text-red-500">Chưa nộp bài</span>;
  };

  const isLocked = subject.status === 'dang_khoa' || (subject.lockUntil && subject.lockUntil > Date.now());
  const canStart  = isApproved && !isLocked && subject.status === 'chua_thi';
  const canRetry  = isApproved && !isLocked && subject.status === 'khong_dat';
  const isPassed  = subject.status === 'dat';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
      isLocked ? 'opacity-70' : ''
    }`}>
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Subject Icon */}
            <div className={`w-12 h-12 ${meta.bg} rounded-xl flex items-center justify-center shadow-sm`}>
              {subject.id === 'word' && <span className="text-white font-black text-xl">W</span>}
              {subject.id === 'excel' && <span className="text-white font-black text-xl">X</span>}
              {subject.id === 'powerpoint' && <span className="text-white font-black text-xl">P</span>}
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

      {/* Countdown if locked */}
      {subject.lockUntil && subject.lockUntil > Date.now() && (
        <div className="mx-5 mb-3 flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
          <Clock size={13} className="text-orange-500 flex-shrink-0" />
          <span className="text-xs text-orange-600 font-medium">Mở lại sau: {countdown}</span>
        </div>
      )}

      {/* Admin chưa duyệt */}
      {!isApproved && (
        <div className="mx-5 mb-3 flex items-center gap-2 bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2">
          <Lock size={13} className="text-yellow-600 flex-shrink-0" />
          <span className="text-xs text-yellow-700 font-medium">Chờ Admin duyệt để thi</span>
        </div>
      )}
      {/* Action buttons */}
      <div className="px-5 pb-5 space-y-3">
        {canStart && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-100"
          >
            <Play size={15} /> Thi ngay
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <Play size={15} /> Thi lại
          </button>
        )}
        {isPassed && (
          <button
            onClick={() => onStart(subject.id)}
            className="w-full py-2.5 bg-green-100 hover:bg-green-200 text-green-700 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle size={15} /> Thi lại (Cải thiện)
          </button>
        )}
        {isLocked && (
          <button
            disabled
            className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold rounded-xl text-sm cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Lock size={14} /> Đang tạm khóa
          </button>
        )}
        {!isApproved && !isLocked && !isPassed && (
          <button
            disabled
            className="w-full py-2.5 bg-gray-50 text-gray-300 font-bold rounded-xl text-sm cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Lock size={14} /> Chờ duyệt
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Score Modal ──────────────────────────────────────────────────────────────
const ScoreModal = ({ subjects, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-white" />
          <h2 className="text-white font-black text-lg">BẢNG ĐIỂM CỦA TÔI</h2>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white text-2xl font-bold leading-none">×</button>
      </div>
      <div className="p-6 space-y-4">
        {subjects.map(s => {
          const meta = SUBJECT_ICONS[s.id];
          const pct = s.tracNghiem ? Math.round((s.tracNghiem.score / s.tracNghiem.total) * 100) : null;
          return (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 ${meta.bg} rounded-lg flex items-center justify-center`}>
                  <span className="text-white font-black text-xs">{s.id === 'word' ? 'W' : s.id === 'excel' ? 'X' : 'P'}</span>
                </div>
                <span className="font-semibold text-gray-700 text-sm">{meta.label}</span>
              </div>
              <div className="text-right">
                <p className={`font-black text-base ${pct === null ? 'text-gray-400' : pct >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                  {pct === null ? '--' : `${pct}%`}
                </p>
                <p className="text-[10px] text-gray-400">{s.tracNghiem ? `${s.tracNghiem.score}/${s.tracNghiem.total} câu` : 'Chưa thi'}</p>
              </div>
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
  const [subjects, setSubjects] = useState(() => {
    if (student?.examProgress && Array.isArray(student.examProgress)) {
      // Merge để đảm bảo đủ 3 môn nếu DB thiếu
      return DEFAULT_SUBJECTS.map(def => {
        const saved = student.examProgress.find(s => s.id === def.id);
        return saved ? { ...def, ...saved, lockUntil: saved.lockUntil ? new Date(saved.lockUntil).getTime() : null } : { ...def };
      });
    }
    return DEFAULT_SUBJECTS.map(s => ({ ...s }));
  });

  // Lưu tiến độ thi vào DataContext mỗi khi subjects thay đổi
  React.useEffect(() => {
    if (student?.id) {
      updateStudent(student.id, { examProgress: subjects });
    }
  }, [subjects]);

  // Điều kiện mở phòng thi: hoàn thành hết buổi học HOẶC Admin đã duyệt studentExamUnlocked
  const isCompleted = student && student.remainingSessions <= 0;
  const isAdminApproved = student?.studentExamUnlocked === true || student?.examApproved === true;
  const canAccessExam = isCompleted || isAdminApproved;

  const handleStart = (subjectId) => {
    if (onStartExam) onStartExam(subjectId);
  };


  // ── LOCKED SCREEN ──
  if (!canAccessExam) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-12">
            <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Lock size={36} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-3">Phòng thi chưa mở</h2>
            <p className="text-gray-500 text-sm mb-6">
              Bạn cần <strong>hoàn thành tất cả buổi học</strong> đã đăng ký hoặc được <strong>Admin duyệt</strong> trước khi vào phòng thi.
            </p>
            {student && (
              <div className="bg-gray-50 rounded-2xl p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Đã học</span>
                  <span className="font-bold text-gray-800">{(student.completedSessions || 0)}/{student.totalSessions || 12} buổi</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(((student.completedSessions || 0) / (student.totalSessions || 12)) * 100))}%` }} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Còn lại</span>
                  <span className="font-bold text-orange-600">{Math.max(0, (student.totalSessions || 12) - (student.completedSessions || 0))} buổi</span>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400">Liên hệ Admin (Hotline: 093-5758-462) nếu bạn cần hỗ trợ.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {subjects.map(s => (
            <SubjectCard key={s.id} subject={s} onStart={handleStart} isGlobalApproved={canAccessExam} />
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
