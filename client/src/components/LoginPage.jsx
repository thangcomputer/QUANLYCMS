import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Phone, ShieldCheck, Database, BookOpen, Monitor, Lock, User, KeyRound, X, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { setTokens } from '../services/api';

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Forgot Password State ──
  const [showForgot, setShowForgot] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotZalo, setForgotZalo] = useState('');
  const [forgotRole, setForgotRole] = useState('student');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [newPasswordResult, setNewPasswordResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const [dynamicLogo, setDynamicLogo] = useState('');

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API}/api/auth/login/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: phone, password, role }),
      });

      const data = await response.json();

      if (data.success) {
        const user = data.data.user ? { ...data.data.user } : { ...data.data };
        user.accessToken = data.data.accessToken || user.accessToken;
        user.refreshToken = data.data.refreshToken || user.refreshToken;
        if (!user.id && user._id) user.id = user._id;

        localStorage.setItem(`${role}_user`, JSON.stringify(user));
        setTokens(user.token || user.accessToken, user.refreshToken, role);
        
        onLogin(user);
        toast.success(`Chào mừng ${role === 'teacher' ? 'Giảng viên' : 'Học viên'}: ${user.name}!`);
        navigate(role === 'teacher' ? '/teacher' : '/student');
      } else {
        setError(data.message || 'Số điện thoại hoặc mật khẩu không đúng');
        toast.error(data.message || 'Đăng nhập thất bại');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
      toast.error('Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password Handler ──
  const handleForgotPassword = async () => {
    if (!forgotPhone.trim()) { setForgotError('Vui lòng nhập số điện thoại'); return; }
    if (!forgotZalo.trim()) { setForgotError('Vui lòng nhập số Zalo để xác minh'); return; }

    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetch(`${API}/api/auth/reset-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: forgotPhone.trim(), zalo: forgotZalo.trim(), role: forgotRole }),
      });
      const data = await res.json();
      if (data.success) {
        setNewPasswordResult({ password: data.data.newPassword, name: data.data.name });
        toast.success('Cấp lại mật khẩu thành công!');
      } else {
        setForgotError(data.message || 'Yêu cầu thất bại');
      }
    } catch {
      setForgotError('Lỗi kết nối máy chủ');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (newPasswordResult?.password) {
      navigator.clipboard.writeText(newPasswordResult.password);
      setCopied(true);
      toast.success('Đã sao chép mật khẩu!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeForgotModal = () => {
    setShowForgot(false);
    setForgotPhone('');
    setForgotZalo('');
    setForgotError('');
    setNewPasswordResult(null);
    setCopied(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-0 font-sans overflow-hidden">
      <div className="w-full h-screen flex flex-col md:flex-row shadow-2xl overflow-hidden">
        
        {/* CỘT TRÁI: BANNER GIỚI THIỆU */}
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-[#1e293b] to-[#0f172a] p-16 flex-col justify-center relative">
          <div className="absolute top-10 left-10">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
               <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
               <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Hệ thống quản lý trực tuyến</span>
            </div>
          </div>

          <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-left-10 duration-1000">
            <h1 className="text-5xl lg:text-7xl font-black text-white leading-[1.1]">
              Nền tảng <span className="text-red-500 block md:inline">Học Tin Học</span> <br />
              Văn Phòng Chuyên Nghiệp
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed max-w-lg">
              Tổ chức đào tạo, thi cử và cấp chứng nhận tin học văn phòng với công nghệ hiện đại. 
              Bao gồm hệ thống trắc nghiệm tự động, giám sát thi AI và tự động chấm điểm thực hành.
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              {[
                { label: 'Microsoft Word', icon: BookOpen },
                { label: 'Microsoft Excel', icon: Database },
                { label: 'PowerPoint', icon: Monitor }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-4 rounded-2xl hover:bg-white/10 transition-all cursor-default group">
                  <item.icon size={18} className="text-red-500 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-bold text-gray-200">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-red-600/10 rounded-full blur-[120px]" />
        </div>

        {/* CỘT PHẢI: FORM ĐĂNG NHẬP */}
        <div className="w-full md:w-1/2 flex items-center justify-center p-8 lg:p-20 relative bg-[#0f172a]">
          <div className="w-full max-w-md space-y-10 z-10">
            <div className="text-center md:text-left flex flex-col items-center md:items-start animate-in fade-in zoom-in duration-700">
              <img src={dynamicLogo || "/logo-thang-tin-hoc.png"} alt="Logo" className="h-16 mb-8 brightness-110 object-contain" onError={(e) => { if (!dynamicLogo) e.target.src = 'https://i.ibb.co/68H8LzG/logo.png'; }} />
              
              <div className="space-y-4">
                <div className="inline-flex bg-white/5 p-1 rounded-2xl border border-white/10 mb-2">
                  <button onClick={() => setRole('student')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'student' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                    Học viên
                  </button>
                  <button onClick={() => setRole('teacher')} className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'teacher' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                    Giảng viên
                  </button>
                </div>

                <h2 className="text-3xl font-black text-white">Đăng nhập tài khoản</h2>
                <p className="text-gray-400 font-medium">Chào mừng trở lại! Vui lòng nhập thông tin của bạn.</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-200">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500 text-sm font-bold">
                  <AlertCircle size={18} /> {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 block ml-1">{role === 'student' ? 'SỐ ĐIỆN THOẠI HOẶC EMAIL' : 'TÀI KHOẢN GIẢNG VIÊN'}</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                    </div>
                    <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-[#1e293b]/50 border-2 border-white/5 rounded-2xl pl-11 pr-5 py-4 text-white outline-none focus:border-red-600 focus:bg-[#1e293b] transition-all font-bold placeholder:text-gray-600"
                      placeholder="Nhập thông tin tài khoản..."
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 block ml-1">MẬT KHẨU</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock size={18} className="text-gray-500 group-focus-within:text-red-500 transition-colors" />
                    </div>
                    <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#1e293b]/50 border-2 border-white/5 rounded-2xl pl-11 pr-12 py-4 text-white outline-none focus:border-red-600 focus:bg-[#1e293b] transition-all font-bold placeholder:text-gray-600"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-white transition-colors">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Quên mật khẩu link */}
              <div className="flex justify-end -mt-2">
                <button type="button" onClick={() => { setShowForgot(true); setForgotRole(role); }}
                  className="text-xs font-bold text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1">
                  <KeyRound size={12} /> Quên mật khẩu?
                </button>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-red-600 text-white rounded-2xl py-4 font-black uppercase tracking-[0.1em] shadow-xl shadow-red-900/20 hover:bg-red-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-70 flex items-center justify-center gap-3">
                {loading ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" /> : 'Đăng nhập ngay'}
              </button>
            </form>

            <div className="text-center pt-8 animate-in fade-in duration-1000 delay-500">
               <p className="text-gray-400 text-sm font-medium">
                Chưa có tài khoản? <button className="text-white font-black hover:text-red-500 transition-colors ml-1">Liên hệ Admin</button>
              </p>
              <div className="mt-10 flex flex-col items-center gap-2">
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Hỗ trợ kỹ thuật</p>
                <p className="text-xs font-bold text-gray-400">Hotline: 093 5758 462</p>
              </div>
            </div>
          </div>

          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-[120px]" />
        </div>
      </div>

      {/* ═══ MODAL: QUÊN MẬT KHẨU ═══ */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e293b] rounded-3xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <KeyRound size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">Quên mật khẩu</h3>
                  <p className="text-white/70 text-xs font-medium">Xác minh để cấp lại mật khẩu mới</p>
                </div>
              </div>
              <button onClick={closeForgotModal} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition">
                <X size={16} className="text-white" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {!newPasswordResult ? (
                <>
                  {/* Role selector */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Vai trò</label>
                    <div className="flex gap-2">
                      <button onClick={() => setForgotRole('student')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition border-2 ${forgotRole === 'student' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                        Học viên
                      </button>
                      <button onClick={() => setForgotRole('teacher')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition border-2 ${forgotRole === 'teacher' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                        Giảng viên
                      </button>
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Số điện thoại đăng ký</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input type="text" value={forgotPhone} onChange={e => setForgotPhone(e.target.value)}
                        className="w-full bg-[#0f172a] border-2 border-white/10 rounded-xl pl-11 pr-4 py-3 text-white text-sm font-bold outline-none focus:border-red-500 transition placeholder:text-gray-600"
                        placeholder="VD: 0935758462" />
                    </div>
                  </div>

                  {/* Zalo */}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5">Số Zalo (xác minh)</label>
                    <div className="relative">
                      <ShieldCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input type="text" value={forgotZalo} onChange={e => setForgotZalo(e.target.value)}
                        className="w-full bg-[#0f172a] border-2 border-white/10 rounded-xl pl-11 pr-4 py-3 text-white text-sm font-bold outline-none focus:border-red-500 transition placeholder:text-gray-600"
                        placeholder="Nhập số Zalo đã đăng ký..." />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 ml-1">Số Zalo phải khớp với thông tin đăng ký trong hệ thống</p>
                  </div>

                  {forgotError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2 text-red-400 text-sm font-bold">
                      <AlertCircle size={14} /> {forgotError}
                    </div>
                  )}

                  <button onClick={handleForgotPassword} disabled={forgotLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black rounded-xl uppercase tracking-wider text-sm hover:from-red-700 hover:to-orange-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {forgotLoading ? <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" /> : <><KeyRound size={16} /> Cấp lại mật khẩu</>}
                  </button>
                </>
              ) : (
                /* ── Success: Show new password ── */
                <div className="text-center space-y-5">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">Cấp lại mật khẩu thành công!</p>
                    <p className="text-gray-400 text-sm mt-1">Tài khoản: <strong className="text-white">{newPasswordResult.name}</strong></p>
                  </div>

                  <div className="bg-[#0f172a] border-2 border-emerald-500/30 rounded-2xl p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Mật khẩu mới</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-3xl font-black text-emerald-400 tracking-[0.3em] font-mono">{newPasswordResult.password}</span>
                      <button onClick={handleCopyPassword}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-amber-400 text-xs font-bold">⚠️ Vui lòng ghi nhớ mật khẩu mới. Sau khi đăng nhập, bạn có thể đổi mật khẩu trong phần cài đặt.</p>
                  </div>

                  <button onClick={closeForgotModal}
                    className="w-full py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition">
                    Đóng & Đăng nhập
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
