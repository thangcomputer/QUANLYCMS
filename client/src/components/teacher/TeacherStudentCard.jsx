import React, { useState, useEffect, useMemo, useCallback } from 'react';
import CmsSelect from '../ui/CmsSelect';
import {
  Calendar, Video, CheckCircle, Save, MessageSquare, FileText,
  GraduationCap, TrendingUp, Clock, Star, Link2, Upload,
  ChevronRight, BookOpen, Award, Zap, BarChart3, Users, Eye, X, XCircle,
  Search, Download, AlertCircle, Clipboard, Send, UserCheck, Check,
  Activity, Trash2, Ban, PlayCircle, Phone, Mail, Edit3, Shield,
  Plus, Loader2, History, ListChecks, ChevronUp, ChevronDown,
} from 'lucide-react';
import api, { buildMediaDownloadUrl, resolveMediaUrl, messagesAPI } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useModal } from '../../utils/Modal.jsx';
import { resolveAvatarUrl } from '../../utils/defaultAvatars';
import { getGradeBadgeClasses, getGradeLabel } from '../../utils/gradeColors';
import { formatLocalDateKey, isScheduleOngoingNow, normalizeScheduleDate } from '../../utils/scheduleTime';
import { getAttendanceAction } from '../../utils/attendanceAction';
import { countEnrollmentCompleted } from '../../utils/schedulingLimits';
import { showGlossyAlert, getDisplayName } from './TeacherShared';
import TeacherQuizManager from './TeacherQuizManager';
import { useData } from '../../context/DataContext';
import { useScheduleContext } from '../../context/ScheduleContext';
import { buildStudentActivityLogs, ACTIVITY_LOG_META } from '../../utils/studentActivityLogs';
import TeacherStudentWeekSlotSheet from './TeacherStudentWeekSlotSheet';
import {
  buildAttendanceMakeupDraft,
  pickAdminContactForMakeup,
  getMakeupSessionSummary,
} from '../../utils/attendanceMakeupRequest';
import {
  makeupPendingKey,
  getMakeupPending,
  markMakeupPending,
  clearMakeupPending,
  subscribeMakeupPending,
} from '../../utils/attendanceMakeupPendingStore';
import { useToast } from '../../utils/toast';
import {
  ATTENDANCE_CONFIRM_MS,
  attendanceConfirmKey,
  getAttendanceConfirm,
  upsertAttendanceConfirm,
  removeAttendanceConfirm,
  subscribeAttendanceConfirm,
} from '../../utils/attendanceConfirmStore';

const maskPhone = (str) => {
  if (!str) return str;
  const s = String(str);
  return s.replace(/(0\d{2})(\d{4,5})(\d{3})/g, '$1***$3');
};

/** Chỉ đánh trượt khi học viên đã được mở khóa phòng thi (chưa mở / đã trượt → không bấm lại). */
const canTeacherFailStudentExam = (student) => Boolean(student?.studentExamUnlocked);

const GRADE_INPUT_CLASS =
  'w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl pl-14 pr-16 py-4 text-3xl font-black text-slate-700 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

function AttendanceGradeInput({ value, onChange, onNudge }) {
  return (
    <div className="relative">
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 z-10">
        <button
          type="button"
          onClick={() => onNudge(0.5)}
          className="w-9 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition shadow-sm"
          aria-label="Tăng điểm 0.5"
        >
          <ChevronUp size={18} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => onNudge(-0.5)}
          className="w-9 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition shadow-sm"
          aria-label="Giảm điểm 0.5"
        >
          <ChevronDown size={18} strokeWidth={2.5} />
        </button>
      </div>
      <input
        type="number"
        min="0"
        max="10"
        step="0.5"
        value={value}
        onChange={onChange}
        className={GRADE_INPUT_CLASS}
      />
      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 text-lg font-black pointer-events-none">/ 10</div>
    </div>
  );
}

