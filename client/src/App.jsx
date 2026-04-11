import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useCallback }  from 'react';
import { SocketProvider }                    from './context/SocketContext';
import { DataProvider, useData }             from './context/DataContext';
import { ToastProvider }                     from './utils/toast.jsx';
import ErrorBoundary                         from './components/ErrorBoundary';
import LoginPage                             from './components/LoginPage';
import AdminLoginPage                        from './components/AdminLoginPage';
import RegistrationForm                      from './components/RegistrationForm';
import AdminDashboard                        from './components/AdminDashboard';
import TeacherDashboard                      from './components/TeacherDashboard';
import StudentDashboard                      from './components/StudentDashboard';
import StudentExamRoom                       from './components/StudentExamRoom';
import StudentTest                           from './components/StudentTest';
import TeacherTest                           from './components/TeacherTest';
import TeacherFinanceAndTraining             from './components/TeacherFinanceAndTraining';
import Inbox                                 from './components/Inbox';
import DashboardLayout                       from './components/DashboardLayout';
import api, { clearTokens, getRolePrefix } from './services/api';
import { BranchProvider }                    from './context/BranchContext';
import LoadingScreen                         from './components/LoadingScreen';
import StaffPopup                            from './components/StaffPopup';
import './App.css';

// ── Session helpers ──────────────────────────────────────────────────────────

const loadSession = () => {
  try {
    // Ưu tiên quét tìm bất kỳ Role nào đang có Token active
    const roles = ['admin', 'staff', 'teacher', 'student'];
    for (const role of roles) {
      const userStr = localStorage.getItem(`${role}_user`);
      if (userStr) {
        const user = JSON.parse(userStr);
        if (localStorage.getItem(`${role}_access_token`) || user.token) {
          return user;
        }
      }
    }
    return null;
  } catch { return null; }
};

const saveSession = (user) => {
  if (user && user.role) {
    localStorage.setItem(`${user.role}_user`, JSON.stringify(user));
  }
};

// ── Protected Route ───────────────────────────────────────────────────────────
const Guard = ({ allowedRoles, session, children }) => {
  if (!session) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(session.role)) return <Navigate to="/login" replace />;

  // ── Global Anti-cheat / Ban Check ──
  const sStatus = String(session.status || '').toLowerCase();
  const isBanned = session.isLocked === true || session.exam_status === 'failed' || ['locked', 'failed', 'suspended'].includes(sStatus);
  const isPendingGrade = session.role === 'teacher' && session.practicalStatus === 'submitted' && sStatus !== 'active';
  const isInactive = session.role === 'teacher' && sStatus === 'inactive';
  
  if ((isBanned || isPendingGrade || isInactive) && session.role !== 'admin') {
    let reason = session.lockReason || 'Tài khoản của bạn đã bị khóa do vi phạm hoặc bài thi KHÔNG ĐẠT.';
    if (isPendingGrade) reason = 'Bạn đã hoàn thành bài thi. Vui lòng chờ Admin chấm điểm, kết quả sẽ được thông báo lại qua Zalo của bạn.';
    if (isInactive) reason = 'Tài khoản chưa được cấp quyền đăng nhập. Vui lòng đợi Admin thao tác hoặc liên hệ lại.';
    
    localStorage.setItem(`${session.role}_ban_error`, reason);
    clearTokens(session.role);
    return <Navigate to="/login" replace />;
  }

  return children;
};

// ── Student exam wrappers ─────────────────────────────────────────────────────
function StudentExamWrapper({ session }) {
  const nav = useNavigate();
  return (
    <ErrorBoundary inline>
      <StudentExamRoom
        onNavigate={(page) => nav(page === 'register' ? '/' : `/${page}`)}
        onStartExam={(subjectId) => nav(`/student/exam/${subjectId}`)}
      />
    </ErrorBoundary>
  );
}

function StudentTestWrapper({ session }) {
  const { subjectId } = useParams();
  const nav = useNavigate();
  return (
    <ErrorBoundary>
      <StudentTest
        subjectId={subjectId || 'word'}
        studentSbd={session?.sbd || '11111'}
        studentName={session?.name || 'Học viên'}
        onBack={() => nav('/student/exam')}
      />
    </ErrorBoundary>
  );
}

