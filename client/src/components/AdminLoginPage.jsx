import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, User, Eye, EyeOff, AlertTriangle, ChevronRight, Fingerprint, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { setTokens } from '../services/api';

const AdminLoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const [captcha, setCaptcha] = useState('');
  const [userInputCaptcha, setUserInputCaptcha] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');

  // Hàm tạo mã bảo vệ ngẫu nhiên
  const generateCaptcha = () => {
    const chars = '23456789abcdefghkmnpqrstuvwxyzABCDEFGHKLMNPQRSTUVWXYZ';
    const code = Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    setCaptchaCode(code);
  };

  React.useEffect(() => {
    generateCaptcha();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // 1. Kiểm tra trường trống
    if (!username || !password) {
      setError('VUI LÒNG NHẬP TÀI KHOẢN VÀ MẬT KHẨU');
      toast.error('Cảnh báo: Thông tin trống');
      return;
    }

    // 2. Kiểm tra mã CAPTCHA
    if (userInputCaptcha.toLowerCase() !== captchaCode.toLowerCase()) {
      setError('MÃ BẢO VỆ KHÔNG CHÍNH XÁC');
      toast.error('Mã bảo vệ sai!');
      generateCaptcha();
      setUserInputCaptcha('');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: username, password }),
      });

      const data = await response.json();

      if (data.success) {
        // Extract real user object from wrapped structure if it exists
        const actualUser = data.data.user || data.data;
        const accessToken = data.data.accessToken || actualUser.token || actualUser.accessToken;
        const refreshToken = data.data.refreshToken || actualUser.refreshToken;
        
        const role = actualUser.role || 'admin';
        
        // Merge tokens into the user object for compatibility
        const finalUserObj = { ...actualUser, token: accessToken, refreshToken };

        // Save properly with correct role prefix
        localStorage.setItem(`${role}_user`, JSON.stringify(finalUserObj));
        setTokens(accessToken, refreshToken, role);
        
        onLogin(finalUserObj);
        toast.success(`Hệ thống đã sẵn sàng, chào mừng ${actualUser.name}!`);
        navigate(role === 'student' ? '/student' : '/admin');
      } else {
        // 3. Lỗi từ Server (Sai mật khẩu hoặc tài khoản)
        setError(data.message?.toUpperCase() || 'TÀI KHOẢN HOẶC MẬT KHẨU KHÔNG ĐÚNG');
        toast.error('Truy cập bị từ chối!');
        setPassword(''); // Xóa mật khẩu sai
      }
    } catch (err) {
      setError('LỖI KẾT NỐI HỆ THỐNG BẢO MẬT');
      toast.error('Server gặp sự cố');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-0 font-sans overflow-hidden selection:bg-red-500/30">
      
      {/* Background Decor - Cyber Dots */}
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="w-full h-screen flex flex-col md:flex-row relative z-10">
        
        {/* LEFT COLUMN: CYBER COMMAND CENTER */}
        <div className="hidden md:flex md:w-[60%] bg-transparent p-20 flex-col justify-center relative border-r border-white/5">
          <div className="relative z-10 space-y-12 animate-in fade-in slide-in-from-left-20 duration-1000">
            <div className="inline-flex items-center gap-3 bg-red-600/10 border border-red-500/20 px-4 py-2 rounded-xl">
               <ShieldCheck size={18} className="text-red-500" />
               <span className="text-xs font-black text-red-500 uppercase tracking-[0.3em]">Hệ thống quản trị tối cao</span>
            </div>

            <div className="space-y-4">
               <h1 className="text-6xl lg:text-8xl font-black text-white leading-none tracking-tighter">
                CMS <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-500 to-red-800">CENTRAL</span>
              </h1>
              <p className="text-slate-400 text-xl font-medium max-w-xl leading-relaxed">
                Trung tâm điều hành nền tảng Đào tạo Tin học văn phòng. 
                Kiểm soát dữ liệu, phân quyền giảng viên và theo dõi tăng trưởng doanh thu theo thời gian thực.
              </p>
            </div>

            {/* Quick Stats Grid - Premium Feel */}
            <div className="grid grid-cols-2 gap-6 max-w-lg pt-10">
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[32px] group hover:border-red-500/50 transition-all duration-500">
                  <Activity size={24} className="text-red-500 mb-4 group-hover:scale-110 transition-transform" />
                  <p className="text-3xl font-black text-white">99.9%</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Uptime System</p>
               </div>
               <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[32px] group hover:border-red-500/50 transition-all duration-500">
                  <Fingerprint size={24} className="text-red-500 mb-4 group-hover:scale-110 transition-transform" />
                  <p className="text-3xl font-black text-white">AES-256</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Data Security</p>
               </div>
            </div>
          </div>

          {/* Glowing Orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px]" />
        </div>

        {/* RIGHT COLUMN: ADMIN GATEWAY */}
        <div className="w-full md:w-[40%] flex items-center justify-center p-8 lg:p-14 relative bg-[#020617]/50 backdrop-blur-3xl">
          
          <div className="w-full max-w-md space-y-12 z-10">
            <div className="text-center space-y-6 animate-in fade-in zoom-in duration-700">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-red-600 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                <img src="/logo_thangtinhoc.png" alt="Logo" className="h-20 relative z-10" onError={(e) => e.target.src = 'https://i.ibb.co/68H8LzG/logo.png'} />
              </div>
              
              <div className="space-y-3">
                <h2 className="text-4xl font-black text-white tracking-tight">Cổng Admin</h2>
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.4em]">Xác thực quyền truy cập hệ thống</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-1000 delay-200">
              {error && (
                <div className="bg-[#1a0505] border-l-4 border-red-600 p-5 rounded-2xl flex items-center gap-4 text-red-500 text-[11px] font-black tracking-widest animate-bounce-horizontal shadow-2xl">
                  <AlertTriangle size={20} className="flex-shrink-0" />
                  <span>{error}</span>
                  <style>{`
                    @keyframes bounce-horizontal {
                      0%, 100% { transform: translateX(0); }
                      25% { transform: translateX(-5px); }
                      75% { transform: translateX(5px); }
                    }
                    .animate-bounce-horizontal {
                      animation: bounce-horizontal 0.4s ease-in-out;
                    }
                  `}</style>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Username / Identifier</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-red-500 transition-colors">
                    <User size={20} />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-white/[0.03] border-2 border-white/5 rounded-3xl pl-14 pr-5 py-5 text-white outline-none focus:border-red-600/50 focus:bg-white/[0.05] transition-all font-black placeholder:text-slate-700 shadow-inner"
                    placeholder="Nhập tài khoản quản trị"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Master Password</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-red-500 transition-colors">
                    <Lock size={20} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/[0.03] border-2 border-white/5 rounded-3xl pl-14 pr-5 py-5 text-white outline-none focus:border-red-600/50 focus:bg-white/[0.05] transition-all font-black placeholder:text-slate-700 shadow-inner"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Mã bảo vệ</label>
                <div className="flex gap-3">
                  <div className="flex-1 bg-white/5 border-2 border-white/5 rounded-3xl p-4 flex items-center justify-center relative overflow-hidden h-16 select-none shadow-inner">
                    {/* Captcha Noise Strokes */}
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-red-500/30 -rotate-3" />
                    <div className="absolute inset-x-0 top-1/3 h-[1px] bg-blue-500/30 rotate-2" />
                    
                    <span className="text-2xl font-black tracking-[0.4em] italic text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]">
                      {captchaCode}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    onClick={generateCaptcha}
                    className="w-16 h-16 rounded-3xl bg-white/5 border-2 border-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all hover:bg-white/10 active:scale-95"
                  >
                    <Activity size={24} className={loading ? 'animate-pulse' : ''} />
                  </button>
                </div>
                
                <input
                  type="text"
                  required
                  value={userInputCaptcha}
                  onChange={(e) => setUserInputCaptcha(e.target.value)}
                  className="w-full bg-white/[0.03] border-2 border-white/5 rounded-2xl px-5 py-4 text-white text-center text-xs font-black outline-none focus:border-red-600/50 focus:bg-white/[0.05] transition-all placeholder:text-slate-700 uppercase tracking-widest"
                  placeholder="Nhập mã hiển thị ở trên"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-3xl py-5 font-black uppercase tracking-[0.2em] shadow-2xl shadow-red-900/40 hover:from-red-700 hover:to-rose-800 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-70 flex items-center justify-center gap-4 border border-white/10"
              >
                {loading ? (
                  <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Khởi tạo truy cập
                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Terminal Style Footer */}
            <div className="text-center pt-10 animate-in fade-in duration-1000 delay-500">
               <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 inline-block">
                  <p className="text-[10px] font-mono text-slate-600">
                    TERMINAL ID: <span className="text-red-500/70">ADMIN-01X8</span> <br />
                    LOCATION: <span className="text-slate-400">VIETNAM CENTRAL HUB</span>
                  </p>
               </div>
            </div>
          </div>

          <div className="absolute bottom-6 text-[9px] font-black text-slate-700 uppercase tracking-[0.5em]">
            Authorized Personnel Only © 2026
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
