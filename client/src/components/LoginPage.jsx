/**
 * LoginPage.jsx — Đăng nhập hợp nhất (SĐT/Email) + Auto-detect Role Badge + Social Login
 * v3.0 — 2026-04
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff, Shield, GraduationCap, User, XCircle, Loader2, CheckCircle2, UserCheck } from 'lucide-react';
import api from '../services/api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Badge color config ────────────────────────────────────────────────────────
const BADGE_CONFIG = {
  black:  { bg: 'bg-gray-900',   text: 'text-white',        icon: Shield },
  indigo: { bg: 'bg-indigo-600', text: 'text-white',        icon: Shield },
  blue:   { bg: 'bg-blue-600',   text: 'text-white',        icon: GraduationCap },
  red:    { bg: 'bg-red-600',    text: 'text-white',        icon: User },
};

// ── Social Login Icons ────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function ZaloIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="10" fill="#0068FF"/>
      <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Arial">Z</text>
    </svg>
  );
}

// ── Main LoginPage ────────────────────────────────────────────────────────────
const LoginPage = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [banError, setBanError]     = useState('');
  const [roleBadge, setRoleBadge]   = useState(null);   // { label, color }
  const [checking, setChecking]     = useState(false);  // debounced API call
  const [adminRedirect, setAdminRedirect] = useState(false); // Admin acc ở cổng public
  const [dynLogo, setDynLogo]             = useState('');

  const debounceRef = useRef(null);

  // Kiểm tra xem có social login token trong URL không (callback từ Google/Zalo)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const socialToken   = params.get('socialToken');
    const socialRefresh = params.get('socialRefresh');
    const socialRole    = params.get('socialRole') || 'student';
    const socialName    = decodeURIComponent(params.get('socialName') || '');
    const socialId      = params.get('socialId');
    const socialError   = params.get('error');

    if (socialError) {
      const messages = {
        google_failed:     'Đăng nhập Google thất bại. Vui lòng thử lại.',
        zalo_not_configured: 'Zalo OAuth chưa được cấu hình. Liên hệ Admin.',
        zalo_server_error: 'Đăng nhập Zalo thất bại. Vui lòng thử lại.',
        token_failed:      'Tạo phiên đăng nhập thất bại. Vui lòng thử lại.',
      };
      setError(messages[socialError] || 'Đăng nhập mạng xã hội thất bại.');
      window.history.replaceState({}, '', '/login');
      return;
    }

    if (socialToken && socialId) {
      // Lưu session từ social login
      const session = {
        id: socialId, role: socialRole, name: socialName,
        token: socialToken, refreshToken: socialRefresh,
        loginAt: Date.now(), status: 'active',
        permissions: [], adminRole: null,
      };
      localStorage.setItem(`${socialRole}_user`, JSON.stringify(session));
      localStorage.setItem(`${socialRole}_access_token`, socialToken);
      window.history.replaceState({}, '', '/login');
      onLogin(session);
    }

    // Kiểm tra ban error
    const banReason = localStorage.getItem('admin_ban_error')
                   || localStorage.getItem('teacher_ban_error')
                   || localStorage.getItem('student_ban_error');
    if (banReason) setBanError(banReason);

    // Fetch dynamic logo
    fetch(`${API}/api/settings/web`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data?.logoUrl) {
          const url = res.data.logoUrl;
          setDynLogo(url.startsWith('http') ? url : `${API}${url}`);
        }
      })
      .catch(() => {});
  }, [onLogin]);

  // ── Debounced auto-detect role ───────────────────────────────────────────
  const checkRole = useCallback(async (value) => {
    if (!value || value.length < 3) { setRoleBadge(null); return; }
    setChecking(true);
    try {
      const res = await fetch(`${API}/api/auth/check-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: value }),
      }).then(r => r.json());
      setRoleBadge(res.success ? res.data : null);
    } catch {}
    finally { setChecking(false); }
  }, []);

  const handleIdentifierChange = (v) => {
    setIdentifier(v);
    setError('');
    setAdminRedirect(false);
    setRoleBadge(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkRole(v.trim()), 500);
  };

  // ── Form submit ──────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setAdminRedirect(false);
    setLoading(true);
    try {
      // Cổng public: chỉ nhận Student & Teacher
      const res = await fetch(`${API}/api/auth/login/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      }).then(r => r.json());

      // Admin/Staff bị chặn → hiện banner hướng vào /admin/login
      if (!res.success && res.redirect) {
        setAdminRedirect(true);
        setLoading(false);
        return;
      }

      if (!res.success && res.isBan) {
        setBanError(res.message);
        return;
      }

      if (!res.success) {
        setError(res.message || 'Sai tài khoản hoặc mật khẩu');
        return;
      }

      const u = res.data?.user || res.data;
      const userRole = u?.role || 'student';

      const session = {
        id:           u._id || u.id,
        role:         userRole,
        name:         u.name,
        sbd:          identifier.trim(),
        loginAt:      Date.now(),
        status:       u.status,
        token:        res.data.accessToken  || res.data.token  || '',
        refreshToken: res.data.refreshToken || '',
        adminRole:    u.adminRole   || null,
        permissions:  u.permissions || [],
        branchId:     u.branchId    || null,
        branchCode:   u.branchCode  || '',
      };

      localStorage.setItem(`${session.role}_user`, JSON.stringify(session));
      // Cũng lưu access_token riêng để api.js đọc
      localStorage.setItem(`${session.role}_access_token`, session.token);
      onLogin(session);

    } catch {
      setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const clearBan = () => {
    ['admin','teacher','student','staff'].forEach(r => localStorage.removeItem(`${r}_ban_error`));
    localStorage.removeItem('thvp_ban_error');
    setBanError('');
  };

  // ── Ban screen ────────────────────────────────────────────────────────────
  if (banError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
          <XCircle size={80} className="text-red-600 mx-auto mb-6" />
          <h2 className="text-3xl font-black text-red-600 uppercase italic">TÀI KHOẢN BỊ KHÓA</h2>
          <div className="bg-red-50 p-6 rounded-3xl mt-6 border border-red-100">
            <p className="text-red-900 font-bold leading-relaxed">{banError}</p>
          </div>
          <button onClick={clearBan} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all">
            ✓ QUAY LẠI ĐĂNG NHẬP
          </button>
        </div>
      </div>
    );
  }

  // ── Role badge display ───────────────────────────────────────────────────
  const badge = roleBadge ? BADGE_CONFIG[roleBadge.color] || BADGE_CONFIG.blue : null;
  const BadgeIcon = badge?.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">

        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-200 overflow-hidden">
            {dynLogo ? (
              <img src={dynLogo} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-white font-black text-2xl">T</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-gray-800">THẮNG TIN HỌC</h1>
          <p className="text-gray-500 text-sm mt-1">Hệ thống quản lý đa chi nhánh</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/80 p-8">
          <h2 className="text-lg font-black text-gray-800 mb-6">Đăng nhập</h2>

          <form onSubmit={handleLogin} className="space-y-4">

            {/* Identifier field */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 tracking-wide">
                Số điện thoại hoặc Email đăng nhập
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={e => handleIdentifierChange(e.target.value)}
                  onBlur={() => { clearTimeout(debounceRef.current); checkRole(identifier.trim()); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-700 transition pr-24"
                  placeholder="0935758462 hoặc email@gmail.com"
                  autoFocus
                  autoComplete="username"
                />
                {/* Auto-detect badge */}
                {checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  </div>
                )}
                {!checking && badge && roleBadge && (
                  <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black ${badge.bg} ${badge.text}`}>
                    <BadgeIcon size={11} />
                    {roleBadge.label}
                  </div>
                )}
                {!checking && !badge && identifier.length >= 3 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                    Không tìm thấy
                  </div>
                )}
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 tracking-wide">Mật khẩu</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-700 transition pr-11"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2">
                <XCircle size={16} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Admin redirect banner — hiện khi tài khoản Admin/Staff dùng cổng public */}
            {adminRedirect && (
              <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                border: '1px solid rgba(99,102,241,0.3)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                animation: 'fadeIn 0.2s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <Shield size={18} style={{ color: '#818cf8', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px', margin: 0 }}>
                      Đây là tài khoản Quản trị!
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
                      Tài khoản Admin / Nhân viên phải đăng nhập qua cổng nội bộ riêng biệt.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.href = '/admin/login'}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    letterSpacing: '0.02em',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseOut={e => e.currentTarget.style.opacity = '1'}
                >
                  <Shield size={14} /> Đến trang Đăng Nhập Nội Bộ →
                </button>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !identifier || !password}
              className="w-full bg-gradient-to-r from-gray-800 to-gray-900 text-white font-black py-3.5 rounded-xl hover:from-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Đang đăng nhập...</> : 'ĐĂNG NHẬP'}
            </button>
          </form>

          {/* ── Social Login ─────────────────────────────────────────────── */}
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Hoặc đăng nhập bằng</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="mt-4 space-y-3">
              {/* Google */}
              <a
                href={`${API}/api/auth/google`}
                className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-red-300 hover:bg-red-50 rounded-xl py-3 text-sm font-bold text-gray-700 transition group"
              >
                <GoogleIcon />
                <span className="group-hover:text-red-700 transition">Đăng nhập bằng Gmail</span>
              </a>

              {/* Zalo */}
              <a
                href={`${API}/api/auth/zalo`}
                className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl py-3 text-sm font-bold text-gray-700 transition group"
              >
                <ZaloIcon />
                <span className="group-hover:text-blue-700 transition">Đăng nhập bằng Zalo</span>
              </a>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-gray-400 mt-6">
            Liên hệ Admin để được cấp tài khoản: <strong className="text-gray-600">093.5758.462</strong>
          </p>
          <p className="text-center text-[11px] text-gray-300 mt-2">
            Là nhân viên?{' '}
            <a href="/admin/login" className="text-gray-500 hover:text-gray-700 underline transition">
              Đăng nhập nội bộ
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
