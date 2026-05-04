import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, XCircle, CreditCard, Landmark, ShieldCheck } from 'lucide-react';

const PublicPaymentPage = () => {
  const { sessionId } = useParams();
  const API = import.meta.env.VITE_API_URL || "";
  
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [bankInfo, setBankInfo] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState('pending'); // 'pending' | 'paid' | 'expired' | 'not_found'
  
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  // 1. Fetch Initial Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch session info
        const sRes = await fetch(`${API}/api/webhooks/payment-status?sessionId=${sessionId}`).then(r => r.json());
        if (sRes.success && sRes.status !== 'not_found') {
          setSession(sRes);
          setTimeLeft(sRes.remaining || 0);
          setStatus(sRes.status);
          
          // Fetch bank info
          const bRes = await fetch(`${API}/api/settings/bank`).then(r => r.json());
          if (bRes.success) setBankInfo(bRes.data);
        } else {
          setStatus('not_found');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId, API]);

  // 2. Timer & Polling
  useEffect(() => {
    if (status !== 'pending') return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/webhooks/payment-status?sessionId=${sessionId}`).then(x => x.json());
        if (r.paid || r.status === 'paid') {
          clearInterval(timerRef.current);
          clearInterval(pollRef.current);
          setStatus('paid');
        } else if (r.status === 'expired') {
          clearInterval(timerRef.current);
          clearInterval(pollRef.current);
          setStatus('expired');
        }
      } catch {}
    }, 3000);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
    };
  }, [status, sessionId, API]);

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={40} className="animate-spin text-blue-600" />
          <p className="text-slate-500 font-bold animate-pulse">Đang tải thông tin thanh toán...</p>
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto text-red-500">
            <XCircle size={48} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Không tìm thấy!</h1>
            <p className="text-slate-400 mt-2">Phiên thanh toán không tồn tại hoặc đã bị xóa.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'paid') {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full space-y-6 animate-in zoom-in duration-500">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-20" />
            <div className="relative w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-emerald-200">
              <CheckCircle2 size={56} />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black text-emerald-700">Thành công!</h1>
            <p className="text-slate-500 mt-3 font-medium">Hệ thống đã nhận được học phí của học viên <strong>{session?.studentName}</strong>.</p>
          </div>
          <div className="pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400">Bạn có thể đóng cửa sổ này ngay bây giờ.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full space-y-6">
          <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto text-amber-500">
            <Clock size={48} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Hết thời gian!</h1>
            <p className="text-slate-400 mt-2">Phiên thanh toán đã hết hạn sau 5 phút. Vui lòng liên hệ Admin để nhận mã mới.</p>
          </div>
        </div>
      </div>
    );
  }

  const qrUrl = bankInfo?.centerBankCode && bankInfo?.centerBankAccountNumber && session
    ? `https://img.vietqr.io/image/${bankInfo.centerBankCode}-${bankInfo.centerBankAccountNumber}-compact2.png?amount=${session.amount}&addInfo=${encodeURIComponent(session.ref)}&accountName=${encodeURIComponent(bankInfo.centerBankAccountName || '')}`
    : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md bg-white rounded-[48px] shadow-[0_20px_70px_rgba(0,0,0,0.08)] overflow-hidden relative border border-white">
        
        {/* Header Decor */}
        <div className="bg-gradient-to-br from-red-600 via-red-600 to-rose-700 px-8 py-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-10 -mb-10 blur-xl" />
          
          <div className="relative z-10 flex flex-col items-center gap-3">
             <div className="px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                Trung Tâm Thắng Tin Học
             </div>
             <h1 className="text-2xl font-black tracking-tight leading-tight">Thanh Toán Học Phí</h1>
             <p className="text-white/80 text-xs font-bold uppercase tracking-widest">{session?.studentName} — {session?.courseName?.slice(0,30)}</p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Amount Card */}
          <div className="bg-red-50/50 border-2 border-red-100 rounded-[32px] p-6 text-center shadow-inner">
            <p className="text-xs text-red-400 font-black uppercase tracking-widest mb-1">Số tiền cần thanh toán</p>
            <p className="text-4xl font-black text-red-600">{(session?.amount || 0).toLocaleString('vi-VN')}<span className="text-2xl ml-1">đ</span></p>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col items-center gap-6">
            <div className="relative group">
              <div className="absolute inset-0 bg-emerald-500 rounded-[40px] blur-2xl opacity-10 group-hover:opacity-20 transition-opacity" />
              <div className="relative bg-white border-4 border-emerald-500/20 p-4 rounded-[40px] shadow-2xl">
                {qrUrl ? (
                  <img src={qrUrl} alt="VietQR" className="w-56 h-56 object-contain rounded-3xl" />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-300">
                    <Loader2 size={32} className="animate-spin" />
                  </div>
                )}
                
                {/* Logo Overlays */}
                <div className="absolute -top-3 -right-3 w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center p-2 border border-slate-50">
                   <img src="https://img.vietqr.io/image/logo-vietqr.png" alt="VietQR Logo" className="object-contain" />
                </div>
              </div>
            </div>

            {/* Countdown & Progress */}
            <div className="w-full space-y-3">
              <div className="flex justify-between items-end px-2">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Thời gian còn lại</span>
                </div>
                <span className={`text-xl font-mono font-black ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-slate-800'}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-50">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${timeLeft < 60 ? 'bg-gradient-to-r from-red-500 to-rose-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`} 
                  style={{ width: `${(timeLeft / 300) * 100}%` }} 
                />
              </div>
            </div>
          </div>

          {/* Info Rows */}
          <div className="space-y-3 pt-4">
             <div className="bg-slate-50 rounded-3xl p-4 flex items-center justify-between border border-slate-100">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-600">
                      <Landmark size={20} />
                   </div>
                   <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tài khoản nhận</p>
                      <p className="text-sm font-black text-slate-700">{bankInfo?.centerBankAccountNumber}</p>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ngân hàng</p>
                   <p className="text-sm font-black text-slate-700 uppercase">{bankInfo?.centerBankCode}</p>
                </div>
             </div>

             <div className="bg-slate-50 rounded-3xl p-4 flex items-center justify-between border border-slate-100">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center text-emerald-600">
                      <CreditCard size={20} />
                   </div>
                   <div className="flex-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nội dung chuyển khoản</p>
                      <p className="text-sm font-mono font-black text-slate-700">{session?.ref}</p>
                   </div>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(session?.ref || '');
                    alert('Đã copy nội dung chuyển khoản!');
                  }}
                  className="p-2 bg-white rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-slate-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
             </div>
          </div>

          {/* Footer Security Note */}
          <div className="flex items-center justify-center gap-2 pt-4 opacity-50">
             <ShieldCheck size={14} className="text-emerald-600" />
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hệ thống thanh toán bảo mật 256-bit</span>
          </div>
        </div>

        {/* Polling Label Floating */}
        <div className="bg-slate-900 py-3 text-center flex items-center justify-center gap-3">
           <Loader2 size={14} className="animate-spin text-emerald-400" />
           <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em]">Đang kiểm tra giao dịch tự động...</span>
        </div>
      </div>
    </div>
  );
};

export default PublicPaymentPage;
