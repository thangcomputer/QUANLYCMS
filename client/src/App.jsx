import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, lazy, Suspense }  from 'react';
import { SocketProvider }                    from './context/SocketContext';
import { StudentsProvider }                  from './context/StudentsContext';
import { TeachersProvider }                  from './context/TeachersContext';
import { ScheduleProvider }                  from './context/ScheduleContext';
import { FinanceProvider }                   from './context/FinanceContext';
import { DataProvider, useData }             from './context/DataContext';
import { ToastProvider }                     from './utils/toast.jsx';
import ErrorBoundary                         from './components/ErrorBoundary';
import LoginPage                             from './components/LoginPage';
import AdminLoginPage                        from './components/AdminLoginPage';
import RegistrationForm                      from './components/RegistrationForm';
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const StudentExamRoom = lazy(() => import('./components/StudentExamRoom'));
const StudentTest = lazy(() => import('./components/StudentTest'));
const TeacherTest = lazy(() => import('./components/TeacherTest'));
const TeacherFinanceAndTraining = lazy(() => import('./components/TeacherFinanceAndTraining'));
const Inbox = lazy(() => import('./components/Inbox'));
const NotificationCenterPage = lazy(() => import('./components/NotificationCenterPage'));
const FileCenterPage = lazy(() => import('./components/FileCenterPage'));
const BackupCenterPage = lazy(() => import('./components/BackupCenterPage'));
const MonitoringPage = lazy(() => import('./components/MonitoringPage'));
const AiCenterPage = lazy(() => import('./components/AiCenterPage'));
const BiDashboardPage = lazy(() => import('./components/BiDashboardPage'));
const WorkflowCenterPage = lazy(() => import('./components/WorkflowCenterPage'));
const FormReportBuilderPage = lazy(() => import('./components/FormReportBuilderPage'));
const TenantManagementPage = lazy(() => import('./components/TenantManagementPage'));
const PublicPaymentPage = lazy(() => import('./components/PublicPaymentPage'));
const FeedBoard = lazy(() => import('./components/FeedBoard'));
const NewsPage = lazy(() => import('./components/NewsPage'));
const CenterInfoPage = lazy(() => import('./components/centerInfo/CenterInfoPage'));
const CenterInfoManagePage = lazy(() => import('./components/centerInfo/CenterInfoManagePage'));
const CertPrepCatalogPage = lazy(() => import('./components/student/certPrep/CertPrepCatalogPage'));
const CertPrepLevelPage = lazy(() => import('./components/student/certPrep/CertPrepLevelPage'));
const CertPrepStudentPlayer = lazy(() => import('./components/student/certPrep/CertPrepStudentPlayer'));
const CertPrepResult = lazy(() => import('./components/student/certPrep/CertPrepResult'));
import DashboardLayout                       from './components/DashboardLayout';
import StudentLearningAccessGate             from './components/student/StudentLearningAccessGate';
import api, { clearTokens, getRolePrefix, NetworkOfflineError } from './services/api';
import { getDeviceFingerprint } from './utils/deviceFingerprint';
import { useIsDesktopExamDevice } from './utils/examDevice';
import { BranchProvider }                    from './context/BranchContext';
import LoadingScreen                         from './components/LoadingScreen';
import PopupBanner                           from './components/PopupBanner';
import OfflineBanner                         from './components/OfflineBanner';
import { ModalProvider, useModal }           from './utils/Modal.jsx';
import SecurityGuard                         from './components/SecurityGuard';
import FaviconSwitcher                       from './components/FaviconSwitcher';
import { useInactivityTimer }                from './utils/useInactivityTimer';
import { unlockAudio }                       from './utils/sound';
import { getMessagingRole }                  from './lib/messagingRoles';
import { hasPermission, PERMISSIONS }        from './constants/permissions';
import { snapshotLoginAlertStorage, restoreLoginAlertStorage } from './components/LoginInboxAlertPopup';
import './App.css';

// ── Session helpers ──────────────────────────────────────────────────────────

