import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useCallback, lazy, Suspense }  from 'react';
import { SocketProvider }                    from './context/SocketContext';
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
const PublicPaymentPage = lazy(() => import('./components/PublicPaymentPage'));
import DashboardLayout                       from './components/DashboardLayout';
import api, { clearTokens, getRolePrefix } from './services/api';
import { BranchProvider }                    from './context/BranchContext';
import LoadingScreen                         from './components/LoadingScreen';
import StaffPopup                            from './components/StaffPopup';
import { ModalProvider, useModal }           from './utils/Modal.jsx';
import SecurityGuard                         from './components/SecurityGuard';
import { useInactivityTimer }                from './utils/useInactivityTimer';
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
    if (priorityRole) {
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
  
    const { showModal } = useModal();

    if ((isBanned || isPendingGrade || isInactive) && session.role !== 'admin') {
      let reason = session.lockReason || 'Tài khoản của bạn đã bị khóa do vi phạm hoặc bài thi KHÔNG ĐẠT.';
      if (isPendingGrade) reason = 'Bạn đã hoàn thành bài thi. Vui lòng chờ Admin chấm điểm, kết quả sẽ được thông báo lại qua Zalo của bạn.';
      if (isInactive) reason = 'Tài khoản chưa được cấp quyền đăng nhập. Vui lòng đợi Admin thao tác hoặc liên hệ lại.';
      
      // Chỉ hiện thông báo 1 lần trước khi redirect
      if (!localStorage.getItem('alerted_ban')) {
        showModal({
            title: 'Hệ thống thông báo',
            content: reason,
            type: 'warning',
            confirmText: 'Tôi đã hiểu'
        });
        localStorage.setItem('alerted_ban', 'true');
      }

      localStorage.setItem(`${session.role}_ban_error`, reason);
      clearTokens(session.role);
      localStorage.removeItem(`${session.role}_user`);
      return <Navigate to="/login" replace />;
    }
  localStorage.removeItem('alerted_ban');


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
  return (
    <ErrorBoundary>
      <StudentTest
        subjectId={subjectId || 'word'}
        studentSbd={session?.phone || session?.sbd || '---'}
        studentName={session?.name || 'Học viên'}
        onBack={() => nav('/student/exam')}
      />
    </ErrorBoundary>
  );
}

// ── Main Routes ───────────────────────────────────────────────────────────────
function AppRoutes({ session, onSessionChange, isAuthLoading, onLogin, onLogout }) {
  const nav = useNavigate();

  const go = useCallback((page, data) => {
    const routes = {
      register: '/dangkykhoahoc',
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
        <Route path="/admin/inbox" element={
          <ErrorBoundary inline>
            <Inbox 
              currentUserId={session?.id} 
              currentUserName={session?.name} 
              currentUserRole={session?.role === 'staff' ? 'admin' : session?.role} 
              onNavigate={go} 
            />
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
function App() {
  const [session, setSession]           = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const navigate = useNavigate();

  // ── Inactivity Timer: tự động logout sau 60 phút không dùng ────────────────
  const handleInactivityLogout = useCallback(() => {
    api.auth.logout().catch(() => {});
    clearTokens(session?.role);
    localStorage.clear();
    sessionStorage.clear();
    navigate('/login?msg=inactivity');
  }, [navigate, session]);

  const { warningVisible, secondsLeft, extendSession } = useInactivityTimer({
    onLogout: handleInactivityLogout,
    enabled: !!session, // Chỉ kích hoạt khi đã đăng nhập
  });

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
          const freshUser = { ...savedUser, ...res.data };
          setSession(freshUser);
          saveSession(freshUser);
        } else {
          clearTokens(savedUser.role);
          setSession(null);
        }
      } catch (err) {
        if (err.status === 401) {
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
        {/* ── Cảnh báo sắp hết phiên (5 phút cuối) ── */}
        <InactivityWarning
          visible={warningVisible}
          secondsLeft={secondsLeft}
          onExtend={extendSession}
          onLogout={handleInactivityLogout}
        />
        <SocketProvider
          userId={session ? (session.id || session._id) : ''}
          role={session?.role || ''}
          name={session?.name || ''}
          token={session?.token || session?.accessToken || ''}
        >
          <ModalProvider>
            <SecurityGuard />
            <DataProvider key={session?.id || 'guest'} user={session} onLogout={handleLogout}>
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
          </ModalProvider>
        </SocketProvider>
    </ErrorBoundary>
  );
}

export default App;
