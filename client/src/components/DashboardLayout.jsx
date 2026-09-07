import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import BranchFilterDropdown from './BranchFilterDropdown';
import FloatingMessenger from './FloatingMessenger';
import { FloatingMessengerProvider } from '../context/FloatingMessengerContext';
import { useData } from '../context/DataContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../utils/toast';
import api, { setTokens, csrfFetch } from '../services/api';
import { 
  Bell, LogOut, CheckCircle2, Clock, X, Lock,
  Calendar, DollarSign, UserPlus, Zap, BookOpen, Award, Menu, Star,
} from 'lucide-react';

import { formatNotificationStudentMask } from '../utils/studentMask';
import { getMessagingRole } from '../lib/messagingRoles';
import StudentQuizInviteHost from './student/StudentQuizInviteHost';
import StudentAttendanceConfirmModal from './student/StudentAttendanceConfirmModal';
import StudentAssignedTeacherModal from './student/StudentAssignedTeacherModal';
import AdminAttendanceDisputeModal from './admin/shared/AdminAttendanceDisputeModal';
import WelcomeCelebrationOverlay from './WelcomeCelebrationOverlay';
import LoginInboxAlertPopup from './LoginInboxAlertPopup';
import { useAttendanceConfirmFlush } from '../utils/attendanceConfirmStore';
import { useAttendanceRealtimeSync } from '../hooks/useAttendanceRealtimeSync';
import TeacherRatingDetailModal, {
  getEvaluationIdFromNotif,
  isTeacherRatingNotif,
} from './teacher/TeacherRatingDetailModal';
import TeacherAttendanceConfirmedModal from './teacher/TeacherAttendanceConfirmedModal';
import TeacherStudentNoteModal, {
  isStudentScheduleNoteNotif,
} from './teacher/TeacherStudentNoteModal';
import { PENDING_TEACHER_QUIZ_DETAIL_KEY } from './teacher/TeacherQuizResultOverlay';
import { RATING_CRITERIA } from '../context/useDataRatings';
import NavArrow from './ui/NavArrow';
import { setLoginOverlay } from '../utils/loginOverlayGate';

const PAGE_TITLES = {
  dashboard: 'Tổng quan',
  students: 'Học viên',
  teachers: 'Giảng viên',
  evaluations: 'Đánh giá',
  finance: 'Tài chính',
  training: 'Đào tạo GV',
  'student-training': 'Đào tạo HV',
  'cert-prep': 'Ôn thi MOS/IC3',
  staff: 'Phân quyền',
  hr: 'Nhân sự',
  analytics: 'Doanh thu',
  settings: 'Cài đặt',
  logs: 'Nhật ký',
  schedule: 'Lịch học',
  materials: 'Tài liệu',
  evaluation: 'Đánh giá',
  profile: 'Hồ sơ',
};

function isTeacherAttendanceConfirmedNotif(n) {
  if (String(n?.payload?.kind || '') === 'attendance_confirmed') return true;
  return String(n?.title || '').includes('Học viên đã xác nhận điểm danh');
}

function isTeacherAttendanceRejectedNotif(n) {
  const kind = String(n?.payload?.kind || '');
  if (kind === 'attendance_rejected' || kind === 'admin_makeup_rejected') return true;
  const title = String(n?.title || '');
  return title.includes('Buổi học không được tính')
    || title.includes('Buổi điểm danh bù không được tính');
}

function attendancePayloadMissingTeacherOrCa(payload) {
  const name = String(payload?.teacherName || '').trim();
  const hasName = name && name !== 'Giảng viên';
  const hasCa = Boolean(String(payload?.timeRange || '').trim() || payload?.startTime);
  return !hasName || !hasCa;
}

function formatScheduleForConfirmModal(sch) {
  const d = sch?.date ? new Date(sch.date) : null;
  const ok = d && !Number.isNaN(d.getTime());
  const start = sch?.startTime || '';
  const end = sch?.endTime || '';
  return {
    scheduleId: String(sch?._id || sch?.id || ''),
    teacherName: sch?.teacherName || sch?.teacherId?.name || '',
    weekday: ok ? d.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    dateLabel: ok ? d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    startTime: start,
    endTime: end,
    timeRange: end ? `${start} - ${end}` : start,
    sessionNumber: sch?.sessionOrdinalPreview || null,
    totalSessions: sch?.sessionTotalPreview || null,
    course: sch?.course || '',
  };
}

