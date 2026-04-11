import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Phone, Mail, ShieldCheck, Database, BookOpen, Monitor } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { setTokens } from '../services/api';

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [role, setRole] = useState('student'); // 'student' or 'teacher'
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
        const user = data.data;
        // Lưu dữ liệu user
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

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-0 font-sans overflow-hidden">
      {/* Container chính: Chia 2 cột */}
      <div className="w-full h-screen flex flex-col md:flex-row shadow-2xl overflow-hidden">
        
        {/* CỘT TRÁI: BANNER GIỚI THIỆU (Ẩn trên mobile nếu cần, nhưng ở đây giữ nguyên style) */}
        <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-[#1e293b] to-[#0f172a] p-16 flex-col justify-center relative">
          <div className="absolute top-10 left-10">
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
               <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
               <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Hệ thống quản lý trực tuyến</span>
            </div>
          </div>

          <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-left-10 duration-1000">
            <h1 className="text-5xl lg:text-7xl font-black text-white leading-[1.1]">
              Nền tảng <span className="text-red-500 block md:inline">Đào tạo</span> <br />
              Chuyên nghiệp
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

          {/* Decorative element */}
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-red-600/10 rounded-full blur-[120px]" />
        </div>

        {/* CỘT PHẢI: FORM ĐĂNG NHẬP */}
        <div className="w-full md:w-1/2 flex items-center justify-center p-8 lg:p-20 relative bg-[#0f172a]">
          {/* Logo & Branding */}
          <div className="w-full max-w-md space-y-10 z-10">
            <div className="text-center md:text-left flex flex-col items-center md:items-start animate-in fade-in zoom-in duration-700">
              <img src="/logo_thangtinhoc.png" alt="Logo" className="h-16 mb-8 brightness-110" onError={(e) => e.target.src = 'https://i.ibb.co/68H8LzG/logo.png'} />
              
              <div className="space-y-4">
                 {/* Role Switcher */}
                <div className="inline-flex bg-white/5 p-1 rounded-2xl border border-white/10 mb-2">
                  <button 
                    onClick={() => setRole('student')}
                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'student' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                  >
                    Học viên
                  </button>
                  <button 
                    onClick={() => setRole('teacher')}
                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'teacher' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                  >
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

              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest block ml-1">Số điện thoại hoặc Email</label>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[#1e293b]/50 border-2 border-white/5 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-600 focus:bg-[#1e293b] transition-all font-bold placeholder:text-gray-600"
                    placeholder="Nhập SĐT hoặc Email của bạn"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] font-bold group-focus-within:text-red-500 transition-colors uppercase">
                    Cơ bản
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest block">Mật khẩu</label>
                  <button type="button" className="text-[10px] font-black text-red-500 hover:underline uppercase tracking-tight">Quên mật khẩu?</button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#1e293b]/50 border-2 border-white/5 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-600 focus:bg-[#1e293b] transition-all font-bold placeholder:text-gray-600"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 text-white rounded-2xl py-4 font-black uppercase tracking-[0.1em] shadow-xl shadow-red-900/20 hover:bg-red-700 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Đăng nhập ngay'
                )}
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest px-4"><span className="bg-[#0f172a] text-gray-500 px-4">Hoặc sử dụng</span></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button type="button" className="flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-2xl py-3 text-sm font-black text-gray-300 hover:bg-white/10 transition-all">
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4" /> Google
                </button>
                <button type="button" className="flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-2xl py-3 text-sm font-black text-gray-300 hover:bg-white/10 transition-all">
                  <img src="https://stc-zaloprofile.zdn.vn/favicon.ico" className="w-4 h-4 rounded-full" /> Zalo
                </button>
              </div>
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

          {/* Decorative element */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-[120px]" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