const loadSession = () => {
  try {
    // Lấy link prefix của URL hiện tại để đoán Role đang định truy cập
    // ví dụ /admin/... -> ưu tiên tìm admin_user
    const path = window.location.pathname;
    const priorityRole = path.startsWith('/admin') ? 'admin' 
                       : path.startsWith('/teacher') ? 'teacher' 
                       : path.startsWith('/student') ? 'student' 
                       : null;

    const roles = ['admin', 'staff', 'teacher', 'student'];
    
    // 1. Kiểm tra role ưu tiên theo URL trước
    if (priorityRole === 'admin') {
      for (const r of ['admin', 'staff']) {
        const userStr = localStorage.getItem(`${r}_user`);
        if (userStr && localStorage.getItem(`${r}_access_token`)) {
          return JSON.parse(userStr);
        }
      }
    } else if (priorityRole) {
      const userStr = localStorage.getItem(`${priorityRole}_user`);
      if (userStr && localStorage.getItem(`${priorityRole}_access_token`)) {
        return JSON.parse(userStr);
      }
    }

    // 2. Fallback tìm bất kỳ role nào đang active
    for (const role of roles) {
      if (role === priorityRole) continue;
      const userStr = localStorage.getItem(`${role}_user`);
      if (userStr && localStorage.getItem(`${role}_access_token`)) {
        return JSON.parse(userStr);
      }
    }
    return null;
  } catch { return null; }
};

const saveSession = (user) => {
  if (!user) return;
  const key = user.adminRole === 'STAFF' || user.role === 'staff' ? 'staff' : (user.role || 'admin');
  localStorage.setItem(`${key}_user`, JSON.stringify(user));
};

// ── Protected Route ───────────────────────────────────────────────────────────
const Guard = ({ allowedRoles, session, children }) => {
  const { showModal } = useModal();
  const location = useLocation();
  const sStatus = String(session?.status || '').toLowerCase();
  const isOnTeacherTest = session?.role === 'teacher' && location.pathname.includes('/teacher/test');
  const isTeacherExamOnly = session?.role === 'teacher' && ['pending', 'locked'].includes(sStatus);

  const isBanned = session?.isLocked === true || session?.exam_status === 'failed' || ['locked', 'failed', 'suspended'].includes(sStatus);
  const isInactive = session?.role === 'teacher' && sStatus === 'inactive';
  // GV pending/locked: vào /teacher/test xem tiến trình — không kick ra login
  const mustKick = !!(session && !isOnTeacherTest && !isTeacherExamOnly && (isBanned || isInactive) && session.role !== 'admin');

  // Dọn phiên server khi bị kick — tránh báo “đăng nhập máy khác” khi vào lại
  useEffect(() => {
    if (!mustKick || !session) return;
    const deviceId = localStorage.getItem('cms_device_id_v1') || getDeviceFingerprint();
    const role = session.role;
    let reason = session.lockReason || 'Tài khoản của bạn đã bị khóa do vi phạm hoặc bài thi KHÔNG ĐẠT.';
    if (isInactive) reason = 'Tài khoản chưa được cấp quyền đăng nhập. Vui lòng đợi Admin thao tác hoặc liên hệ lại.';
    localStorage.setItem(`${role}_ban_error`, reason);

    if (!localStorage.getItem('alerted_ban')) {
      showModal({
        title: 'Hệ thống thông báo',
        content: reason,
        type: 'warning',
        confirmText: 'Tôi đã hiểu',
      });
      localStorage.setItem('alerted_ban', 'true');
    }

    (async () => {
      try { await api.auth.logout(); } catch { /* ignore */ }
      clearTokens(role);
      localStorage.removeItem(`${role}_user`);
      if (deviceId) localStorage.setItem('cms_device_id_v1', deviceId);
    })();
  }, [mustKick, session, isInactive, showModal]);

  if (!session) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(session.role)) return <Navigate to="/login" replace />;

  if (mustKick) {
    return <Navigate to="/login" replace />;
  }
  localStorage.removeItem('alerted_ban');

  // GV pending/locked: chỉ được /teacher/test (và feed nếu mở từ menu)
  if (isTeacherExamOnly) {
    const p = location.pathname || '';
    const allowed = p === '/teacher/test' || p.startsWith('/teacher/test/');
    if (!allowed) {
      return <Navigate to="/teacher/test" replace />;
    }
  }

  return children;
};

