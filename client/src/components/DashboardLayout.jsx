import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import BranchFilterDropdown from './BranchFilterDropdown';
import { useData } from '../context/DataContext';
import { Bell, Search, User, LogOut, CheckCircle2, Clock, X, ChevronRight } from 'lucide-react';

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date); // Fallback to raw string if invalid
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 0) return 'Vừa xong'; // Future date fallback
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

// ═══════════════════════════════════════════════════════════════════════════════
// DashboardLayout — Sidebar cố định, nội dung thay đổi qua <Outlet>
// ═══════════════════════════════════════════════════════════════════════════════
// Sidebar luôn hiển thị cố định bên trái.
// Khi bấm menu item → navigate đến route tương ứng → chỉ phần <Outlet> thay đổi.
// Sidebar KHÔNG bị mất.

const DashboardLayout = ({ role, session, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { teachers } = useData();
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // ── Auto-refresh token nếu session cũ không có token ─────────────────────
  useEffect(() => {
    const key = `${role}_user`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (stored && !stored.token && session?.sbd) {
        // Session cũ không có token → lấy token từ refreshToken nếu có
        if (stored.refreshToken) {
          fetch(`${API}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          }).then(r => r.json()).then(res => {
            if (res.success && res.accessToken) {
              localStorage.setItem(key, JSON.stringify({ ...stored, token: res.accessToken }));
            }
          }).catch(() => {});
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect if current teacher is still pending — đọc từ DataContext (live state)
  const currentTeacher = role === 'teacher' && session?.id
    ? teachers.find(t => String(t.id) === String(session.id))
    : null;

  const isTeacherPending = role === 'teacher' && session?.id ? (
    currentTeacher
      ? String(currentTeacher.status || '').toLowerCase() !== 'active'
      : String(session?.status || '').toLowerCase() !== 'active'
  ) : false;

  // ── HARD GUARD: GV bị chặn (Inactive/Locked/không hợp lệ) → kick ra ngay ──
  // Dù bypass URL hay session cũ, vẫn bị đá ra
  // NGOẠI TRỪ: đang ở trang thi /teacher/test → cho xem kết quả trước
  useEffect(() => {
    if (role !== 'teacher' || !session?.id) return;
    
    // Nếu đang ở trang thi, không kick ra → để GV xem kết quả
    if (window.location.pathname === '/teacher/test') return;
    
    const allowed = ['pending', 'active'];
    const s = String(currentTeacher?.status || session?.status || '').toLowerCase();
    
    if (!allowed.includes(s)) {
      localStorage.setItem('thvp_ban_error', currentTeacher?.lockReason || session?.lockReason || 'Tài khoản đã bị KHÓA do vi phạm nội quy mạng hoặc Trượt bài thi.');
      localStorage.removeItem('teacher_user');
      window.location.href = '/login';
    }
  }, [currentTeacher, role, session]);

  // ── AUTO-REDIRECT: GV chưa được cấp quyền → vào thẳng trang test ──
  useEffect(() => {
    if (role !== 'teacher' || !session?.id) return;
    
    const status = String(currentTeacher?.status || session?.status || '').toLowerCase();
    
    // GV Pending mà đang ở /teacher (dashboard) → redirect sang /teacher/test
    if (status === 'pending' && window.location.pathname === '/teacher') {
      navigate('/teacher/test', { replace: true });
    }
    
    // GV Active mà cố tình vào /teacher/test → redirect về trang chủ /teacher
    if (status === 'active' && window.location.pathname === '/teacher/test') {
      navigate('/teacher', { replace: true });
    }
  }, [currentTeacher, role, session, navigate]);


  const handleLogout = () => {
    onLogout?.();
  };

  const { isRefetching, triggerBackgroundSync, notifications: allNotifications, markNotificationRead } = useData();

  const [showNotif, setShowNotif] = React.useState(false);
  const [notifLimit, setNotifLimit] = React.useState(5);
  const notifRef = React.useRef(null);
  const bellRef = React.useRef(null);

  // Click outside to close notification dropdown
  React.useEffect(() => {
    if (!showNotif) return;
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target) &&
          bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    };
    // Use setTimeout to avoid closing immediately on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotif]);

  const myNotifications = allNotifications.filter(n => 
    (String(n.userId) === String(session?.id) || n.userId === null) && 
    (n.role === role || n.role === null)
  ).sort((a, b) => new Date(b.time) - new Date(a.time));

  const unreadCount = myNotifications.filter(n => !n.read).length;

  useEffect(() => {
    // Kích hoạt dải loading 1s ngay khi vừa load xong bảng điều khiển
    triggerBackgroundSync();
  }, [triggerBackgroundSync]);

  return (
    <div className="flex min-h-screen bg-gray-50 relative">
      {/* ── Progress Bar (Loading ngầm) ── */}
      {isRefetching && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 z-[9999] animate-[gradient_2s_linear_infinite]" style={{ backgroundSize: '200% 100%' }}>
          <style>{`
            @keyframes gradient {
              0% { background-position: 100% 0; }
              100% { background-position: -100% 0; }
            }
          `}</style>
        </div>
      )}

      {/* ── Sidebar cố định ── */}
      <AppSidebar
        session={session}
        role={role}
        userName={
          role === 'teacher' 
            ? (currentTeacher?.name && !/^\d+$/.test(currentTeacher.name) ? currentTeacher.name : currentTeacher?.email || currentTeacher?.phone || session?.name || 'Giảng viên')
            : (session?.name || 'Admin')
        }
        onLogout={handleLogout}
        teacherPending={isTeacherPending}
        adminRole={session?.adminRole || null}
        userPermissions={session?.permissions || []}
      />

      {/* ── Main Content Area ── */}
      <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        {/* ── Header — Top Bar ── */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur-md bg-white/80">
          <div className="flex items-center gap-4">
            {/* Breadcrumbs */}
            {(() => {
              const loc = location;
              const currentHash = loc.hash?.replace('#', '') || '';
              const HASH_NAMES = {
                dashboard: 'Tổng quan', students: 'Học viên', teachers: 'Giảng viên',
                evaluations: 'Đánh giá', finance: 'Tài chính', training: 'Đào tạo GV',
                'student-training': 'Đào tạo HV', analytics: 'Báo cáo', hr: 'Nhân sự & Lương',
                'system-logs': 'Nhật ký', 'staff-permissions': 'Phân quyền', settings: 'Cài đặt',
                inbox: 'Hộp thư',
              };
              const tabLabel = HASH_NAMES[currentHash] || currentHash.replace('-', ' ');
              return (
                <nav className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                   <span className="hover:text-blue-600 transition-colors cursor-pointer">Dashboard</span>
                   <ChevronRight size={12} />
                   <span className="text-blue-600">
                      {role === 'admin' ? 'Quản lý' : role === 'teacher' ? 'Giảng dạy' : 'Học tập'}
                   </span>
                   {currentHash && (
                     <>
                       <ChevronRight size={12} />
                       <span className="text-gray-900 bg-gray-100 px-2 py-0.5 rounded uppercase">
                         {tabLabel}
                       </span>
                     </>
                   )}
                </nav>
              );
            })()}
            <div className="w-px h-6 bg-gray-100 mx-2 hidden md:block"></div>
            <h1 className="text-sm font-bold text-gray-800 md:block hidden animate-in fade-in slide-in-from-left-4 duration-500">
              Chào {getGreetingTime()}, <span className="text-blue-600">
                {role === 'teacher' 
                  ? (currentTeacher?.name && !/^\d+$/.test(currentTeacher.name) ? currentTeacher.name : currentTeacher?.email || currentTeacher?.phone || session?.name || 'Giảng viên') 
                  : session?.name || 'Admin'}
              </span> 👋
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Branch Filter — chỉ admin SUPER_ADMIN mới thấy */}
            {role === 'admin' && <BranchFilterDropdown />}

            {/* Search - Mock */}
            <div className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Tìm kiếm..." className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-blue-100 outline-none w-48 transition-all focus:w-64" />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button 
                ref={bellRef}
                onClick={() => { setShowNotif(!showNotif); setNotifLimit(5); }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${showNotif ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotif && (
                  <div ref={notifRef} className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[70] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold text-gray-800 text-sm">Thông báo</h3>
                      <button onClick={() => setShowNotif(false)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {myNotifications.length === 0 ? (
                        <div className="p-10 text-center text-gray-400">
                          <Bell size={32} className="mx-auto mb-2 opacity-20" />
                          <p className="text-xs">Chưa có thông báo nào</p>
                        </div>
                      ) : (
                        <div className="w-full">
                          {myNotifications.slice(0, notifLimit).map(n => (
                            <div 
                              key={n.id} 
                              onClick={() => { markNotificationRead(n.id); if(n.path) navigate(n.path); setShowNotif(false); }}
                              className={`p-4 border-b border-gray-50 hover:bg-blue-50/30 transition cursor-pointer flex gap-3 ${!n.read ? 'bg-blue-50/20' : ''}`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${!n.read ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                {n.type === 'alert' ? <Clock size={14}/> : <Bell size={14}/>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[11px] leading-tight ${!n.read ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>{n.text}</p>
                                <p className="text-[9px] text-gray-400 mt-1">{formatTime(n.time)}</p>
                              </div>
                            </div>
                          ))}
                          {myNotifications.length > notifLimit && (
                            <button 
                              onClick={() => setNotifLimit(prev => prev + 5)} 
                              className="w-full py-3 text-[10px] font-bold text-blue-600 text-center hover:bg-gray-50 transition border-b border-gray-50"
                            >
                              Hiển thị thêm...
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                      <button 
                        onClick={() => {
                          myNotifications.filter(n => !n.read).forEach(n => markNotificationRead(n.id));
                        }}
                        className="text-[10px] font-bold text-gray-500 hover:text-blue-600 transition flex items-center gap-1"
                      >
                        <CheckCircle2 size={12} /> Đánh dấu đã đọc tất cả
                      </button>
                      <button 
                        onClick={() => { setShowNotif(false); }}
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
              )}
            </div>

            {/* Profile - Logout */}
            <div className="h-8 w-px bg-gray-100 mx-1" />
            <button 
              onClick={handleLogout}
              className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black hover:bg-red-100 transition flex items-center gap-2"
            >
              <LogOut size={14} /> ĐĂNG XUẤT
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
