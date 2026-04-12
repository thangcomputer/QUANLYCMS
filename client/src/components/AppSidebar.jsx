import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, BookOpen, Calendar, MessageSquare,
  Trophy, FileText, Bell, LogOut, ChevronLeft, ChevronRight,
  GraduationCap, Users, DollarSign, ClipboardList, Menu, X,
  Settings, User, Star, AlertTriangle, Lock, Volume2, VolumeX, BarChart3
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { isSoundMuted, setSoundMuted } from '../utils/sound';
import { PERMISSIONS } from '../constants/permissions';

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Vừa xong';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} phút trước`;
  if (diffMs < 86400000) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

// ─── Cấu hình menu theo role ──────────────────────────────────────────────────
const MENU_CONFIG = {
  student: {
    brand: { label: 'HỌC VIÊN', color: 'from-slate-900 to-indigo-950' },
    items: [
      { key: 'dashboard',  icon: LayoutDashboard, label: 'Tổng quan',      path: '/student' },
      { key: 'exam',       icon: Trophy,           label: 'Phòng Thi',      path: '/student/exam' },
      { key: 'schedule',   icon: Calendar,         label: 'Lịch học',       path: '/student', hash: 'schedule' },
      { key: 'materials',  icon: BookOpen,          label: 'Tài liệu',      path: '/student', hash: 'materials' },
      { key: 'inbox',      icon: MessageSquare,     label: 'Hộp thư',       path: '/student/inbox' },
      { key: 'evaluation', icon: Star,              label: 'Đánh giá',      path: '/student', hash: 'evaluation' },
    ],
    bottomItems: [
      { key: 'profile',   icon: User,    label: 'Hồ sơ',      path: '/student', hash: 'profile' },
      { key: 'logout',    icon: LogOut,  label: 'Đăng xuất',  isLogout: true },
    ],
    accentColor: 'bg-indigo-600',
    activeClass: 'bg-white/20 text-white shadow-lg backdrop-blur-md border-r-4 border-white',
  },
  teacher: {
    brand: { label: 'GIẢNG VIÊN', color: 'from-slate-900 to-indigo-950' },
    items: [
      { key: 'dashboard',  icon: LayoutDashboard, label: 'Tổng quan',      path: '/teacher' },
      { key: 'students',   icon: Users,            label: 'Quản lý học viên', path: '/teacher', hash: 'students' },
      { key: 'schedule',   icon: Calendar,         label: 'Lịch dạy',      path: '/teacher', hash: 'schedule' },
      { key: 'test',       icon: ClipboardList,    label: 'Bài Test',       path: '/teacher/test' },
      { key: 'finance',    icon: DollarSign,       label: 'Tài chính',      path: '/teacher/finance' },
      {key: 'training',   icon: BookOpen,          label: 'Đào tạo',        path: '/teacher', hash: 'training' },
      { key: 'inbox',      icon: MessageSquare,    label: 'Hộp thư',        path: '/teacher/inbox' },
    ],
    bottomItems: [
      { key: 'profile', icon: User,   label: 'Hồ sơ cá nhân', path: '/teacher', hash: 'profile' },
      { key: 'logout',  icon: LogOut, label: 'Đăng xuất',      isLogout: true },
    ],
    accentColor: 'bg-indigo-600',
    activeClass: 'bg-white/20 text-white shadow-lg backdrop-blur-md border-r-4 border-white',
  },
  admin: {
    brand: { label: 'QUẢN TRỊ', color: 'from-slate-900 to-indigo-950' },
    items: [
      { key: 'dashboard',        icon: LayoutDashboard, label: 'Tổng quan',        path: '/admin', hash: 'dashboard'                                                         },
      { key: 'students',         icon: Users,         label: 'Học Viên',           path: '/admin', hash: 'students',            permission: PERMISSIONS.MANAGE_STUDENTS  },
      { key: 'teachers',         icon: GraduationCap, label: 'Giảng Viên',         path: '/admin', hash: 'teachers',            permission: PERMISSIONS.VIEW_TEACHERS                          },
      { key: 'evaluations',      icon: AlertTriangle, label: 'Đánh giá nội bộ',    path: '/admin', hash: 'evaluations',         permission: PERMISSIONS.VIEW_EVALUATIONS },
      { key: 'finance',          icon: DollarSign,    label: 'Tài chính',           path: '/admin', hash: 'finance',             permission: PERMISSIONS.MANAGE_FINANCE   },
      { key: 'training',         icon: BookOpen,      label: 'Đào tạo GV',          path: '/admin', hash: 'training',            permission: PERMISSIONS.MANAGE_TRAINING  },
      { key: 'student-training', icon: BookOpen,      label: 'Đào tạo HV',          path: '/admin', hash: 'student-training',    permission: PERMISSIONS.MANAGE_TRAINING  },
      { key: 'logs',             icon: Lock,          label: 'Nhật ký hệ thống',    path: '/admin', hash: 'logs',               permission: PERMISSIONS.VIEW_LOGS        },
      { key: 'settings',         icon: Settings,      label: 'Cài đặt hệ thống',    path: '/admin', hash: 'settings',            permission: PERMISSIONS.SYSTEM_SETTINGS  },
      { key: 'staff',            icon: Users,         label: 'Phân quyền NV',       path: '/admin', hash: 'staff',  superAdminOnly: true, permission: PERMISSIONS.MANAGE_STAFF },
      { key: 'hr',               icon: ClipboardList, label: 'Nhân sự & Lương',     path: '/admin', hash: 'hr',                  permission: PERMISSIONS.MANAGE_HR    },
      { key: 'analytics',        icon: BarChart3,     label: 'Báo cáo doanh thu',   path: '/admin', hash: 'analytics',           permission: [PERMISSIONS.MANAGE_FINANCE, PERMISSIONS.VIEW_BRANCH_REVENUE] },
      { key: 'inbox',            icon: MessageSquare, label: 'Hộp thư',             path: '/admin/inbox'                                                                     },
    ],
    bottomItems: [
      { key: 'logout', icon: LogOut, label: 'Đăng xuất', isLogout: true },
    ],
    accentColor: 'bg-indigo-600',
    activeClass: 'bg-white/10 text-white shadow-xl backdrop-blur-lg border-r-[4px] border-white font-bold',
  },
};