/** Chặn deep-link trang admin khi STAFF thiếu quyền (menu đã ẩn nhưng URL vẫn mở được). */
const PermissionGuard = ({ session, permission, anyOf, superAdminOnly, children, fallback = '/admin' }) => {
  const isSuper = session?.id === 'admin' || session?.adminRole === 'SUPER_ADMIN';
  if (superAdminOnly && !isSuper) return <Navigate to={fallback} replace />;
  if (anyOf?.length) {
    if (!anyOf.some((p) => hasPermission(session, p))) return <Navigate to={fallback} replace />;
  } else if (permission && !hasPermission(session, permission)) {
    return <Navigate to={fallback} replace />;
  }
  return children;
};

// ── Student exam wrappers ─────────────────────────────────────────────────────
function StudentExamWrapper({ session }) {
  const nav = useNavigate();
  return (
    <ErrorBoundary inline>
      <StudentExamRoom
        onNavigate={(page) => nav(page === 'register' ? '/dangkykhoahoc' : `/${page}`)}
        onStartExam={(subjectId) => nav(`/student/exam/${subjectId}`)}
      />
    </ErrorBoundary>
  );
}

function StudentTestWrapper({ session }) {
  const { subjectId } = useParams();
  const nav = useNavigate();
  const allowStartExam = useIsDesktopExamDevice();

  if (!allowStartExam) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] overflow-hidden flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white rounded-2xl border border-amber-200 shadow-sm p-6 text-center">
          <p className="text-lg font-bold text-slate-900">Thi chỉ dành cho máy tính</p>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Điện thoại và máy tính bảng không được làm bài thi. Bạn vẫn xem điểm tại Phòng thi.
          </p>
          <button
            type="button"
            onClick={() => nav('/student/exam')}
            className="mt-5 w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm"
          >
            Về Phòng thi (xem điểm)
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
        <StudentTest
          subjectId={subjectId || 'word'}
          studentSbd={session?.phone || session?.sbd || '---'}
          studentName={session?.name || 'Học viên'}
          onBack={() => nav('/student/exam')}
        />
      </div>
    </ErrorBoundary>
  );
}