const FailExamButton = ({ student, onLockExam, compact = false }) => {
  const { showModal } = useModal();
  const canFail = canTeacherFailStudentExam(student);
  const hint = canFail
    ? 'Đánh trượt học viên đang được mở khóa phòng thi'
    : 'Chưa mở khóa phòng thi hoặc đã bị đánh trượt';

  const openConfirm = () => {
    if (!canFail) return;
    showModal({
      title: 'Xác nhận ĐÁNH TRƯỢT',
      content: `Hành động này sẽ KHOÁ TRUY CẬP PHÒNG THI của ${getDisplayName(student)} ngay lập tức.`,
      type: 'warning',
      confirmText: 'ĐÁNH TRƯỢT NGAY',
      onConfirm: () => onLockExam(student),
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        disabled={!canFail}
        title={hint}
        aria-label="Đánh trượt"
        onClick={openConfirm}
        className={`inline-flex justify-center items-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg transition-all shrink-0 ${
          canFail
            ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
        }`}
      >
        <XCircle size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={!canFail}
      title={hint}
      onClick={openConfirm}
      className={`flex flex-1 min-[360px]:flex-initial justify-center items-center gap-2 text-xs font-black px-4 py-3 sm:px-5 rounded-2xl transition-all uppercase tracking-widest ${
        canFail
          ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/40'
          : 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed opacity-60'
      }`}
    >
      <XCircle size={16} /> ĐÁNH TRƯỢT
    </button>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

export const StudentCard = ({
  student, onUpdateLink, onSaveGrade, onUpdateNotes, onLockExam,
  isDetailed, attendanceGate, myStudents = [], onCancelSchedule,
  navigate,
}) => {
  const toast = useToast();
  const { showModal } = useModal();
  const { onDataRefresh, socket, onlineUsers = [], lastSeenUsers = {} } = useSocket();
  const {
    privateEvaluations = [],
    schedules: allSchedules = [],
    triggerBackgroundSync,
    currentUser,
    addSchedule,
    updateSchedule,
    cancelSchedule,
  } = useData();
  const { setSchedulesLocal } = useScheduleContext();
  const [linkInput, setLinkInput] = useState(student.linkHoc);
  const [gradeInput, setGradeInput] = useState(student.avgGrade ?? student.lastGrade ?? '');
  const [notesInput, setNotesInput] = useState(student.notes || '');
  const [activePanel, setActivePanel] = useState('progress');
  const [linkSaved, setLinkSaved] = useState(false);
  const [gradeSaved, setGradeSaved] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [sendingMakeup, setSendingMakeup] = useState(false);
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const confirmKey = attendanceConfirmKey(student);
  const studentPresenceId = String(student._id || student.id || '');
  const isStudentOnline = onlineUsers.some((u) => String(u.userId) === studentPresenceId);
  const lastSeenAt = lastSeenUsers[studentPresenceId];
  const lastSeenLabel = (() => {
    if (!lastSeenAt) return 'Chưa online';
    const d = new Date(lastSeenAt);
    if (Number.isNaN(d.getTime())) return 'Chưa online';
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'Vừa xong';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
    return d.toLocaleDateString('vi-VN');
  })();
  /** Chờ 10s sau "Xác nhận Điểm danh" — persist sessionStorage để đổi tab không mất */
  const [pendingAttendance, setPendingAttendance] = useState(() => {
    const stored = getAttendanceConfirm(confirmKey);
    if (!stored) return null;
    return {
      note: stored.note,
      grade: stored.grade,
      endsAt: stored.endsAt,
      committing: Boolean(stored.committing),
    };
  });
  const [confirmTick, setConfirmTick] = useState(0);
  const [showQuizCreate, setShowQuizCreate] = useState(false);
  const [studentQuizzes, setStudentQuizzes] = useState([]);
  const [studentEvals, setStudentEvals] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const sessionTotal = Number(student.totalSessions) > 0 ? Number(student.totalSessions) : 12;
  // Chuẩn Admin: enrollment.completedSessions (gồm buổi ghi nhận trước / chỉnh tay).
  const done = student.completedSessions != null
    ? Math.max(0, Number(student.completedSessions) || 0)
    : Math.max(0, sessionTotal - (Number(student.remainingSessions) || 0));
  const isDroppedOut = Boolean(student.interactionLocked)
    || ['cancelled', 'refunded'].includes(String(student.enrollmentStatus || '').toLowerCase())
    || String(student.status || '') === 'Thôi học';
  const onCalendarDone = useMemo(() => {
    const sid = String(student._id || student.id || '');
    if (!sid || !Array.isArray(allSchedules) || allSchedules.length === 0) return 0;
    return countEnrollmentCompleted(allSchedules, sid, student.course);
  }, [allSchedules, student._id, student.id, student.course]);
  const priorCredit = Math.max(0, done - onCalendarDone);
  const remainingSessions = Math.max(0, sessionTotal - done);
  const nextSessionNumber = Math.max(0, Number(done) || 0) + 1;
  const defaultAttendanceNote = `Buổi ${nextSessionNumber}: Đã điểm danh hoàn thành buổi học`;
  const [attForm, setAttForm] = useState({
    note: defaultAttendanceNote,
    grade: student.avgGrade ?? student.lastGrade ?? 0,
  });

  const nudgeAttGrade = useCallback((delta) => {
    setAttForm((prev) => {
      const cur = Number(prev.grade);
      const base = Number.isFinite(cur) ? cur : 0;
      const next = Math.round((base + delta) * 2) / 2;
      return { ...prev, grade: Math.min(10, Math.max(0, next)) };
    });
  }, []);

  useEffect(() => {
    setGradeInput(student.avgGrade ?? student.lastGrade ?? '');
    setLinkInput(student.linkHoc);
    setNotesInput(student.notes || '');
    setAttForm((prev) => ({
      ...prev,
      grade: student.avgGrade ?? student.lastGrade ?? 0,
    }));
  }, [student._enrollmentKey, student.course, student.avgGrade, student.lastGrade, student.linkHoc, student.notes]);

  // ASSIGNMENTS STATE
  const [courseAssignments, setCourseAssignments] = useState([]);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [newAssign, setNewAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingAssign, setEditingAssign] = useState({ title: '', deadline: '', fileUrl: '', description: '' });
  const [gradingInputs, setGradingInputs] = useState({});

  const handleGradeSubmit = async (submissionId) => {
    const gradeValue = gradingInputs[submissionId];
    if (gradeValue === undefined || gradeValue === '' || isNaN(gradeValue) || gradeValue < 0 || gradeValue > 10) {
      showGlossyAlert('Vui lòng nhập điểm hợp lệ (0-10)');
      return;
    }
    try {
      const wasGraded = (courseAssignments || []).some((a) =>
        (a.submissions || []).some((s) => String(s._id) === String(submissionId) && s.status === 'graded')
      );
      const res = await api.assignments.grade(submissionId, {
        grade: Number(gradeValue),
        teacherFeedback: wasGraded ? 'Giảng viên đã sửa điểm' : 'Đã chấm điểm trực tiếp',
      });
      if (res.success) {
        if (typeof fetchStudentAssignments === 'function') fetchStudentAssignments();
        showGlossyAlert(wasGraded ? 'Đã cập nhật điểm!' : 'Chấm điểm thành công!');
      } else {
        showGlossyAlert(res.message || 'Lỗi chấm bài');
      }
    } catch(e) {
      showGlossyAlert('Lỗi mạng khi lưu điểm');
    }
  };

  const progressPct = sessionTotal > 0 ? Math.round((done / sessionTotal) * 100) : 0;
  const isCompleted = remainingSessions === 0;

  const todayStr = new Date().toLocaleDateString('vi-VN');
  const hasAttendedToday = (student.grades || []).some(g => g.date === todayStr);

  const [attendanceTick, setAttendanceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setAttendanceTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const gateSchedule = attendanceGate?.schedule;
  const gateUnlockKey = [
    String(gateSchedule?._id || gateSchedule?.id || ''),
    normalizeScheduleDate(gateSchedule?.date) || '',
    String(gateSchedule?.startTime || ''),
  ].join('|');
  const [gateNow, setGateNow] = useState(() => Date.now());
  useEffect(() => {
    if (!gateSchedule) return undefined;
    const tick = () => setGateNow(Date.now());
    tick();
    const action = getAttendanceAction(gateSchedule, null, new Date());
    const unlockAt = action.attendUnlockAt instanceof Date ? action.attendUnlockAt.getTime() : 0;
    const remaining = unlockAt - Date.now();
    if (!(unlockAt > 0) || remaining <= 0) return undefined;

    const timeoutId = setTimeout(tick, remaining);
    const intervalId = setInterval(() => {
      tick();
      if (Date.now() >= unlockAt) clearInterval(intervalId);
    }, 1000);
    const onResume = () => tick();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }, [gateUnlockKey, gateSchedule]);

  const lastAttendanceAt = useMemo(() => {
    if (student.last_attendance_at) {
      const d = new Date(student.last_attendance_at);
      if (!Number.isNaN(d.getTime())) return d;
    }
    // Fallback SoT: completed schedule hôm nay (khớp API reset-today-attendance)
    const sid = String(student._id || student.id || '');
    const course = String(student.course || '').trim();
    const now = new Date();
    const todays = (allSchedules || []).filter((sch) => {
      if (String(sch.status || '') !== 'completed') return false;
      const schSid = String(sch.studentId?._id || sch.studentId?.id || sch.studentId || '');
      if (schSid !== sid) return false;
      if (course && sch.course && String(sch.course) !== course) return false;
      const sd = new Date(sch.date || sch.createdAt);
      return (
        sd.getFullYear() === now.getFullYear()
        && sd.getMonth() === now.getMonth()
        && sd.getDate() === now.getDate()
      );
    });
    if (!todays.length) return null;
    todays.sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt || a.date).getTime();
      const tb = new Date(b.updatedAt || b.createdAt || b.date).getTime();
      return tb - ta;
    });
    const latest = todays[0];
    const at = new Date(latest.updatedAt || latest.createdAt || latest.date);
    return Number.isNaN(at.getTime()) ? null : at;
  }, [student.last_attendance_at, student._id, student.id, student.course, allSchedules, attendanceTick]);

  const cooldownHours = useMemo(() => {
    if (lastAttendanceAt) {
      const diffMs = Date.now() - lastAttendanceAt.getTime();
      if (diffMs >= 12 * 60 * 60 * 1000) return 0;
      return parseFloat((12 - diffMs / (1000 * 60 * 60)).toFixed(1));
    }
    return student.remaining_cooldown_hours || 0;
  }, [lastAttendanceAt, student.remaining_cooldown_hours, attendanceTick]);

  const canCheckIn = cooldownHours > 0
    ? false
    : (student.can_check_in !== undefined ? student.can_check_in : !hasAttendedToday);

  // Hoàn tất lịch hôm nay (SoT) — tránh UI "ĐIỂM DANH + HỦY CA" khi cooldown đã bật nhưng gate/grades lệch
  const hasCompletedScheduleToday = useMemo(() => {
    const sid = String(student._id || student.id || '');
    const course = String(student.course || '').trim();
    const todayKey = formatLocalDateKey(new Date());
    return (allSchedules || []).some((sch) => {
      if (String(sch.status || '') !== 'completed') return false;
      const schSid = String(sch.studentId?._id || sch.studentId?.id || sch.studentId || '');
      if (schSid !== sid) return false;
      if (course && sch.course && String(sch.course) !== course) return false;
      return normalizeScheduleDate(sch.date) === todayKey;
    });
  }, [allSchedules, student._id, student.id, student.course, attendanceTick]);

  /** Chờ HV xác nhận / tranh chấp (chưa completed) */
  const studentConfirmPhase = useMemo(() => {
    const sid = String(student._id || student.id || '');
    const course = String(student.course || '').trim();
    const todayKey = formatLocalDateKey(new Date());
    const hit = (allSchedules || []).find((sch) => {
      if (String(sch.status || '') !== 'scheduled') return false;
      const conf = String(sch.studentConfirmStatus || 'none');
      if (conf !== 'pending' && conf !== 'disputed') return false;
      const schSid = String(sch.studentId?._id || sch.studentId?.id || sch.studentId || '');
      if (schSid !== sid) return false;
      if (course && sch.course && String(sch.course) !== course) return false;
      return normalizeScheduleDate(sch.date) === todayKey
        || conf === 'disputed'; // tranh chấp có thể qua ngày
    });
    if (!hit) return null;
    return String(hit.studentConfirmStatus);
  }, [allSchedules, student._id, student.id, student.course, attendanceTick]);

  const awaitingStudentConfirm = studentConfirmPhase === 'pending';
  const attendanceDisputed = studentConfirmPhase === 'disputed';

  const hasLastAttendanceToday = useMemo(() => {
    if (!student.last_attendance_at) return false;
    const d = new Date(student.last_attendance_at);
    if (Number.isNaN(d.getTime())) return false;
    return formatLocalDateKey(d) === formatLocalDateKey(new Date());
  }, [student.last_attendance_at, attendanceTick]);

  // Đã điểm danh hôm nay — KHÔNG dùng !canCheckIn (cooldown 12h có thể từ hôm trước)
  // pending/disputed: coi như đã thao tác điểm danh (không cho bấm lại)
  const alreadyAttendedToday = Boolean(
    hasAttendedToday
    || attendanceGate?.status === 'done'
    || hasCompletedScheduleToday
    || hasLastAttendanceToday
    || awaitingStudentConfirm
    || attendanceDisputed,
  );
  const isPendingConfirm = Boolean(pendingAttendance);
  const isCommittingAttendance = Boolean(pendingAttendance?.committing);
  const liveAttendance = useMemo(
    () => (gateSchedule ? getAttendanceAction(gateSchedule, null, new Date(gateNow)) : attendanceGate?.meta || null),
    [gateSchedule, gateNow, attendanceGate?.meta],
  );
  const waitingAttendanceUnlock = Boolean(
    liveAttendance
    && liveAttendance.state === 'UPCOMING'
    && !alreadyAttendedToday
    && !isPendingConfirm
    && gateSchedule,
  );
  const confirmRemainSec = useMemo(() => {
    if (!pendingAttendance?.endsAt) return 0;
    return Math.max(0, Math.ceil((pendingAttendance.endsAt - Date.now()) / 1000));
  }, [pendingAttendance, confirmTick]);

  const makeupKey = useMemo(() => {
    const sch = attendanceGate?.schedule;
    return makeupPendingKey({
      scheduleId: sch?._id || sch?.id,
      studentId: student._id || student.id,
      date: normalizeScheduleDate(sch?.date) || formatLocalDateKey(new Date()),
      course: student.course,
    });
  }, [attendanceGate?.schedule, student._id, student.id, student.course]);

  const [makeupPending, setMakeupPending] = useState(() => Boolean(getMakeupPending(makeupKey)));

  useEffect(() => {
    const sync = () => setMakeupPending(Boolean(getMakeupPending(makeupKey)));
    sync();
    return subscribeMakeupPending(sync);
  }, [makeupKey]);

  // Admin đã duyệt / buổi đã completed → nút về trạng thái đã điểm danh mặc định
  useEffect(() => {
    if (!makeupKey || !getMakeupPending(makeupKey)) return;
    const pending = getMakeupPending(makeupKey);
    const pendingSchId = String(pending?.scheduleId || '');
    const gateSchId = String(attendanceGate?.schedule?._id || attendanceGate?.schedule?.id || '');
    const scheduleSettled = (allSchedules || []).some((s) => {
      const id = String(s._id || s.id || '');
      if (!id) return false;
      const st = String(s.status || '');
      if (st !== 'completed' && st !== 'cancelled') return false;
      if (pendingSchId && id === pendingSchId) return true;
      if (gateSchId && id === gateSchId) return true;
      return false;
    });
    if (
      alreadyAttendedToday
      || attendanceGate?.status === 'done'
      || scheduleSettled
    ) {
      clearMakeupPending(makeupKey);
      setMakeupPending(false);
    }
  }, [alreadyAttendedToday, makeupKey, attendanceGate?.status, attendanceGate?.schedule, allSchedules]);

  const isOverdueMakeup = attendanceGate?.status === 'overdue'
    && !alreadyAttendedToday
    && !isPendingConfirm
    && !isCompleted
    && !makeupPending;

  // Có buổi hôm nay (scheduled / overdue / done) → hiện cặp nút điểm danh + hủy
  const showSessionActionRow = Boolean(
    !isDroppedOut
    && !isCompleted && (
      isPendingConfirm
      || alreadyAttendedToday
      || makeupPending
      || (attendanceGate && attendanceGate.status !== 'no_schedule')
    ),
  );

  // Khôi phục đếm ngược khi đổi HV / quay lại tab — không xóa pending của HV khác
  useEffect(() => {
    const apply = (map) => {
      const stored = map ? (map[confirmKey] || null) : getAttendanceConfirm(confirmKey);
      setPendingAttendance((prev) => {
        if (!stored) return prev === null ? prev : null;
        const next = {
          note: stored.note,
          grade: stored.grade,
          endsAt: stored.endsAt,
          committing: Boolean(stored.committing),
        };
        if (
          prev
          && prev.endsAt === next.endsAt
          && prev.note === next.note
          && prev.grade === next.grade
          && Boolean(prev.committing) === next.committing
        ) {
          return prev;
        }
        return next;
      });
    };
    apply();
    return subscribeAttendanceConfirm(apply);
  }, [confirmKey]);

  // Chỉ đếm UI; commit thật do attendanceConfirmStore (vẫn chạy khi GV đang ở tab khác)
  useEffect(() => {
    if (!pendingAttendance) return undefined;
    const tickId = setInterval(() => setConfirmTick((n) => n + 1), 250);
    return () => clearInterval(tickId);
  }, [pendingAttendance]);

  const beginAttendanceConfirm = useCallback(() => {
    if (isDroppedOut) {
      toast.info('Học viên đã thôi học — không điểm danh được.');
      return;
    }
    if (alreadyAttendedToday || isPendingConfirm || isCompleted) return;
    if (waitingAttendanceUnlock) {
      toast.info(liveAttendance?.reason || 'Điểm danh sau 15 phút kể từ giờ bắt đầu buổi học.');
      return;
    }
    setShowAttendanceModal(false);
    const gateSchedule = attendanceGate?.schedule;
    const scheduleId = gateSchedule?._id || gateSchedule?.id || '';
    const payload = {
      studentId: String(student._id || student.id),
      courseName: student.course || '',
      scheduleId: scheduleId ? String(scheduleId) : '',
      note: attForm.note || defaultAttendanceNote,
      grade: Number(attForm.grade) || 0,
      endsAt: Date.now() + ATTENDANCE_CONFIRM_MS,
      teacherId: String(currentUser?.id || currentUser?._id || ''),
    };
    upsertAttendanceConfirm(confirmKey, payload);
    setPendingAttendance({
      note: payload.note,
      grade: payload.grade,
      endsAt: payload.endsAt,
      committing: false,
    });
    toast.info(`Đã ghi nhận — còn ${Math.round(ATTENDANCE_CONFIRM_MS / 1000)} giây để hủy điểm danh trước khi tính buổi.`);
  }, [
    isDroppedOut,
    alreadyAttendedToday,
    isPendingConfirm,
    isCompleted,
    waitingAttendanceUnlock,
    liveAttendance?.reason,
    attForm.note,
    attForm.grade,
    defaultAttendanceNote,
    toast,
    student._id,
    student.id,
    student.course,
    currentUser?.id,
    currentUser?._id,
    confirmKey,
    attendanceGate?.schedule,
  ]);

  const cancelPendingAttendance = useCallback(() => {
    if (getAttendanceConfirm(confirmKey)?.committing) {
      toast.info('Đang ghi nhận điểm danh — không thể hủy lúc này.');
      return;
    }
    removeAttendanceConfirm(confirmKey);
    setPendingAttendance(null);
    toast.success('Đã hủy điểm danh — buổi chưa được tính.');
  }, [toast, confirmKey]);

  const makeupSummary = useMemo(
    () => getMakeupSessionSummary({ student, schedule: attendanceGate?.schedule }),
    [student, attendanceGate?.schedule],
  );

  const openMakeupModal = useCallback(() => {
    if (makeupPending || alreadyAttendedToday) return;
    setShowMakeupModal(true);
  }, [makeupPending, alreadyAttendedToday]);

  const openAttendanceModal = useCallback(() => {
    if (isDroppedOut) {
      toast.info('Học viên đã thôi học — không điểm danh được.');
      return;
    }
    if (makeupPending) return;
    if (isOverdueMakeup) {
      openMakeupModal();
      return;
    }
    if (alreadyAttendedToday || isPendingConfirm || isCompleted) return;
    if (waitingAttendanceUnlock) {
      toast.info(liveAttendance?.reason || 'Điểm danh sau 15 phút kể từ giờ bắt đầu buổi học.');
      return;
    }
    if (!canCheckIn) return;
    const tGrade = (student.grades || []).find((g) => g.date === todayStr);
    setAttForm({
      note: tGrade?.note || defaultAttendanceNote,
      grade: tGrade?.grade ?? (student.lastGrade || 0),
    });
    setShowAttendanceModal(true);
  }, [
    isDroppedOut,
    toast,
    makeupPending,
    isOverdueMakeup,
    openMakeupModal,
    alreadyAttendedToday,
    isPendingConfirm,
    isCompleted,
    waitingAttendanceUnlock,
    liveAttendance?.reason,
    canCheckIn,
    student.grades,
    student.lastGrade,
    todayStr,
    defaultAttendanceNote,
  ]);

  const sendMakeupRequestToAdmin = useCallback(async () => {
    if (makeupPending) return;
    setSendingMakeup(true);
    try {
      const teacherName = currentUser?.name || 'Giảng viên';
      const teacherId = String(currentUser?.id || currentUser?._id || '');
      const sch = attendanceGate?.schedule;
      const draft = buildAttendanceMakeupDraft({
        student,
        schedule: sch,
        teacherName,
      });
      let peer = { id: 'admin', name: 'Admin', role: 'admin', adminRole: 'SUPER_ADMIN' };
      try {
        const res = await messagesAPI.getContacts();
        if (res?.success) {
          peer = pickAdminContactForMakeup(res.data || []);
        }
      } catch {
        /* fallback admin mailbox */
      }
      await messagesAPI.send({
        senderId: teacherId || 'teacher',
        senderName: teacherName,
        senderRole: 'teacher',
        receiverId: String(peer.id),
        receiverName: peer.name || 'Admin',
        receiverRole: peer.role || 'admin',
        content: draft,
        messageType: 'text',
      });
      if (makeupKey) {
        markMakeupPending(makeupKey, {
          scheduleId: String(sch?._id || sch?.id || ''),
          studentId: String(student._id || student.id || ''),
        });
        setMakeupPending(true);
      }
      setShowMakeupModal(false);
      toast.success('Đã gửi yêu cầu điểm danh bù tới Admin.');
    } catch (err) {
      toast.error(err?.message || 'Không gửi được yêu cầu. Thử lại sau.');
    } finally {
      setSendingMakeup(false);
    }
  }, [attendanceGate?.schedule, currentUser, student, toast, makeupKey, makeupPending]);

  // Pending 10s: hủy điểm danh (local). Đang commit / đã điểm danh: không hủy. Chưa DD: hủy ca.
  const canCancelSession = (isPendingConfirm && !isCommittingAttendance)
    || (
      showSessionActionRow
      && !alreadyAttendedToday
      && !isPendingConfirm
      && Boolean(attendanceGate?.schedule)
    );
  const cancelIsUndoAttendance = isPendingConfirm && !isCommittingAttendance;
  const cancelButtonLabel = isCommittingAttendance
    ? 'Đang ghi nhận'
    : cancelIsUndoAttendance
      ? (confirmRemainSec > 0 ? `Hủy điểm danh (${confirmRemainSec}s)` : 'Hủy điểm danh')
      : alreadyAttendedToday
        ? 'Đã khóa'
        : 'Hủy ca';
  const cancelButtonTitle = isCommittingAttendance
    ? 'Đang ghi nhận điểm danh lên hệ thống'
    : cancelIsUndoAttendance
      ? `Hủy điểm danh trong ${confirmRemainSec}s — buổi chưa tính`
      : alreadyAttendedToday
        ? 'Đã điểm danh — không thể hủy sau khi hết thời gian chờ'
        : 'Hủy ca lịch học hôm nay';
  const cancelButtonClassActive =
    'bg-red-600 hover:bg-red-700 text-white border-red-600 shadow-sm shadow-red-600/25 active:scale-[0.98] cursor-pointer';
  const cancelButtonClassDisabled =
    'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60';

  const leftAttendanceLocked = alreadyAttendedToday || isPendingConfirm || makeupPending;
  const leftAttendanceDisabled = isDroppedOut || isCompleted || leftAttendanceLocked || waitingAttendanceUnlock || (!isOverdueMakeup && !canCheckIn && !makeupPending);

  const fetchStudentAssignments = useCallback(async () => {
    setLoadingAssign(true);
    try {
      const sid = student.id || student._id;
      const course = String(student.course || '').trim();
      const res = await api.assignments.getByStudentAndCourse(sid, course);
      if (res.success) {
        const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const want = norm(course);
        setCourseAssignments(
          (res.data || [])
            .filter((a) => !want || norm(a.courseId) === want)
            .map((a) => ({
              ...a,
              submissions: a.mySubmission ? [a.mySubmission] : [],
            }))
        );
      }
    } catch (e) { void 0 }
    setLoadingAssign(false);
  }, [student.id, student._id, student.course]);

  useEffect(() => {
    if (activePanel === 'assignments' || activePanel === 'logs') {
      fetchStudentAssignments();
    }
  }, [activePanel, student.id, student.course, fetchStudentAssignments]);

  const fetchActivityExtras = useCallback(async () => {
    setLoadingLogs(true);
    const sid = String(student.id || student._id || '');
    const teacherId = student.teacherId || student.teacherIds?.[0];
    try {
      const [quizRes, evalRes] = await Promise.all([
        api.quizzes.getTeacherQuizzes().catch(() => null),
        teacherId ? api.evaluations.getByTeacher(teacherId).catch(() => null) : Promise.resolve(null),
      ]);
      if (quizRes?.success) {
        setStudentQuizzes(quizRes.data || []);
      }
      const fromApi = evalRes?.success
        ? (evalRes.data || []).filter((e) => String(e.studentId?._id || e.studentId) === sid)
        : [];
      setStudentEvals(fromApi);
    } catch {
      /* ignore */
    } finally {
      setLoadingLogs(false);
    }
  }, [student.id, student._id, student.teacherId, student.teacherIds]);

  useEffect(() => {
    if (activePanel === 'logs') {
      fetchActivityExtras();
    }
  }, [activePanel, fetchActivityExtras]);

  const activityLogs = useMemo(() => {
    const sid = String(student.id || student._id || '');
    const studentSchedules = (allSchedules || []).filter(
      (sch) => String(sch.studentId?._id || sch.studentId || '') === sid
    );
    return buildStudentActivityLogs({
      student,
      assignments: courseAssignments,
      quizzes: studentQuizzes,
      evaluations: [], // KHÔNG hiển thị đánh giá của học viên cho giảng viên
      schedules: studentSchedules,
    });
  }, [student, courseAssignments, studentQuizzes, allSchedules]);

  /** Realtime: học viên nộp bài → cập nhật trạng thái ngay */
  useEffect(() => {
    if (!socket) return;
    const sid = String(student.id || student._id);

    const onSubmissionForStudent = (submission) => {
      const subStudent = String(submission?.studentId?._id || submission?.studentId || '');
      if (subStudent && subStudent !== sid) return;
      fetchStudentAssignments();
    };

    const shouldRefresh = (data) => {
      if (!data || typeof data !== 'object') return false;
      if (data.type === 'submission' || data.type === 'assignment') return true;
      const ev = data.eventName;
      if (typeof ev === 'string' && ev.startsWith('submission:')) return true;
      if (data.assignmentId != null && data.studentId != null) return true;
      return false;
    };

    socket.on('submission:new', onSubmissionForStudent);
    socket.on('submission:graded', onSubmissionForStudent);

    const unsubRefresh = onDataRefresh((data) => {
      if (shouldRefresh(data)) fetchStudentAssignments();
    });

    return () => {
      socket.off('submission:new', onSubmissionForStudent);
      socket.off('submission:graded', onSubmissionForStudent);
      unsubRefresh?.();
    };
  }, [socket, student.id, student._id, onDataRefresh, fetchStudentAssignments]);

  const assignmentDeadlineMin = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isDeadlineInPast = (value) => {
    const t = new Date(value).getTime();
    return Number.isNaN(t) || t <= Date.now();
  };

  const handleCreateAssign = async () => {
    if (!newAssign.title || !newAssign.deadline) return;
    if (isDeadlineInPast(newAssign.deadline)) {
      showGlossyAlert('Hạn nộp phải sau thời điểm hiện tại — không chọn ngày cũ.');
      return;
    }
    try {
      const res = await api.assignments.create({
        ...newAssign,
        courseId: student.course,
        teacherId: student.teacherId || 'current',
        studentId: student.id || student._id,
      });
      if (res.success) {
        setShowAddAssign(false);
        setNewAssign({ title: '', deadline: '', fileUrl: '', description: '' });
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const isAssignmentGraded = (assign) => {
    const sub = assign.submissions?.find(s => String(s.studentId?._id || s.studentId) === String(student.id || student._id))
      || assign.mySubmission;
    return sub?.status === 'graded';
  };

  const handleEditAssign = (assign) => {
    if (isAssignmentGraded(assign)) {
      showGlossyAlert('Bài đã chấm điểm — không thể sửa. Chỉ có thể chỉnh sửa điểm.');
      return;
    }
    setEditingAssignmentId(assign._id);
    setEditingAssign({
      title: assign.title,
      deadline: assign.deadline ? new Date(assign.deadline).toISOString().slice(0,16) : '',
      fileUrl: assign.fileUrl || '',
      description: assign.description || ''
    });
  };

  const handleUpdateAssign = async () => {
    if (!editingAssign.title || !editingAssign.deadline) return;
    if (isDeadlineInPast(editingAssign.deadline)) {
      showGlossyAlert('Hạn nộp phải sau thời điểm hiện tại — không chọn ngày cũ.');
      return;
    }
    try {
      const res = await api.assignments.update(editingAssignmentId, editingAssign);
      if (res.success) {
        setEditingAssignmentId(null);
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const handleDeleteAssign = async (id) => {
    const assign = courseAssignments.find(a => String(a._id) === String(id));
    if (assign && isAssignmentGraded(assign)) {
      showGlossyAlert('Bài đã chấm điểm — không thể xóa.');
      return;
    }
    if (!(await window.cmsConfirm("Bạn có chắc muốn xóa bài tập này?"))) return;
    try {
      const res = await api.assignments.delete(id);
      if (res.success) {
        fetchStudentAssignments();
      }
    } catch (e) { void 0 }
  };

  const handleAssignmentUpload = async (e, type = 'new') => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showGlossyAlert("File đính kèm quá lớn. Xin vui lòng giới hạn dưới 3MB!");
      e.target.value = '';
      return;
    }
    try {
      const res = await api.assignments.uploadFile(file);
      if (res.success) {
        if (type === 'new') setNewAssign(prev => ({...prev, fileUrl: res.fileUrl}));
        else setEditingAssign(prev => ({...prev, fileUrl: res.fileUrl}));
      } else {
        showGlossyAlert(res.message || "Lỗi khi tải file lên");
      }
    } catch(err) {
      showGlossyAlert("Lỗi mạng khi tải file");
    }
    e.target.value = '';
  };

  const handleCancelSession = async () => {
    if (!canCancelSession) return;

    // Trong cửa sổ 10s: hủy pending local — chưa cộng buổi
    if (isPendingConfirm) {
      cancelPendingAttendance();
      return;
    }

    const sid = student._id || student.id;
    const schedule = attendanceGate?.schedule;
    const scheduleId = schedule?._id || schedule?.id;

    // Đã commit điểm danh → không cho hủy điểm danh nữa (chỉ hủy ca khi chưa DD)
    if (alreadyAttendedToday) return;

    if (!scheduleId) {
      toast.error('Không tìm thấy lịch để hủy.');
      return;
    }

    showModal({
      title: 'Hủy ca',
      content: `Xác nhận hủy ca của "${student.name || sid}"?\nLịch: ${makeupSummary.dateLabel} · ${makeupSummary.timeRange}`,
      type: 'warning',
      confirmText: 'XÁC NHẬN HỦY CA',
      cancelText: 'Đóng',
      onConfirm: async () => {
        try {
          const reason = 'GV hủy ca từ trang học viên';
          const res = await api.schedules.cancel(scheduleId, reason);
          if (res?.success === false) {
            showModal({ title: 'Lỗi', content: res.message || 'Không hủy được ca', type: 'error', confirmText: 'Đóng' });
            return;
          }
          // Realtime: cập nhật SWR schedules — không reload, không gọi API lần 2
          setSchedulesLocal((prev) => (prev || []).map((sch) => {
            if (String(sch._id || sch.id) !== String(scheduleId)) return sch;
            return { ...sch, status: 'cancelled', note: reason };
          }));
          toast.success('Đã hủy ca.');
          if (typeof triggerBackgroundSync === 'function') {
            Promise.resolve(triggerBackgroundSync()).catch(() => {});
          }
        } catch (e) {
          showModal({ title: 'Lỗi', content: e?.message || 'Lỗi kết nối server', type: 'error', confirmText: 'Đóng' });
        }
      },
    });
  };

  const handleLinkSave = () => {
    if (isDroppedOut) {
      toast.info('Học viên đã thôi học — không cập nhật được.');
      return;
    }
    onUpdateLink(student._id || student.id, linkInput, student.course || '');
    setLinkSaved(true); setTimeout(() => setLinkSaved(false), 2000);
  };

  const handleGradeSave = () => {
    if (isDroppedOut) {
      toast.info('Học viên đã thôi học — không cập nhật được.');
      return;
    }
    onSaveGrade(student._id || student.id, Number(gradeInput), student.course);
    setGradeSaved(true); setTimeout(() => setGradeSaved(false), 2000);
  };

  const gradeValue = Number(gradeInput) || 0;
  const gradeLetter = gradeValue >= 8.5 ? 'A' : gradeValue >= 7 ? 'B' : gradeValue >= 5 ? 'C' : 'D';

  const panels = [
    { key: 'progress', icon: Activity, label: 'Tiến độ' },
    { key: 'assignments', icon: BookOpen, label: 'Bài tập' },
    { key: 'quiz', icon: ListChecks, label: 'Trắc nghiệm' },
    { key: 'link', icon: Video, label: 'Link học' },
    { key: 'schedule', icon: Calendar, label: 'Sắp lịch' },
    { key: 'logs', icon: History, label: 'Nhật ký' },
  ];

  const quizStudents = (myStudents && myStudents.length > 0) ? myStudents : [student];
  const studentId = String(student._id || student.id || '');

  const openQuizCreate = () => {
    setActivePanel('quiz');
    setShowQuizCreate(true);
  };

  if (isDetailed) {
    return (
      <div className={`bg-white rounded-2xl sm:rounded-[40px] shadow-md sm:shadow-lg shadow-slate-200/60 border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500 min-w-0 w-full max-w-full ${isDroppedOut ? 'opacity-85' : ''}`}>
        {isDroppedOut && (
          <div className="bg-slate-700 text-white text-center text-[11px] sm:text-xs font-bold uppercase tracking-wide px-3 py-2.5">
            Học viên đã thôi học / hoàn phí — chỉ xem lịch sử · không thao tác
          </div>
        )}
        {/* Header */}
        <div className="bg-slate-50/80 px-3 py-3 sm:px-8 sm:py-6 md:px-10 md:py-8 border-b border-slate-100">
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl sm:rounded-[28px] p-3 sm:p-6 min-w-0">
            <div className="flex items-start gap-3 sm:gap-6 min-w-0">
            <div className="relative w-11 h-11 sm:w-20 sm:h-20 shrink-0">
            <div className="w-full h-full rounded-xl sm:rounded-[28px] overflow-hidden shadow-sm border border-slate-200 bg-white">
              <img
                src={resolveAvatarUrl({
                  avatar: student.avatarUrl || student.avatar || student.photo,
                  role: 'student',
                  gender: student.gender,
                })}
                alt={getDisplayName(student)}
                className="w-full h-full object-cover"
              />
            </div>
            {isStudentOnline ? (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 border-2 border-white rounded-full" title="Đang online" />
            ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <h2 className="text-base sm:text-2xl font-bold tracking-tight text-slate-800 break-words line-clamp-2 leading-snug">
                    {getDisplayName(student)}
                  </h2>
                  <p className="text-slate-500 text-[11px] sm:text-sm font-semibold mt-0.5 break-words line-clamp-2 leading-snug">
                    {student.course}{student.age ? ` · ${student.age} tuổi` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`hidden min-[420px]:inline-flex px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                    isDroppedOut
                      ? 'bg-slate-100 text-slate-500'
                      : isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {isDroppedOut ? 'Thôi học' : isCompleted ? 'Hoàn thành' : 'Đang học'}
                  </span>
                  <button
                    type="button"
                    disabled={isDroppedOut}
                    onClick={() => {
                      if (isDroppedOut) return;
                      const id = String(student.id || student._id || '');
                      if (!navigate || !id) return;
                      navigate('/teacher/inbox', {
                        state: {
                          selectUserId: id,
                          selectUser: {
                            id,
                            name: student.name || 'Học viên',
                            role: 'student',
                            avatar: student.avatar,
                            trusted: true,
                          },
                        },
                      });
                    }}
                    className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all border shrink-0 ${
                      isDroppedOut
                        ? 'bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100'
                    }`}
                    title={isDroppedOut ? 'HV đã thôi học' : 'Nhắn tin với học viên'}
                    aria-label="Nhắn tin với học viên"
                  >
                    <MessageSquare size={14} />
                  </button>
                  {onLockExam && !isDroppedOut && (
                    <FailExamButton student={student} onLockExam={onLockExam} compact />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={`min-[420px]:hidden px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase whitespace-nowrap ${
                  isDroppedOut
                    ? 'bg-slate-100 text-slate-500'
                    : isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {isDroppedOut ? 'Thôi học' : isCompleted ? 'Hoàn thành' : 'Đang học'}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase whitespace-nowrap border ${
                  isStudentOnline
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {isStudentOnline ? 'Đang online' : 'Offline'}
                </span>
                {!isStudentOnline && lastSeenAt ? (
                  <span className="text-[10px] font-medium text-slate-400">{lastSeenLabel}</span>
                ) : null}
                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide bg-white text-slate-400 border border-slate-100 whitespace-nowrap">
                  {student.learningMode === 'ONLINE' ? 'Học online' : 'Học tại trung tâm'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex justify-between items-center mb-1.5 text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-wide text-slate-400">
              <span>Tiến độ khóa học</span>
              <span className="text-slate-700 tabular-nums">{done}/{sessionTotal} buổi ({progressPct}%)</span>
            </div>
            <div className="h-1.5 sm:h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {priorCredit > 0 ? (
              <p className="text-[10px] sm:text-[11px] lg:text-sm text-slate-500 mt-1.5 leading-snug">
                Trên lịch: <span className="font-semibold text-slate-700">{onCalendarDone}</span>
                {' · '}
                Ghi nhận trước: <span className="font-semibold text-slate-700">{priorCredit}</span>
              </p>
            ) : null}
          </div>
        </div>
        </div>

        {String(student.teacherAlert || '').trim() ? (
          <div className="mx-3 mb-0 sm:mx-8 md:mx-10 mt-3 rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
              Lưu ý từ Admin
            </p>
            <p className="text-xs sm:text-sm font-semibold text-amber-950 mt-1 whitespace-pre-wrap break-words leading-snug">
              {String(student.teacherAlert).trim()}
            </p>
          </div>
        ) : null}

        {/* Tabs — Tiến độ, Bài tập, Tạo TN, Link học, Đánh giá, Nhật ký */}
        <div className="flex w-full px-3 sm:px-6 md:px-10 bg-white border-b border-slate-100 min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {panels.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (isDroppedOut && (key === 'quiz' || key === 'schedule' || key === 'assignments' || key === 'link')) {
                  toast.info('Học viên đã thôi học — không thao tác được.');
                  if (key === 'schedule') {
                    // Cho xem nhật ký lịch qua panel logs; không mở xếp lịch mới
                    setActivePanel('logs');
                  }
                  return;
                }
                if (key === 'quiz') {
                  if (isDroppedOut) return;
                  openQuizCreate();
                  return;
                }
                if (key === 'schedule') {
                  if (isDroppedOut) {
                    toast.info('Học viên đã thôi học — không xếp lịch mới.');
                    return;
                  }
                  setShowQuickSchedule(true);
                  return;
                }
                setActivePanel(key);
              }}
              title={key === 'quiz' ? 'Tạo trắc nghiệm' : label}
              aria-label={key === 'quiz' ? 'Tạo trắc nghiệm' : label}
              aria-current={activePanel === key ? 'page' : undefined}
              className={`group relative flex-1 min-w-[76px] sm:min-w-0 flex flex-col items-center justify-center gap-1 px-1 sm:px-1 min-h-11 sm:min-h-0 py-2 sm:py-3.5 text-[10px] sm:text-xs lg:text-sm font-bold tracking-wide transition-all ${
                activePanel === key ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 ${
                activePanel === key
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200 ring-2 ring-blue-100'
                  : 'bg-slate-100 text-slate-500 shadow-sm group-hover:bg-blue-50 group-hover:text-blue-600'
              }`}>
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white/70 blur-[3px]" aria-hidden="true" />
                <Icon size={16} strokeWidth={2.4} className="relative drop-shadow-sm" aria-hidden="true" />
              </span>
              <span className="block truncate max-w-full leading-tight px-0.5">{label}</span>
              {activePanel === key && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Action Content */}
        <div className="p-3 sm:p-6 md:p-10 space-y-4 sm:space-y-8">
           {activePanel === 'progress' && (
              <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500">
                 {/* Stat Boxes — 3 cột trên mobile */}
                 <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2 sm:gap-4 md:gap-6 min-w-0">
                    <div className="group bg-blue-50/60 border border-blue-100 rounded-xl sm:rounded-2xl text-center flex flex-col items-center justify-center p-2.5 sm:p-6 min-w-0 overflow-hidden">
                       <p className="text-[10px] sm:text-xs lg:text-sm font-bold text-blue-600 uppercase tracking-wide mb-1 truncate max-w-full">Đã học</p>
                       <div className="relative mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white shadow-md shadow-blue-200 transition-transform group-hover:scale-105">
                         <CheckCircle size={18} strokeWidth={2.4} />
                       </div>
                       <h4 className="text-lg sm:text-4xl font-extrabold text-blue-600 leading-none tabular-nums">{done}</h4>
                       <p className="text-[10px] sm:text-xs font-bold text-blue-400 mt-1 uppercase">buổi</p>
                    </div>
                    <div className="group bg-amber-50/60 border border-amber-100 rounded-xl sm:rounded-2xl text-center flex flex-col items-center justify-center p-2.5 sm:p-6 min-w-0 overflow-hidden">
                       <p className="text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-wide mb-1 text-amber-600 truncate max-w-full">Còn lại</p>
                       <div className="relative mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-200 transition-transform group-hover:scale-105">
                         <Clock size={18} strokeWidth={2.4} />
                       </div>
                       <h4 className="text-lg sm:text-4xl font-extrabold leading-none tabular-nums text-amber-600">{remainingSessions}</h4>
                       <p className="text-[10px] sm:text-xs font-bold mt-1 uppercase text-amber-400">buổi</p>
                    </div>
                    <div className="group bg-purple-50/60 border border-purple-100 rounded-xl sm:rounded-2xl text-center flex flex-col items-center justify-center p-2.5 sm:p-6 min-w-0 overflow-hidden">
                       <p className="text-[10px] sm:text-xs lg:text-sm font-bold text-purple-600 uppercase tracking-wide mb-1 truncate max-w-full">Điểm TB</p>
                       <div className="relative mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500 text-white shadow-md shadow-purple-200 transition-transform group-hover:scale-105">
                         <Star size={18} strokeWidth={2.4} />
                       </div>
                       <div className="flex items-baseline justify-center gap-0.5 min-w-0">
                          <h4 className="text-lg sm:text-4xl font-extrabold text-purple-600 leading-none tabular-nums">{student.lastGrade || 0}</h4>
                          <span className="text-[10px] sm:text-lg font-bold text-purple-400">/10</span>
                       </div>
                       <p className="text-xs font-bold text-purple-400 mt-1 uppercase hidden sm:block">Đánh giá chung</p>
                    </div>
                 </div>
                 {priorCredit > 0 ? (
                   <p className="text-[11px] sm:text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 leading-snug">
                     Đã học gồm <span className="font-semibold text-slate-700">{onCalendarDone} buổi trên lịch</span>
                     {' + '}
                     <span className="font-semibold text-slate-700">{priorCredit} buổi ghi nhận trước</span>
                     {' '}(Admin / chuyển khóa) — khớp số hệ thống.
                   </p>
                 ) : null}

                 {/* Actions: Điểm danh | Hủy ca / Hủy điểm danh — ẩn khi không còn lịch */}
                 {showSessionActionRow ? (
                 <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 mt-4 sm:gap-4 min-w-0">
                     <button 
                       type="button"
                       onClick={openAttendanceModal} 
                       disabled={leftAttendanceDisabled}
                       title={
                         isCompleted ? 'Khóa học đã hoàn thành' :
                         makeupPending ? 'Đã gửi yêu cầu — chờ Admin xét duyệt điểm danh bù' :
                         isOverdueMakeup ? 'Quá hạn điểm danh — gửi yêu cầu điểm danh bù tới Admin' :
                         isCommittingAttendance ? 'Đang ghi nhận điểm danh lên hệ thống' :
                         isPendingConfirm ? `Đang chờ xác nhận — còn ${confirmRemainSec}s để hủy` :
                         attendanceDisputed ? 'Học viên không đồng ý — đang giải quyết (chờ Admin)' :
                         awaitingStudentConfirm ? 'Đã gửi điểm danh — đang chờ học viên xác nhận' :
                         alreadyAttendedToday ? `Đã điểm danh. Mở khóa sau ${cooldownHours} tiếng.` :
                         waitingAttendanceUnlock ? (liveAttendance?.reason || 'Điểm danh sau 15 phút kể từ giờ bắt đầu buổi học') :
                         'Bấm để điểm danh buổi học hôm nay'
                       }
                       className={`min-h-10 sm:min-h-[3.25rem] px-2 py-2 rounded-xl font-medium text-[10px] sm:text-sm uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all min-w-0 ${
                         isCompleted 
                           ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                         : makeupPending
                           ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 pointer-events-none select-none'
                         : isOverdueMakeup
                           ? 'bg-amber-500 hover:bg-amber-600 text-white active:scale-[0.98] shadow-sm'
                         : attendanceDisputed
                           ? 'bg-amber-100 text-amber-800 cursor-not-allowed opacity-90 pointer-events-none select-none'
                         : awaitingStudentConfirm
                           ? 'bg-blue-100 text-blue-800 cursor-not-allowed opacity-90 pointer-events-none select-none'
                         : leftAttendanceLocked
                           ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 pointer-events-none select-none'
                         : waitingAttendanceUnlock
                           ? 'bg-slate-100 text-slate-600 cursor-not-allowed opacity-60'
                           : 'bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-[0.98]'
                       }`}
                     >
                       <CheckCircle size={14} className="shrink-0" aria-hidden="true" />
                       <span className="min-w-0 text-center leading-tight whitespace-normal">
                         {isCompleted 
                           ? 'Hoàn thành'
                           : makeupPending
                             ? 'Đang xét duyệt'
                           : isOverdueMakeup
                             ? 'Điểm danh bù'
                             : isCommittingAttendance
                               ? 'Đang ghi nhận'
                             : isPendingConfirm
                               ? 'Đang xác nhận'
                               : attendanceDisputed
                                 ? 'Đang giải quyết'
                               : awaitingStudentConfirm
                                 ? 'Chờ HV xác nhận'
                               : alreadyAttendedToday
                                 ? (cooldownHours > 0 ? `Chờ ${cooldownHours}h` : 'Đã điểm danh')
                                 : 'Điểm danh'}
                       </span>
                     </button>

                   <button
                     type="button"
                     onClick={() => { if (canCancelSession) handleCancelSession(); }}
                     disabled={!canCancelSession}
                     aria-disabled={!canCancelSession}
                     title={cancelButtonTitle}
                     className={`min-h-10 sm:min-h-[3.25rem] px-2 py-2 rounded-xl font-medium text-[10px] sm:text-sm uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all min-w-0 border ${
                       canCancelSession ? cancelButtonClassActive : cancelButtonClassDisabled
                     }`}
                   >
                     <X size={14} className="shrink-0" aria-hidden="true" />
                     <span className="min-w-0 text-center leading-tight whitespace-normal">
                       {cancelButtonLabel}
                     </span>
                   </button>
                 </div>
                 ) : null}

                 {/* Notes */}
                 <div className="mt-4 sm:mt-0">
                    <label className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                       <FileText size={12} aria-hidden="true" /> Ghi chú học viên
                    </label>
                    <div className="border border-slate-200 rounded-xl p-3 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                    <textarea 
                       value={notesInput} onChange={e => setNotesInput(e.target.value)}
                       onBlur={() => {
                         if (isDroppedOut) return;
                         onUpdateNotes((student._id || student.id), notesInput);
                       }}
                       readOnly={isDroppedOut}
                       placeholder="Nhận xét cá nhân, ghi nhận đặc biệt về học viên này..."
                       className={`w-full bg-transparent border-0 rounded-none p-0 text-xs sm:text-sm font-medium outline-none resize-none ${isDroppedOut ? 'opacity-60 cursor-not-allowed' : ''}`}
                       rows={3}
                    />
                    <span className="text-[11px] text-slate-400 ml-auto block mt-2">Tự động lưu khi rời ô nhập</span>
                    </div>
                 </div>
              </div>
           )}

           {activePanel === 'link' && (
              <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                 <div className="bg-indigo-50 border border-indigo-100 rounded-2xl sm:rounded-[40px] p-4 sm:p-6 md:p-10 relative overflow-hidden min-w-0">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-200/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 min-w-0">
                       <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                          <Video size={22} />
                       </div>
                       <div className="min-w-0">
                          <h3 className="text-base sm:text-xl font-black text-indigo-900 truncate">Link học trực tuyến</h3>
                          <p className="text-xs font-bold text-indigo-400 leading-snug">Tự động đồng bộ hóa với Dashboard của học viên</p>
                       </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 min-w-0">
                       <div className="flex-1 relative min-w-0">
                          <input 
                            type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                            className="w-full bg-white border-2 border-indigo-100 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm font-bold text-indigo-700 focus:border-indigo-500 outline-none transition-all shadow-sm min-w-0"
                            placeholder="Nhập link Google Meet / Zoom..."
                          />
                       </div>
                       <button 
                         type="button"
                         onClick={handleLinkSave}
                         className={`shrink-0 w-full sm:w-auto min-h-11 px-6 sm:px-10 py-3 sm:py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg whitespace-nowrap ${
                            linkSaved ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-100'
                         }`}
                       >
                         {linkSaved ? 'ĐÃ LƯU ✓' : 'CẬP NHẬT'}
                       </button>
                    </div>
                 </div>
              </div>
           )}

            {activePanel === 'assignments' && (
              <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-10 duration-500">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-600 truncate min-w-0">
                    Danh sách bài tập
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddAssign(!showAddAssign)}
                    className={`shrink-0 text-xs px-3 min-h-9 rounded-lg font-medium transition-all inline-flex items-center gap-1 whitespace-nowrap ${
                      showAddAssign
                        ? 'bg-white text-red-600 border-2 border-red-600 hover:bg-red-50'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {showAddAssign ? <X size={14} /> : <Plus size={14} />}
                    {showAddAssign ? 'Hủy' : 'Giao bài'}
                  </button>
                </div>

                {showAddAssign && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-[32px] p-6 space-y-4 shadow-inner animate-in zoom-in-95">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Tiêu đề bài tập</label>
                        <input type="text" value={newAssign.title} onChange={e => setNewAssign({...newAssign, title: e.target.value})}
                          className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="VD: Homework Buổi 1" />
                      </div>
                      <div>
                        <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Hạn nộp (Deadline)</label>
                        <input
                          type="datetime-local"
                          min={assignmentDeadlineMin()}
                          value={newAssign.deadline}
                          onChange={e => setNewAssign({...newAssign, deadline: e.target.value})}
                          className="w-full max-w-full min-w-0 bg-white border border-indigo-200 rounded-2xl px-3 sm:px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none"
                        />
                        <p className="text-[10px] text-indigo-300 font-medium mt-1">Chỉ chọn từ hiện tại trở đi.</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Tài liệu đính kèm (Link Drive/File hoặc Tải lên)</label>
                        <div className="flex items-center gap-2 min-w-0">
                          <input type="text" value={newAssign.fileUrl} onChange={e => setNewAssign({...newAssign, fileUrl: e.target.value})}
                            className="flex-1 min-w-0 bg-white border border-indigo-200 rounded-2xl px-3 sm:px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="Dán link Drive/File..." />
                          <label className="shrink-0 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 w-11 h-11 rounded-2xl cursor-pointer transition inline-flex items-center justify-center" title="Tải file lên (Tối đa 3MB)">
                            <Upload size={18} />
                            <input type="file" className="hidden" onChange={(e) => handleAssignmentUpload(e, 'new')} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" />
                          </label>
                        </div>
                        <p className="text-xs cms-min-text-xs text-gray-400 font-medium italic mt-1.5 ml-1">* Cho phép: PDF, Word, Excel, ZIP, RAR. Tối đa 3MB.</p>
                      </div>
                      <button onClick={handleCreateAssign} className="md:col-span-2 bg-red-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-red-700 transition shadow-lg shadow-red-100">GỬI BÀI TẬP CHO HỌC VIÊN</button>
                    </div>
                  </div>
                )}

                {loadingAssign ? (
                   <div className="py-20 text-center animate-pulse text-xs font-black text-slate-300 uppercase tracking-[4px]">Đang tải dữ liệu...</div>
                ) : (
                  <div className="space-y-4">
                    {courseAssignments.map(assign => {
                      const submission = assign.submissions?.find(s => String(s.studentId?._id || s.studentId) === String(student.id || student._id));
                      const isSubmitted = !!submission;
                      const isGraded = submission?.status === 'graded';
                      
                      return editingAssignmentId === assign._id ? (
                        <div key={`edit-${assign._id}`} className="bg-indigo-50 border border-indigo-200 rounded-[32px] p-6 space-y-4 shadow-inner animate-in zoom-in-95 relative z-10 transition-all">
                          <div className="flex items-center justify-between">
                             <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">Chỉnh sửa Bài tập</h4>
                             <button onClick={() => setEditingAssignmentId(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16}/></button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Tiêu đề bài tập</label>
                              <input type="text" value={editingAssign.title} onChange={e => setEditingAssign({...editingAssign, title: e.target.value})}
                                className="w-full bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none"/>
                            </div>
                            <div>
                              <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Hạn nộp (Deadline)</label>
                              <input
                                type="datetime-local"
                                min={assignmentDeadlineMin()}
                                value={editingAssign.deadline}
                                onChange={e => setEditingAssign({...editingAssign, deadline: e.target.value})}
                                className="w-full max-w-full min-w-0 bg-white border border-indigo-200 rounded-2xl px-3 sm:px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none"
                              />
                              <p className="text-[10px] text-indigo-300 font-medium mt-1">Chỉ chọn từ hiện tại trở đi.</p>
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs cms-min-text-xs font-black text-indigo-400 uppercase mb-1 block">Tài liệu đính kèm (Link Drive/File hoặc Tải lên)</label>
                              <div className="flex items-center gap-2">
                                <input type="text" value={editingAssign.fileUrl} onChange={e => setEditingAssign({...editingAssign, fileUrl: e.target.value})}
                                  className="flex-1 bg-white border border-indigo-200 rounded-2xl px-4 py-3 text-sm font-bold text-indigo-900 focus:border-indigo-500 outline-none" placeholder="Dán link Drive/File..." />
                                <label className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-3 rounded-2xl cursor-pointer transition flex items-center justify-center" title="Tải file lên (Tối đa 3MB)">
                                  <Upload size={18} />
                                  <input type="file" className="hidden" onChange={(e) => handleAssignmentUpload(e, 'edit')} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar" />
                                </label>
                              </div>
                              <p className="text-xs cms-min-text-xs text-gray-400 font-medium italic mt-1.5 ml-1">* Cho phép: PDF, Word, Excel, ZIP, RAR. Tối đa 3MB.</p>
                            </div>
                            <button onClick={handleUpdateAssign} className="md:col-span-2 bg-red-600 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-red-700 transition shadow-lg shadow-red-100">CẬP NHẬT BÀI TẬP</button>
                          </div>
                        </div>
                      ) : (
                        <div key={assign._id} className="bg-white rounded-2xl sm:rounded-[40px] p-4 sm:p-6 border border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all group relative overflow-hidden">
                          {isGraded && <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full translate-x-12 -translate-y-12 pointer-events-none" />}

                          {/* Dòng 1: tên + badge */}
                          <div className="flex items-start justify-between gap-2 relative z-10">
                            <h5 className="line-clamp-2 font-semibold text-slate-800 text-sm sm:text-base leading-snug break-words flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                              <span className="min-w-0">{assign.title}</span>
                              {(() => {
                                const role = String(assign.assignedByRole || '').toLowerCase();
                                const isAdmin = role === 'admin' || role === 'staff';
                                const label = isAdmin ? 'Admin giao' : 'Giáo viên';
                                return (
                                  <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border ${
                                    isAdmin
                                      ? 'bg-violet-100 text-violet-700 border-violet-200'
                                      : 'bg-sky-100 text-sky-700 border-sky-200'
                                  }`}>
                                    {label}
                                  </span>
                                );
                              })()}
                            </h5>
                            {isSubmitted ? (
                              <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide flex items-center gap-1 border ${isGraded ? getGradeBadgeClasses(submission.grade) : 'bg-blue-100 text-blue-700 border-transparent'}`}>
                                {isGraded ? <Check size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                                {isGraded ? `${getGradeLabel(submission.grade)}: ${submission.grade}/10` : 'Đã nộp'}
                              </span>
                            ) : (
                              <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide bg-slate-50 text-slate-400">
                                Chưa nộp
                              </span>
                            )}
                          </div>

                          {/* Dòng 2: hạn + tải bài + sửa/xóa */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 relative z-10">
                            <p className="text-[11px] sm:text-xs font-medium text-slate-500 flex items-center gap-1">
                              <Clock size={12} className="text-orange-400 shrink-0" />
                              Hạn: {new Date(assign.deadline).toLocaleDateString('vi-VN')}
                            </p>
                            {isSubmitted && submission.submittedFileUrl && (
                              <a
                                href={buildMediaDownloadUrl(submission.submittedFileUrl, submission.submittedFileUrl.split('/').pop())}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] sm:text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                title="Tải bài làm của học viên"
                              >
                                <Download size={12} /> Tải bài làm
                              </a>
                            )}
                            {!isGraded && (
                              <div className="flex items-center gap-1 ml-auto">
                                <button type="button" onClick={() => handleEditAssign(assign)} title="Sửa bài tập" className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50">
                                  <Edit3 size={14} />
                                </button>
                                <button type="button" onClick={() => handleDeleteAssign(assign._id)} title="Xóa bài tập" className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Dòng 3: chấm điểm */}
                          {isSubmitted && (
                            <div className="grid grid-cols-2 gap-2 mt-3 relative z-10">
                              <input
                                type="number"
                                min="0"
                                max="10"
                                placeholder={isGraded ? 'Sửa điểm' : 'Điểm 0-10'}
                                value={gradingInputs[submission._id] ?? (isGraded ? (submission.grade ?? '') : '')}
                                onChange={(e) => setGradingInputs({ ...gradingInputs, [submission._id]: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 text-center"
                              />
                              <button
                                type="button"
                                onClick={() => handleGradeSubmit(submission._id)}
                                className={`w-full py-2 rounded-lg text-xs font-medium text-white transition-all ${
                                  isGraded ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                              >
                                {isGraded ? 'Sửa điểm' : 'Lưu điểm'}
                              </button>
                            </div>
                          )}

                          {isGraded && submission.teacherFeedback && (
                            <p className="text-[11px] text-slate-400 italic mt-2 line-clamp-2 relative z-10">*{submission.teacherFeedback}</p>
                          )}
                          {isGraded && !submission.teacherFeedback && (
                            <p className="text-[11px] text-slate-400 italic mt-2 relative z-10">*Giảng viên đã sửa điểm</p>
                          )}

                          {/* Link phụ: xem đề bài */}
                          {assign.fileUrl && (
                            <a
                              href={resolveMediaUrl(assign.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 mt-2.5 text-[11px] sm:text-xs font-medium text-blue-600 hover:text-blue-800 relative z-10"
                            >
                              <Link2 size={12} /> Xem đề bài
                            </a>
                          )}
                        </div>
                      );
                    })}
                    {courseAssignments.length === 0 && !showAddAssign && (
                      <div className="py-24 text-center bg-gray-50/50 rounded-[40px] border-4 border-dashed border-white">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-200 shadow-sm">
                           <BookOpen size={28} />
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-10 leading-relaxed">Chưa có bài tập nào được giao<br/>cho lộ trình này</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activePanel === 'quiz' && (
              <div className="animate-in fade-in duration-300 py-8 sm:py-12 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                  <ListChecks size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Tạo trắc nghiệm</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Soạn đề giao cho <strong>{getDisplayName(student)}</strong>
                    {student.course ? ` · ${student.course}` : ''}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openQuizCreate}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  <Plus size={14} /> Mở form tạo trắc nghiệm
                </button>
              </div>
            )}

            {activePanel === 'grade' && (
              <div className="space-y-6 sm:space-y-8 animate-in slide-in-from-right-10 duration-500">
                 <div className="bg-amber-50 border border-amber-100 rounded-2xl sm:rounded-[40px] p-5 sm:p-10 text-center flex flex-col items-center gap-4 sm:gap-6">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                        <Award size={22} />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-amber-900">Đánh giá quá trình</h3>
                      <p className="text-[11px] sm:text-xs font-medium text-amber-600 max-w-sm leading-relaxed">
                        Môn {student.course} · Cập nhật điểm trung bình dựa trên bài tập
                      </p>
                    </div>

                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={gradeInput}
                      onChange={e => setGradeInput(e.target.value)}
                      className="w-28 sm:w-32 bg-white border-2 border-amber-200 rounded-xl p-3 text-2xl font-bold text-amber-700 text-center focus:border-amber-500 outline-none"
                    />

                    <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-full border-4 border-amber-100 flex flex-col items-center justify-center shadow-md">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Xếp loại</span>
                      <span className="text-4xl sm:text-5xl font-bold text-amber-600 leading-none mt-0.5">{gradeLetter}</span>
                    </div>

                    <p className="text-[11px] font-medium text-amber-500 italic">* Điểm số sẽ được hiển thị công khai trên học bạ</p>

                    <button
                      type="button"
                      onClick={handleGradeSave}
                      className="w-full max-w-sm bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-medium text-sm transition-all"
                    >
                      {gradeSaved ? 'Đã lưu ✓' : 'Lưu kết quả đánh giá'}
                    </button>
                 </div>
              </div>
           )}

           {activePanel === 'logs' && (
              <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-10 duration-500">
                <div className="flex items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 min-w-0">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <History size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-black text-slate-800 leading-snug">
                        Nhật ký Hoạt động &amp; Lịch sử Học viên
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium leading-snug">
                        Trái: ngày buổi học · Phải: giờ thao tác thực tế (điểm danh / hủy / nộp bài…)
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 shrink-0 whitespace-nowrap">
                    {activityLogs.length} lượt
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {loadingLogs || (activePanel === 'logs' && loadingAssign && activityLogs.length === 0) ? (
                    <div className="py-16 text-center animate-pulse text-xs font-black text-slate-300 uppercase tracking-[4px]">
                      Đang tải nhật ký...
                    </div>
                  ) : activityLogs.length > 0 ? (
                    activityLogs.map((log) => {
                      const meta = ACTIVITY_LOG_META[log.type] || ACTIVITY_LOG_META.attendance;
                      const Icon =
                        log.type === 'quiz' ? Award
                          : log.type === 'homework' ? Clipboard
                            : log.type === 'grade_update' ? Edit3
                              : log.type === 'evaluation' ? Star
                                : log.type === 'schedule_change' ? Calendar
                                : log.type === 'attendance_cancel' || log.type === 'schedule_cancel' ? X
                                  : CheckCircle;
                      return (
                        <div
                          key={log.id}
                          className="bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 transition flex items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs mt-0.5 ${meta.iconWrap}`}>
                              <Icon size={16} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black text-slate-900 font-mono">
                                  {log.time ? `${log.time} — ${log.date}` : log.date}
                                </span>
                                <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md border ${meta.badge}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 font-medium mt-1 leading-snug">
                                {log.note}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex flex-col items-end gap-1 min-w-[7.5rem]">
                            {log.actedAtLabel ? (
                              <span
                                className="text-[10px] sm:text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap"
                                title="Thời điểm thao tác"
                              >
                                {log.actedAtLabel}
                              </span>
                            ) : null}
                            {(log.type === 'quiz' && log.rawScore != null) ? (
                              <div className="bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs inline-flex items-baseline gap-0.5">
                                <span className={`text-sm font-black tabular-nums ${
                                  log.rawScore >= 70 ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                  {log.rawScore}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">%</span>
                              </div>
                            ) : log.grade != null && Number(log.grade) >= 0 ? (
                              <div className="bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs inline-flex items-baseline gap-0.5">
                                <span className={`text-sm font-black tabular-nums ${
                                  log.grade >= 8 ? 'text-emerald-600' : log.grade >= 6.5 ? 'text-blue-600' : log.grade >= 5 ? 'text-amber-600' : 'text-rose-600'
                                }`}>
                                  {log.grade}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">/10</span>
                              </div>
                            ) : !log.actedAtLabel ? (
                              <span className="text-xs text-slate-400 font-bold italic">--</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-2">
                      <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                        <History size={20} />
                      </div>
                      <p className="font-bold text-slate-600">Chưa có nhật ký hoạt động nào</p>
                      <p className="text-[11px] text-slate-400">
                        Điểm danh, hủy điểm danh (buổi mấy), hủy ca, nộp bài, chấm điểm, thi trắc nghiệm và đánh giá sẽ hiện tại đây.
                      </p>
                    </div>
                  )}
                </div>
              </div>
           )}
        </div>
        
        {showQuizCreate && (
          <TeacherQuizManager
            myStudents={quizStudents}
            createOnly
            autoOpenCreate
            presetStudentId={studentId}
            presetCourseName={student.course || ''}
            onCreateClose={() => setShowQuizCreate(false)}
          />
        )}

        {/* Makeup modal — phải có trong isDetailed (tab Học viên) */}
        {showMakeupModal && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300"
            role="presentation"
            onClick={() => !sendingMakeup && setShowMakeupModal(false)}
          >
            <div
              className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh bù</h3>
                  <p className="text-amber-50 text-xs font-bold mt-1">Quá hạn cửa sổ điểm danh 1 giờ</p>
                </div>
                <button
                  type="button"
                  onClick={() => !sendingMakeup && setShowMakeupModal(false)}
                  className="hover:bg-white/10 p-2 rounded-2xl transition-all shrink-0"
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 text-sm">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Thông tin buổi học</p>
                  <p className="font-bold text-slate-800">HV: {makeupSummary.name}</p>
                  {makeupSummary.course ? (
                    <p className="text-slate-600">Khóa: <span className="font-semibold text-blue-700">{makeupSummary.course}</span></p>
                  ) : null}
                  {makeupSummary.total > 0 ? (
                    <p className="text-slate-600">Buổi: <span className="font-black">{makeupSummary.sessionNo}/{makeupSummary.total}</span></p>
                  ) : null}
                  <p className="text-slate-600">Lịch: <span className="font-semibold">{makeupSummary.dateLabel}</span></p>
                  <p className="text-slate-600">Giờ: <span className="font-semibold">{makeupSummary.timeRange}</span></p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-slate-700 leading-relaxed">
                  <p className="font-bold text-slate-900">Giảng viên lưu ý:</p>
                  <p>Bạn chịu trách nhiệm về buổi học này.</p>
                  <p>Admin sẽ liên hệ học viên để xác nhận học viên đã học buổi này chưa. Chỉ khi học viên đồng ý đã học, buổi này mới được tính cho giảng viên.</p>
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMakeupModal(false)}
                  disabled={sendingMakeup}
                  className="flex-1 py-3.5 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={sendMakeupRequestToAdmin}
                  disabled={sendingMakeup}
                  className="flex-[1.4] py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-black shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingMakeup ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  Gửi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attendance Modal - Added to Detailed View */}
        {showAttendanceModal && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300"
            role="presentation"
            onClick={() => setShowAttendanceModal(false)}
          >
            <div
              className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <CheckCircle size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh & Chấm điểm</h3>
                    <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest">{student.course}</p>
                  </div>
                </div>
                <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-white/10 p-2 rounded-2xl transition-all">
                  <X size={20} />
                </button>
              </div>
              <div className="p-10 space-y-6">
                <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
                  <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Học viên</p>
                  <p className="text-lg font-black text-emerald-600">{getDisplayName(student)}</p>
                  <p className="text-xs font-bold text-emerald-400 mt-2">Tiến độ hiện tại: {done}/{sessionTotal} buổi</p>
                </div>
                
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">Đánh giá buổi học (0-10)</label>
                  <AttendanceGradeInput
                    value={attForm.grade}
                    onChange={(e) => setAttForm({ ...attForm, grade: e.target.value })}
                    onNudge={nudgeAttGrade}
                  />
                </div>

                <div>
                   <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">Ghi chú nhanh</label>
                   <textarea 
                     value={attForm.note}
                     onChange={(e) => setAttForm({ ...attForm, note: e.target.value })}
                     placeholder="Ví dụ: Học tốt, nộp bài đầy đủ..."
                     className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none transition-all resize-none"
                     rows={3}
                   />
                </div>

                <div className="flex flex-col-reverse min-[380px]:flex-row gap-2 sm:gap-4 pt-4 min-w-0">
                  <button 
                    type="button"
                    onClick={() => setShowAttendanceModal(false)}
                    className="flex-1 min-h-11 py-3 sm:py-4 text-slate-400 font-black text-xs uppercase tracking-widest bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all whitespace-nowrap"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button"
                    onClick={beginAttendanceConfirm}
                    className="flex-[2] min-h-11 py-3 sm:py-4 px-2 text-white font-black text-xs uppercase tracking-widest bg-gradient-to-r from-emerald-600 to-green-500 rounded-2xl shadow-lg shadow-green-100 hover:shadow-green-200 transition-all active:scale-95 text-center leading-tight"
                  >
                    Xác nhận Điểm danh
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showQuickSchedule && !isDroppedOut && (
          <TeacherStudentWeekSlotSheet
            student={student}
            enrollments={[student]}
            teacherId={currentUser?.id || currentUser?._id}
            schedules={allSchedules}
            addSchedule={addSchedule}
            updateSchedule={updateSchedule}
            cancelSchedule={cancelSchedule}
            onClose={() => setShowQuickSchedule(false)}
          />
        )}
      </div>
    );
  }

  // STANDARD COMPACT VIEW (For Dashboard/List)
  return (
    <React.Fragment>
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${isDroppedOut ? 'opacity-70' : ''}`}>
      {isDroppedOut && (
        <div className="bg-slate-600 text-white text-center text-[10px] font-bold uppercase tracking-wide px-3 py-1.5">
          Thôi học — chỉ xem
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shrink-0 bg-white">
              <img src={resolveAvatarUrl({ avatar: student.avatarUrl || student.avatar || student.photo, role: 'student', gender: student.gender })} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-lg tracking-wide truncate">{getDisplayName(student)}</p>
              <p className="text-slate-300 text-xs mt-0.5 flex flex-wrap items-center gap-2">
                {student.course} · {student.age} tuổi
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs cms-min-text-xs font-black tracking-wider uppercase ${
                  isStudentOnline ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-slate-300'
                }`}>
                  {isStudentOnline ? 'Đang online' : 'Offline'}
                </span>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs cms-min-text-xs font-semibold tracking-wider uppercase bg-white/10 text-slate-400">
                  {student.learningMode === 'ONLINE' ? 'Học online' : 'Học tại trung tâm'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full min-[440px]:w-auto min-[440px]:justify-end">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-blue-400'
            }`}>{isDroppedOut ? 'Thôi học' : isCompleted ? '✓ Hoàn thành' : student.status}</span>
            <a href={`https://zalo.me/${student.zalo}`} target="_blank" rel="noreferrer"
              className="inline-flex flex-1 min-[440px]:flex-initial justify-center items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all min-w-0 max-w-full">
              <MessageSquare size={14} className="shrink-0" /> <span className="truncate">{maskPhone(student.zalo)}</span>
            </a>
            {onLockExam && (
              <FailExamButton student={student} onLockExam={onLockExam} compact />
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1.5 text-xs">
            <span className="text-slate-400">Tiến độ khóa học</span>
            <span className="text-white font-bold">{done}/{sessionTotal} buổi ({progressPct}%)</span>
          </div>
          <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${
              progressPct >= 70 ? 'bg-green-400' : progressPct >= 40 ? 'bg-yellow-400' : 'bg-blue-400'
            }`} style={{ width: `${progressPct}%` }} />
          </div>
          {priorCredit > 0 ? (
            <p className="text-[10px] text-slate-400 mt-1.5">
              Trên lịch: {onCalendarDone} · Ghi nhận trước: {priorCredit}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 min-w-0 overflow-hidden">
        {panels.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (isDroppedOut && (key === 'quiz' || key === 'schedule' || key === 'assignments' || key === 'link')) {
                toast.info('Học viên đã thôi học — không thao tác được.');
                return;
              }
              if (key === 'quiz') {
                openQuizCreate();
                return;
              }
              if (key === 'schedule') {
                setShowQuickSchedule(true);
                return;
              }
              setActivePanel(key);
            }}
            title={label}
            aria-label={label}
            className={`flex-1 min-w-0 min-h-11 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-0.5 py-2 sm:py-3.5 text-[10px] sm:text-sm font-semibold transition-all ${
              activePanel === key ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} className="shrink-0" aria-hidden="true" />
            <span className="hidden min-[400px]:inline truncate max-w-full leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Panel Content (Standard View) */}
      <div className="p-6">
        {activePanel === 'progress' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100">
                <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide mb-1">Đã học</p>
                <p className="text-3xl font-black text-blue-700">{done}</p>
                <p className="text-xs text-blue-400">buổi</p>
              </div>
              <div className={`rounded-2xl p-4 text-center border ${isCompleted ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${isCompleted ? 'text-green-500' : 'text-orange-500'}`}>Còn lại</p>
                <p className={`text-3xl font-black ${isCompleted ? 'text-green-700' : 'text-orange-700'}`}>{remainingSessions}</p>
                <p className={`text-xs ${isCompleted ? 'text-green-400' : 'text-orange-400'}`}>buổi</p>
              </div>
              <div className="bg-purple-50 rounded-2xl p-4 text-center border border-purple-100">
                <p className="text-xs text-purple-500 font-semibold uppercase tracking-wide mb-1">Điểm TB</p>
                <p className="text-3xl font-black text-purple-700">{student.lastGrade}</p>
                <p className="text-xs text-purple-400">/ 10</p>
              </div>
            </div>
            {priorCredit > 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 leading-snug">
                Đã học gồm <span className="font-semibold text-slate-700">{onCalendarDone} buổi trên lịch</span>
                {' + '}
                <span className="font-semibold text-slate-700">{priorCredit} buổi ghi nhận trước</span>
                {' '}(Admin / chuyển khóa).
              </p>
            ) : null}
            {/* === 2-COLUMN LAYOUT: Điểm danh | Hủy ca / Hủy điểm danh === */}
            {showSessionActionRow ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={openAttendanceModal} 
                  disabled={leftAttendanceDisabled}
                  title={
                    isCompleted ? 'Hoàn thành' :
                    makeupPending ? 'Đã gửi yêu cầu — chờ Admin xét duyệt điểm danh bù' :
                    isOverdueMakeup ? 'Quá hạn — gửi yêu cầu điểm danh bù tới Admin' :
                    isCommittingAttendance ? 'Đang ghi nhận điểm danh lên hệ thống' :
                    isPendingConfirm ? `Đang chờ xác nhận — còn ${confirmRemainSec}s để hủy` :
                    attendanceDisputed ? 'Học viên không đồng ý — đang giải quyết (chờ Admin)' :
                    awaitingStudentConfirm ? 'Đã gửi điểm danh — đang chờ học viên xác nhận' :
                    alreadyAttendedToday ? `Đã điểm danh. Mở khóa sau ${cooldownHours} tiếng.` :
                    waitingAttendanceUnlock ? (liveAttendance?.reason || 'Điểm danh sau 15 phút kể từ giờ bắt đầu buổi học') :
                    'Bấm để điểm danh'
                  }
                  className={`py-4 rounded-2xl font-black text-sm uppercase tracking-tight flex items-center justify-center gap-2 transition-all shadow-md ${
                    isCompleted 
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-2 border-gray-300'
                    : makeupPending
                      ? 'bg-slate-50 text-slate-400 cursor-not-allowed pointer-events-none select-none border-2 border-slate-200 opacity-60'
                    : isOverdueMakeup
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:shadow-amber-200 shadow-amber-100 active:scale-[0.97] border-2 border-transparent'
                    : attendanceDisputed
                      ? 'bg-amber-100 text-amber-800 cursor-not-allowed pointer-events-none select-none border-2 border-amber-200'
                    : awaitingStudentConfirm
                      ? 'bg-blue-100 text-blue-800 cursor-not-allowed pointer-events-none select-none border-2 border-blue-200'
                    : leftAttendanceLocked
                      ? 'bg-slate-50 text-slate-400 cursor-not-allowed pointer-events-none select-none border-2 border-slate-200 opacity-60'
                    : waitingAttendanceUnlock
                      ? 'bg-slate-100 text-slate-600 cursor-not-allowed opacity-60 border-2 border-slate-200'
                      : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white hover:shadow-green-200 shadow-green-100 active:scale-[0.97] border-2 border-transparent'
                  }`}>
                  <CheckCircle size={18} />
                  <span className="text-xs text-center leading-tight">
                    {isCompleted 
                      ? 'HOÀN THÀNH'
                      : makeupPending
                        ? <>ĐANG<br/>XÉT DUYỆT</>
                      : isOverdueMakeup
                        ? <>ĐIỂM DANH<br/>BÙ</>
                        : isCommittingAttendance
                          ? <>ĐANG<br/>GHI NHẬN</>
                        : isPendingConfirm
                          ? <>ĐANG<br/>XÁC NHẬN</>
                          : attendanceDisputed
                            ? <>ĐANG<br/>GIẢI QUYẾT</>
                          : awaitingStudentConfirm
                            ? <>CHỜ HV<br/>XÁC NHẬN</>
                          : alreadyAttendedToday
                            ? (cooldownHours > 0 ? `CHỜ ${cooldownHours}H` : 'ĐÃ ĐIỂM DANH')
                            : 'ĐIỂM DANH'}
                  </span>
                </button>

              <button
                type="button"
                onClick={() => { if (canCancelSession) handleCancelSession(); }}
                disabled={!canCancelSession}
                aria-disabled={!canCancelSession}
                title={cancelButtonTitle}
                className={`py-4 rounded-2xl font-black text-sm uppercase tracking-tight flex items-center justify-center gap-2 transition-all border-2 ${
                  canCancelSession ? cancelButtonClassActive : cancelButtonClassDisabled
                }`}
              >
                <X size={18} />
                <span className="text-xs text-center leading-tight">
                  {isCommittingAttendance
                    ? <>ĐANG<br/>GHI NHẬN</>
                    : cancelIsUndoAttendance
                      ? <>HỦY ĐIỂM DANH{confirmRemainSec > 0 ? <><br/>{confirmRemainSec}s</> : null}</>
                      : alreadyAttendedToday
                        ? <>ĐÃ KHÓA</>
                        : <>HỦY CA</>}
                </span>
              </button>
            </div>
            ) : null}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2 font-black uppercase text-xs text-gray-400 tracking-widest">📝 Ghi chú học viên</label>
              <textarea value={notesInput} onChange={e => setNotesInput(e.target.value)}
                onBlur={() => {
                  if (isDroppedOut) return;
                  onUpdateNotes(student._id || student.id, notesInput);
                }}
                readOnly={isDroppedOut}
                rows={3}
                placeholder="Nhận xét, ghi chú về học viên..."
                className={`w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:border-blue-400 outline-none ${isDroppedOut ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`} />
            </div>
          </div>
        )}

        {activePanel === 'link' && (
          <div className="space-y-5">
            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100">
               <div className="flex items-center gap-2 mb-3">
                 <Video size={18} className="text-blue-600" />
                 <h3 className="font-bold text-blue-800 text-sm">Link học trực tuyến</h3>
               </div>
               <p className="text-xs text-blue-500 mb-4 font-bold uppercase">Cập nhật link buổi học mới tại đây</p>
               <div className="flex gap-2">
                 <input type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                   className="flex-1 border-2 border-blue-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none"
                   placeholder="Dán link họp..." />
                 <button onClick={handleLinkSave}
                   className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${linkSaved ? 'bg-green-500 text-white' : 'bg-slate-800 text-white'}`}>
                   Lưu
                 </button>
               </div>
            </div>
          </div>
        )}

        {activePanel === 'grade' && (
          <div className="space-y-5">
             <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-1">Điểm trung bình</p>
                  <h4 className="text-3xl font-black text-orange-700">{student.lastGrade || 0}</h4>
                </div>
                <button onClick={() => setActivePanel('grade')} className="bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Cập nhật điểm</button>
             </div>
          </div>
        )}
      </div>
    </div>

      {/* === MODAL ĐIỂM DANH BÙ → gửi thẳng Admin === */}
      {showMakeupModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300"
          role="presentation"
          onClick={() => !sendingMakeup && setShowMakeupModal(false)}
        >
          <div
            className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white flex justify-between items-start gap-3">
              <div>
                <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh bù</h3>
                <p className="text-amber-50 text-xs font-bold mt-1">Quá hạn cửa sổ điểm danh 1 giờ</p>
              </div>
              <button
                type="button"
                onClick={() => !sendingMakeup && setShowMakeupModal(false)}
                className="hover:bg-white/10 p-2 rounded-2xl transition-all shrink-0"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Thông tin buổi học</p>
                <p className="font-bold text-slate-800">HV: {makeupSummary.name}</p>
                {makeupSummary.course ? (
                  <p className="text-slate-600">Khóa: <span className="font-semibold text-blue-700">{makeupSummary.course}</span></p>
                ) : null}
                {makeupSummary.total > 0 ? (
                  <p className="text-slate-600">Buổi: <span className="font-black">{makeupSummary.sessionNo}/{makeupSummary.total}</span></p>
                ) : null}
                <p className="text-slate-600">Lịch: <span className="font-semibold">{makeupSummary.dateLabel}</span></p>
                <p className="text-slate-600">Giờ: <span className="font-semibold">{makeupSummary.timeRange}</span></p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-slate-700 leading-relaxed">
                <p className="font-bold text-slate-900">Giảng viên lưu ý:</p>
                <p>Bạn chịu trách nhiệm về buổi học này.</p>
                <p>Admin sẽ liên hệ học viên để xác nhận học viên đã học buổi này chưa. Chỉ khi học viên đồng ý đã học, buổi này mới được tính cho giảng viên.</p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowMakeupModal(false)}
                disabled={sendingMakeup}
                className="flex-1 py-3.5 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={sendMakeupRequestToAdmin}
                disabled={sendingMakeup}
                className="flex-[1.4] py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-black shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingMakeup ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Gửi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === DUY NHẤT 1 MODAL ĐIỂM DANH (dùng chung cho cả 2 view) === */}
      {showAttendanceModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-300"
          role="presentation"
          onClick={() => setShowAttendanceModal(false)}
        >
          <div
            className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >            <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tight">Điểm danh &amp; Chấm điểm</h3>
                  <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest">{student.course}</p>
                </div>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-white/10 p-2 rounded-2xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-10 space-y-6">
              <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
                <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Học viên</p>
                <p className="text-lg font-black text-emerald-600">{getDisplayName(student)}</p>
                <p className="text-xs font-bold text-emerald-400 mt-2">Tiến độ hiện tại: {done}/{sessionTotal} buổi</p>
              </div>
              
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">Đánh giá buổi học (0-10)</label>
                <AttendanceGradeInput
                  value={attForm.grade}
                  onChange={(e) => setAttForm({ ...attForm, grade: e.target.value })}
                  onNudge={nudgeAttGrade}
                />
              </div>

              <div>
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">Ghi chú nhanh</label>
                 <textarea 
                   value={attForm.note}
                   onChange={(e) => setAttForm({ ...attForm, note: e.target.value })}
                   placeholder="Ví dụ: Học tốt, nộp bài đầy đủ..."
                   className="w-full bg-slate-50 border-2 border-slate-100 focus:border-emerald-500 focus:bg-white rounded-2xl px-6 py-4 text-sm font-semibold text-slate-700 outline-none transition-all resize-none h-24"
                 />
              </div>

            </div>

            <div className="bg-slate-50 px-8 py-6 flex gap-4 flex-shrink-0">
              <button 
                type="button"
                onClick={() => setShowAttendanceModal(false)}
                className="flex-[1] py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                onClick={beginAttendanceConfirm}
                className="flex-[2] py-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                Xác nhận Điểm danh
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickSchedule && !isDroppedOut && (
        <TeacherStudentWeekSlotSheet
          student={student}
          enrollments={[student]}
          teacherId={currentUser?.id || currentUser?._id}
          schedules={allSchedules}
          addSchedule={addSchedule}
          updateSchedule={updateSchedule}
          cancelSchedule={cancelSchedule}
          onClose={() => setShowQuickSchedule(false)}
        />
      )}
    </React.Fragment>
  );
};

export default StudentCard;
