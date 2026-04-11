import React, { useState, useEffect, useRef } from 'react';
import {
  CreditCard, User, Phone, BookOpen, GraduationCap, CheckCircle,
  Printer, LayoutDashboard, ArrowLeft, Loader2, AlertCircle,
  Clock, RefreshCw, XCircle
} from 'lucide-react';
import { useData } from '../context/DataContext';
import InvoiceTemplate from './InvoiceTemplate';
import exportPDF from '../utils/exportPDF';
import { generateVietQRUrl } from './BankSelect';

const API   = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOTAL = 5 * 60; // 5 phút = 300 giây

// Helper: tính effective price
const calcEff = (price, pct) =>
  pct > 0 ? Math.round(Number(price) * (1 - Number(pct) / 100)) : Number(price);

// ── Đồng hồ đếm ngược đẹp ────────────────────────────────────────────────────
function Countdown({ seconds, total }) {
  const pct  = (seconds / total) * 100;
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const color = seconds > 60 ? '#22c55e' : seconds > 30 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle cx="28" cy="28" r="24" fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 24}`}
            strokeDashoffset={`${2 * Math.PI * 24 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-black" style={{ color }}>{mins}:{secs}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 font-medium">còn lại</p>
    </div>
  );
}

// ── Overlay Quá Hạn ───────────────────────────────────────────────────────────
function ExpiredOverlay({ onBack }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-8 text-center animate-in zoom-in-95 fade-in duration-300">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={44} className="text-red-500" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">Phiên thanh toán hết hạn!</h3>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Mã QR đã hết hiệu lực sau 5 phút.<br />
          Vui lòng quay lại và thử lại để nhận mã mới.
        </p>
        <button
          onClick={onBack}
          className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-bold py-3.5 rounded-2xl hover:from-red-700 transition shadow-lg"
        >
          ← Quay lại nhập thông tin
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const RegistrationForm = ({ onNavigate }) => {
  const { addStudent } = useData();
  const [step, setStep]         = useState(1);
  const [exporting, setExporting] = useState(false);

  // Bank
  const [centerBank, setCenterBank]   = useState(null);
  const [bankLoading, setBankLoading] = useState(false);

  // Countdown + Session + Polling
  const [timeLeft, setTimeLeft]     = useState(TOTAL);
  const [expired, setExpired]       = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [pollStatus, setPollStatus] = useState('pending'); // pending | paid | expired
  const [pollSeconds, setPollSeconds] = useState(0);

  const countdownRef = useRef(null);
  const pollRef      = useRef(null);
  const sessionRef   = useRef(null); // tránh tạo session 2 lần

  // Courses from DB
  const [dbCourses, setDbCourses]     = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '', age: '', zalo: '',
    courseId:        '',
    course:          '',
    price:           0,
    discountPercent: 0,
    effectivePrice:  0,
    branchId:        '',
    branchCode:      '', // CS1, CS2 — dùng prefix QR
  });

  // Fetch branches
  const [branches, setBranches]             = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/branches`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.length > 0) {
          setBranches(res.data);
          // Chọn chi nhánh đầu tiên mặc định
          setFormData(f => ({ ...f, branchId: res.data[0]._id, branchCode: res.data[0].code }));
        }
      })
      .catch(() => {})
      .finally(() => setBranchesLoading(false));
  }, []);

  // Fetch courses khi mount
  useEffect(() => {
    fetch(`${API}/api/courses`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.length > 0) {
          const list = res.data;
          setDbCourses(list);
          const first = list[0];
          const ep = calcEff(first.price, first.discountPercent);
          setFormData(f => ({
            ...f,
            courseId: first._id,
            course: first.name,
            price: first.price,
            discountPercent: first.discountPercent || 0,
            effectivePrice: ep,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
  }, []);


  // Nội dung chuyển khoản: prefix chi nhánh + mã học viên
  const studentCodeShort = formData.name.replace(/\s+/g, '').slice(0, 8).toUpperCase() || 'HV';
  const branchPrefix = formData.branchCode ? `${formData.branchCode} ` : '';
  const ckContent = `${branchPrefix}${studentCodeShort} Nop hoc phi`;

  // Fetch bank + tạo session khi vào step 2
  useEffect(() => {
    if (step !== 2) return;

    // Reset state
    setTimeLeft(TOTAL);
    setExpired(false);
    setPollStatus('pending');
    setPollSeconds(0);

    // 1) Fetch bank info
    setBankLoading(true);
    fetch(`${API}/api/settings/payment`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data?.bankCode && res.data?.accountNumber) {
          setCenterBank(res.data);
        } else {
          setCenterBank(null);
        }
      })
      .catch(() => setCenterBank(null))
      .finally(() => setBankLoading(false));

    // 2) Tạo payment session
    if (!sessionRef.current) {
      fetch(`${API}/api/webhooks/payment-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ckContent.toLowerCase(), amount: formData.price }),
      })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            setSessionId(res.sessionId);
            sessionRef.current = res.sessionId;
          }
        })
        .catch(console.error);
    }

    // 3) Đồng hồ đếm ngược
    countdownRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(countdownRef.current);
          clearInterval(pollRef.current);
          setExpired(true);
          setPollStatus('expired');
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    // 4) Polling mỗi 3 giây
    pollRef.current = setInterval(() => {
      const sid = sessionRef.current;
      if (!sid) return;
      setPollSeconds(s => s + 3);
      fetch(`${API}/api/webhooks/payment-session/${sid}`)
        .then(r => r.json())
        .then(res => {
          if (res.status === 'paid') {
            clearInterval(countdownRef.current);
            clearInterval(pollRef.current);
            setPollStatus('paid');
            // Tự động đăng ký: price snapshot = effectivePrice (giá sau giảm)
            addStudent({
              name: formData.name,
              age: parseInt(formData.age) || 0,
              phone: formData.zalo,
              zalo: formData.zalo,
              course: formData.course,
              price: formData.effectivePrice || formData.price,
              branchId:   formData.branchId   || undefined,
              branchCode: formData.branchCode || '',
              paid: true,
            });
            setTimeout(() => setStep(3), 500);
          } else if (res.status === 'expired') {
            clearInterval(countdownRef.current);
            clearInterval(pollRef.current);
            setExpired(true);
            setPollStatus('expired');
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(countdownRef.current);
      clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleBack = () => {
    clearInterval(countdownRef.current);
    clearInterval(pollRef.current);
    sessionRef.current = null;
    setSessionId(null);
    setExpired(false);
    setStep(1);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'name') {
      setFormData({ ...formData, name: value.toUpperCase() });
    } else if (name === 'courseId') {
      const selected = dbCourses.find(c => c._id === value);
      if (selected) {
        const ep = calcEff(selected.price, selected.discountPercent);
        setFormData(f => ({
          ...f,
          courseId: selected._id,
          course: selected.name,
          price: selected.price,
          discountPercent: selected.discountPercent || 0,
          effectivePrice: ep,
        }));
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleNext = () => {
    if (!formData.name.trim()) { alert('Vui lòng nhập họ tên học viên!'); return; }
    if (!formData.zalo.trim()) { alert('Vui lòng nhập số Zalo!'); return; }
    sessionRef.current = null; // reset để tạo session mới
    setStep(2);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    await new Promise(r => setTimeout(r, 500));
    await exportPDF({ studentName: formData.name });
    setExporting(false);
  };

  // QR dùng effectivePrice (giá sau giảm)
  const qrUrl = centerBank
    ? generateVietQRUrl(centerBank.bankCode, centerBank.accountNumber, formData.effectivePrice || formData.price, ckContent, centerBank.accountName)
    : null;

  const invoiceData = {
    studentName: formData.name || 'HỌC VIÊN',
    courseName: formData.course,
    tuitionFee: formData.effectivePrice || formData.price, // luôn dùng giá thực tế
    date: new Date(),
    receiverName: 'Hồ Thị Nga',
    isPaid: step === 3,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 flex items-center justify-center p-4">

      {/* Overlay Quá Hạn */}
      {expired && step === 2 && <ExpiredOverlay onBack={handleBack} />}

      <div className="w-full max-w-2xl">
        <div className="bg-white shadow-2xl rounded-2xl border border-gray-100 overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-500 px-8 py-5">
            <div className="flex items-center gap-3">
              <img src="/logo-thang-tin-hoc.svg" alt="Thắng Tin Học" className="h-10 brightness-0 invert" />
              <div>
                <h1 className="text-white text-lg font-bold tracking-wide">TRUNG TÂM THẮNG TIN HỌC</h1>
                <p className="text-red-100 text-xs">Đăng ký khóa học trực tuyến</p>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex items-center gap-2">
              {['Thông tin', 'Thanh toán', 'Hoàn tất'].map((label, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-2 w-full rounded-full transition-all duration-500 ${
                    step > i + 1 ? 'bg-green-500' : step === i + 1 ? 'bg-red-600' : 'bg-gray-200'
                  }`} />
                  <span className={`text-xs font-medium ${step >= i + 1 ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8">

            {/* ===== BƯỚC 1 ===== */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-bold text-red-700 flex items-center gap-2">
                  <GraduationCap size={28} /> ĐĂNG KÝ KHÓA HỌC
                </h2>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <User size={14} /> Họ và tên học viên
                  </label>
                  <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="NGUYỄN VĂN A"
                    className="w-full p-3.5 border-2 border-gray-200 rounded-xl focus:border-red-500 outline-none uppercase font-semibold text-gray-800 placeholder:font-normal placeholder:text-gray-400 placeholder:uppercase transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Tuổi</label>
                    <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="20" min="10" max="80"
                      className="w-full p-3.5 border-2 border-gray-200 rounded-xl focus:border-red-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                      <Phone size={14} /> Số Zalo
                    </label>
                    <input type="text" name="zalo" value={formData.zalo} onChange={handleChange} placeholder="093xxxxxxx"
                      className="w-full p-3.5 border-2 border-gray-200 rounded-xl focus:border-red-500 outline-none transition-all" />
                  </div>
                </div>

                {/* Chọn khóa học — dynamic từ DB */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <BookOpen size={14} /> Chọn khóa học
                  </label>
                  {coursesLoading ? (
                    <div className="flex items-center gap-2 p-3.5 border-2 border-gray-200 rounded-xl text-gray-400 text-sm">
                      <Loader2 size={14} className="animate-spin" /> Đang tải khóa học...
                    </div>
                  ) : (
                    <select name="courseId" value={formData.courseId} onChange={handleChange}
                      className="w-full p-3.5 border-2 border-gray-200 rounded-xl focus:border-red-500 outline-none font-bold text-blue-800 bg-white transition-all">
                      {dbCourses.map(c => {
                        const ep = calcEff(c.price, c.discountPercent);
                        const pct = c.discountPercent || 0;
                        return (
                          <option key={c._id} value={c._id}>
                            {c.name} — {pct > 0 ? `${ep.toLocaleString('vi-VN')}đ (-${pct}%)` : `${c.price.toLocaleString('vi-VN')}đ`}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {/* Chọn chi nhánh */}
                {branches.length > 1 && (
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                      🏢 Cơ sở đăng ký học
                    </label>
                    <select
                      value={formData.branchId}
                      onChange={e => {
                        const b = branches.find(x => x._id === e.target.value);
                        setFormData(f => ({ ...f, branchId: e.target.value, branchCode: b?.code || '' }));
                      }}
                      className="w-full p-3.5 border-2 border-gray-200 rounded-xl focus:border-red-500 outline-none font-bold text-gray-800 bg-white transition-all">
                      {branches.map(b => (
                        <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hiệu ứng marketing giá */}
                {formData.course && (
                  <div className="rounded-2xl overflow-hidden border-2 border-red-200 shadow-sm">
                    {formData.discountPercent > 0 ? (
                      <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="bg-yellow-400 text-red-800 text-xs font-black px-2.5 py-1 rounded-full animate-pulse">
                            ⚡ GIẢM {formData.discountPercent}%
                          </span>
                          <span className="line-through text-red-200 text-base">
                            {formData.price.toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-white text-3xl font-black">
                            {formData.effectivePrice.toLocaleString('vi-VN')} VNĐ
                          </span>
                          <span className="text-red-200 text-sm">
                            (tiết kiệm {(formData.price - formData.effectivePrice).toLocaleString('vi-VN')}đ)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-100 px-5 py-4 flex justify-between items-center">
                        <span className="text-sm text-gray-600 font-medium">Học phí:</span>
                        <span className="text-2xl font-bold text-red-700">{formData.price.toLocaleString('vi-VN')} VNĐ</span>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleNext} disabled={!formData.course || coursesLoading}
                  className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-50">
                  TIẾP TỤC THANH TOÁN →
                </button>
              </div>
            )}

            {/* ===== BƯỚC 2 ===== */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors">
                    <ArrowLeft size={16} /> Quay lại
                  </button>

                  {/* Countdown */}
                  {!expired && <Countdown seconds={timeLeft} total={TOTAL} />}
                </div>

                <h2 className="text-2xl font-bold text-gray-800 flex items-center justify-center gap-2">
                  <CreditCard size={28} /> THANH TOÁN HỌC PHÍ
                </h2>

                {/* Tóm tắt */}
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-5 space-y-2">
                  <div className="flex justify-between"><span className="text-gray-600">Học viên:</span><span className="font-bold">{formData.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Khóa học:</span><span className="font-semibold text-blue-700 text-sm">{formData.course}</span></div>
                  <hr className="border-yellow-200" />
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Số tiền:</span>
                    <span className="text-2xl font-bold text-red-700">{formData.price.toLocaleString('vi-VN')} VNĐ</span>
                  </div>
                </div>

                {/* QR */}
                {bankLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                    <Loader2 size={22} className="animate-spin text-blue-400" />
                    <span className="text-sm">Đang tải thông tin ngân hàng...</span>
                  </div>
                ) : !centerBank ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800 text-sm">Chưa cấu hình ngân hàng</p>
                      <p className="text-amber-600 text-xs mt-1">Admin vào <strong>Cài đặt hệ thống → Tài khoản Thu học phí</strong>.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="bg-white p-3 border-2 border-dashed border-blue-200 rounded-2xl inline-block">
                        <img src={qrUrl} alt="QR Thanh Toán" className="w-52 h-52 mx-auto object-contain"
                          onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                        <div className="w-52 h-52 mx-auto bg-gray-100 rounded-xl items-center justify-center text-gray-400 text-sm" style={{display:'none'}}>
                          <div className="text-center"><CreditCard size={36} className="mx-auto mb-2 opacity-30" /><p>Lỗi tải QR</p></div>
                        </div>
                        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-gray-500">Quét mã để đóng học phí</p>
                      </div>
                    </div>

                    {/* Thông tin ngân hàng */}
                    <div className="text-sm bg-gray-50 rounded-xl p-4 space-y-1.5">
                      <div className="flex justify-between"><span className="text-gray-500">Ngân hàng</span><span className="font-bold">{centerBank.bankName}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Số tài khoản</span><span className="font-mono font-bold tracking-wider">{centerBank.accountNumber}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Chủ tài khoản</span><span className="font-bold uppercase text-right max-w-[60%] leading-tight">{centerBank.accountName}</span></div>
                    </div>
                  </>
                )}

                <p className="text-center text-sm text-gray-500 italic">
                  Nội dung CK: <span className="font-semibold text-gray-700">{ckContent}</span>
                </p>

                {/* Trạng thái polling */}
                {pollStatus === 'paid' ? (
                  <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl py-3 text-emerald-700 font-bold">
                    <CheckCircle size={18} /> Đã xác nhận thanh toán! Đang chuyển...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl py-3">
                    <RefreshCw size={12} className="animate-spin text-blue-400" />
                    Đang tự động kiểm tra thanh toán... ({pollSeconds}s)
                  </div>
                )}
              </div>
            )}

            {/* ===== BƯỚC 3 ===== */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle size={48} className="text-green-500" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">ĐĂNG KÝ THÀNH CÔNG!</h2>
                  <p className="text-gray-500 mt-2">Thông tin của <span className="font-semibold text-gray-700">{formData.name}</span> đã được lưu vào hệ thống.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 text-left space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Học viên:</span><span className="font-bold">{formData.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Khóa học:</span><span className="font-semibold text-blue-700">{formData.course}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Học phí:</span><span className="font-bold text-red-700">{formData.price.toLocaleString('vi-VN')} VNĐ</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Trạng thái:</span>
                    <span className="font-bold text-green-600 flex items-center gap-1"><CheckCircle size={14} /> ĐÃ THANH TOÁN</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 pt-2">
                  <button onClick={handleExportPDF} disabled={exporting}
                    className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    {exporting ? <><Loader2 size={22} className="animate-spin"/>Đang xuất PDF...</> : <><Printer size={22}/>IN HÓA ĐƠN A5 (PHIẾU THU)</>}
                  </button>
                  <button onClick={() => onNavigate('student')}
                    className="w-full py-3 text-blue-600 font-semibold hover:text-blue-800 flex items-center justify-center gap-2">
                    <LayoutDashboard size={18} /> VÀO DASHBOARD XEM LỊCH HỌC
                  </button>
                  <button onClick={() => { setStep(1); sessionRef.current = null; setFormData({ name:'', age:'', zalo:'', course: COURSES[0].name, price: COURSES[0].price }); }}
                    className="text-sm text-gray-400 hover:text-gray-600">
                    Đăng ký học viên mới
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invoice ẩn */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceTemplate data={invoiceData} />
        </div>
      </div>
    </div>
  );
};

export default RegistrationForm;