// ── Main Routes ───────────────────────────────────────────────────────────────
function AppRoutes({ session, onSessionChange, isAuthLoading, onLogin, onLogout }) {
  const nav = useNavigate();

  const go = useCallback((page) => {
    const routes = {
      register: '/',
      admin:    '/admin',
      teacher:  '/teacher',
      student:  '/student',
      finance:  '/teacher/finance',
      inbox:    session?.role === 'student' ? '/student/inbox'
              : session?.role === 'admin'   ? '/admin/inbox'
              :                               '/teacher/inbox',
      test:     '/teacher/test',
    };
    nav(routes[page] || '/');
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
    <Routes>
      {/* ═══ Public ═══ */}
      <Route path="/login"       element={<LoginPage onLogin={onLogin} />} />
      <Route path="/admin/login" element={<AdminLoginPage onLogin={onLogin} />} />
      <Route path="/"            element={<RegistrationForm onNavigate={go} />} />

      {/* ═══ Admin ═══ */}
      <Route element={
      <Guard allowedRoles={['admin', 'staff']} session={session}>
          <DashboardLayout role="admin" session={session} onLogout={onLogout} />
        </Guard>
      }>
        <Route path="/admin"       element={<ErrorBoundary inline><AdminDashboard onNavigate={go} /></ErrorBoundary>} />
        <Route path="/admin/inbox" element={
          <ErrorBoundary inline>
            <Inbox currentUserId={session?.id} currentUserName={session?.name} currentUserRole={session?.role} onNavigate={go} />
          </ErrorBoundary>
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
        <Route path="/teacher/inbox"   element={
          <ErrorBoundary inline>
            <Inbox currentUserId={session?.id} currentUserName={session?.name} currentUserRole={session?.role} onNavigate={go} />
          </ErrorBoundary>
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
          <DashboardLayout role="student" session={session} onLogout={onLogout} />
        </Guard>
      }>
        <Route path="/student"      element={<ErrorBoundary inline><StudentDashboard onNavigate={go} /></ErrorBoundary>} />
        <Route path="/student/exam" element={<StudentExamWrapper session={session} />} />
        <Route path="/student/inbox" element={
          <ErrorBoundary inline>
            <Inbox currentUserId={session?.id} currentUserName={session?.name} currentUserRole={session?.role} onNavigate={go} />
          </ErrorBoundary>
        } />
      </Route>

      {/* ═══ Fullscreen Exam (không sidebar) ═══ */}
      <Route path="/student/exam/:subjectId" element={
        <Guard allowedRoles={['student', 'admin']} session={session}>
          <StudentTestWrapper session={session} />
        </Guard>
      } />

      {/* ═══ Fallback ═══ */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [session, setSession]           = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const navigate = useNavigate();

  // ── Khôi phục session khi reload ──────────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      const savedUser = loadSession();
      console.log('[Auth] Initializing session restoration...', { hasSavedUser: !!savedUser });

      if (!savedUser) {
        console.log('[Auth] No saved session found.');
        setIsAuthLoading(false);
        return;
      }

      try {
        console.log('[Auth] Verifying session with server...', { role: savedUser.role });
        const res = await api.auth.me();
        
        if (res.success && res.data) {
          console.log('[Auth] Session verified successfully.');
          const freshUser = { ...savedUser, ...res.data };
          setSession(freshUser);
          saveSession(freshUser);
        } else {
          console.warn('[Auth] Server rejected session:', res.message);
          clearTokens(savedUser.role);
          setSession(null);
        }
      } catch (err) {
        console.error('[Auth] Restoration error:', err);
        if (err.status === 401) {
          clearTokens(savedUser.role);
          setSession(null);
        } else {
          console.log('[Auth] Network error, falling back to cached session.');
          setSession(savedUser);
        }
      } finally {
        setIsAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  const handleLogout = useCallback(() => {
    setSession(prev => {
      if (prev) {
        // ⭐ Fix 3: Gọi backend logout → blacklist access token
        api.auth.logout().catch(() => {});

        // ⭐ Fix 2: Xóa SẠCH toàn bộ cache → chống chia sẻ tài khoản / máy dùng chung
        clearTokens(prev.role);
        localStorage.clear();        // Xóa sạch mọi dữ liệu cache
        sessionStorage.clear();      // Xóa sạch session storage

        setSession(null);
        navigate('/login');
        return null;
      }
      return prev;
    });
  }, [navigate]);

  const handleLogin = useCallback((account) => {
    saveSession(account);
    setSession(account);
    // 'staff' role dùng chung dashboard với admin
    const redirects = { admin: '/admin', staff: '/admin', teacher: '/teacher', student: '/student' };
    navigate(redirects[account.role] || '/');
  }, [navigate]);

  const handleSessionChange = useCallback((newSession) => {
    setSession(newSession);
    saveSession(newSession);
  }, []);

  return (
    <ErrorBoundary>
        <LoadingScreen />
        <SocketProvider
          userId={session ? `${session.role}_${session.id}` : ''}
          role={session?.role || ''}
          name={session?.name || ''}
        >
          <DataProvider user={session} onLogout={handleLogout}>
            <BranchProvider session={session}>
              <ToastProvider>
                  <AppRoutes
                    session={session}
                    onSessionChange={handleSessionChange}
                    isAuthLoading={isAuthLoading}
                    onLogin={handleLogin}
                    onLogout={handleLogout}
                  />
                  {/* Staff Popup — chỉ hiện cho nhân viên chi nhánh */}
                  {session && <StaffPopup session={session} />}
              </ToastProvider>
            </BranchProvider>
          </DataProvider>
        </SocketProvider>
    </ErrorBoundary>
  );
}

export default App;