// ── Main Routes ───────────────────────────────────────────────────────────────
function AppRoutes({ session, onSessionChange, isAuthLoading, onLogin, onLogout }) {
  const nav = useNavigate();

  const go = useCallback((page, data) => {
    const routes = {
      register: '/dangkykhoahoc',
      login:    '/login',
      admin:    '/admin',
      teacher:  '/teacher',
      student:  '/student',
      finance:  '/teacher/finance',
      inbox:    session?.role === 'student' ? '/student/inbox'
              : session?.role === 'admin'   ? '/admin/inbox'
              :                               '/teacher/inbox',
      test:     '/teacher/test',
    };
    nav(routes[page] || '/', { state: data });
  }, [nav, session]);

  // Hiển thị loading khi đang verify token
  if (isAuthLoading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{
          width: '44px', height: '44px', border: '3px solid #1e293b',
          borderTop: '3px solid #3b82f6', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Đang xác thực...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}><Routes>
      {/* ═══ Public ═══ */}
      <Route path="/"            element={<LoginPage onLogin={onLogin} />} />
      <Route path="/login"       element={<LoginPage onLogin={onLogin} />} />
      <Route path="/admin/login" element={<AdminLoginPage onLogin={onLogin} />} />
      <Route path="/dangkykhoahoc" element={<RegistrationForm onNavigate={go} />} />
      <Route path="/pay/:sessionId" element={<Suspense fallback={<LoadingScreen />}><PublicPaymentPage /></Suspense>} />

      {/* ═══ Admin ═══ */}
      <Route element={
      <Guard allowedRoles={['admin', 'staff']} session={session}>
          <DashboardLayout role="admin" session={session} onLogout={onLogout} />
        </Guard>
      }>
        <Route path="/admin"       element={<ErrorBoundary inline><AdminDashboard onNavigate={go} /></ErrorBoundary>} />
        <Route path="/admin/notifications" element={
          <ErrorBoundary inline><NotificationCenterPage role="admin" session={session} /></ErrorBoundary>
        } />
        <Route path="/admin/files" element={
          <PermissionGuard session={session} permission={PERMISSIONS.SYSTEM_SETTINGS}>
            <ErrorBoundary inline><FileCenterPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/backups" element={
          <PermissionGuard session={session} superAdminOnly>
            <ErrorBoundary inline><BackupCenterPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/monitoring" element={
          <PermissionGuard session={session} permission={PERMISSIONS.VIEW_LOGS}>
            <ErrorBoundary inline><MonitoringPage session={session} /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/ai" element={
          <PermissionGuard session={session} permission={PERMISSIONS.SYSTEM_SETTINGS}>
            <ErrorBoundary inline><AiCenterPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/bi" element={
          <PermissionGuard
            session={session}
            anyOf={[PERMISSIONS.MANAGE_FINANCE, PERMISSIONS.VIEW_BRANCH_REVENUE]}
          >
            <ErrorBoundary inline><BiDashboardPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/workflows" element={
          <PermissionGuard session={session} permission={PERMISSIONS.SYSTEM_SETTINGS}>
            <ErrorBoundary inline><WorkflowCenterPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/builder" element={
          <PermissionGuard session={session} permission={PERMISSIONS.SYSTEM_SETTINGS}>
            <ErrorBoundary inline><FormReportBuilderPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/tenants" element={
          <PermissionGuard session={session} superAdminOnly>
            <ErrorBoundary inline><TenantManagementPage /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/inbox" element={
          <PermissionGuard session={session} permission={PERMISSIONS.MANAGE_MESSAGES}>
            <ErrorBoundary inline>
              <Inbox 
                currentUserId={session?.id} 
                currentUserName={session?.name} 
                currentUserRole={getMessagingRole(session)} 
                onNavigate={go} 
              />
            </ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/feed" element={
          <PermissionGuard session={session} anyOf={[PERMISSIONS.MANAGE_MESSAGES, PERMISSIONS.MANAGE_STUDENTS, PERMISSIONS.VIEW_TEACHERS]}>
            <ErrorBoundary inline><FeedBoard session={session} role="admin" /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/news" element={
          <PermissionGuard session={session} anyOf={[PERMISSIONS.MANAGE_BLOG, PERMISSIONS.MANAGE_MESSAGES, PERMISSIONS.VIEW_TEACHERS]}>
            <ErrorBoundary inline><NewsPage session={session} role="admin" /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/news/:slug" element={
          <PermissionGuard session={session} anyOf={[PERMISSIONS.MANAGE_BLOG, PERMISSIONS.MANAGE_MESSAGES, PERMISSIONS.VIEW_TEACHERS]}>
            <ErrorBoundary inline><NewsPage session={session} role="admin" /></ErrorBoundary>
          </PermissionGuard>
        } />
        <Route path="/admin/center-info" element={
          <ErrorBoundary inline><CenterInfoPage session={session} role="admin" /></ErrorBoundary>
        } />
        <Route path="/admin/center-info/manage" element={
          <PermissionGuard session={session} anyOf={[PERMISSIONS.MANAGE_CENTER_INFO]}>
            <ErrorBoundary inline><CenterInfoManagePage /></ErrorBoundary>
          </PermissionGuard>
        } />
      </Route>

      {/* ═══ Teacher ═══ */}
      <Route element={
        <Guard allowedRoles={['teacher', 'admin']} session={session}>
          <DashboardLayout role="teacher" session={session} onLogout={onLogout} />
        </Guard>
      }>
        <Route path="/teacher"         element={<ErrorBoundary inline><TeacherDashboard onNavigate={go} /></ErrorBoundary>} />
        <Route path="/teacher/finance" element={<ErrorBoundary inline><TeacherFinanceAndTraining onNavigate={go} /></ErrorBoundary>} />
        <Route path="/teacher/notifications" element={
          <ErrorBoundary inline><NotificationCenterPage role="teacher" session={session} /></ErrorBoundary>
        } />
        <Route path="/teacher/inbox"   element={
          <ErrorBoundary inline>
            <Inbox currentUserId={session?.id} currentUserName={session?.name} currentUserRole={getMessagingRole(session)} onNavigate={go} />
          </ErrorBoundary>
        } />
        <Route path="/teacher/feed" element={
          <ErrorBoundary inline><FeedBoard session={session} role="teacher" /></ErrorBoundary>
        } />
        <Route path="/teacher/news" element={
          <ErrorBoundary inline><NewsPage session={session} role="teacher" /></ErrorBoundary>
        } />
        <Route path="/teacher/news/:slug" element={
          <ErrorBoundary inline><NewsPage session={session} role="teacher" /></ErrorBoundary>
        } />
        <Route path="/teacher/center-info" element={
          <ErrorBoundary inline><CenterInfoPage session={session} role="teacher" /></ErrorBoundary>
        } />
        <Route path="/teacher/test"    element={
          <ErrorBoundary>
            <TeacherTest teacherName={session?.name || 'Giảng Viên'} onBack={() => nav('/teacher')} />
          </ErrorBoundary>
        } />
      </Route>

      {/* ═══ Student ═══ */}
      <Route element={
        <Guard allowedRoles={['student', 'admin']} session={session}>
          <StudentLearningAccessGate session={session}>
            <DashboardLayout role="student" session={session} onLogout={onLogout} />
          </StudentLearningAccessGate>
        </Guard>
      }>
        <Route path="/student" element={
          <ErrorBoundary inline>
            <StudentDashboard onNavigate={go} />
          </ErrorBoundary>
        } />
        <Route path="/student/exam" element={
          <ErrorBoundary inline>
            <StudentExamWrapper session={session} />
          </ErrorBoundary>
        } />
        <Route path="/student/notifications" element={
          <ErrorBoundary inline><NotificationCenterPage role="student" session={session} /></ErrorBoundary>
        } />
        <Route path="/student/inbox" element={
          <ErrorBoundary inline>
            <Inbox currentUserId={session?.id} currentUserName={session?.name} currentUserRole={getMessagingRole(session)} onNavigate={go} />
          </ErrorBoundary>
        } />
        <Route path="/student/feed" element={
          <ErrorBoundary inline><FeedBoard session={session} role="student" /></ErrorBoundary>
        } />
        <Route path="/student/news" element={
          <ErrorBoundary inline><NewsPage session={session} role="student" /></ErrorBoundary>
        } />
        <Route path="/student/news/:slug" element={
          <ErrorBoundary inline><NewsPage session={session} role="student" /></ErrorBoundary>
        } />
        <Route path="/student/center-info" element={
          <ErrorBoundary inline><CenterInfoPage session={session} role="student" /></ErrorBoundary>
        } />
        <Route path="/student/cert-prep" element={
          <ErrorBoundary inline>
            <CertPrepCatalogPage />
          </ErrorBoundary>
        } />
        <Route path="/student/cert-prep/levels/:levelId" element={
          <ErrorBoundary inline>
            <CertPrepLevelPage />
          </ErrorBoundary>
        } />
        <Route path="/student/cert-prep/result/:sessionId" element={
          <ErrorBoundary inline>
            <CertPrepResult />
          </ErrorBoundary>
        } />
      </Route>

      {/* ═══ Fullscreen Exam (chỉ khi vào làm bài) ═══ */}
      <Route path="/student/exam/quiz" element={<Navigate to="/student/exam" replace />} />
      <Route path="/student/exam/cert" element={<Navigate to="/student/exam" replace />} />
      <Route path="/student/exam/:subjectId" element={
        <Guard allowedRoles={['student', 'admin']} session={session}>
          <StudentLearningAccessGate session={session} allowHashes={[]}>
            <StudentTestWrapper session={session} />
          </StudentLearningAccessGate>
        </Guard>
      } />

      <Route path="/student/cert-prep/play/:sessionId" element={
        <Guard allowedRoles={['student', 'admin']} session={session}>
          <StudentLearningAccessGate session={session} allowHashes={[]}>
            <ErrorBoundary inline>
              <CertPrepStudentPlayer />
            </ErrorBoundary>
          </StudentLearningAccessGate>
        </Guard>
      } />

      {/* ═══ Fallback ═══ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  );
}

// ── Inactivity Warning Overlay ────────────────────────────────────────────────
function InactivityWarning({ visible, secondsLeft, onExtend, onLogout }) {
  if (!visible) return null;
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: '#1e293b', borderRadius: '1.5rem', maxWidth: '400px', width: '100%',
        border: '1px solid rgba(234,179,8,0.4)', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ background: 'linear-gradient(135deg,#ca8a04,#b45309)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.2)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>⏰</div>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 900, fontSize: '1rem', margin: 0 }}>Phiên sắp hết hạn</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', margin: 0 }}>Bạn không tương tác trong 55 phút qua</p>
          </div>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '1rem', padding: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#fde047', fontWeight: 900, fontSize: '2.5rem', margin: 0, fontFamily: 'monospace' }}>{mins}:{secs}</p>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>Tự động đăng xuất sau thời gian trên</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onLogout} style={{
              flex: 1, padding: '0.75rem', background: 'transparent', border: '2px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontWeight: 700, borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.875rem',
            }}>Đăng xuất ngay</button>
            <button onClick={onExtend} style={{
              flex: 2, padding: '0.75rem', background: 'linear-gradient(135deg,#ca8a04,#b45309)',
              border: 'none', color: '#fff', fontWeight: 900, borderRadius: '0.75rem',
              cursor: 'pointer', fontSize: '0.875rem',
            }}>✅ Tiếp tục làm việc</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

import { useToast } from './utils/toast.jsx';
function GlobalApiErrorHandler() {
  const toast = useToast();
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail?.message || 'Lỗi API';
      const status = e.detail?.status;
      if (status === 403 || status >= 500) {
        toast.error(msg);
      }
    };
    window.addEventListener('cms:api-error', handler);
    return () => window.removeEventListener('cms:api-error', handler);
  }, [toast]);
  return null;
}

function App() {
  const [session, setSession]           = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const navigate = useNavigate();

  // ── Inactivity Timer: tự động logout sau 60 phút không dùng ────────────────
  const handleInactivityLogout = useCallback(async () => {
    // Đang offline → không logout (tránh đá user khi mạng tụt giữa phiên)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const deviceId = localStorage.getItem('cms_device_id_v1') || getDeviceFingerprint();
    const loginAlerts = snapshotLoginAlertStorage();
    const role = session?.role;
    try { await api.auth.logout(); } catch { /* ignore */ }
    if (role) clearTokens(role);
    localStorage.clear();
    sessionStorage.clear();
    if (deviceId) localStorage.setItem('cms_device_id_v1', deviceId);
    restoreLoginAlertStorage(loginAlerts);
    setSession(null);
    navigate('/login?msg=inactivity');
  }, [navigate, session]);

  const { warningVisible, secondsLeft, extendSession } = useInactivityTimer({
    onLogout: handleInactivityLogout,
    enabled: !!session, // Chỉ kích hoạt khi đã đăng nhập
  });

  // Mở khóa AudioContext sau tương tác đầu tiên (Chrome/Safari yêu cầu)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ── Khôi phục session khi reload ──────────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      const savedUser = loadSession();

      if (!savedUser) {
        setIsAuthLoading(false);
        return;
      }

      try {
        const res = await api.auth.me();
        
        if (res.success && res.data) {
          // /me cũ có thể thiếu key gender → không xóa gender đã có trong session
          const freshUser = {
            ...savedUser,
            ...res.data,
            gender: Object.prototype.hasOwnProperty.call(res.data, 'gender')
              ? (res.data.gender || savedUser.gender || '')
              : (savedUser.gender || ''),
            avatar: Object.prototype.hasOwnProperty.call(res.data, 'avatar')
              ? (res.data.avatar || savedUser.avatar || '')
              : (savedUser.avatar || ''),
          };
          setSession(freshUser);
          saveSession(freshUser);
        } else {
          clearTokens(savedUser.role);
          setSession(null);
        }
      } catch (err) {
        // Mất mạng / server unreachable → giữ phiên local, không đá về login
        if (err?.name === 'NetworkOfflineError' || err instanceof NetworkOfflineError || err?.isNetworkError) {
          setSession(savedUser);
        } else if (err.status === 401) {
          clearTokens(savedUser.role);
          setSession(null);
        } else {
          setSession(savedUser);
        }
      } finally {
        setIsAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Sidebar / modal có thể patch session (gender, isFirstLogin, welcome…) vào localStorage
  useEffect(() => {
    const onPatched = (e) => {
      const patched = e?.detail;
      if (!patched) return;
      setSession((prev) => {
        if (!prev) return prev;
        if (String(prev.id || prev._id) !== String(patched.id || patched._id)) return prev;
        const next = { ...prev, ...patched };
        // Giữ id/_id ổn định
        next.id = prev.id || prev._id;
        next._id = prev._id || prev.id;
        try {
          const key = `${prev.role || 'student'}_user`;
          localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) || '{}'), ...next }));
        } catch { /* ignore */ }
        return next;
      });
    };
    window.addEventListener('cms:session-patched', onPatched);
    return () => window.removeEventListener('cms:session-patched', onPatched);
  }, []);

  const handleLogout = useCallback(async () => {
    if (!session) {
      navigate('/login');
      return;
    }
    const deviceId = localStorage.getItem('cms_device_id_v1') || getDeviceFingerprint();
    const loginAlerts = snapshotLoginAlertStorage();
    const role = session.role;
    try { await api.auth.logout(); } catch { /* ignore */ }
    clearTokens(role);
    localStorage.clear();
    sessionStorage.clear();
    if (deviceId) localStorage.setItem('cms_device_id_v1', deviceId);
    restoreLoginAlertStorage(loginAlerts);
    setSession(null);
    navigate('/login');
  }, [navigate, session]);

  const handleLogin = useCallback((account) => {
    // ⭐ Fix: Login mới thì dọn dẹp sạch sẽ session cũ của role khác để tránh xung đột
    // (VD: Đã từng login Admin thì xóa admin_user khi login Teacher)
    const roles = ['admin', 'staff', 'teacher', 'student'];
    roles.forEach(r => {
       if (r !== account.role) {
         localStorage.removeItem(`${r}_user`);
         localStorage.removeItem(`${r}_access_token`);
         localStorage.removeItem(`${r}_refresh_token`);
       }
    });

    // Xóa thời gian không hoạt động cũ để tránh bị văng ngay lần đăng nhập đầu tiên
    localStorage.removeItem('last_activity_at');

    saveSession(account);
    setSession(account);
    const teacherHome = String(account.status || '').toLowerCase() === 'active' ? '/teacher' : '/teacher/test';
    const redirects = { admin: '/admin', staff: '/admin', teacher: teacherHome, student: '/student' };
    navigate(redirects[account.role] || '/');
  }, [navigate]);

  const handleSessionChange = useCallback((newSession) => {
    setSession(newSession);
    saveSession(newSession);
  }, []);

  return (
    <ErrorBoundary>
        <LoadingScreen />
        <OfflineBanner />
        {/* ── Cảnh báo sắp hết phiên (5 phút cuối) ── */}
        <InactivityWarning
          visible={warningVisible}
          secondsLeft={secondsLeft}
          onExtend={extendSession}
          onLogout={handleInactivityLogout}
        />
        <SocketProvider
          userId={session ? (session.id || session._id) : ''}
          role={getMessagingRole(session) || session?.role || ''}
          adminRole={session?.adminRole || ''}
          name={session?.name || ''}
          token={session?.token || session?.accessToken || ''}
        >
          <ModalProvider>
            <SecurityGuard />
            <FaviconSwitcher />
            <StudentsProvider user={session}>
            <TeachersProvider user={session}>
            <ScheduleProvider user={session}>
            <FinanceProvider user={session}>
            <DataProvider key={session?.id || 'guest'} user={session} onLogout={handleLogout}>
                <BranchProvider session={session}>
                <ToastProvider>
                    <GlobalApiErrorHandler />
                      <AppRoutes
                        session={session}
                        onSessionChange={handleSessionChange}
                        isAuthLoading={isAuthLoading}
                        onLogin={handleLogin}
                        onLogout={handleLogout}
                    />
                    {/* Popup thông báo — Nhân viên (cùng cấu hình với tab Popup) */}
                    {session?.role === 'staff' && <PopupBanner role="staff" />}
                </ToastProvider>
                </BranchProvider>
            </DataProvider>
            </FinanceProvider>
            </ScheduleProvider>
            </TeachersProvider>
            </StudentsProvider>
          </ModalProvider>
        </SocketProvider>
    </ErrorBoundary>
  );
}

export default App;
