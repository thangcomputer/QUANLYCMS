import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import BranchFilterDropdown from './BranchFilterDropdown';
import { useData } from '../context/DataContext';
import api from '../services/api';
import { 
  Bell, Search, LogOut, CheckCircle2, Clock, X, ChevronRight, Lock,
  Calendar, DollarSign, UserPlus, Zap, BookOpen, Award, Activity
} from 'lucide-react';

const getNotifStyle = (type) => {
  switch (type) {
    case 'finance':  return { icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', label: 'Tài chính' };
    case 'student':  
    case 'COURSE':   return { icon: UserPlus,   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100',    label: 'Học viên mới' };
    case 'schedule': return { icon: Calendar,   color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-100',  label: 'Lịch dạy' };
    case 'admin':    return { icon: Zap,        color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-100',     label: 'Admin' };
    case 'news':     return { icon: Bell,       color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-100',    label: 'Tin tức' };
    case 'training': return { icon: BookOpen,   color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-100',  label: 'Đào tạo' };
    case 'grade':    return { icon: Award,      color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-100',  label: 'Đánh giá' };
    default:         return { icon: Bell,       color: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-100',    label: 'Thông báo' };
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
  const { teachers, isRefetching, triggerBackgroundSync, notifications: allNotifications, markNotificationRead } = useData();
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const key = `${role}_user`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (stored && !stored.token && session?.sbd) {
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
  }, []);

  const currentTeacher = role === 'teacher' && session?.id
    ? teachers.find(t => String(t.id) === String(session.id))
    : null;

  // ⭐ Fix: Chuyển sang logic "Pessimistic" (Mặc định là Pending trừ khi có bằng chứng là Active)
  // Việc này giúp tránh bị "Flash" mở khóa menu khi login (do data chưa load kịp)
  const isTeacherPending = (role === 'teacher' && session?.id) ? (
     String(session?.status || '').toLowerCase() !== 'active' && 
     (!currentTeacher || String(currentTeacher.status || '').toLowerCase() !== 'active')
  ) : false;

  const isTeacherActive = (role === 'teacher' && session?.id) ? (
     String(session?.status || '').toLowerCase() === 'active' || 
     (currentTeacher && String(currentTeacher.status || '').toLowerCase() === 'active')
  ) : false;

  useEffect(() => {
    if (role !== 'teacher' || !session?.id) return;
    if (window.location.pathname === '/teacher/test') return;
    
    // Nếu hệ thống đang tải hoặc currentTeacher chưa có nhưng session lại nói là active/pending thì CHỜ.
    const isLocalStatusValid = ['pending', 'active'].includes(String(session?.status).toLowerCase());
    if (isRefetching || (!currentTeacher && isLocalStatusValid)) return;
    
    const currentStatus = currentTeacher?.status || session?.status;
    if (currentStatus === undefined || currentStatus === '') return;
    
    const allowed = ['pending', 'active'];
    const s = String(currentStatus).toLowerCase();
    
    if (!allowed.includes(s)) {
      localStorage.setItem('thvp_ban_error', currentTeacher?.lockReason || session?.lockReason || 'Tài khoản đã bị KHÓA do vi phạm nội quy.');
      localStorage.removeItem('teacher_user');
      window.location.href = '/login';
    }
  }, [currentTeacher, role, session, isRefetching]);

  useEffect(() => {
    if (role !== 'teacher' || !session?.id) return;
    
    const isLocalStatusValid = String(session?.status).toLowerCase();
    if (isRefetching || (!currentTeacher && isLocalStatusValid)) return;

    const status = String(currentTeacher?.status || session?.status || '').toLowerCase();
    if (!status) return;
    
    // Nếu đang Pending mà cố truy cập các trang khác (finance, students...)
    if (status === 'pending' && !window.location.pathname.includes('/teacher/test')) {
      navigate('/teacher/test', { replace: true });
    }
    // Nếu đang Active mà lại vào trang Test
    if (status === 'active' && window.location.pathname.includes('/teacher/test')) {
      navigate('/teacher', { replace: true });
    }
  }, [currentTeacher?.status, session?.status, role, session?.id, navigate, isRefetching]);

  useEffect(() => {
    if (session?.isFirstLogin === true) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-change-password-modal'));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [session?.isFirstLogin]);

  const handleLogout = () => onLogout?.();

  const [showNotif, setShowNotif] = React.useState(false);
  const [notifLimit, setNotifLimit] = React.useState(5);
  const notifRef = React.useRef(null);
  const bellRef = React.useRef(null);

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
    if (n.receivers && n.receivers.length > 0) {
      if (n.receivers.includes('ALL_ADMIN') && role !== 'admin') return false;
      if (n.receivers.includes('ALL_TEACHER') && role !== 'teacher') return false;
      if (n.receivers.includes('ALL_STUDENT') && role !== 'student') return false;
      // Nếu có ID cụ thể trong receivers
      const isForMe = n.receivers.includes(String(session?.id)) || 
                      n.receivers.includes(role) || 
                      (role === 'admin' && n.receivers.includes('ALL_ADMIN'));
      if (!isForMe && !n.receivers.includes('ALL')) return false;
    }
    return (String(n.userId) === String(session?.id) || !n.userId) && 
           (n.role === role || !n.role);
  }).sort((a, b) => new Date(b.time || Date.now()) - new Date(a.time || Date.now()));

  const unreadCount = myNotifications.filter(n => !n.read).length;

  useEffect(() => {
    triggerBackgroundSync();
  }, [triggerBackgroundSync]);

  return (
    <div className="flex h-screen bg-[#f8fafc] relative font-sans overflow-hidden">
      {isRefetching && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 z-[9999] animate-[gradient_2s_linear_infinite]" style={{ backgroundSize: '200% 100%' }}>
          <style>{`
            @keyframes gradient {
              0% { background-position: 100% 0; }
              100% { background-position: -100% 0; }
            }
          `}</style>
        </div>
      )}

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

      <main className="flex-1 min-w-0 flex flex-col h-screen">
        <header className="h-16 md:h-20 bg-white/80 border-b border-gray-100 flex items-center justify-between px-4 pl-14 md:px-8 md:pl-8 flex-shrink-0 z-40 backdrop-blur-xl">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-1 md:gap-3">
              <nav className="flex items-center gap-1 md:gap-2 text-[10px] md:text-[11px] font-black uppercase tracking-widest text-gray-400">
                 <span className="hidden sm:inline hover:text-red-600 transition-colors cursor-pointer">Dashboard</span>
                 <ChevronRight size={12} className="hidden sm:block opacity-50" />
                 <span className="text-red-600">
                    {role === 'admin' ? 'Hệ thống' : role === 'teacher' ? 'Giảng dạy' : 'Học tập'}
                 </span>
                 {location.hash && (
                   <>
                     <ChevronRight size={12} className="opacity-50" />
                     <span className="text-white bg-red-600 px-1.5 md:px-2 py-0.5 rounded shadow-sm text-[9px] md:text-[10px]">
                       {location.hash.replace('#','').toUpperCase()}
                     </span>
                   </>
                 )}
              </nav>
            </div>
            <div className="w-px h-6 bg-gray-100 mx-2 hidden md:block"></div>
            <h1 className="text-sm font-black text-gray-800 md:block hidden animate-in fade-in slide-in-from-left-4 duration-500">
              Chào {getGreetingTime()}, 
              <span className={`ml-3 px-2 py-0.5 rounded-lg text-[9px] uppercase tracking-widest font-black text-white shadow-sm ${
                role === 'admin' ? 'bg-slate-900' : role === 'teacher' ? 'bg-red-600' : 'bg-blue-600'
              }`}>
                {role === 'admin' ? 'Hệ thống' : role === 'teacher' ? 'Giảng viên' : 'Học viên'}
              </span>
              <span className="text-red-600 font-black ml-2">
                {role === 'teacher' 
                  ? (currentTeacher?.name && !/^\d+$/.test(currentTeacher.name) ? currentTeacher.name : currentTeacher?.email || currentTeacher?.phone || session?.name || 'Giảng viên') 
                  : session?.name || 'Admin'}
              </span> 👋
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {role === 'admin' && <BranchFilterDropdown />}

            <div className="relative hidden sm:block group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-500 transition-colors" />
              <input type="text" placeholder="Tìm tên, SĐT..." className="pl-11 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl text-xs outline-none focus:border-red-600 focus:bg-white transition-all w-48 focus:w-72 shadow-sm font-medium" />
            </div>

            <div className="relative">
              <button 
                ref={bellRef}
                onClick={() => { setShowNotif(!showNotif); setNotifLimit(5); }}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${showNotif ? 'bg-red-600 text-white shadow-xl shadow-red-200' : 'bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 text-white text-[11px] font-black rounded-full flex items-center justify-center border-4 border-white animate-bounce shadow-lg">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotif && (
                  <div ref={notifRef} className="absolute right-0 mt-4 w-96 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-gray-100 z-[70] overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-black text-gray-800 text-base">Thông báo mới</h3>
                      <button onClick={() => setShowNotif(false)} className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 hover:text-red-600 shadow-sm transition-all"><X size={16}/></button>
                    </div>
                    <div className="max-h-[450px] overflow-y-auto">
                      {myNotifications.length === 0 ? (
                        <div className="p-12 text-center">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bell size={32} className="text-gray-200" />
                          </div>
                          <p className="text-sm font-bold text-gray-400">Không có thông báo mới nào</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {myNotifications.slice(0, notifLimit).map(n => {
                            const style = getNotifStyle(n.type);
                            const Icon = style.icon;
                            return (
                              <div 
                                key={n.id || n._id} 
                                onClick={() => { 
                                  markNotificationRead(n.id || n._id); 
                                  if (n.payload?.action === 'RESET_PASSWORD') {
                                    window.dispatchEvent(new CustomEvent('open-reset-pw', { detail: n.payload }));
                                  } else if (n.path) {
                                    navigate(n.path); 
                                  }
                                  setShowNotif(false); 
                                }}
                                className={`p-5 hover:bg-gray-50 transition-all cursor-pointer flex gap-4 border-l-4 ${!n.read ? `bg-white ${style.border.replace('border-', 'border-l-')}` : 'bg-white border-l-transparent opacity-80'}`}
                              >
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative ${style.bg} ${style.color}`}>
                                  <Icon size={20} />
                                  {!n.read && (
                                    <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${style.bg.replace('bg-', 'bg-')}`} style={{backgroundColor: 'currentColor'}} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${style.color}`}>{style.label}</span>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{formatTime(n.time || n.createdAt || n.timestamp)}</span>
                                  </div>
                                  {n.title && <h4 className={`text-sm font-bold mb-0.5 ${!n.read ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</h4>}
                                  <p className={`text-[13px] leading-relaxed ${!n.read && !n.title ? 'text-gray-900 font-bold' : !n.read ? 'text-gray-700 font-semibold' : 'text-gray-500 font-medium'}`}>{n.text || n.message || n.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                      <button onClick={() => markNotificationRead()} className="text-[11px] font-black text-gray-500 hover:text-red-600 transition-colors uppercase tracking-tight">Vừa đọc tất cả</button>
                      <button onClick={() => setShowNotif(false)} className="text-[11px] font-black text-red-600 hover:underline uppercase tracking-tight">Đóng lại</button>
                    </div>
                  </div>
              )}
            </div>

            <div className="h-10 w-px bg-gray-100 mx-1 hidden sm:block" />
            
            {role !== 'admin' && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('open-change-password-modal'))} className="px-3 md:px-5 py-2 md:py-3 bg-white border border-gray-200 text-gray-600 rounded-xl md:rounded-2xl text-[11px] font-black hover:bg-gray-50 transition shadow-sm active:scale-95 flex items-center gap-2 md:gap-3">
                <Lock size={16} className="text-gray-400" /> <span className="hidden sm:inline">ĐỔI MK</span>
              </button>
            )}

            <button onClick={handleLogout} className="px-3 md:px-5 py-2 md:py-3 bg-red-600 text-white rounded-xl md:rounded-2xl text-[11px] font-black hover:bg-red-700 transition shadow-lg shadow-red-200 active:scale-95 flex items-center gap-2 md:gap-3">
              <LogOut size={16} /> <span className="hidden sm:inline">ĐĂNG XUẤT</span>
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 sm:p-6 md:p-10 w-full overflow-x-hidden overflow-y-auto hide-scrollbar">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal session={session} role={role} />
    </div>
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
             // Dispatch event để App.jsx biết session đã thay đổi (nếu cần)
             window.dispatchEvent(new Event('storage'));
           } catch {}
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
          <h3 className="text-white font-black text-lg flex items-center gap-2">
            <Lock size={20} /> {session?.isFirstLogin === true ? 'Tạo mật khẩu cá nhân' : 'Đổi mật khẩu'}
          </h3>
          <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition"><X size={20} /></button>
        </div>
        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <p className="font-bold text-gray-800 text-lg">Đổi mật khẩu thành công!</p>
              <p className="text-gray-500 text-sm mt-1">Sử dụng mật khẩu mới cho lần đăng nhập sau.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl border border-red-100">{error}</div>}
              {session?.isFirstLogin !== true && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mật khẩu hiện tại</label>
                  <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition" />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mật khẩu mới</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nhập lại mật khẩu mới</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white transition" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 mt-2">
                {loading ? 'Đang xử lý...' : 'Xác nhận đổi'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