// ─── AppSidebar Component ─────────────────────────────────────────────────────
const AppSidebar = ({
  session,
  role = 'student',
  userName = '',
  userAvatar = '',
  notifications = 0,
  onLogout,
  activeKey,
  onNavigateItem,
  teacherPending = false,
  adminRole = null,       // 'SUPER_ADMIN' | 'STAFF' | null
  userPermissions = [],   // ['manage_students', ...]
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    students, teachers, getPrivateEvaluationsForAdmin, getConversations, triggerBackgroundSync,
    notifications: allNotifications, markNotificationRead
  } = useData();
  const [muted, setMutedState] = useState(() => isSoundMuted());
  const [dynamicLogo, setDynamicLogo] = useState('');
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Fetch dynamic logo from web settings
  useEffect(() => {
    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data?.logoUrl) {
          const url = res.data.logoUrl;
          setDynamicLogo(url.startsWith('http') ? url : `${API}${url}`);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleMute = () => {
    const newState = !muted;
    setSoundMuted(newState);
    setMutedState(newState);
  };

  const config = MENU_CONFIG[role] || MENU_CONFIG.student;

  // ── Filter menu theo permissions (RBAC) ──────────────────────────────────────
  const filterItems = (items) => {
    // Teacher & Student: không lọc
    if (role !== 'admin' && role !== 'staff') return items;
    // Hardcoded admin ID hoặc SUPER_ADMIN: toàn quyền
    if (session?.id === 'admin' || adminRole === 'SUPER_ADMIN') return items;
    // STAFF: chỉ hiện menu có permission = null (public) hoặc nằm trong userPermissions
    return items.filter(item => {
      if (item.superAdminOnly) return false;          // Chỉ SUPER_ADMIN mới thấy
      if (!item.permission) return true;              // Menu public (inbox, v.v.)
      // ⭐ Support array permissions: user chỉ cần 1 trong các quyền
      if (Array.isArray(item.permission)) {
        return item.permission.some(p => userPermissions.includes(p));
      }
      return userPermissions.includes(item.permission); // Kiểm tra quyền
    });
  };

  const getBadgeCount = (itemKey) => {
    if (itemKey === 'inbox' && session?.id) {
      return getConversations(session.id).reduce((sum, c) => sum + (c.unread || 0), 0);
    }
    if (role === 'admin') {
      if (itemKey === 'students') {
        return (students || []).filter(s => !s.paid).length;
      }
      if (itemKey === 'teachers') {
        return (teachers || []).filter(t => {
          const s = String(t.status || '').toLowerCase();
          const p = String(t.practicalStatus || '').toLowerCase();
          return s === 'pending' || p === 'pending';
        }).length;
      }
      if (itemKey === 'evaluations') {
        return (getPrivateEvaluationsForAdmin?.() || []).filter(e => !e.read).length;
      }
    }
    return 0;
  };

  const handleClick = (item) => {
    if (item.isLogout) { onLogout?.(); return; }
    if (onNavigateItem) { onNavigateItem(item); setMobileOpen(false); return; }
    // Navigate with hash if present (e.g. /teacher#students)
    const target = item.hash ? `${item.path}#${item.hash}` : item.path;
    navigate(target);
    setMobileOpen(false);
  };

  const isActive = (item) => {
    if (activeKey) return item.key === activeKey;
    const pathMatches = location.pathname === item.path;
    const currentHash = location.hash?.replace('#', '') || '';

    // Item has a hash → only active when path AND hash both match
    if (item.hash) {
      return pathMatches && currentHash === item.hash;
    }
    // Base dashboard items (no hash) → active only when path matches AND no hash in URL
    const basePaths = ['/student', '/teacher', '/admin'];
    if (basePaths.includes(item.path) && pathMatches) {
      return !currentHash;
    }
    // Other items (e.g. /teacher/finance) → path match AND no hash in URL
    return pathMatches && !currentHash;
  };

  const initials = userName ? userName.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() : 'HV';

  // ── Sidebar inner content ──
  const SidebarContent = () => (
    <div className={`flex flex-col h-full bg-gradient-to-b ${config.brand.color} text-white overflow-x-hidden`}>

      {/* ── Logo + Collapse button ── */}
      {/* ── Logo + Collapse button ── */}
      <div className={`flex items-center justify-between border-b border-white/10 ${(collapsed && !mobileOpen) ? 'px-3 py-4' : 'px-5 py-4'}`}>
        {(!collapsed || mobileOpen) && (
          <div 
            className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity" 
            onClick={() => {
              navigate(config.items[0].path);
              triggerBackgroundSync();
            }}
            title="Làm mới bảng điều khiển"
          >
            <img src={dynamicLogo || '/logo-thang-tin-hoc.svg'} alt="Logo" className="h-8 flex-shrink-0" style={dynamicLogo ? { maxHeight: '32px', objectFit: 'contain' } : { filter: 'brightness(0) invert(1)' }} />
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 items-center justify-center flex-shrink-0 transition-all"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* ── User info ── */}
      {(!collapsed || mobileOpen) && (
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full ${config.accentColor} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">{userName || 'Người dùng'}</p>
              <p className="text-white/50 text-[10px]">{config.brand.label}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {filterItems(config.items)
        .filter(item => {
          // Ẩn mục 'Bài Test' khi GV đã được kích hoạt giảng dạy
          if (role === 'teacher' && item.key === 'test' && !teacherPending) return false;
          return true;
        })
        .map(item => {
          const Icon = item.icon;
          const active = isActive(item);
          // Lock item if teacher is pending and this is not the test tab
          const isLocked = teacherPending && item.key !== 'test';
          return (
            <div key={item.key} className="relative group/nav">
              <button
                onClick={() => !isLocked && handleClick(item)}
                title={isLocked ? '🔒 Bạn chưa phải là giáo viên chính thức nên chưa được mở' : (collapsed && !mobileOpen ? item.label : undefined)}
                className={`w-full flex items-center gap-3 rounded-xl transition-all
                  ${(collapsed && !mobileOpen) ? 'justify-center px-2 py-3' : 'px-4 py-3'}
                  ${isLocked
                    ? 'text-white/30 cursor-not-allowed'
                    : active ? config.activeClass : 'text-white/60 hover:text-white hover:bg-white/10'
                  }
                `}
              >
                <Icon size={18} className="flex-shrink-0" />
                {(!collapsed || mobileOpen) && <span className="text-sm font-medium">{item.label}</span>}
                {(!collapsed || mobileOpen) && isLocked && (
                  <Lock size={13} className="ml-auto text-white/30 flex-shrink-0" />
                )}
                {(!collapsed || mobileOpen) && !isLocked && getBadgeCount(item.key) > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black leading-none drop-shadow-md shadow-red-500/50">
                    {getBadgeCount(item.key) > 99 ? '99+' : getBadgeCount(item.key)}
                  </span>
                )}
                {(collapsed && !mobileOpen) && !isLocked && getBadgeCount(item.key) > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white"></span>
                )}
              </button>
            </div>
          );
        })}

      </nav>

      {/* ── Bottom items ── */}
      <div className="px-3 pb-4 space-y-1 border-t border-white/10 pt-3">
        {config.bottomItems.map(item => {
          const Icon = item.icon;
          const active = !item.isLogout && isActive(item);
          return (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              className={`w-full flex items-center gap-3 rounded-xl transition-all
                ${(collapsed && !mobileOpen) ? 'justify-center px-2 py-3' : 'px-4 py-3'}
                ${item.isLogout
                  ? 'text-white/50 hover:text-red-400 hover:bg-red-500/10'
                  : active ? config.activeClass : 'text-white/60 hover:text-white hover:bg-white/10'}
              `}
              title={(collapsed && !mobileOpen) ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {(!collapsed || mobileOpen) && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}

        {/* ── Nút Bật/Tắt Âm Thanh ── */}
        <button
          onClick={handleToggleMute}
          title={(collapsed && !mobileOpen) ? (muted ? "Bật âm báo" : "Tắt âm báo") : undefined}
          className={`w-full flex items-center gap-3 rounded-xl transition-all text-white/50 hover:text-white hover:bg-white/10
            ${(collapsed && !mobileOpen) ? 'justify-center px-2 py-3' : 'px-4 py-3'}
          `}
        >
          {muted ? <VolumeX size={18} className="flex-shrink-0" /> : <Volume2 size={18} className="flex-shrink-0" />}
          {(!collapsed || mobileOpen) && <span className="text-sm font-medium">{muted ? "Bật âm thanh" : "Tắt âm thanh"}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <div className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen z-30 transition-all duration-300
        ${collapsed ? 'w-16' : 'w-60'}
      `}>
        <SidebarContent />
      </div>

      {/* ── Mobile: Hamburger button ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-center text-gray-600"
      >
        <Menu size={20} />
      </button>

      {/* ── Mobile: Overlay ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64">
            <div className="h-full relative">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-3 right-3 z-10 w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center text-white"
              >
                <X size={16} />
              </button>
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      {/* ── Spacer for main content ── */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`} />
    </>
  );
};

export default AppSidebar;