function matchScheduleForAttendanceNotif(list, base) {
  const arr = Array.isArray(list) ? list : [];
  const sid = String(base?.scheduleId || '').trim();
  if (sid) {
    const hit = arr.find((s) => String(s._id || s.id) === sid);
    if (hit) return hit;
  }
  const course = String(base?.course || '').trim().toLowerCase();
  const completed = arr.filter((s) => String(s.status) === 'completed');
  const byCourse = course
    ? completed.filter((s) => String(s.course || '').trim().toLowerCase() === course)
    : completed;
  const pool = byCourse.length ? byCourse : completed;
  if (!pool.length) return null;

  const sessionNo = Number(base?.sessionNumber || base?.completedSessions);
  const sorted = [...pool].sort((a, b) => {
    const da = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (da !== 0) return da;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
  if (Number.isFinite(sessionNo) && sessionNo > 0) {
    const byOrdinal = pool.find((s) => Number(s.sessionOrdinalPreview) === sessionNo);
    if (byOrdinal) return byOrdinal;
    if (sorted[sessionNo - 1]) return sorted[sessionNo - 1];
  }
  return sorted[sorted.length - 1] || null;
}

async function enrichAttendancePayloadFromSchedules(base, studentId) {
  if (!attendancePayloadMissingTeacherOrCa(base) || !studentId) return base;
  try {
    const res = await api.schedules.getByStudent(studentId);
    const sch = matchScheduleForAttendanceNotif(res?.data, base);
    if (!sch) return base;
    const extra = formatScheduleForConfirmModal(sch);
    return {
      ...base,
      ...extra,
      sessionNumber: base.sessionNumber || base.completedSessions || extra.sessionNumber,
      totalSessions: base.totalSessions || base.totalRequired || extra.totalSessions,
      course: base.course || extra.course,
      teacherName: extra.teacherName || base.teacherName,
    };
  } catch {
    return base;
  }
}

function resolvePageTitle(role, pathname, hash) {
  const key = (hash || '').replace('#', '');
  if (key && PAGE_TITLES[key]) return PAGE_TITLES[key];
  if (pathname.includes('/inbox')) return 'Hộp thư';
  if (pathname.includes('/feed')) return 'Bảng tin';
  if (pathname.includes('/news')) return 'Tin tức';
  if (pathname.includes('/notifications')) return 'Thông báo';
  if (pathname.includes('/bi')) return 'BI Dashboard';
  if (pathname.includes('/files')) return 'Quản lý file';
  if (pathname.includes('/backups')) return 'Sao lưu';
  if (pathname.includes('/monitoring')) return 'Monitoring';
  if (pathname.includes('/ai')) return 'AI Center';
  if (pathname.includes('/workflows')) return 'Workflow';
  if (pathname.includes('/builder')) return 'Form & Report';
  if (pathname.includes('/tenants')) return 'Multi-tenant';
  if (pathname.includes('/exam')) return 'Phòng thi';
  if (pathname.includes('/cert-prep')) return 'Ôn thi MOS/IC3';
  if (pathname.includes('/test')) return 'Bài test';
  if (pathname.includes('/finance')) return 'Tài chính';
  if (role === 'admin') return 'Quản trị';
  if (role === 'teacher') return 'Giảng dạy';
  return 'Học tập';
}

const getNotifStyle = (type) => {
  switch (String(type || '').toUpperCase()) {
    case 'FINANCE':
      return { icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', label: 'Tài chính' };
    case 'STUDENT':
    case 'COURSE':
      return { icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', label: 'Khóa học' };
    case 'SCHEDULE':
      return { icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', label: 'Lịch dạy' };
    case 'EXAM':
      return { icon: Award, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', label: 'Thi' };
    case 'EVALUATION':
    case 'GRADE':
      return { icon: Star, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', label: 'Đánh giá' };
    case 'ADMIN':
      return { icon: Zap, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', label: 'Admin' };
    case 'SYSTEM':
      return { icon: Zap, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', label: 'Hệ thống' };
    case 'NEWS':
      return { icon: Bell, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', label: 'Tin tức' };
    case 'TRAINING':
      return { icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', label: 'Đào tạo' };
    default:
      return { icon: Bell, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-100', label: 'Thông báo' };
  }
};

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date); 
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 0) return 'Vừa xong';
  if (diffMs < 60000) return 'Vừa xong';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} phút trước`;
  if (diffMs < 86400000) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const getGreetingTime = () => {
  const currentHour = new Date().getHours();
  if (currentHour < 11) return 'buổi sáng';
  if (currentHour < 14) return 'buổi trưa';
  if (currentHour < 18) return 'buổi chiều';
  return 'buổi tối';
};

const DashboardLayout = ({ role, session, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ratingDetail, setRatingDetail] = useState(null);
  const [ratingDetailLoading, setRatingDetailLoading] = useState(false);
  const [ratingDetailError, setRatingDetailError] = useState('');
  const [adminQuickPopup, setAdminQuickPopup] = useState(null);
  const { socket } = useSocket() || {};
  const { students, teachers, schedules, isRefetching, triggerBackgroundSync, notifications: allNotifications, markNotificationRead, getConversations } = useData();
  const API = import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || "");
  const myId = String(session?.id || session?._id || '');
  useAttendanceConfirmFlush({
    enabled: role === 'teacher',
    teacherId: myId,
  });
  useAttendanceRealtimeSync({
    enabled: role === 'teacher' || role === 'admin' || role === 'staff' || role === 'student',
    myId,
    role,
  });

  const openTeacherRatingDetail = async (notifOrIds = {}) => {
    const evaluationId = notifOrIds.evaluationId
      || getEvaluationIdFromNotif(notifOrIds)
      || null;
    const studentId = notifOrIds.studentId || notifOrIds.payload?.studentId || null;
    const teacherId = myId;
    if (!teacherId) return;

    setRatingDetailLoading(true);
    setRatingDetailError('');
    setRatingDetail(null);
    try {
      const res = await api.evaluations.getByTeacher(teacherId);
      const list = (res?.success && Array.isArray(res.data)) ? res.data : [];
      const found = list.find((e) => String(e.id || e._id) === String(evaluationId))
        || list.find((e) => studentId && String(e.studentId) === String(studentId))
        || (list.length === 1 ? list[0] : null);
      if (!found) {
        setRatingDetailError('Không tìm thấy nội dung đánh giá.');
      } else {
        setRatingDetail(found);
      }
    } catch {
      setRatingDetailError('Không tải được đánh giá. Thử lại sau.');
    } finally {
      setRatingDetailLoading(false);
    }
  };

  useEffect(() => {
    const onOpen = (e) => {
      openTeacherRatingDetail(e.detail || {});
    };
    window.addEventListener('open-teacher-rating', onOpen);
    return () => window.removeEventListener('open-teacher-rating', onOpen);
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link ?evaluationId= từ thông báo
  useEffect(() => {
    if (role !== 'teacher' || !myId) return;
    try {
      const params = new URLSearchParams(location.search || '');
      const evaluationId = params.get('evaluationId');
      if (!evaluationId) return;
      openTeacherRatingDetail({ evaluationId });
      params.delete('evaluationId');
      const next = params.toString();
      navigate({ pathname: location.pathname, search: next ? `?${next}` : '', hash: location.hash }, { replace: true });
    } catch { /* ignore */ }
  }, [role, myId, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.add('cms-app-shell');
    document.body.classList.add('cms-app-shell');
    return () => {
      document.documentElement.classList.remove('cms-app-shell');
      document.body.classList.remove('cms-app-shell');
    };
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const onBlog = (payload) => {
      if (payload?.targetAudience) {
        if (role === 'teacher' && payload.targetAudience === 'student') return;
        if (role === 'student' && payload.targetAudience === 'teacher') return;
      }
      const title = payload?.title ? `Có bài viết mới: '${payload.title}'` : 'Có bài viết mới';
      toast.info(title);
    };
    socket.on('blog:published', onBlog);
    return () => socket.off('blog:published', onBlog);
  }, [socket, toast, role]);

  useEffect(() => {
    const key = `${role}_user`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (stored && !stored.token && session?.sbd) {
        if (stored.refreshToken) {
          csrfFetch(`${API}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          }).then(r => r.json()).then(res => {
            if (res.success && res.accessToken) {
              const nextRefresh = res.refreshToken || stored.refreshToken;
              localStorage.setItem(key, JSON.stringify({ ...stored, token: res.accessToken, accessToken: res.accessToken, refreshToken: nextRefresh }));
              setTokens(res.accessToken, nextRefresh, role);
            }
          }).catch(() => {});
        }
      }
    } catch {}
  }, []);

  const sessionTeacherId = session?.id || session?._id;

  const currentTeacher = role === 'teacher' && sessionTeacherId
    ? teachers.find(t => String(t.id) === String(sessionTeacherId))
    : null;

  // ⭐ Fix: Chuyển sang logic "Pessimistic" (Mặc định là Pending trừ khi có bằng chứng là Active)
  // Việc này giúp tránh bị "Flash" mở khóa menu khi login (do data chưa load kịp)
  const isTeacherPending = (role === 'teacher' && sessionTeacherId) ? (
     String(session?.status || '').toLowerCase() !== 'active' && 
     (!currentTeacher || String(currentTeacher.status || '').toLowerCase() !== 'active')
  ) : false;

  const isTeacherActive = (role === 'teacher' && sessionTeacherId) ? (
     String(session?.status || '').toLowerCase() === 'active' || 
     (currentTeacher && String(currentTeacher.status || '').toLowerCase() === 'active')
  ) : false;

  useEffect(() => {
    if (role !== 'teacher' || !sessionTeacherId) return;
    if (window.location.pathname.includes('/teacher/test')) return;
    
    // Nếu hệ thống đang tải hoặc currentTeacher chưa có nhưng session lại nói là active/pending thì CHỜ.
    const isLocalStatusValid = ['pending', 'active', 'locked'].includes(String(session?.status).toLowerCase());
    if (isRefetching || (!currentTeacher && isLocalStatusValid)) return;
    
    const currentStatus = currentTeacher?.status || session?.status;
    if (currentStatus === undefined || currentStatus === '') return;
    
    const allowed = ['pending', 'active'];
    const s = String(currentStatus).toLowerCase();
    
    // Khóa / chờ chấm: chuyển sang trang test thay vì đá ra login
    if (!allowed.includes(s)) {
      navigate('/teacher/test', { replace: true });
    }
  }, [currentTeacher, role, session, sessionTeacherId, isRefetching, navigate]);

  useEffect(() => {
    if (role !== 'teacher' || !sessionTeacherId) return;
    
    const isLocalStatusValid = String(session?.status).toLowerCase();
    if (isRefetching || (!currentTeacher && isLocalStatusValid)) return;

    const status = String(currentTeacher?.status || session?.status || '').toLowerCase();
    if (!status) return;

    const path = location.pathname || '';
    const onTest = path.includes('/teacher/test');

    // Pending / locked: chỉ được trang bài test
    if ((status === 'pending' || status === 'locked') && !onTest) {
      navigate('/teacher/test', { replace: true });
      return;
    }
    // Active: không ở trang Test
    if (status === 'active' && onTest) {
      navigate('/teacher', { replace: true });
    }
  }, [currentTeacher?.status, session?.status, role, sessionTeacherId, navigate, isRefetching, location.pathname]);

  // Admin/staff + HV lần đầu: mở đổi MK ngay. GV: đổi thủ công ở Hồ sơ/menu.
  // Giữ gate pending để QC/tin nhắn không đè trong lúc chờ mở modal.
  const [firstLoginPwDone, setFirstLoginPwDone] = useState(false);
  useEffect(() => {
    const onDone = () => setFirstLoginPwDone(true);
    window.addEventListener('cms:first-login-password-done', onDone);
    return () => window.removeEventListener('cms:first-login-password-done', onDone);
  }, []);
  useEffect(() => {
    const needFirstPw = session?.isFirstLogin === true && role !== 'teacher' && !firstLoginPwDone;
    setLoginOverlay('change-password-pending', needFirstPw);
    if (!needFirstPw) return undefined;
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-change-password-modal'));
    }, 500);
    return () => clearTimeout(timer);
  }, [session?.isFirstLogin, role, firstLoginPwDone]);

  const [showWelcomeCelebration, setShowWelcomeCelebration] = useState(false);
  const welcomeMarkedRef = React.useRef(false);
  const [courseCelebration, setCourseCelebration] = useState(null);
  const courseCelebrationTimerRef = React.useRef(null);
  const [starBonusCelebration, setStarBonusCelebration] = useState(null);
  const starBonusShownRef = React.useRef(new Set());
  const [attendanceConfirm, setAttendanceConfirm] = useState(null);
  const [attendanceConfirmBusy, setAttendanceConfirmBusy] = useState(false);
  const [attendanceDispute, setAttendanceDispute] = useState(null);
  const [attendanceDisputeBusy, setAttendanceDisputeBusy] = useState(false);
  const [teacherAttendanceConfirm, setTeacherAttendanceConfirm] = useState(null);
  const teacherRejectPopupShownRef = React.useRef(new Set());
  const [studentNotePopup, setStudentNotePopup] = useState(null);
  const studentNotePopupLive = React.useMemo(() => {
    if (!studentNotePopup) return null;
    if (studentNotePopup.deleted) return studentNotePopup;
    const sid = String(studentNotePopup.scheduleId || '');
    const sch = sid
      ? (schedules || []).find((s) => String(s._id || s.id) === sid)
      : null;
    if (!sch) return studentNotePopup;
    const liveNote = String(sch.studentNote || '').trim();
    if (!liveNote) return { ...studentNotePopup, studentNote: '', deleted: true };
    return { ...studentNotePopup, studentNote: liveNote, deleted: false };
  }, [studentNotePopup, schedules]);

  const starBonusSeenKey = React.useCallback((teacherId, month) => (
    `star_bonus_celeb_${teacherId}_${month}`
  ), []);

  const markStarBonusSeen = React.useCallback((teacherId, month) => {
    if (!teacherId || !month) return;
    const key = starBonusSeenKey(teacherId, month);
    starBonusShownRef.current.add(key);
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
  }, [starBonusSeenKey]);

  const hasSeenStarBonus = React.useCallback((teacherId, month) => {
    if (!teacherId || !month) return true;
    const key = starBonusSeenKey(teacherId, month);
    if (starBonusShownRef.current.has(key)) return true;
    try {
      if (localStorage.getItem(key) === '1') {
        starBonusShownRef.current.add(key);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, [starBonusSeenKey]);

  const teacherRejectSeenKey = React.useCallback((teacherId, scheduleId) => (
    `teacher_att_reject_seen_${teacherId}_${scheduleId}`
  ), []);

  const hasSeenTeacherReject = React.useCallback((teacherId, scheduleId) => {
    if (!teacherId || !scheduleId) return false;
    const key = teacherRejectSeenKey(teacherId, scheduleId);
    if (teacherRejectPopupShownRef.current.has(key)) return true;
    try {
      if (localStorage.getItem(key) === '1') {
        teacherRejectPopupShownRef.current.add(key);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, [teacherRejectSeenKey]);

  const markTeacherRejectSeen = React.useCallback((teacherId, scheduleId, notifId) => {
    if (teacherId && scheduleId) {
      const key = teacherRejectSeenKey(teacherId, scheduleId);
      teacherRejectPopupShownRef.current.add(key);
      try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    }
    if (notifId && typeof markNotificationRead === 'function') {
      markNotificationRead(notifId);
    }
  }, [teacherRejectSeenKey, markNotificationRead]);

  const dismissTeacherAttendanceConfirm = React.useCallback(() => {
    const p = teacherAttendanceConfirm;
    if (p?.rejected) {
      markTeacherRejectSeen(
        myId,
        String(p.scheduleId || ''),
        p.notifId || p.notificationId || '',
      );
    }
    setTeacherAttendanceConfirm(null);
  }, [teacherAttendanceConfirm, markTeacherRejectSeen, myId]);

  const queueStarBonusCelebration = React.useCallback((raw) => {
    if (!raw?.month) return;
    const teacherId = String(raw.teacherId || myId || '');
    if (teacherId && myId && teacherId !== myId) return;
    if (hasSeenStarBonus(myId || teacherId, raw.month)) return;
    setStarBonusCelebration({
      month: String(raw.month),
      monthLabel: raw.monthLabel || '',
      amount: Number(raw.amount) || 0,
      minStudents: raw.minStudents,
      minStars: raw.minStars,
      teacherId: myId || teacherId,
    });
  }, [myId, hasSeenStarBonus]);

  const queueCourseCelebration = React.useCallback((raw) => {
    if (!raw) return;
    if (courseCelebrationTimerRef.current) {
      clearTimeout(courseCelebrationTimerRef.current);
      courseCelebrationTimerRef.current = null;
    }
    const payload = {
      courseName: raw.courseName || raw.course || 'khóa học',
      enrollmentId: raw.enrollmentId || null,
      completedSessions: raw.completedSessions,
      totalRequired: raw.totalRequired,
      showAfter: raw.showAfter || null,
    };
    const afterMs = payload.showAfter ? new Date(payload.showAfter).getTime() : 0;
    const delay = Number.isFinite(afterMs) ? Math.max(0, afterMs - Date.now()) : 0;
    if (delay <= 0) {
      setCourseCelebration(payload);
      return;
    }
    courseCelebrationTimerRef.current = setTimeout(() => {
      courseCelebrationTimerRef.current = null;
      setCourseCelebration(payload);
    }, delay);
  }, []);

  useEffect(() => () => {
    if (courseCelebrationTimerRef.current) clearTimeout(courseCelebrationTimerRef.current);
  }, []);

  useEffect(() => {
    if (role !== 'student' && role !== 'teacher') return;
    if (session?.showWelcomeCelebration !== true) return;
    setShowWelcomeCelebration(true);
  }, [role, session?.showWelcomeCelebration, session?.id, session?._id]);

  useEffect(() => {
    if (role !== 'student') return;
    const pending = session?.pendingCourseCelebration;
    if (!pending?.courseName && !pending?.enrollmentId) return;
    if (showWelcomeCelebration) return;
    queueCourseCelebration(pending);
  }, [role, session?.pendingCourseCelebration, showWelcomeCelebration, session?.id, session?._id, queueCourseCelebration]);

  useEffect(() => {
    if (!socket || role !== 'student') return undefined;
    const onCourseCelebration = (payload) => {
      if (!payload) return;
      if (String(payload.studentId || '') && myId && String(payload.studentId) !== myId) return;
      queueCourseCelebration(payload);
    };
    socket.on('course:celebration', onCourseCelebration);
    return () => { socket.off('course:celebration', onCourseCelebration); };
  }, [socket, role, myId, queueCourseCelebration]);

  useEffect(() => {
    if (!socket || role !== 'teacher') return undefined;
    const onStarBonus = (payload) => {
      if (!payload) return;
      queueStarBonusCelebration(payload);
    };
    socket.on('teacher:star-bonus-celebration', onStarBonus);
    return () => { socket.off('teacher:star-bonus-celebration', onStarBonus); };
  }, [socket, role, queueStarBonusCelebration]);

  // HV: modal xác nhận điểm danh (blocking)
  useEffect(() => {
    if (role !== 'student' || !myId) return undefined;
    let cancelled = false;
    const loadPending = async () => {
      try {
        const res = await api.schedules.getPendingConfirm();
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        // Chỉ auto-mở khi còn bắt buộc xác nhận (pending). Disputed → không chặn.
        const firstPending = list.find((p) => (
          String(p?.studentConfirmStatus || '').toLowerCase() === 'pending'
        ));
        if (firstPending?.scheduleId) {
          setAttendanceConfirm({ ...firstPending, resolved: false, waiting: false });
        }
      } catch { /* ignore */ }
    };
    loadPending();

    if (!socket) return () => { cancelled = true; };
    const onAwait = (payload) => {
      if (!payload) return;
      if (payload.studentId && String(payload.studentId) !== myId) return;
      setAttendanceConfirm({ ...payload, resolved: false, waiting: false });
    };
    const onResolved = (payload, outcome) => {
      if (!payload?.scheduleId) return;
      if (payload.studentId && String(payload.studentId) !== myId) return;
      setAttendanceConfirm((prev) => {
        const same = prev && String(prev.scheduleId) === String(payload.scheduleId);
        const st = String(payload.studentConfirmStatus || '').toLowerCase();
        const isAdminResolve = outcome === 'rejected'
          || st === 'admin_approved'
          || st === 'admin_rejected';
        // HV tự Đồng ý: đã đóng modal → không mở lại «Đã giải quyết»
        if (!same && !isAdminResolve) return prev || null;
        return {
          ...payload,
          resolved: true,
          waiting: false,
          resolveOutcome: outcome === 'rejected' ? 'rejected' : 'approved',
          studentConfirmStatus: outcome === 'rejected'
            ? 'admin_rejected'
            : (payload.studentConfirmStatus || 'admin_approved'),
        };
      });
    };
    const onConfirmed = (p) => onResolved(p, 'approved');
    const onRejected = (p) => onResolved(p, 'rejected');
    const onDisputed = (payload) => {
      if (!payload?.scheduleId) return;
      if (payload.studentId && String(payload.studentId) !== myId) return;
      // Sau khi HV gửi tranh chấp: đóng modal chặn; có thể mở lại dạng chờ khi bấm thông báo
      setAttendanceConfirm((prev) => (
        prev && String(prev.scheduleId) === String(payload.scheduleId) ? null : prev
      ));
    };
    socket.on('attendance:awaiting-confirm', onAwait);
    socket.on('attendance:confirmed', onConfirmed);
    socket.on('attendance:disputed', onDisputed);
    socket.on('attendance:rejected', onRejected);
    return () => {
      cancelled = true;
      socket.off('attendance:awaiting-confirm', onAwait);
      socket.off('attendance:confirmed', onConfirmed);
      socket.off('attendance:disputed', onDisputed);
      socket.off('attendance:rejected', onRejected);
    };
  }, [socket, role, myId]);

  // GV: Admin không tính buổi → popup tự động (socket realtime, 1 lần / buổi)
  useEffect(() => {
    if (!socket || role !== 'teacher' || !myId) return undefined;
    const onRejected = (payload) => {
      if (!payload) return;
      const tid = payload.teacherId != null ? String(payload.teacherId) : '';
      if (tid && tid !== String(myId)) return;
      const scheduleId = String(payload.scheduleId || '');
      if (scheduleId && hasSeenTeacherReject(myId, scheduleId)) return;
      const matchNotif = (allNotifications || []).find((n) => (
        isTeacherAttendanceRejectedNotif(n)
        && String(n?.payload?.scheduleId || '') === scheduleId
      ));
      setTeacherAttendanceConfirm({
        ...payload,
        rejected: true,
        kind: payload.kind || 'attendance_rejected',
        studentName: payload.studentName || '',
        notifId: matchNotif ? String(matchNotif.id || matchNotif._id || '') : '',
      });
    };
    socket.on('attendance:rejected', onRejected);
    return () => { socket.off('attendance:rejected', onRejected); };
  }, [socket, role, myId, hasSeenTeacherReject, allNotifications]);

  // Admin: tranh chấp → chỉ toast + badge chuông (không auto-mở modal, tránh chen thao tác)
  useEffect(() => {
    if (!socket || (role !== 'admin' && role !== 'staff')) return undefined;
    const onDispute = (payload) => {
      if (!payload?.scheduleId) return;
      toast.info(
        `Tranh chấp điểm danh: ${payload.studentName || 'HV'} — buổi ${payload.sessionNumber || '?'}. Bấm chuông để xử lý.`,
      );
    };
    socket.on('attendance:disputed', onDispute);
    return () => { socket.off('attendance:disputed', onDispute); };
  }, [socket, role, toast]);

  const handleStudentAttendanceDecision = React.useCallback(async (decision) => {
    const sid = attendanceConfirm?.scheduleId;
    if (!sid) return;
    setAttendanceConfirmBusy(true);
    try {
      const res = await api.schedules.studentConfirm(sid, decision);
      if (!res?.success) {
        toast.error(res?.message || 'Không gửi được xác nhận');
        return;
      }
      setAttendanceConfirm(null);
      if (res.disputed) {
        toast.info('Đã gửi tranh chấp — chờ Admin giải quyết. Buổi chưa được tính.');
      } else {
        toast.success('Đã xác nhận điểm danh — buổi học được tính.');
      }
      if (typeof triggerBackgroundSync === 'function') {
        Promise.resolve(triggerBackgroundSync({ force: true })).catch(() => {});
      }
    } catch (e) {
      toast.error(e?.message || 'Lỗi kết nối');
    } finally {
      setAttendanceConfirmBusy(false);
    }
  }, [attendanceConfirm, toast, triggerBackgroundSync]);

  /** Mở modal HV từ thông báo: luôn check trạng thái thật (tránh mở Đồng ý khi đã xong). */
  const openStudentAttendanceFromNotif = React.useCallback(async (rawPayload, opts = {}) => {
    const base = rawPayload && typeof rawPayload === 'object' ? { ...rawPayload } : {};
    const scheduleId = base.scheduleId || opts.scheduleId;
    const forceResolved = opts.forceResolved === true;
    const forceRejected = opts.forceRejected === true;

    if (forceResolved || forceRejected) {
      const merged = await enrichAttendancePayloadFromSchedules(base, myId);
      setAttendanceConfirm({
        ...merged,
        scheduleId: merged.scheduleId || scheduleId,
        sessionNumber: merged.sessionNumber || merged.completedSessions || '?',
        totalSessions: merged.totalSessions || merged.totalRequired,
        resolved: true,
        waiting: false,
        resolveOutcome: forceRejected ? 'rejected' : 'approved',
        studentConfirmStatus: forceRejected
          ? 'admin_rejected'
          : (merged.studentConfirmStatus || 'admin_approved'),
        kind: forceRejected ? 'attendance_rejected' : (merged.kind || 'attendance_taken'),
      });
      return;
    }

    if (!scheduleId) {
      // Thông báo cũ «Đã điểm danh» không có scheduleId → bổ sung GV/ca từ lịch HV
      const merged = await enrichAttendancePayloadFromSchedules(base, myId);
      setAttendanceConfirm({
        ...merged,
        sessionNumber: merged.sessionNumber || merged.completedSessions || '?',
        totalSessions: merged.totalSessions || merged.totalRequired,
        resolved: true,
        waiting: false,
        kind: merged.kind || 'attendance_taken',
        studentConfirmStatus: 'accepted',
      });
      return;
    }

    try {
      const res = await api.schedules.getPendingConfirm();
      const list = Array.isArray(res?.data) ? res.data : [];
      const live = list.find((p) => String(p?.scheduleId) === String(scheduleId));
      const st = String(live?.studentConfirmStatus || '').toLowerCase();
      if (live && st === 'pending') {
        setAttendanceConfirm({ ...live, resolved: false, waiting: false });
        return;
      }
      if (live && st === 'disputed') {
        setAttendanceConfirm({ ...live, resolved: false, waiting: true });
        return;
      }
      setAttendanceConfirm({
        ...base,
        ...(live || {}),
        scheduleId,
        sessionNumber: base.completedSessions
          || live?.sessionNumber
          || base.sessionNumber
          || '?',
        totalSessions: base.totalRequired
          || base.totalSessions
          || live?.totalSessions,
        resolved: true,
        waiting: false,
        studentConfirmStatus: base.studentConfirmStatus || 'accepted',
        kind: base.kind || 'attendance_taken',
      });
    } catch {
      setAttendanceConfirm({ ...base, scheduleId, resolved: false, waiting: false });
    }
  }, [myId]);

  const handleAdminDisputeDecision = React.useCallback(async (decision) => {
    const sid = attendanceDispute?.scheduleId;
    if (!sid) return;
    setAttendanceDisputeBusy(true);
    try {
      const res = await api.schedules.resolveDispute(sid, decision);
      if (!res?.success) {
        toast.error(res?.message || 'Không xử lý được tranh chấp');
        return;
      }
      setAttendanceDispute(null);
      if (res.rejected) {
        toast.success('Đã từ chối — buổi không tính. Đã báo GV và HV.');
      } else {
        toast.success('Đã chấp thuận — buổi được tính.');
      }
      if (typeof triggerBackgroundSync === 'function') {
        Promise.resolve(triggerBackgroundSync({ force: true })).catch(() => {});
      }
    } catch (e) {
      toast.error(e?.message || 'Lỗi kết nối');
    } finally {
      setAttendanceDisputeBusy(false);
    }
  }, [attendanceDispute, toast, triggerBackgroundSync]);

  const openTeacherAttendanceConfirmed = React.useCallback(async (n, opts = {}) => {
    const rejected = opts.rejected === true
      || String(n?.payload?.kind || '') === 'attendance_rejected'
      || String(n?.payload?.kind || '') === 'admin_makeup_rejected'
      || isTeacherAttendanceRejectedNotif(n);
    const base = { ...(n?.payload || {}) };
    const confirmedAt = base.studentConfirmedAt || n?.time || n?.createdAt || n?.timestamp || null;
    const notifId = String(n?.id || n?._id || base.notifId || '');
    let payload = {
      ...base,
      studentName: base.studentName || '',
      confirmedAt,
      rejected,
      notifId,
      kind: rejected
        ? (base.kind || 'attendance_rejected')
        : (base.kind || 'attendance_confirmed'),
    };
    const missingCa = !String(payload.timeRange || '').trim() && !payload.startTime;
    const missingSession = payload.sessionNumber == null && payload.sessionOrdinalPreview == null;
    const missingName = !String(payload.studentName || '').trim();
    if ((missingCa || missingSession || missingName) && myId) {
      try {
        const res = await api.schedules.getByTeacher(myId);
        const list = Array.isArray(res?.data) ? res.data : [];
        const sid = String(payload.scheduleId || '');
        const sch = sid
          ? list.find((s) => String(s._id || s.id) === sid)
          : null;
        if (sch) {
          const extra = formatScheduleForConfirmModal(sch);
          payload = {
            ...extra,
            ...payload,
            studentName: payload.studentName || sch.studentName || sch.studentId?.name || '',
            timeRange: payload.timeRange || extra.timeRange,
            sessionNumber: payload.sessionNumber ?? extra.sessionNumber,
            totalSessions: payload.totalSessions ?? extra.totalSessions,
            weekday: payload.weekday || extra.weekday,
            dateLabel: payload.dateLabel || extra.dateLabel,
            course: payload.course || extra.course,
            confirmedAt: payload.confirmedAt || sch.studentConfirmedAt || confirmedAt,
            rejected,
          };
        }
      } catch { /* dùng payload thông báo */ }
    }
    setTeacherAttendanceConfirm(payload);
  }, [myId]);

  const openStudentNoteFromNotif = React.useCallback((n) => {
    const p = { ...(n?.payload || {}) };
    const sid = String(p.scheduleId || '');
    const sch = sid
      ? (schedules || []).find((s) => String(s._id || s.id) === sid)
      : null;
    const start = p.startTime || sch?.startTime || '';
    const end = p.endTime || sch?.endTime || '';
    const dateRaw = p.date || sch?.date;
    let dateLabel = p.dateLabel || '';
    if (!dateLabel && dateRaw) {
      const d = new Date(dateRaw);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      }
    }
    const liveNote = sch ? String(sch.studentNote || '').trim() : '';
    const deletedLocal = Boolean(sch) && !liveNote;
    setStudentNotePopup({
      scheduleId: sid || String(sch?._id || sch?.id || ''),
      studentName: p.studentName || sch?.studentName || sch?.studentId?.name || 'Học viên',
      studentNote: deletedLocal ? '' : (liveNote || String(p.studentNote || '').trim()),
      deleted: deletedLocal,
      date: dateRaw,
      dateLabel,
      startTime: start,
      endTime: end,
      timeRange: p.timeRange || (start && end ? `${start} – ${end}` : start),
      course: p.course || sch?.course || '',
    });
    if (!sid) return;
    api.schedules.getById(sid).then((res) => {
      const found = res?.success ? res.data : null;
      const live = String(found?.studentNote || '').trim();
      const gone = !found || !live;
      setStudentNotePopup((prev) => {
        if (!prev || String(prev.scheduleId || '') !== sid) return prev;
        return { ...prev, studentNote: live, deleted: gone };
      });
    }).catch(() => {});
  }, [schedules]);

  React.useEffect(() => {
    if (!socket) return undefined;
    const onRemoved = (data) => {
      if (String(data?.kind || '') !== 'student_schedule_note') return;
      setStudentNotePopup((prev) => {
        if (!prev) return prev;
        if (data.scheduleId && String(prev.scheduleId || '') === String(data.scheduleId)) return null;
        if (data.studentName && String(prev.studentName || '') === String(data.studentName)
          && data.dateLabel && String(prev.dateLabel || '') === String(data.dateLabel)) return null;
        return prev;
      });
    };
    socket.on('notification:removed', onRemoved);
    return () => socket.off('notification:removed', onRemoved);
  }, [socket]);

  const dismissWelcomeCelebration = React.useCallback(async () => {
    setShowWelcomeCelebration(false);
    if (welcomeMarkedRef.current) return;
    welcomeMarkedRef.current = true;
    try {
      await api.auth.markWelcomeCelebrationSeen();
      const key = role === 'staff' ? 'staff' : role;
      const stored = JSON.parse(localStorage.getItem(`${key}_user`) || '{}');
      localStorage.setItem(`${key}_user`, JSON.stringify({ ...stored, showWelcomeCelebration: false }));
    } catch {
      welcomeMarkedRef.current = false;
    }
  }, [role]);

  const dismissCourseCelebration = React.useCallback(async () => {
    const current = courseCelebration;
    setCourseCelebration(null);
    if (!current) return;
    try {
      await api.auth.markCourseCelebrationSeen({
        enrollmentId: current?.enrollmentId,
        courseName: current?.courseName,
      });
      const key = 'student';
      const stored = JSON.parse(localStorage.getItem(`${key}_user`) || '{}');
      localStorage.setItem(`${key}_user`, JSON.stringify({ ...stored, pendingCourseCelebration: null }));
    } catch { /* lần sau /me sẽ hiện lại nếu chưa lưu */ }
  }, [courseCelebration]);

  const dismissStarBonusCelebration = React.useCallback(() => {
    const current = starBonusCelebration;
    setStarBonusCelebration(null);
    if (!current?.month) return;
    markStarBonusSeen(current.teacherId || myId, current.month);
    // Đánh dấu notif thưởng sao tháng đó đã đọc (nếu còn unread)
    try {
      const hit = (allNotifications || []).find((n) => (
        n?.payload?.kind === 'star_bonus_eligible'
        && String(n.payload?.month) === String(current.month)
        && !n.read
      ));
      if (hit && typeof markNotificationRead === 'function') {
        markNotificationRead(hit.id || hit._id);
      }
    } catch { /* ignore */ }
  }, [starBonusCelebration, markStarBonusSeen, myId, allNotifications, markNotificationRead]);

  const handleLogout = () => onLogout?.();

  const [showNotif, setShowNotif] = React.useState(false);
  const [notifLimit, setNotifLimit] = React.useState(5);
  const [notifPos, setNotifPos] = React.useState({ top: 72, right: 16 });
  const [assignedTeacherModal, setAssignedTeacherModal] = React.useState({
    open: false,
    loading: false,
    teacher: null,
  });

  // Gate overlay layout → PopupBanner / LoginInbox xếp hàng (không đè nhau)
  useEffect(() => {
    setLoginOverlay('welcome-celebration', Boolean(showWelcomeCelebration));
  }, [showWelcomeCelebration]);
  useEffect(() => {
    setLoginOverlay('course-celebration', Boolean(courseCelebration));
  }, [courseCelebration]);
  useEffect(() => {
    setLoginOverlay('star-bonus-celebration', Boolean(starBonusCelebration));
  }, [starBonusCelebration]);
  useEffect(() => {
    setLoginOverlay('attendance-confirm', role === 'student' && Boolean(attendanceConfirm));
  }, [role, attendanceConfirm]);
  useEffect(() => {
    setLoginOverlay('assigned-teacher', role === 'student' && Boolean(assignedTeacherModal.open));
  }, [role, assignedTeacherModal.open]);
  useEffect(() => {
    setLoginOverlay('attendance-dispute', (role === 'admin' || role === 'staff') && Boolean(attendanceDispute));
  }, [role, attendanceDispute]);
  useEffect(() => {
    setLoginOverlay('teacher-attendance-confirm', role === 'teacher' && Boolean(teacherAttendanceConfirm));
  }, [role, teacherAttendanceConfirm]);
  useEffect(() => {
    setLoginOverlay('admin-quick-popup', Boolean(adminQuickPopup));
  }, [adminQuickPopup]);

  const notifRef = React.useRef(null);
  const bellRef = React.useRef(null);

  const openAssignedTeacherFromNotif = React.useCallback(async (payload = {}) => {
    const teacherId = String(payload?.teacherId || '').trim();
    const fallback = {
      id: teacherId,
      name: payload?.teacherName || 'Giảng viên',
      specialty: payload?.specialty || '',
      averageRating: Number(payload?.averageRating) || 0,
      ratingCount: Number(payload?.ratingCount) || 0,
      voiceRegion: payload?.voiceRegion || '',
      avatar: payload?.avatar || '',
    };
    setAssignedTeacherModal({ open: true, loading: Boolean(teacherId), teacher: fallback });
    if (!teacherId) {
      setAssignedTeacherModal({ open: true, loading: false, teacher: fallback });
      return;
    }
    try {
      const res = await api.teachers.getPublicCard(teacherId);
      if (res?.success && res?.data) {
        setAssignedTeacherModal({
          open: true,
          loading: false,
          teacher: { ...fallback, ...res.data },
        });
        return;
      }
    } catch { /* keep fallback */ }
    setAssignedTeacherModal({ open: true, loading: false, teacher: fallback });
  }, []);

  useLayoutEffect(() => {
    if (!showNotif) return undefined;
    const updatePos = () => {
      const el = bellRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setNotifPos({
        top: Math.round(r.bottom + 8),
        right: Math.max(12, Math.round(window.innerWidth - r.right)),
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [showNotif]);

  React.useEffect(() => {
    if (!showNotif) return;
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target) &&
          bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotif]);

  const myNotifications = allNotifications.filter(n => {
    // Nếu có mảng receivers, kiểm tra quyền
    if (Array.isArray(n.receivers) && n.receivers.length > 0) {
      const recs = n.receivers.map((r) => String(r));
      const myIdStr = myId != null ? String(myId) : '';
      const isAdminRole = role === 'admin' || role === 'staff';
      if (recs.includes('ALL_ADMIN') && !isAdminRole) return false;
      if (recs.includes('ALL_TEACHER') && role !== 'teacher') return false;
      if (recs.includes('ALL_STUDENT') && role !== 'student') return false;

      const isForMe = (myIdStr && recs.includes(myIdStr)) ||
                      (role && recs.includes(String(role))) ||
                      (isAdminRole && recs.includes('ALL_ADMIN')) ||
                      (role === 'teacher' && recs.includes('ALL_TEACHER')) ||
                      (role === 'student' && recs.includes('ALL_STUDENT')) ||
                      recs.includes('GLOBAL') ||
                      recs.includes('ALL');
      if (!isForMe) return false;
    }
    return ((myId && String(n.userId) === String(myId)) || !n.userId) && 
           (n.role === role || !n.role);
  }).sort((a, b) => new Date(b.time || Date.now()) - new Date(a.time || Date.now()));


  const unreadCount = myNotifications.filter(n => !n.read).length;

  // GV offline lúc đạt mốc → hiện popup khi vào lại (notif chưa xem + chưa celeb)
  useEffect(() => {
    if (role !== 'teacher' || !myId) return;
    if (showWelcomeCelebration || starBonusCelebration) return;
    const hit = myNotifications.find((n) => (
      n?.payload?.kind === 'star_bonus_eligible'
      && n?.payload?.month
      && !n.read
      && !hasSeenStarBonus(myId, n.payload.month)
    ));
    if (!hit) return;
    queueStarBonusCelebration({
      teacherId: myId,
      month: hit.payload.month,
      monthLabel: hit.payload.monthLabel,
      amount: hit.payload.amount,
      minStudents: hit.payload.minStudents,
      minStars: hit.payload.minStars,
    });
  }, [
    role,
    myId,
    myNotifications,
    showWelcomeCelebration,
    starBonusCelebration,
    hasSeenStarBonus,
    queueStarBonusCelebration,
  ]);

  // GV offline lúc Admin không tính buổi → mở popup 1 lần khi vào lại (notif chưa đọc + chưa xem)
  useEffect(() => {
    if (role !== 'teacher' || !myId) return;
    if (showWelcomeCelebration || starBonusCelebration || teacherAttendanceConfirm) return;
    const hit = myNotifications.find((n) => {
      if (n?.read) return false;
      if (!isTeacherAttendanceRejectedNotif(n)) return false;
      const scheduleId = String(n?.payload?.scheduleId || '');
      if (scheduleId && hasSeenTeacherReject(myId, scheduleId)) return false;
      const key = String(n.id || n._id || scheduleId || '');
      if (!key || teacherRejectPopupShownRef.current.has(`session:${key}`)) return false;
      return true;
    });
    if (!hit) return;
    const key = String(hit.id || hit._id || hit.payload?.scheduleId || '');
    if (key) teacherRejectPopupShownRef.current.add(`session:${key}`);
    openTeacherAttendanceConfirmed(hit, { rejected: true });
  }, [
    role,
    myId,
    myNotifications,
    showWelcomeCelebration,
    starBonusCelebration,
    teacherAttendanceConfirm,
    openTeacherAttendanceConfirmed,
    hasSeenTeacherReject,
  ]);

  useEffect(() => {
    triggerBackgroundSync();
  }, [triggerBackgroundSync]);

  /** Deep-link hồ sơ HV từ chat (điểm danh bù…): hoạt động cả khi đang ở /admin/inbox (AdminDashboard chưa mount). */
  useEffect(() => {
    if (role !== 'admin' && role !== 'staff') return undefined;
    const onOpenStudentDetail = (e) => {
      const { id, tab, scheduleId } = e.detail || {};
      const sid = String(id || '').trim();
      if (!sid) return;
      const q = new URLSearchParams();
      q.set('studentId', sid);
      const safeTab = String(tab || 'summary').trim();
      if (safeTab) q.set('tab', safeTab === 'overview' ? 'summary' : safeTab);
      const sch = String(scheduleId || '').trim();
      if (sch) q.set('scheduleId', sch);
      const hash = `students?${q.toString()}`;
      // Hash-only trên /admin: navigate('/admin#…') bị RR bỏ qua → modal không mở tới khi F5.
      navigate({ pathname: '/admin', hash });
      window.location.hash = hash;
    };
    window.addEventListener('open-student-detail', onOpenStudentDetail);
    return () => window.removeEventListener('open-student-detail', onOpenStudentDetail);
  }, [role, navigate]);

  const displayName = role === 'teacher'
    ? (currentTeacher?.name && !/^\d+$/.test(currentTeacher.name)
        ? currentTeacher.name
        : currentTeacher?.email || currentTeacher?.phone || session?.name || 'Giảng viên')
    : (session?.name || 'Admin');
  const pageTitle = resolvePageTitle(role, location.pathname, location.hash);
  const activeHash = (location.hash || '').replace('#', '').split('?')[0];
  const adminHash = activeHash || (location.pathname === '/admin' ? 'dashboard' : '');
  // GV Tổng quan = /teacher (không hash) — KHÔNG immersive; chỉ #students mới khóa scroll như split-pane.
  const isTeacherStudentsTab =
    role === 'teacher' && location.pathname === '/teacher' && activeHash === 'students';
  const isStudentsTab = adminHash === 'students' || isTeacherStudentsTab;
  const isInboxPage = location.pathname.includes('/inbox');
  const isBiPage = location.pathname.includes('/bi');
  const isImmersivePage =
    isInboxPage
    || isBiPage
    || (role === 'teacher' && location.pathname === '/teacher/test')
    || isTeacherStudentsTab;
  const showAdminBranch = role === 'admin';
  const roleLabel = role === 'admin'
    ? (session?.adminRole === 'SUPER_ADMIN' ? 'Super Admin' : session?.adminRole === 'HIGH_ADMIN' ? 'Admin cấp cao' : session?.adminRole === 'SUPPORT' ? 'Chuyên viên Hỗ trợ' : session?.adminRole === 'STAFF' ? 'Staff' : 'admin')
    : role;

  return (
    <FloatingMessengerProvider
      currentUserId={myId}
      currentUserRole={getMessagingRole(session) || role}
      getConversations={getConversations}
    >
    <div className="flex h-[100dvh] max-h-[100dvh] bg-[#f8fafc] relative font-sans overflow-hidden">
      {isRefetching ? (
        <div className="sr-only" role="status" aria-live="polite">
          Đang đồng bộ dữ liệu
        </div>
      ) : null}

      <AppSidebar
        session={session}
        role={role}
        userName={displayName}
        userAvatar={session?.avatar || session?.avatarUrl || ''}
        onLogout={handleLogout}
        teacherPending={isTeacherPending}
        adminRole={session?.adminRole || null}
        userPermissions={session?.permissions || []}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      <main id="main-content" className="flex-1 min-w-0 flex flex-col h-[100dvh] max-h-[100dvh] max-w-full overflow-hidden" tabIndex={-1}>
        <header className={`cms-topbar flex flex-col ${
          !isImmersivePage ? 'cms-shell-gutter' : ''
        } ${
          role === 'teacher' && location.pathname === '/teacher/test' ? 'hidden' : ''
        }`}>
          <div className="cms-topbar__row">
            <button
              type="button"
              className="cms-topbar__menu"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileNavOpen}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1 flex flex-col md:flex-row md:items-center md:gap-3 overflow-hidden">
              <h1 className="cms-topbar__title">{pageTitle}</h1>
              <p className="hidden md:block text-[11px] sm:text-[12px] text-slate-500 truncate leading-none mt-0.5 sm:mt-0">
                <span className="font-medium text-slate-600">{displayName}</span>
                <span className="text-slate-300 mx-1">·</span>
                <span>{roleLabel}</span>
              </p>
            </div>

            <div className="flex items-center flex-nowrap justify-end gap-0.5 sm:gap-2 shrink-0">
              {showAdminBranch && (
                <div className={isStudentsTab ? 'hidden lg:block' : 'hidden md:block'}>
                  <BranchFilterDropdown />
                </div>
              )}

              <div className="relative">
                <button 
                  ref={bellRef}
                  type="button"
                  onClick={() => { setShowNotif(!showNotif); setNotifLimit(5); }}
                  aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
                  aria-expanded={showNotif}
                  aria-haspopup="dialog"
                  className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-colors duration-200 ${showNotif ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                >
                  <Bell size={18} aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white" aria-hidden="true">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="h-8 w-px bg-slate-100 mx-0.5 hidden md:block" />

              {/* Desktop / large tablet+: logout in topbar (mobile+tablet dùng sidebar) */}
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Đăng xuất"
                className="hidden lg:inline-flex h-11 px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors duration-200 items-center gap-1.5"
              >
                <LogOut size={15} aria-hidden="true" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>

          {/* Mobile: branch full-width row (not students — students keeps prior lg-only behavior) */}
          {showAdminBranch && !isStudentsTab && (
            <div className="md:hidden w-full cms-page-gutter pb-2.5">
              <BranchFilterDropdown fullWidth />
            </div>
          )}
        </header>

        <div
          className={
            isInboxPage || isBiPage
              ? 'flex-1 min-h-0 w-full overflow-hidden flex flex-col cms-page-gutter py-3 sm:py-3 md:py-4 pb-[env(safe-area-inset-bottom,0px)]'
              : isImmersivePage
                ? 'flex-1 min-h-0 w-full overflow-hidden flex flex-col p-0'
                : 'flex-1 min-h-0 cms-page-gutter cms-shell-gutter py-3 sm:py-4 w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:pb-6'
          }
        >
          <div
            className={
              isInboxPage || isBiPage
                ? 'cms-page min-w-0 w-full max-w-full flex-1 min-h-0 h-full flex flex-col overflow-hidden'
                : isImmersivePage
                  ? 'cms-page min-w-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden'
                  : 'cms-page min-w-0 w-full max-w-full'
            }
          >
            <Outlet context={{ session, role }} />
          </div>
        </div>
      </main>

      {role === 'student' ? <StudentQuizInviteHost /> : null}

      <LoginInboxAlertPopup
        role={role}
        userId={myId}
        blocked={
          showWelcomeCelebration
          || !!courseCelebration
          || !!starBonusCelebration
          || (role === 'student' && !!attendanceConfirm)
          || (role === 'student' && assignedTeacherModal.open)
          || ((role === 'admin' || role === 'staff') && !!attendanceDispute)
          || (role === 'teacher' && !!teacherAttendanceConfirm)
          || (session?.isFirstLogin === true && role !== 'teacher')
        }
      />
      <WelcomeCelebrationOverlay
        open={showWelcomeCelebration}
        role={role}
        name={displayName || session?.name || ''}
        variant="welcome"
        onClose={dismissWelcomeCelebration}
      />
      <WelcomeCelebrationOverlay
        open={!showWelcomeCelebration && !!courseCelebration}
        role="student"
        name={displayName || session?.name || ''}
        variant="course_complete"
        courseName={courseCelebration?.courseName || ''}
        onClose={dismissCourseCelebration}
      />
      <WelcomeCelebrationOverlay
        open={!showWelcomeCelebration && !courseCelebration && !!starBonusCelebration}
        role="teacher"
        name={displayName || session?.name || ''}
        variant="star_bonus"
        starBonus={starBonusCelebration}
        onClose={dismissStarBonusCelebration}
      />
      <StudentAttendanceConfirmModal
        open={role === 'student' && !!attendanceConfirm}
        payload={attendanceConfirm}
        busy={attendanceConfirmBusy}
        onAccept={() => handleStudentAttendanceDecision('accept')}
        onDispute={() => handleStudentAttendanceDecision('dispute')}
        onDismiss={() => setAttendanceConfirm(null)}
      />
      <StudentAssignedTeacherModal
        open={role === 'student' && assignedTeacherModal.open}
        teacher={assignedTeacherModal.teacher}
        loading={assignedTeacherModal.loading}
        onClose={() => setAssignedTeacherModal({ open: false, loading: false, teacher: null })}
      />
      <AdminAttendanceDisputeModal
        open={(role === 'admin' || role === 'staff') && !!attendanceDispute}
        payload={attendanceDispute}
        busy={attendanceDisputeBusy}
        onApprove={() => handleAdminDisputeDecision('approve')}
        onReject={() => handleAdminDisputeDecision('reject')}
        onClose={() => setAttendanceDispute(null)}
      />
      <TeacherAttendanceConfirmedModal
        open={role === 'teacher' && !!teacherAttendanceConfirm}
        payload={teacherAttendanceConfirm}
        onClose={dismissTeacherAttendanceConfirm}
      />
      <TeacherStudentNoteModal
        open={role === 'teacher' && !!studentNotePopup}
        payload={studentNotePopupLive}
        onClose={() => setStudentNotePopup(null)}
      />

      {showNotif && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="cms-notif-backdrop md:hidden"
            aria-hidden="true"
            onClick={() => setShowNotif(false)}
          />
          <div
            ref={notifRef}
            role="dialog"
            aria-modal="true"
            aria-label="Danh sách thông báo"
            className="cms-notif-sheet"
            style={{
              '--notif-top': `${notifPos.top}px`,
              '--notif-right': `${notifPos.right}px`,
            }}
          >
            <div className="md:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
              <span className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-shrink-0">
              <h3 className="font-semibold text-slate-900 text-base">Thông báo mới</h3>
              <button
                type="button"
                onClick={() => setShowNotif(false)}
                aria-label="Đóng thông báo"
                className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-200"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {myNotifications.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Bell size={28} className="text-slate-300" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-slate-400">Không có thông báo mới nào</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {myNotifications.slice(0, notifLimit).map((n, idx) => {
                    const style = getNotifStyle(n.type);
                    const Icon = style.icon;
                    return (
                      <div
                        key={`${n.id || n._id}-${idx}`}
                        onClick={() => {
                          markNotificationRead(n.id || n._id);
                          if (n.payload?.action === 'RESET_PASSWORD') {
                            window.dispatchEvent(new CustomEvent('open-reset-pw', { detail: n.payload }));
                          } else if (n.payload?.action === 'blog_published' && n.payload?.slug) {
                            const base = role === 'teacher' ? '/teacher' : role === 'student' ? '/student' : '/admin';
                            navigate(`${base}/news/${n.payload.slug}`);
                          } else if (n.payload?.kind === 'lms_qa' && n.payload?.qaId) {
                            const qaId = n.payload.qaId;
                            if (role === 'admin' || role === 'staff') {
                              navigate(`/admin/notifications?qaId=${encodeURIComponent(qaId)}`);
                            } else if (role === 'teacher') {
                              navigate(`/teacher/notifications?qaId=${encodeURIComponent(qaId)}`);
                            } else if (role === 'student') {
                              const p = n.path || `/student#materials?tab=qa&qaId=${encodeURIComponent(qaId)}`;
                              navigate(p.includes('#') ? p : `/student#materials?tab=qa&qaId=${encodeURIComponent(qaId)}`);
                            }
                          } else if (n.payload?.kind === 'attendance_dispute' && (role === 'admin' || role === 'staff')) {
                            setShowNotif(false);
                            (async () => {
                              const fallback = {
                                scheduleId: n.payload.scheduleId,
                                studentName: n.payload.studentName,
                                teacherName: n.payload.teacherName,
                                course: n.payload.course,
                                sessionNumber: n.payload.sessionNumber,
                                totalSessions: n.payload.totalSessions,
                                weekday: n.payload.weekday,
                                dateLabel: n.payload.dateLabel,
                                timeRange: n.payload.timeRange,
                              };
                              try {
                                const res = await api.schedules.getDisputes();
                                const live = (Array.isArray(res?.data) ? res.data : []).find(
                                  (p) => String(p?.scheduleId) === String(n.payload.scheduleId),
                                );
                                if (live) {
                                  setAttendanceDispute({ ...live, resolved: false });
                                  return;
                                }
                                // Đã giải quyết: lấy schedule để biết chấp thuận / không chấp thuận
                                let sch = null;
                                try {
                                  const one = await api.schedules.getById(n.payload.scheduleId);
                                  if (one?.success) sch = one.data;
                                } catch { /* ignore */ }
                                const st = String(sch?.studentConfirmStatus || '').toLowerCase();
                                const status = String(sch?.status || '').toLowerCase();
                                const rejected = st === 'admin_rejected'
                                  || status === 'cancelled'
                                  || status === 'canceled'
                                  || status === 'no_show';
                                const approved = st === 'admin_approved'
                                  || st === 'accepted'
                                  || status === 'completed';
                                setAttendanceDispute({
                                  ...fallback,
                                  ...(sch ? {
                                    studentName: sch.studentName || sch.studentId?.name || fallback.studentName,
                                    teacherName: sch.teacherName || sch.teacherId?.name || fallback.teacherName,
                                    course: sch.course || fallback.course,
                                    status: sch.status,
                                    studentConfirmStatus: sch.studentConfirmStatus
                                      || (rejected ? 'admin_rejected' : approved ? 'admin_approved' : 'admin_approved'),
                                  } : {
                                    studentConfirmStatus: 'admin_approved',
                                  }),
                                  resolved: true,
                                  resolveOutcome: rejected ? 'rejected' : 'approved',
                                });
                              } catch {
                                setAttendanceDispute({
                                  ...fallback,
                                  resolved: true,
                                  studentConfirmStatus: 'admin_approved',
                                  resolveOutcome: 'approved',
                                });
                              }
                            })();
                          } else if (n.payload?.kind === 'attendance_confirm_pending' && role === 'student') {
                            setShowNotif(false);
                            openStudentAttendanceFromNotif(n.payload);
                          } else if (
                            role === 'student'
                            && (n.payload?.kind === 'attendance_admin_approved'
                              || n.payload?.kind === 'attendance_confirmed'
                              || n.payload?.kind === 'attendance_taken')
                          ) {
                            setShowNotif(false);
                            openStudentAttendanceFromNotif(n.payload, { forceResolved: true });
                          } else if (
                            role === 'student'
                            && n.payload?.kind === 'attendance_rejected'
                          ) {
                            setShowNotif(false);
                            openStudentAttendanceFromNotif(n.payload, { forceRejected: true });
                          } else if (
                            role === 'student'
                            && n.payload?.kind === 'attendance_dispute'
                          ) {
                            setShowNotif(false);
                            openStudentAttendanceFromNotif({
                              ...n.payload,
                              studentConfirmStatus: 'disputed',
                              waiting: true,
                            });
                          } else if (
                            role === 'student'
                            && (
                              String(n.title || '').includes('Đã điểm danh buổi học')
                              || String(n.title || '').includes('Điểm danh đã được chấp thuận')
                            )
                          ) {
                            setShowNotif(false);
                            openStudentAttendanceFromNotif({
                              ...(n.payload || {}),
                              course: n.payload?.course,
                              sessionNumber: n.payload?.completedSessions || n.payload?.sessionNumber,
                              totalSessions: n.payload?.totalRequired || n.payload?.totalSessions,
                              teacherName: n.payload?.teacherName,
                            }, { forceResolved: true });
                          } else if (
                            role === 'student'
                            && (
                              n.payload?.kind === 'teacher_assigned'
                              || n.payload?.kind === 'teacher_reassigned'
                              || String(n.title || '').includes('Phân công giảng viên')
                              || String(n.title || '').includes('Giảng viên khóa học đã đổi')
                            )
                          ) {
                            setShowNotif(false);
                            openAssignedTeacherFromNotif(n.payload || {});
                          } else if (n.payload?.kind === 'star_bonus_eligible' && role === 'teacher') {
                            setShowNotif(false);
                            setStarBonusCelebration({
                              month: String(n.payload.month || ''),
                              monthLabel: n.payload.monthLabel || '',
                              amount: Number(n.payload.amount) || 0,
                              minStudents: n.payload.minStudents,
                              minStars: n.payload.minStars,
                              teacherId: myId,
                            });
                          } else if (n.payload?.kind === 'lms_course_update') {
                            const action = n.payload?.action || '';
                            const isSoftware = String(action).startsWith('software_link');
                            const fallback = role === 'teacher'
                              ? (isSoftware ? '/teacher#software-links' : `/teacher#training?courseId=${encodeURIComponent(n.payload?.courseId || '')}`)
                              : (isSoftware ? '/student#materials-software' : `/student#materials-videos?courseId=${encodeURIComponent(n.payload?.courseId || '')}`);
                            const p = n.path || fallback;
                            if (String(p).includes('#')) {
                              const [pathPart, hashPart] = String(p).split('#');
                              navigate(pathPart || (role === 'teacher' ? '/teacher' : '/student'));
                              window.location.hash = hashPart || '';
                            } else {
                              navigate(p);
                            }
                          } else if (role === 'student' && n.payload?.kind === 'video_course_paid') {
                            setShowNotif(false);
                            const cid = String(n.payload?.courseId || '').trim();
                            const p = n.path || (cid
                              ? `/student#materials-videos?courseId=${encodeURIComponent(cid)}`
                              : '/student#materials-videos');
                            if (String(p).includes('#')) {
                              const [pathPart, hashPart] = String(p).split('#');
                              navigate(pathPart || '/student');
                              window.location.hash = hashPart || '';
                            } else {
                              navigate(p);
                            }
                          } else if (n.payload?.kind === 'lms_review') {
                            navigate(n.path || `/admin/notifications?reviewId=${encodeURIComponent(n.payload?.reviewId || '')}`);
                          } else if (role === 'teacher' && isTeacherRatingNotif(n)) {
                            openTeacherRatingDetail({
                              evaluationId: getEvaluationIdFromNotif(n),
                              studentId: n.payload?.studentId,
                              ...n,
                            });
                          } else if (role === 'teacher' && isTeacherAttendanceRejectedNotif(n)) {
                            setShowNotif(false);
                            openTeacherAttendanceConfirmed(n, { rejected: true });
                          } else if (role === 'teacher' && isTeacherAttendanceConfirmedNotif(n)) {
                            setShowNotif(false);
                            openTeacherAttendanceConfirmed(n);
                      } else if (role === 'teacher' && n.payload?.quizId) {
                        setShowNotif(false);
                        const detail = {
                          quizId: n.payload?.quizId,
                          studentId: n.payload?.studentId,
                          payload: n.payload,
                        };
                        try {
                          sessionStorage.setItem(PENDING_TEACHER_QUIZ_DETAIL_KEY, JSON.stringify(detail));
                        } catch { /* ignore */ }
                        if (location.pathname === '/teacher') {
                          window.dispatchEvent(new CustomEvent('open-teacher-quiz-detail', { detail }));
                        } else {
                          navigate('/teacher');
                        }
                          } else if (role === 'teacher' && isStudentScheduleNoteNotif(n)) {
                            setShowNotif(false);
                            openStudentNoteFromNotif(n);
                          } else if (role === 'teacher' && (n.payload?.type === 'schedule' || n.type === 'schedule')) {
                            // Chuyển hướng đến tab lịch học của giảng viên khi nhận thông báo ghi chú từ học viên
                            navigate('/teacher#schedule');
                          } else if (
                            (role === 'admin' || role === 'staff')
                            && (n.payload?.kind === 'admin_feedback'
                              || String(n.type || '').toUpperCase() === 'EVALUATION')
                          ) {
                            navigate('/admin#evaluations');
                          } else if ((role === 'admin' || role === 'staff' || session?.adminRole === 'SUPER_ADMIN' || session?.adminRole === 'STAFF') && (n.title?.includes('Học viên mới đăng ký') || n.title?.includes('Điểm danh buổi học'))) {

                            const openPopup = (studentData) => {
                              setAdminQuickPopup({
                                type: n.title?.includes('Học viên mới đăng ký') ? 'register' : 'attendance',
                                notif: n,
                                student: studentData,
                              });
                            };

                            if (n.payload?.studentId) {
                              api.students.getById(n.payload.studentId)
                                .then(res => {
                                  if (res?.success && res?.data) {
                                    openPopup(res.data);
                                  } else {
                                    // fallback to local state
                                    const st = students.find((s) => String(s._id || s.id) === String(n.payload?.studentId));
                                    if (st) openPopup(st);
                                    else if (n.path) navigate(n.path);
                                  }
                                })
                                .catch(() => {
                                  const st = students.find((s) => String(s._id || s.id) === String(n.payload?.studentId));
                                  if (st) openPopup(st);
                                  else if (n.path) navigate(n.path);
                                });
                            } else {
                              const st = students.find((s) => String(s._id || s.id) === String(n.payload?.studentId));
                              if (st) openPopup(st);
                              else if (n.path) navigate(n.path);
                            }
                          } else if (
                            (role === 'admin' || role === 'staff' || session?.adminRole === 'SUPER_ADMIN' || session?.adminRole === 'STAFF')
                            && n.payload?.kind === 'student_device_alert'
                            && n.payload?.studentId
                          ) {
                            setShowNotif(false);
                            window.dispatchEvent(new CustomEvent('open-student-detail', {
                              detail: { id: String(n.payload.studentId), tab: 'summary' },
                            }));
                          } else if (
                            role === 'student'
                            && n.payload?.kind === 'class_link_updated'
                            && /^https?:\/\//i.test(String(n.payload?.linkHoc || '').trim())
                          ) {
                            window.open(String(n.payload.linkHoc).trim(), '_blank', 'noopener,noreferrer');
                          } else if (n.path) {
                            let targetPath = n.path;

                            if (targetPath.startsWith('http')) {
                              try {
                                const urlObj = new URL(targetPath);
                                targetPath = urlObj.pathname + urlObj.search + urlObj.hash;
                              } catch (e) {}
                            }

                            if (targetPath.startsWith('/admin/') && targetPath !== '/admin/inbox' && targetPath !== '/admin/news' && !targetPath.includes('/news/') && !targetPath.includes('#')) {
                              targetPath = '/admin#' + targetPath.replace('/admin/', '');
                            } else if (targetPath.startsWith('/student/') && !['/student/exam', '/student/inbox', '/student/news'].includes(targetPath) && !targetPath.includes('/news/') && !targetPath.includes('#')) {
                              targetPath = '/student#' + targetPath.replace('/student/', '');
                            } else if (targetPath.startsWith('/teacher/') && !['/teacher/test', '/teacher/finance', '/teacher/inbox', '/teacher/profile', '/teacher/news'].includes(targetPath) && !targetPath.includes('/news/') && !targetPath.includes('#')) {
                              targetPath = '/teacher#' + targetPath.replace('/teacher/', '');
                            }

                            // /teacher?evaluationId=… → mở popup thay vì chỉ về trang chủ
                            if (role === 'teacher' && String(targetPath).includes('evaluationId=')) {
                              openTeacherRatingDetail({ path: targetPath, payload: n.payload });
                            } else {
                              if (role === 'student' && String(n.type).toLowerCase() === 'exam' && n.payload?.quizId) {
                                targetPath = '/student/exam';
                              }
                              if (
                                role === 'student'
                                && targetPath === '/student#materials'
                                && (/bài tập/i.test(String(n.title || '')) || String(n.payload?.type || '') === 'assignment')
                              ) {
                                targetPath = '/student#materials-assignments';
                              }
                              if (String(targetPath).includes('#')) {
                                const [pathPart, hashPart] = String(targetPath).split('#');
                                navigate(pathPart || location.pathname || '/');
                                window.location.hash = hashPart || '';
                              } else {
                                navigate(targetPath);
                              }
                            }
                          }
                          setShowNotif(false);
                        }}
                        className={`px-4 py-3 hover:bg-slate-50 active:bg-slate-50 transition-colors duration-200 cursor-pointer flex gap-3 border-l-[3px] min-w-0 ${!n.read ? `bg-white ${style.border.replace('border-', 'border-l-')}` : 'bg-white border-l-transparent opacity-80'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative ${style.bg} ${style.color}`}>
                          <Icon size={18} aria-hidden="true" />
                          {!n.read && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-red-500" aria-hidden="true" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className={`text-[11px] font-semibold ${style.color}`}>{style.label}</span>
                            <span className="text-[11px] text-slate-400 font-medium flex-shrink-0">{formatTime(n.time || n.createdAt || n.timestamp)}</span>
                          </div>
                          {n.title && <h4 className={`text-sm font-semibold mb-0.5 break-anywhere ${!n.read ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</h4>}
                          <p className={`text-[13px] leading-snug break-anywhere ${!n.read && !n.title ? 'text-slate-900 font-semibold' : !n.read ? 'text-slate-700' : 'text-slate-500'}`}>
                            {formatNotificationStudentMask(n.text || n.message || n.content, students, role === 'admin' || role === 'staff' || role === 'teacher')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0">
              <button type="button" onClick={() => markNotificationRead()} className="text-[12px] font-semibold text-slate-500 hover:text-red-600 transition-colors duration-200">Đọc tất cả</button>
              <button
                type="button"
                onClick={() => {
                  setShowNotif(false);
                  const base = role === 'teacher' ? '/teacher' : role === 'student' ? '/student' : '/admin';
                  navigate(`${base}/notifications`);
                }}
                className="text-[12px] font-semibold text-red-600 hover:underline inline-flex items-center gap-0.5"
              >
                Xem tất cả
                <NavArrow size={14} className="text-red-600" />
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      <ChangePasswordModal session={session} role={role} />

      {(ratingDetailLoading || ratingDetail || ratingDetailError) && role === 'teacher' ? (
        <TeacherRatingDetailModal
          rating={ratingDetail}
          loading={ratingDetailLoading}
          error={ratingDetailError}
          students={students}
          criteriaConfig={RATING_CRITERIA}
          onClose={() => {
            setRatingDetail(null);
            setRatingDetailError('');
            setRatingDetailLoading(false);
          }}
        />
      ) : null}
      {adminQuickPopup && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-base">
                {adminQuickPopup.type === 'register' ? '🎉 Học viên mới đăng ký' : '📋 Điểm danh buổi học'}
              </h3>
              <button type="button" onClick={() => setAdminQuickPopup(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm font-medium">
              {adminQuickPopup.type === 'register' ? (
                <>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Cơ sở:</span>
                    <span className="font-black text-slate-800">{adminQuickPopup.student.branchId?.name || adminQuickPopup.student.branchCode || adminQuickPopup.student.createdByBranch || 'Không rõ'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Học viên:</span>
                    <span className="font-bold text-slate-800">{adminQuickPopup.student.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Môn học:</span>
                    <span className="font-bold text-blue-700">{adminQuickPopup.student.course}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Thời gian:</span>
                    <span className="font-bold text-slate-800">{formatTime(adminQuickPopup.notif.time || adminQuickPopup.notif.createdAt)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">SĐT:</span>
                    <span className="font-bold text-slate-800">{adminQuickPopup.student.phone || adminQuickPopup.student.zalo || 'Không có'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Thanh toán:</span>
                    <span className="font-bold text-emerald-600">{adminQuickPopup.student.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Người lập phiếu:</span>
                    <span className="font-bold text-slate-800">
                      {adminQuickPopup.notif.payload?.creatorName 
                        ? `${adminQuickPopup.notif.payload.creatorName} (${adminQuickPopup.notif.payload.creatorRole})` 
                        : 'Hệ thống'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Học viên:</span>
                    <span className="font-bold text-slate-800">{adminQuickPopup.student.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Môn học:</span>
                    <span className="font-bold text-blue-700">{adminQuickPopup.notif.payload?.course || adminQuickPopup.student.course}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Giảng viên:</span>
                    <span className="font-bold text-slate-800">{adminQuickPopup.notif.payload?.teacherName || 'Không rõ'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Tiến độ:</span>
                    <span className="font-black text-emerald-600">Buổi {adminQuickPopup.notif.payload?.completedSessions || '?'} / {adminQuickPopup.notif.payload?.totalRequired || '?'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">Thời gian:</span>
                    <span className="font-bold text-slate-800">{formatTime(adminQuickPopup.notif.time || adminQuickPopup.notif.createdAt)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-2">
                    <span className="text-slate-500">SĐT Học viên:</span>
                    <span className="font-bold text-slate-800">{adminQuickPopup.student.phone || adminQuickPopup.student.zalo || 'Không có'}</span>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setAdminQuickPopup(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setAdminQuickPopup(null);
                  if (adminQuickPopup.type === 'register') {
                    navigate(`/admin#students?studentId=${adminQuickPopup.student._id || adminQuickPopup.student.id}`);
                  } else {
                    navigate(`/admin#students?studentId=${adminQuickPopup.student._id || adminQuickPopup.student.id}&tab=attendance`);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
              >
                Xem chi tiết
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Chat nổi toàn site — mặc định hỗ trợ online, nhiều tab kiểu Facebook */}
      <FloatingMessenger session={session} role={role} />
    </div>
    </FloatingMessengerProvider>
  );
};

const ChangePasswordModal = ({ session, role }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess(false);
    };
    window.addEventListener('open-change-password-modal', handleOpen);
    return () => window.removeEventListener('open-change-password-modal', handleOpen);
  }, []);

  React.useEffect(() => {
    setLoginOverlay('change-password', isOpen);
    if (isOpen) {
      setLoginOverlay('change-password-pending', false);
      return () => setLoginOverlay('change-password', false);
    }
    // Đóng modal: nếu local vẫn bắt buộc đổi MK → giữ gate
    try {
      const stored = JSON.parse(localStorage.getItem(`${role}_user`) || '{}');
      if (stored?.isFirstLogin === true && role !== 'teacher') {
        setLoginOverlay('change-password-pending', true);
      }
    } catch { /* ignore */ }
    return () => setLoginOverlay('change-password', false);
  }, [isOpen, role]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isFirst = session?.isFirstLogin === true;
    if ((!isFirst && !oldPassword) || !newPassword || !confirmPassword) return setError('Vui lòng nhập đầy đủ thông tin.');
    if (newPassword !== confirmPassword) return setError('Mật khẩu mới không khớp.');
    if (newPassword.length < 6) return setError('Mật khẩu mới phải có ít nhất 6 ký tự.');

    setLoading(true); setError('');
    try {
      const res = await api.auth.changePassword(oldPassword, newPassword);
      if (res.success) {
        setSuccess(true);
        // Cập nhật lại session local storage nếu là first login
        if (session?.isFirstLogin === true) {
           const key = `${role}_user`;
           try {
             const stored = JSON.parse(localStorage.getItem(key) || '{}');
             localStorage.setItem(key, JSON.stringify({ ...stored, isFirstLogin: false }));
             window.dispatchEvent(new Event('storage'));
           } catch {}
           setLoginOverlay('change-password-pending', false);
           window.dispatchEvent(new CustomEvent('cms:first-login-password-done'));
        }
        setTimeout(() => setIsOpen(false), 2000);
      } else {
        setError(res.message || 'Lỗi khi đổi mật khẩu.');
      }
    } catch {
      setError('Lỗi kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4 bg-black/60"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-sm max-h-[min(92dvh,900px)] overflow-y-auto overflow-x-hidden shadow-xl">
        <div className="bg-gradient-to-r from-red-600 to-red-600 px-6 py-5 flex items-center justify-between">
          <h3 id="change-password-title" className="text-white font-black text-lg flex items-center gap-2">
            <Lock size={20} aria-hidden="true" /> {session?.isFirstLogin === true ? 'Tạo mật khẩu cá nhân' : 'Đổi mật khẩu'}
          </h3>
          <button type="button" onClick={() => setIsOpen(false)} aria-label="Đóng" className="text-white/80 hover:text-white transition"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" aria-hidden="true" />
              </div>
              <p className="font-bold text-gray-800 text-lg">Đổi mật khẩu thành công!</p>
              <p className="text-gray-600 text-sm mt-1">Sử dụng mật khẩu mới cho lần đăng nhập sau.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div role="alert" className="bg-red-50 text-red-700 text-xs font-bold p-3 rounded-xl border border-red-100">{error}</div>}
              {session?.isFirstLogin !== true && (
                <div>
                  <label htmlFor="cms-old-password" className="text-xs font-bold text-slate-600 uppercase block mb-1">Mật khẩu hiện tại</label>
                  <input id="cms-old-password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password"
                    className="input-field" />
                </div>
              )}
              <div>
                <label htmlFor="cms-new-password" className="text-xs font-bold text-slate-600 uppercase block mb-1">Mật khẩu mới</label>
                <input id="cms-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password"
                  className="input-field" />
              </div>
              <div>
                <label htmlFor="cms-confirm-password" className="text-xs font-bold text-slate-600 uppercase block mb-1">Nhập lại mật khẩu mới</label>
                <input id="cms-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password"
                  className="input-field" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full btn-primary-blue py-3">
                {loading ? 'Đang xử lý...' : 'Xác nhận đổi'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DashboardLayout;




