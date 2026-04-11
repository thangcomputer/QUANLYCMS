/**
 * AdminLoginPage.jsx — Cổng Đăng Nhập Nội Bộ (Admin & Nhân viên)
 * /admin/login — Dark mode, CAPTCHA server-side, không có Social Login
 */
import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Shield, Lock, RefreshCw, Loader2, XCircle, AlertTriangle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AdminLoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [captcha, setCaptcha]       = useState({ cid: '', svg: '' });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError]           = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [loading, setLoading]       = useState(false);
  const [attempts, setAttempts]     = useState(0);
  const [dynLogo, setDynLogo]       = useState('');
  const inputRef = useRef(null);

  // Luôn tải CAPTCHA khi mount — không auto-redirect
  useEffect(() => {
    fetchCaptcha();
    inputRef.current?.focus();
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
  }, []);

  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer('');
    setCaptchaError('');
    try {
      const res = await fetch(`${API}/api/auth/captcha`).then(r => r.json());
      if (res.success) setCaptcha({ cid: res.cid, svg: res.svg });
    } catch { setCaptchaError('Không thể tải mã bảo vệ'); }
    finally { setCaptchaLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCaptchaError('');

    if (!captchaAnswer.trim()) {
      setCaptchaError('Vui lòng nhập mã bảo vệ');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          captchaId: captcha.cid,
          captchaAnswer: captchaAnswer.trim(),
        }),
      }).then(r => r.json());

      if (!res.success) {
        setAttempts(a => a + 1);
        // Luôn refresh CAPTCHA sau mỗi lần sai
        await fetchCaptcha();
        if (res.captchaError) {
          setCaptchaError(res.message);
        } else {
          setError(res.message || 'Đăng nhập thất bại');
        }
        return;
      }

      // Thành công
      const u = res.data?.user || res.data;
      const userRole = u?.role || 'admin';
      const session = {
        id:           u._id || u.id,
        role:         userRole,
        name:         u.name,
        token:        res.data.accessToken,
        refreshToken: res.data.refreshToken || '',
        loginAt:      Date.now(),
        status:       u.status,
        adminRole:    u.adminRole   || null,
        permissions:  u.permissions || [],
        branchId:     u.branchId    || null,
        branchCode:   u.branchCode  || '',
      };
      localStorage.setItem(`${userRole}_user`, JSON.stringify(session));
      localStorage.setItem(`${userRole}_access_token`, session.token);
      onLogin(session);

    } catch {
      setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
      await fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-stretch font-sans">

      {/* ── Brand Panel (trái) ─────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-80 xl:w-96 bg-gradient-to-b from-gray-900 to-gray-950 border-r border-gray-800 p-10">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/50 overflow-hidden">
              {dynLogo ? (
                <img src={dynLogo} alt="Logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-black text-lg">T</span>
              )}
            </div>
            <div>
              <p className="text-white font-black text-sm">THẮNG TIN HỌC</p>
              <p className="text-gray-500 text-[10px]">CMS v3.0</p>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-2xl font-black text-white leading-tight">
              Cổng truy cập<br/>
              <span className="text-red-500">Nội bộ</span>
            </h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              Dành riêng cho Quản trị viên và Nhân viên. Khu vực này được bảo vệ bởi CAPTCHA và xác thực 2 lớp.
            </p>
          </div>

          {/* Security badges */}
          <div className="mt-10 space-y-3">
            {[
              { label: 'CAPTCHA bảo vệ', desc: 'Ngăn chặn bot tự động' },
              { label: 'JWT Audience', desc: 'Token phân tách luồng' },
              { label: 'Branch Isolation', desc: 'Dữ liệu cách ly chi nhánh' },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-green-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Shield size={12} className="text-green-400" />
                </div>
                <div>
                  <p className="text-white text-xs font-bold">{s.label}</p>
                  <p className="text-gray-600 text-[10px]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-700 text-[10px]">© 2026 Thắng Tin Học. Confidential.</p>
      </div>

      {/* ── Login Form Panel (phải) ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center overflow-hidden">
              {dynLogo ? (
                <img src={dynLogo} alt="Logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-black">T</span>
              )}
            </div>
            <p className="text-white font-black text-sm">THẮNG TIN HỌC — NỘI BỘ</p>
          </div>

          {/* Attempt warning */}
          {attempts >= 3 && (
            <div className="mb-4 bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 flex items-center gap-2 text-amber-400 text-xs">
              <AlertTriangle size={14} />
              Đã thử {attempts} lần. Liên hệ quản trị nếu cần hỗ trợ.
            </div>
          )}

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={16} className="text-red-500" />
                <h2 className="text-white font-black text-lg">Đăng nhập nội bộ</h2>
              </div>
              <p className="text-gray-500 text-xs">Chỉ dành cho Admin & Nhân viên chi nhánh</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Identifier */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Số điện thoại hoặc Email
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition placeholder:text-gray-600"
                  placeholder="0935758462 hoặc admin"
                  autoComplete="username"
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Mật khẩu</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition pr-11 placeholder:text-gray-600"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* CAPTCHA */}
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Mã bảo vệ
                </label>
                <div className="flex gap-2 items-stretch mb-2">
                  {/* SVG CAPTCHA display */}
                  <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex items-center justify-center min-h-[52px]">
                    {captchaLoading ? (
                      <Loader2 size={20} className="animate-spin text-gray-500" />
                    ) : captcha.svg ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: captcha.svg }}
                        className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                      />
                    ) : (
                      <span className="text-gray-600 text-xs">Không tải được mã</span>
                    )}
                  </div>
                  {/* Refresh button */}
                  <button type="button" onClick={fetchCaptcha} disabled={captchaLoading}
                    title="Làm mới mã bảo vệ"
                    className="w-12 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-40">
                    <RefreshCw size={16} className={captchaLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
                <input
                  type="text"
                  value={captchaAnswer}
                  onChange={e => { setCaptchaAnswer(e.target.value); setCaptchaError(''); }}
                  className={`w-full bg-gray-800 border rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-1 transition placeholder:text-gray-600 tracking-widest font-mono uppercase ${
                    captchaError ? 'border-red-600 focus:border-red-600 focus:ring-red-600/30' : 'border-gray-700 focus:border-red-600 focus:ring-red-600/30'
                  }`}
                  placeholder="Nhập mã hiển thị ở trên"
                  maxLength={6}
                  autoComplete="off"
                />
                {captchaError && (
                  <p className="text-red-500 text-[11px] mt-1 flex items-center gap-1">
                    <XCircle size={11} /> {captchaError}
                  </p>
                )}
              </div>

              {/* General error */}
              {error && (
                <div className="bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-xs flex items-start gap-2">
                  <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !identifier || !password || !captchaAnswer || captchaLoading}
                className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-black py-3.5 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-red-900/30 mt-2"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Đang xác thực...</>
                  : <><Lock size={15} /> ĐĂNG NHẬP NỘI BỘ</>
                }
              </button>
            </form>

            {/* Redirect to public */}
            <div className="mt-5 pt-4 border-t border-gray-800 text-center">
              <p className="text-gray-600 text-[11px]">
                Là học viên hoặc giảng viên?{' '}
                <a href="/login" className="text-gray-400 hover:text-white underline transition">
                  Đăng nhập tại đây
                </a>
              </p>
            </div>
          </div>

          {/* Security note */}
          <div className="mt-4 flex items-center gap-2 justify-center">
            <Shield size={12} className="text-green-600" />
            <p className="text-gray-700 text-[10px]">Kết nối được bảo mật · Mã hoá HTTPS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
