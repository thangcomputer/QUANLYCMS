import React, { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import {
  ShieldCheck, UserCheck, MessageCircle, BookOpen,
  Plus, Search, Bell, LogOut, Users, GraduationCap,
  CheckCircle2, Clock, XCircle, ChevronRight, ChevronLeft, BarChart3,
  TrendingUp, DollarSign, Star, Printer, Trash2, Filter,
  FileSpreadsheet, Download, Eye, AlertTriangle, Unlock, Lock, User,
  Phone, CalendarCheck, MessageSquare, Video, FileText, ShieldAlert,
  Edit3, X, PlayCircle, Save, RefreshCw, Trophy, ClipboardList, CreditCard, HelpCircle,
  MoreHorizontal, AlertCircle, Landmark, Loader2, Settings, RotateCcw, MapPin, Layers, Camera, KeyRound
} from 'lucide-react';



import { useData } from '../context/DataContext';
import { useSocket } from '../context/SocketContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../utils/toast.jsx';
import { useBranch } from '../context/BranchContext';
import InvoiceTemplate from './InvoiceTemplate';
import exportPDF from '../utils/exportPDF';
import { exportStudentsExcel, exportToCSV } from '../utils/exportExcel';
import api from '../services/api';
import { BankSelect, generateVietQRUrl } from './BankSelect';
import { useModal } from '../utils/Modal.jsx';
import SystemSettingsTab from './SystemSettingsTab';
import StaffManagementTab from './StaffManagementTab';
import RevenueAnalyticsTab from './RevenueAnalyticsTab';
import EmployeeManagementTab from './EmployeeManagementTab';
import StudentDetailModal from './StudentDetailModal';
import StudentImportModal from './StudentImportModal';
import TeacherScheduleHistoryPanel from './TeacherScheduleHistoryPanel';
import AdminCourseBuilder from './AdminCourseBuilder';

// ─── RICH TEXT EDITOR (tương thích React 18, không dùng prompt) ──────────────
const RichTextEditor = ({ value, onChange, placeholder }) => {
  const editorRef = React.useRef(null);
  const hasInitialized = React.useRef(false);
  const [showLinkInput, setShowLinkInput] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const savedSelection = React.useRef(null);

  React.useEffect(() => {
    if (editorRef.current && !hasInitialized.current) {
      editorRef.current.innerHTML = value || '';
      hasInitialized.current = true;
    }
  }, []);

  React.useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      if (!hasInitialized.current || value === '') {
        editorRef.current.innerHTML = value || '';
        hasInitialized.current = true;
      }
    }
  }, [value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (savedSelection.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  };

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(cmd, false, val);
    saveSelection();
    handleInput();
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Color picker handlers
  const handleFgColor = (e) => {
    restoreSelection();
    exec('foreColor', e.target.value);
  };
  const handleBgColor = (e) => {
    restoreSelection();
    exec('hiliteColor', e.target.value);
  };

  // Image upload → base64
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      restoreSelection();
      editorRef.current?.focus();
      document.execCommand('insertImage', false, ev.target.result);
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Link insertion
  const openLinkInput = () => {
    saveSelection();
    setLinkUrl('');
    setShowLinkInput(true);
  };
  const applyLink = () => {
    if (linkUrl.trim()) {
      restoreSelection();
      exec('createLink', linkUrl.trim().startsWith('http') ? linkUrl.trim() : 'https://' + linkUrl.trim());
    }
    setShowLinkInput(false);
  };

  const btnClass = "p-1.5 rounded hover:bg-purple-100 text-gray-600 hover:text-purple-700 transition text-xs font-bold cursor-pointer select-none";

  return (
    <div className="border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-purple-400 transition relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 bg-gray-50 border-b border-gray-200"
        onMouseDown={e => e.preventDefault()}>
        <select
          onMouseDown={e => { e.stopPropagation(); saveSelection(); }}
          onChange={e => { if (e.target.value) { editorRef.current?.focus(); restoreSelection(); document.execCommand('formatBlock', false, e.target.value); saveSelection(); handleInput(); } e.target.selectedIndex = 0; }}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white mr-1 cursor-pointer" defaultValue="">
          <option value="" disabled>Heading</option>
          <option value="h1">Tiêu đề 1</option>
          <option value="h2">Tiêu đề 2</option>
          <option value="h3">Tiêu đề 3</option>
          <option value="p">Bình thường</option>
        </select>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Text formatting */}
        <button type="button" onClick={() => exec('bold')} className={btnClass} title="In đậm (Ctrl+B)"><b>B</b></button>
        <button type="button" onClick={() => exec('italic')} className={btnClass} title="In nghiêng (Ctrl+I)"><i>I</i></button>
        <button type="button" onClick={() => exec('underline')} className={btnClass} title="Gạch chân (Ctrl+U)"><u>U</u></button>
        <button type="button" onClick={() => exec('strikeThrough')} className={btnClass} title="Gạch ngang"><s>S</s></button>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Color pickers - native input[type=color] hidden behind buttons */}
        <label className={btnClass + " relative overflow-hidden"} title="Màu chữ" onMouseDown={e => e.stopPropagation()}>
          <span className="flex items-center gap-0.5">A<span className="w-3 h-1.5 rounded-sm bg-red-500 block" /></span>
          <input type="color" defaultValue="#ff0000"
            onMouseDown={e => { e.stopPropagation(); saveSelection(); }}
            onChange={handleFgColor}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
        <label className={btnClass + " relative overflow-hidden"} title="Tô nền chữ" onMouseDown={e => e.stopPropagation()}>
          <span className="flex items-center gap-0.5">A<span className="w-3 h-1.5 rounded-sm bg-yellow-300 block" /></span>
          <input type="color" defaultValue="#ffff00"
            onMouseDown={e => { e.stopPropagation(); saveSelection(); }}
            onChange={handleBgColor}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Lists */}
        <button type="button" onClick={() => exec('insertUnorderedList')} className={btnClass} title="Danh sách chấm">• ≡</button>
        <button type="button" onClick={() => exec('insertOrderedList')} className={btnClass} title="Danh sách số">1. ≡</button>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Link */}
        <button type="button" onClick={openLinkInput} className={btnClass} title="Chèn liên kết">🔗</button>

        {/* Image upload */}
        <label className={btnClass + " relative overflow-hidden"} title="Chèn hình ảnh" onMouseDown={e => e.stopPropagation()}>
          🖼️
          <input type="file" accept="image/*"
            onMouseDown={e => { e.stopPropagation(); saveSelection(); }}
            onChange={handleImageUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Clear */}
        <button type="button" onClick={() => exec('removeFormat')} className={btnClass} title="Xoá định dạng">✕</button>
      </div>

      {/* Inline link input panel */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200" onMouseDown={e => e.stopPropagation()}>
          <span className="text-xs font-bold text-blue-600">🔗 URL:</span>
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
            placeholder="https://example.com"
            className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            autoFocus
          />
          <button type="button" onClick={applyLink}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition">Chèn</button>
          <button type="button" onClick={() => setShowLinkInput(false)}
            className="text-gray-400 hover:text-gray-600 text-xs">Huỷ</button>
        </div>
      )}

      {/* Editor area */}
      <div ref={editorRef}
        contentEditable
        onInput={handleInput}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        className="min-h-[200px] px-4 py-3 text-sm text-gray-800 leading-relaxed outline-none"
        style={{ wordBreak: 'break-word' }}
        data-placeholder={placeholder || 'Nhập nội dung...'}
        suppressContentEditableWarning
      />
      <style>{`
        [data-placeholder]:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; display: block; }
        [contenteditable] img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        [contenteditable] a { color: #6366f1; text-decoration: underline; }
        [contenteditable] ul { list-style: disc; padding-left: 1.5em; margin: 4px 0; }
        [contenteditable] ol { list-style: decimal; padding-left: 1.5em; margin: 4px 0; }
        [contenteditable] li { margin: 2px 0; }
        [contenteditable] h1 { font-size: 1.75em; font-weight: 700; margin: 8px 0 4px; }
        [contenteditable] h2 { font-size: 1.4em; font-weight: 700; margin: 6px 0 3px; }
        [contenteditable] h3 { font-size: 1.15em; font-weight: 700; margin: 4px 0 2px; }
      `}</style>
    </div>
  );
};

// ─── STAT CARD (Nâng cấp Premium) ──────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color, trend }) => (
  <div className="group bg-white rounded-[32px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50 flex items-start gap-5 hover:shadow-[0_20px_40px_rgba(220,38,38,0.08)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
    {/* Decorative background element */}
    <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-110 transition-transform ${color}`} />
    
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${color} group-hover:rotate-6 transition-transform`}>
      <Icon size={26} className="text-white drop-shadow-md" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-gray-400 font-black uppercase tracking-widest">{label}</p>
        {trend && (
           <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
             {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
           </span>
        )}
      </div>
      <p className="text-2xl font-black text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1 font-bold italic">{sub}</p>}
    </div>
  </div>
);

// ─── AVATAR BADGE ─────────────────────────────────────────────────────────────
const Avatar = ({ initials, color = 'bg-red-500' }) => (
  <div className={`w-10 h-10 rounded-2xl ${color} flex items-center justify-center text-white text-[12px] font-black shadow-inner border-2 border-white/20`}>
    {initials}
  </div>
);

// ─── MODAL THÊM HỌC VIÊN ─────────────────────────────────────────────────────
const AddStudentModal = ({ onAdd, onClose, teachers }) => {
  const toast    = useToast();
  const API      = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const TOTAL_PAYMENT_SECS = 300; // 5 phút

  const { isSuperAdmin, branches, selectedBranchId } = useBranch();

  // ── Step: 'form' | 'qr' | 'success' ─────────────────────────────────────
  const [step, setStep] = useState('form');

  // ── Form state ────────────────────────────────────────────────────────────
  const [dbCourses, setDbCourses] = useState([]);
  const [form, setForm] = useState({
    name: '', age: '', phone: '', zalo: '',
    courseId: '', course: '', price: 0, totalSessions: 12,
    paid: false, teacherId: '', learningMode: 'OFFLINE', branchId: ''
  });

  // Fetch courses from DB
  useEffect(() => {
    fetch(`${API}/api/courses`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.length) {
          setDbCourses(res.data);
          const first = res.data[0];
          const ep = Math.round(first.price * (1 - (first.discountPercent || 0) / 100));
          let defaultBranchId = '';
          if (selectedBranchId && selectedBranchId !== 'all') {
             defaultBranchId = selectedBranchId;
          } else if (branches && branches.length > 0) {
             defaultBranchId = branches[0]._id;
          }
          
          let mode = 'OFFLINE';
          if (defaultBranchId) {
             const checkBranch = branches.find(b => String(b._id) === String(defaultBranchId));
             if (checkBranch && checkBranch.name.toLowerCase().includes('online')) {
                mode = 'ONLINE';
             }
          }

          setForm(f => ({ ...f, courseId: first._id, course: first.name, price: ep, totalSessions: 12, branchId: defaultBranchId, learningMode: mode }));
        }
      })
      .catch(() => {});
  }, [API, isSuperAdmin, selectedBranchId, branches]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'name') { setForm(f => ({ ...f, name: value.toUpperCase() })); return; }
    
    if (name === 'branchId') {
      const selectedB = branches.find(b => String(b._id) === String(value));
      let mode = form.learningMode;
      if (selectedB && selectedB.name.toLowerCase().includes('online')) {
        mode = 'ONLINE';
      }
      setForm(f => ({ ...f, branchId: value, learningMode: mode }));
      return;
    }

    if (name === 'courseId') {
      const c = dbCourses.find(x => x._id === value);
      if (c) {
        const ep = Math.round(c.price * (1 - (c.discountPercent || 0) / 100));
        setForm(f => ({ ...f, courseId: c._id, course: c.name, price: ep }));
      }
      return;
    }
    if (type === 'checkbox') { setForm(f => ({ ...f, [name]: checked })); return; }
    setForm(f => ({ ...f, [name]: value }));
  };

  // ── QR payment state ──────────────────────────────────────────────────────
  const [bankInfo, setBankInfo]     = useState(null);
  const [timeLeft, setTimeLeft]     = useState(TOTAL_PAYMENT_SECS);
  const [pollStatus, setPollStatus] = useState('pending'); // 'pending' | 'paid'
  const [sessionId, setSessionId]   = useState(null);
  const pollRef                     = React.useRef(null);
  const timerRef                    = React.useRef(null);

  const studentCode = `TTH${Date.now().toString().slice(-5)}`;
  const ckContent   = `${form.name.replace(/\s+/g,'').slice(0,8) || 'HV'} ${studentCode} Nop hoc phi`.trim();

  // Fetch bank + create session khi vào step qr
  useEffect(() => {
    if (step !== 'qr') return;
    setTimeLeft(TOTAL_PAYMENT_SECS);
    setPollStatus('pending');

    // 1) Fetch bank settings (public endpoint)
    fetch(`${API}/api/settings/bank`)
      .then(r => r.json())
      .then(res => { if (res.success) setBankInfo(res.data); })
      .catch(() => {});

    // 2) Create payment session
    const token = (() => { try { return JSON.parse(localStorage.getItem('admin_user') || '{}').token || ''; } catch { return ''; } })();
    fetch(`${API}/api/webhooks/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: form.price, content: ckContent }),
    }).then(r => r.json()).then(res => { if (res.sessionId) setSessionId(res.sessionId); }).catch(() => {});

    // Countdown
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);

    return () => { clearInterval(timerRef.current); clearInterval(pollRef.current); };
  }, [step]);

  // Polling mỗi 3s
  useEffect(() => {
    if (step !== 'qr' || pollStatus === 'paid') return;
    const sid = sessionId;
    pollRef.current = setInterval(async () => {
      if (!sid && !ckContent) return;
      try {
        const r = await fetch(`${API}/api/webhooks/payment-status?sessionId=${sid || ''}&content=${encodeURIComponent(ckContent)}`).then(x => x.json());
        if (r.paid) {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          setPollStatus('paid');
          setStep('success');
          // Lưu học viên (paid=true)
          onAdd({ ...form, age: Number(form.age), id: Date.now(), paid: true, studentCode });
          // Tự đóng sau 2.5s
          setTimeout(() => onClose(), 2500);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [step, sessionId, pollStatus]);

  const handleSubmitForm = () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Vui lòng nhập họ tên và số điện thoại!'); return; }
    if (form.paid) {
      // Paid manually marked — add directly
      onAdd({ ...form, age: Number(form.age), id: Date.now(), paid: true });
      onClose(); return;
    }
    setStep('qr');
  };

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const qrUrl = bankInfo?.centerBankCode && bankInfo?.centerBankAccountNumber
    ? `https://img.vietqr.io/image/${bankInfo.centerBankCode}-${bankInfo.centerBankAccountNumber}-compact2.png?amount=${form.price}&addInfo=${encodeURIComponent(ckContent)}&accountName=${encodeURIComponent(bankInfo.centerBankAccountName || '')}`
    : null;

  // ── STEP: success ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center gap-4 w-72">
          <div className="relative w-20 h-20">
            {/* Spinner ring */}
            <svg className="animate-spin absolute inset-0" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="36" stroke="#22c55e" strokeWidth="6" strokeDasharray="200" strokeDashoffset="50" strokeLinecap="round" />
            </svg>
            {/* Checkmark */}
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-emerald-500 animate-bounce" />
            </div>
          </div>
          <p className="text-lg font-black text-emerald-700">Thanh toán thành công!</p>
          <p className="text-xs text-gray-400 text-center">Đã đăng ký học viên<br /><strong>{form.name}</strong></p>
        </div>
      </div>
    );
  }

  // ── STEP: QR payment ─────────────────────────────────────────────────────
  if (step === 'qr') {
    const expired = timeLeft === 0;
    const pct     = (timeLeft / TOTAL_PAYMENT_SECS) * 100;
    const isUrgent = timeLeft < 60;

    return (
      <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-[9999] p-4" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white flex items-center justify-between">
            <div>
              <p className="font-black text-base">💳 Quét QR Thanh Toán</p>
              <p className="text-xs opacity-80">{form.name} — {form.course?.slice(0,25)}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition">
              <X size={14} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {expired ? (
              <div className="text-center py-8 space-y-3">
                <div className="text-5xl">⏰</div>
                <p className="font-black text-red-600 text-lg">Phiên thanh toán hết hạn</p>
                <p className="text-sm text-gray-400">Vui lòng thử lại</p>
                <button onClick={() => { setStep('form'); }} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition">
                  Quay lại
                </button>
              </div>
            ) : (
              <>
                {/* Countdown bar */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className={isUrgent ? 'text-red-500 animate-pulse' : 'text-gray-500'}>⏱ Còn lại</span>
                    <span className={`font-mono font-black ${isUrgent ? 'text-red-500' : 'text-gray-700'}`}>{formatTime(timeLeft)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Amount */}
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 text-center">
                  <p className="text-xs text-gray-500 font-medium">Số tiền cần thanh toán</p>
                  <p className="text-2xl font-black text-red-600">{form.price.toLocaleString('vi-VN')}đ</p>
                </div>

                {/* QR Code */}
                {qrUrl ? (
                  <div className="flex justify-center">
                    <div className="border-4 border-emerald-400 rounded-2xl p-2 shadow-lg shadow-emerald-100">
                      <img src={qrUrl} alt="VietQR" className="w-44 h-44 object-contain rounded-xl" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Loader2 size={20} className="animate-spin" /> Đang tải mã QR...
                  </div>
                )}

                {/* Transfer content */}
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Nội dung chuyển khoản</p>
                  <p className="font-mono font-bold text-gray-800 text-sm">{ckContent}</p>
                </div>

                {/* Polling indicator */}
                <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                  <Loader2 size={12} className="animate-spin text-emerald-500" />
                  Đang kiểm tra thanh toán tự động mỗi 3 giây...
                </div>

                <button onClick={onClose} className="w-full py-2 border-2 border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                  Đóng (thanh toán sau)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: form (Tái cấu trúc UI lưới 2 cột) ─────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#dc2626] to-[#991b1b] px-8 py-6 flex items-center justify-between">
          <h3 className="text-white font-black text-2xl flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-2xl backdrop-blur-md">
              <Plus size={28} />
            </div>
            Thêm Học Viên Mới
          </h3>
          <button onClick={onClose} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center text-white transition-all cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Body Lưới 2 cột */}
        <div className="p-10 max-h-[75vh] overflow-y-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Cột Trái: Thông tin Cá nhân */}
            <div className="space-y-6 md:border-r border-gray-100 md:pr-10">
              <h4 className="font-black text-gray-400 text-[11px] mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
                <span className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center text-[10px] shadow-lg shadow-red-200">1</span>
                Thông tin Cá nhân
              </h4>
              
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Họ tên học viên <span className="text-red-500">*</span></label>
                <input name="name" value={form.name} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] p-4 uppercase font-black text-gray-800 outline-none transition-all shadow-sm" placeholder="VD: NGUYỄN VĂN A" />
              </div>
              
              <div className="flex gap-3 items-end">
                <div style={{width: '100px', flexShrink: 0}}>
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Tuổi</label>
                  <input name="age" type="number" value={form.age} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] px-3 py-4 font-bold text-gray-800 outline-none transition-all shadow-sm text-center" placeholder="20" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Số điện thoại / Zalo <span className="text-red-500">*</span></label>
                  <input name="phone" value={form.phone} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] p-4 font-black text-gray-800 outline-none transition-all shadow-sm font-mono" placeholder="0911222333" />
                </div>
              </div>
            </div>

            {/* Cột Phải: Thông tin Khóa học */}
            <div className="space-y-6 md:pl-2">
              <h4 className="font-black text-gray-400 text-[11px] mb-6 flex items-center gap-2 uppercase tracking-[0.2em]">
                <span className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center text-[10px] shadow-lg shadow-slate-200">2</span>
                Đăng ký Khóa học
              </h4>

              {/* Step: Branch Selection (If SuperAdmin) */}
              {isSuperAdmin && (
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Cơ sở (Chi nhánh)</label>
                <select name="branchId" value={form.branchId || ''} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] p-4 font-black text-gray-800 outline-none transition-all shadow-sm appearance-none cursor-pointer">
                  <option value="">-- Chọn cơ sở đào tạo --</option>
                  {branches.map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              )}

              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-3">Hình thức học</label>
                <div className="flex gap-4">
                  <label className={`flex items-center gap-3 cursor-pointer border-2 p-4 rounded-2xl transition-all flex-1 ${form.learningMode === 'OFFLINE' ? 'border-red-600 bg-red-50 shadow-md shadow-red-100' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'}`}>
                    <input type="radio" name="learningMode" value="OFFLINE" checked={form.learningMode === 'OFFLINE'} onChange={handleChange} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.learningMode === 'OFFLINE' ? 'border-red-600' : 'border-gray-300'}`}>
                       {form.learningMode === 'OFFLINE' && <div className="w-2.5 h-2.5 rounded-full bg-red-600" />}
                    </div>
                    <span className="font-black uppercase text-xs">🏢 Tại cơ sở</span>
                  </label>
                  <label className={`flex items-center gap-3 cursor-pointer border-2 p-4 rounded-2xl transition-all flex-1 ${form.learningMode === 'ONLINE' ? 'border-red-600 bg-red-50 shadow-md shadow-red-100' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'}`}>
                    <input type="radio" name="learningMode" value="ONLINE" checked={form.learningMode === 'ONLINE'} onChange={handleChange} className="hidden" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.learningMode === 'ONLINE' ? 'border-red-600' : 'border-gray-300'}`}>
                       {form.learningMode === 'ONLINE' && <div className="w-2.5 h-2.5 rounded-full bg-red-600" />}
                    </div>
                    <span className="font-black uppercase text-xs">🌐 Online</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Khóa học & Học phí</label>
                {dbCourses.length > 0 ? (
                  <select name="courseId" value={form.courseId} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] p-4 font-black text-gray-800 outline-none transition-all shadow-sm cursor-pointer">
                    {dbCourses.map(c => {
                      const ep = Math.round(c.price * (1 - (c.discountPercent || 0) / 100));
                      return <option key={c._id} value={c._id}>{c.name} — {ep.toLocaleString('vi-VN')}đ</option>;
                    })}
                  </select>
                ) : (
                  <div className="p-4 bg-gray-50 rounded-[20px] text-gray-400 text-xs font-bold animate-pulse">Đang tải dữ liệu khóa học...</div>
                )}
                {form.price > 0 && (
                  <div className="mt-3 flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl border border-emerald-100 inline-flex shadow-sm">
                    <DollarSign size={14} className="font-black" />
                    <span className="text-xs font-black">HỌC PHÍ THỰC THU: {form.price.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Giảng viên hướng dẫn</label>
                <select name="teacherId" value={form.teacherId} onChange={handleChange} className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-[20px] p-4 font-black text-gray-800 outline-none transition-all shadow-sm cursor-pointer">
                  <option value="">-- Chọn sau (Không bắt buộc) --</option>
                  {teachers.filter(t => t.status === 'Active' || (t.testScore >= 80)).map(t => (
                    <option key={t.id || t._id} value={t.id || t._id}>{t.name} (Điểm: {t.testScore || 100})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer: Bottom actions */}
          <div className="mt-12 pt-10 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-50/50 -mx-10 -mb-10 px-10 pb-10 pt-8 rounded-b-[40px]">
            <label className="flex items-center gap-4 cursor-pointer select-none group">
              <div className="relative">
                <input type="checkbox" name="paid" checked={form.paid} onChange={handleChange} className="peer hidden" />
                <div className="w-7 h-7 bg-white rounded-lg border-2 border-gray-200 peer-checked:bg-red-600 peer-checked:border-red-600 transition-all flex items-center justify-center shadow-sm">
                  <CheckCircle2 size={16} className="text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
              </div>
              <div>
                <span className="text-sm font-black text-gray-800 block uppercase tracking-tight group-hover:text-red-600 transition-colors">Đính kèm biên lai / Đã thanh toán</span>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Học sinh đã nộp tiền mặt hoặc chuyển khoản trực tiếp</p>
              </div>
            </label>

            <div className="flex gap-4 w-full md:w-auto">
              <button 
                onClick={onClose} 
                className="px-10 py-4 bg-white border-2 border-gray-100 rounded-[22px] text-xs font-black text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-all"
              >
                HỦY BỎ
              </button>
              <button 
                onClick={handleSubmitForm} 
                className="flex-1 md:flex-none px-12 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-[22px] text-xs font-black tracking-widest shadow-xl shadow-red-200 hover:shadow-red-500/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 uppercase active:scale-95"
              >
                {form.paid ? <><CheckCircle2 size={18} /> HOÀN TẤT ĐĂNG KÝ</> : <><CreditCard size={18} /> QUÉT MÃ QR & ĐĂNG KÝ</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
// ─── MODAL CHỈNH SỬA HỌC VIÊN ─────────────────────────────────────────────────────
const EditStudentModal = ({ student, onSave, onClose, teachers }) => {
  const toast    = useToast();
  const API      = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const { isSuperAdmin, branches } = useBranch();

  const [dbCourses, setDbCourses] = useState([]);
  const [form, setForm] = useState({
    name: student.name || '',
    age: student.age || '',
    phone: student.phone || '',
    zalo: student.zalo || '',
    courseId: student.courseId || '',
    course: student.course || '',
    price: student.price || 0,
    totalSessions: student.totalSessions || 12,
    paid: !!student.paid,
    teacherId: student.teacherId || '',
    learningMode: student.learningMode || 'OFFLINE',
    branchId: student.branchId || ''
  });
  const [studentExamUnlocked, setStudentExamUnlocked] = useState(!!student.studentExamUnlocked);

  // Fetch courses from DB
  useEffect(() => {
    fetch(`${API}/api/courses`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data.length) {
          setDbCourses(res.data);
          // Only auto-set if course is completely empty, otherwise keep user's original course
          if (!form.courseId && !form.course) {
             const first = res.data[0];
             const ep = Math.round(first.price * (1 - (first.discountPercent || 0) / 100));
             setForm(f => ({ ...f, courseId: first._id, course: first.name, price: ep }));
          }
        }
      })
      .catch(() => {});
  }, [API, form.courseId, form.course]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'name') { setForm(f => ({ ...f, name: value.toUpperCase() })); return; }
    
    if (name === 'branchId') {
      const selectedB = branches.find(b => String(b._id) === String(value));
      let mode = form.learningMode;
      if (selectedB && selectedB.name.toLowerCase().includes('online')) {
        mode = 'ONLINE';
      }
      setForm(f => ({ ...f, branchId: value, learningMode: mode }));
      return;
    }

    if (name === 'courseId') {
      // Find course by ID or name
      const c = dbCourses.find(x => String(x._id) === String(value) || x.name === value);
      if (c) {
        // Only update price if it's changing the course
        const ep = Math.round(c.price * (1 - (c.discountPercent || 0) / 100));
        setForm(f => ({ ...f, courseId: c._id, course: c.name, price: ep }));
      }
      return;
    }
    
    if (name === 'studentExamUnlocked') {
      setStudentExamUnlocked(checked);
      return;
    }

    if (type === 'checkbox') { setForm(f => ({ ...f, [name]: checked })); return; }
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmitForm = () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Vui lòng nhập họ tên và số điện thoại!'); return; }
    onSave({
      ...student,
      ...form,
      studentExamUnlocked
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-8 py-5 flex items-center justify-between">
          <h3 className="text-white font-bold text-xl flex items-center gap-3"><Edit3 size={24} /> Chỉnh sửa Học Viên</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white transition cursor-pointer">
            <X size={24} />
          </button>
        </div>

        {/* Body Lưới 2 cột */}
        <div className="p-8 max-h-[75vh] overflow-y-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Cột Trái: Thông tin Cá nhân */}
            <div className="space-y-6 md:border-r border-gray-100 md:pr-8">
              <h4 className="font-black text-gray-800 text-sm mb-4 flex items-center gap-2 uppercase tracking-wide">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs">1</span>
                Thông tin Cá nhân
              </h4>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Họ tên học viên <span className="text-red-500">*</span></label>
                <input name="name" value={form.name} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 uppercase font-semibold focus:border-red-500 focus:ring-4 focus:ring-red-50 outline-none transition" placeholder="VD: NGUYỄN VĂN A" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tuổi</label>
                  <input name="age" type="number" value={form.age} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 focus:border-red-500 focus:ring-4 focus:ring-red-50 outline-none transition" placeholder="VD: 20" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Số điện thoại / Zalo <span className="text-red-500">*</span></label>
                  <input name="phone" value={form.phone} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 focus:border-red-500 focus:ring-4 focus:ring-red-50 outline-none transition font-mono" placeholder="0911222333" />
                </div>
              </div>
            </div>

            {/* Cột Phải: Thông tin Khóa học */}
            <div className="space-y-6 md:pl-2">
              <h4 className="font-black text-gray-800 text-sm mb-4 flex items-center gap-2 uppercase tracking-wide">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">2</span>
                Thông tin Khóa học
              </h4>

              {/* Dropdown Chi nhánh */}
              {isSuperAdmin && (
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Cơ sở đăng ký</label>
                <select name="branchId" value={form.branchId || ''} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition text-sm font-bold text-gray-800 bg-gray-50 cursor-pointer">
                  <option value="">-- Chọn cơ sở --</option>
                  {branches.map(b => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              )}

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Hình thức học</label>
                <div className="flex gap-3">
                  <label className={`flex flex-col items-center justify-center gap-1 cursor-pointer border-2 p-3 rounded-xl transition flex-1 ${form.learningMode === 'OFFLINE' ? 'border-red-500 bg-red-50 shadow-sm' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <input type="radio" name="learningMode" value="OFFLINE" checked={form.learningMode === 'OFFLINE'} onChange={handleChange} className="w-4 h-4 accent-red-600 cursor-pointer hidden" />
                    <span className={`font-black text-base ${form.learningMode === 'OFFLINE' ? 'text-red-700' : 'text-gray-400'}`}>🏢 Offline</span>
                    <span className={`text-[11px] font-semibold ${form.learningMode === 'OFFLINE' ? 'text-red-600/70' : 'text-gray-400'}`}>Tại cơ sở</span>
                  </label>
                  <label className={`flex flex-col items-center justify-center gap-1 cursor-pointer border-2 p-3 rounded-xl transition flex-1 ${form.learningMode === 'ONLINE' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <input type="radio" name="learningMode" value="ONLINE" checked={form.learningMode === 'ONLINE'} onChange={handleChange} className="w-4 h-4 accent-blue-600 cursor-pointer hidden" />
                    <span className={`font-black text-base ${form.learningMode === 'ONLINE' ? 'text-blue-700' : 'text-gray-400'}`}>🌐 Online</span>
                    <span className={`text-[11px] font-semibold ${form.learningMode === 'ONLINE' ? 'text-blue-600/70' : 'text-gray-400'}`}>Từ xa</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Khóa học đăng ký</label>
                {dbCourses.length > 0 ? (
                  <select name="courseId" value={form.courseId || form.course} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition font-bold text-blue-800 bg-gray-50 cursor-pointer text-sm">
                    {/* Preserve existing course if not found in dbCourses */}
                    {!dbCourses.some(c => String(c._id) === String(form.courseId) || c.name === form.course) && (form.courseId || form.course) && <option value={form.courseId || form.course}>{form.course}</option>}
                    {dbCourses.map(c => {
                      const ep = Math.round(c.price * (1 - (c.discountPercent || 0) / 100));
                      // We use c._id as value, but if old student has only course name, we might fallback
                      return <option key={c._id} value={c._id}>{c.name} — {ep.toLocaleString('vi-VN')}đ</option>;
                    })}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 border-2 border-gray-200 rounded-xl p-3.5 text-gray-400 text-sm bg-gray-50">
                    <Loader2 size={16} className="animate-spin" /> Đang tải dữ liệu...
                  </div>
                )}
                
                <div className="flex gap-4 mt-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Học phí (VNĐ)</label>
                    <input type="number" name="price" value={form.price} onChange={handleChange} className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none bg-emerald-50 text-emerald-700 font-bold" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Tổng số buổi</label>
                    <input type="number" name="totalSessions" value={form.totalSessions} onChange={handleChange} className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:border-blue-500 outline-none bg-blue-50 text-blue-700 font-bold" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Giảng viên hướng dẫn <span className="text-gray-400 font-normal">(Tùy chọn)</span></label>
                <select name="teacherId" value={form.teacherId} onChange={handleChange} className="w-full border-2 border-gray-200 rounded-xl p-3.5 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition text-sm bg-gray-50 cursor-pointer">
                  <option value="">-- Có thể chọn sau --</option>
                  {teachers.filter(t => t.status === 'Active' || (t.testScore >= 80)).map(t => (
                    <option key={t.id || t._id} value={t.id || t._id}>{t.name} (Điểm: {t.testScore || 100})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Full width row */}
          <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col md:flex-row items-center gap-6 justify-between bg-gray-50/50 -mx-8 -mb-8 px-8 pb-8 pt-6 rounded-b-3xl">
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              <label className="flex items-center gap-3 cursor-pointer select-none p-3.5 bg-green-50 border-2 border-green-200 rounded-2xl transition hover:bg-green-100/70 hover:shadow-sm">
                <input type="checkbox" name="paid" checked={form.paid} onChange={handleChange} className="w-5 h-5 accent-green-600 rounded cursor-pointer" />
                <div>
                  <span className="text-sm font-black text-green-800 block">Đã đóng học phí</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none p-3.5 bg-blue-50 border-2 border-blue-200 rounded-2xl transition hover:bg-blue-100/70 hover:shadow-sm">
                <input type="checkbox" name="studentExamUnlocked" checked={studentExamUnlocked} onChange={handleChange} className="w-5 h-5 accent-blue-600 rounded cursor-pointer" />
                <div>
                  <span className="text-sm font-black text-blue-800 block">[Mở khóa phòng thi đặc cách]</span>
                </div>
              </label>
            </div>

            <div className="flex gap-3 w-full md:w-auto mt-4 md:mt-0">
              <button 
                onClick={onClose} 
                className="flex-1 md:flex-none px-8 py-3.5 bg-white border-2 border-gray-200 rounded-2xl font-bold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  setResetPwInput('');
                  setResetPwModal({ id: student.id || student._id, name: student.name, role: 'student' });
                }}
                className="flex-1 md:flex-none px-4 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-amber-100 transition-all whitespace-nowrap"
              >
                <KeyRound size={15} /> Cấp lại MK
              </button>
              <button 
                onClick={handleSubmitForm} 
                className="flex-[2] md:flex-none px-8 py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-2xl font-black hover:from-red-700 hover:to-red-600 shadow-[0_8px_16px_rgba(220,38,38,0.2)] hover:shadow-[0_8px_20px_rgba(220,38,38,0.3)] transition-all flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                <Save size={20} className="drop-shadow-sm" /> Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
const AdminDashboard = ({ onNavigate }) => {
  // ── Đọc từ DataContext (dữ liệu chung) ──
  const {
    students, teachers: globalTeachers,
    addStudent: ctxAddStudent,
    addTeacher: ctxAddTeacher,
    removeTeacher: ctxRemoveTeacher,
    updateTeacher: ctxUpdateTeacher,
    assignTeacher: ctxAssignTeacher,
    approveTeacher: ctxApproveTeacher,
    rejectTeacher: ctxRejectTeacher,
    removeStudent: ctxRemoveStudent,
    updateStudent: ctxUpdateStudent,
    payTeacher: ctxPayTeacher,
    markStudentPaid,
    transactions,
    getAdminStats, getTeacherRating, getPrivateEvaluationsForAdmin, markEvaluationRead,
    notifications, markNotificationRead, getNotifications, addNotification,
    systemLogs, addSystemLog,
    trainingData, addTrainingItem, updateTrainingItem, removeTrainingItem,
    studentTrainingData, addStudentTrainingItem, updateStudentTrainingItem, removeStudentTrainingItem,
    approveStudentExam, revokeStudentExam,
    questions, addQuestion, updateQuestion, removeQuestion, resetQuestions,
    studentQuestions, addStudentQuestion, updateStudentQuestion, removeStudentQuestion, resetStudentQuestions,
    grantPending,
    triggerBackgroundSync,
    examResults, addExamResult, updateExamResult, removeExamResult,
    // Pagination
    studentsPagination, fetchStudentsPaginated,
  } = useData();

  const { socket } = useSocket();
  const toast = useToast();
  const { showModal: showGlobalModal } = useModal();
  const { selectedBranchId, branches } = useBranch();  // Global branch filter
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // ⭐ RBAC: Xác định quyền admin — dùng để ẩn/hiện nút action
  const _sess = JSON.parse(localStorage.getItem('admin_user') || localStorage.getItem('staff_user') || '{}');
  const isSuperAdmin = _sess?.id === 'admin' || _sess?.adminRole === 'SUPER_ADMIN';
  const staffPermissions = _sess?.permissions || [];

  // ── (Đã chuyển logic Tài chính xuống dưới để tránh khai báo trùng lặp) ──

  const location = useLocation();
  const navigate = useNavigate();
  const currentHash = location.hash?.replace('#', '') || 'dashboard';
  const activeTab = currentHash;

  // ── Branch-aware stats (Auto-refresh with SWR: every 5s or on window focus) ────────
  const statsFetcher = async ([key, branch_id]) => {
    const params = branch_id && branch_id !== 'all' ? { branch_id } : {};
    const res = await api.students.getStats(params);
    return res?.success ? res.data : null;
  };
  
  const { data: branchStats } = useSWR(
    activeTab === 'dashboard' ? ['admin_stats', selectedBranchId] : null,
    statsFetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  // Khoá bài thi sinh viên qua socket
  const lockStudentExam = (student) => {
    const reason = `Admin đã khoá bài thi của bạn. Lý do: Vi phạm quy chế phòng thi.`;
    revokeStudentExam(student.id, reason);
    if (socket) {
      socket.emit('exam:locked', {
        studentId: student.id,
        studentName: student.name,
        reason,
      });
    }
    toast.success(`Đã khoá bài thi của ${student.name} và gửi thông báo tức thì!`);
  };

  // Refresh dữ liệu mỗi khi Admin chuyển qua lại giữa các view (Tab)
  useEffect(() => {
    triggerBackgroundSync();
  }, [activeTab, triggerBackgroundSync]);

  // ── 💡 GỌI GIẢNG VIÊN VỀ STATE LOCAL (KÈM QUERY BRANCH) ĐỂ VIEW LỌC ĐƯỢC ──
  const [teachers, setLocalTeachers] = useState([]);
  
  const fetchTeachers = useCallback(async () => {
    try {
      const params = selectedBranchId && selectedBranchId !== 'all' 
        ? { branch_id: selectedBranchId } : {};
      const res = await api.teachers.getAll(params);
      if (res?.success) setLocalTeachers(res.data.map(t => ({ ...t, id: t._id })));
    } catch (e) {}
  }, [selectedBranchId]);

  useEffect(() => {
    // Fetch khi branch đổi, hoặc tab chuyển qua teachers (kiểm tra real-time)
    fetchTeachers();
  }, [fetchTeachers, activeTab]);

  const handlePayTeacher = async (teacher) => {
    const teacherId = String(teacher.id || teacher._id);
    const now = new Date();
    // Mở modal bước 1 với trạng thái loading trước
    setPayoutModal({
      step: 1,
      isLoading: true,
      teacher,
      teacherId,
      teacherName: teacher.name,
      baseSalaryPerSession: teacher.baseSalaryPerSession || 0,
      pendingSessionsCount: 0,
      sessionsCount: '',
      amount: '',
      note: `Thù lao giảng dạy tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
      bankInfo: teacher.bankAccount || {},
    });
    // Fetch số buổi nợ + thông tin ngân hàng thực từ DB
    try {
      const res = await api.teachers.getPendingSessions(teacherId);
      if (res.success) {
        const { pendingSessionsCount, salaryPerSession, bankInfo } = res.data;
        const autoAmount = pendingSessionsCount * (salaryPerSession || teacher.baseSalaryPerSession || 0);
        setPayoutModal(prev => prev ? ({
          ...prev,
          isLoading: false,
          pendingSessionsCount,
          baseSalaryPerSession: salaryPerSession || prev.baseSalaryPerSession,
          sessionsCount: String(pendingSessionsCount),
          amount: String(autoAmount),
          bankInfo: bankInfo || prev.bankInfo || {},
        }) : null);
      } else {
        setPayoutModal(prev => prev ? { ...prev, isLoading: false } : null);
      }
    } catch {
      setPayoutModal(prev => prev ? { ...prev, isLoading: false } : null);
    }
  };

  const unreadEvals = getPrivateEvaluationsForAdmin().filter(ev => !ev.read).length;
  const adminNotifs = getNotifications(null, 'admin');
  const unreadNotifs = adminNotifs.filter(n => !n.read).length;

  // States
  const [search, setSearch] = useState('');
  const [filterPaid, setFilterPaid] = useState('all');
  const [filterCourse, setFilterCourse] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [actionMenuId, setActionMenuId] = useState(null); // 3-dot menu
  const [showModal, setShowModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ name: '', phone: '', specialty: '', startDate: new Date().toISOString().split('T')[0], address: '' });
  const [showStudentDetailId, setShowStudentDetailId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const BLANK_Q = { type: 'multiple', section: 'excel', q: '', options: ['', '', '', ''], correct: 0, difficulty: 'medium', sampleAnswer: '' };

  // Nhật ký hệ thống từ DB
  const [dbLogs, setDbLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (activeTab === 'logs') {
      setIsLoadingLogs(true);
      api.systemLogs.getAll(1, 100)
        .then(res => setDbLogs(res.data))
        .catch(err => void 0)
        .finally(() => setIsLoadingLogs(false));
    }
  }, [activeTab]);

  // Tài chính trực tiếp từ Server (Single Source of Truth)
  const financeFetcher = async ([key, branch_id]) => {
    const params = branch_id && branch_id !== 'all' ? { branch_id } : {};
    const [resTx, resSt] = await Promise.all([
      api.transactions.getAll(params),
      api.students.getAll(`?${new URLSearchParams(params).toString()}`)
    ]);
    return {
      financialData: resTx?.success ? (resTx.data || []) : [],
      financeStudents: resSt?.success ? (resSt.data || []) : []
    };
  };

  const { data: financeRes, isValidating: isLoadingFinance } = useSWR(
    activeTab === 'finance' ? ['admin_finance', selectedBranchId] : null,
    financeFetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  const financialData = financeRes?.financialData || [];
  const financeStudents = financeRes?.financeStudents || [];

  // ── Server-side paginated fetch for students tab ─────────────────────────────
  useEffect(() => {
    if (activeTab === 'students') {
      fetchStudentsPaginated({ page: currentPage, limit: PAGE_SIZE, search, paid: filterPaid, course: filterCourse, branch_id: selectedBranchId });
    }
  }, [activeTab, currentPage, search, filterPaid, filterCourse, fetchStudentsPaginated, selectedBranchId]);

  // Reset page when filters change (including branch change)
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterPaid, filterCourse, selectedBranchId]);

  // ── Socket listener: khi cơ sở thêm HV mới → auto-refresh danh sách + stats ──
  useEffect(() => {
    if (!socket) return;

    const handleStudentNew = (data) => {
      toast.success(`📋 Học viên mới: ${data?.name || 'N/A'} — ${data?.course || ''}`);

      // Re-fetch students nếu đang ở tab students
      if (activeTab === 'students') {
        fetchStudentsPaginated({ page: currentPage, limit: 10, branch_id: selectedBranchId });
      }

      // Re-fetch stats
      const params = selectedBranchId && selectedBranchId !== 'all'
        ? { branch_id: selectedBranchId } : {};
      api.students.getStats(params).then(res => {
        if (res?.success) setBranchStats(res.data);
      }).catch(() => {});
    };

    socket.on('student:new', handleStudentNew);
    return () => socket.off('student:new', handleStudentNew);
  }, [socket, activeTab, currentPage, selectedBranchId, fetchStudentsPaginated, toast]);


  // Close 3-dot menu when clicking outside
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = () => setActionMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [actionMenuId]);

  const [editTeacher, setEditTeacher] = useState(null);
  const [resetPwModal, setResetPwModal] = useState(null); // { id, name, role } 
  const [resetPwInput, setResetPwInput] = useState('');
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null); // { type: 'teacher'|'student', id, name }
  const [grantModal, setGrantModal] = useState(null); // { id, name, type: 'retry' | 'first' }
  const [exportingId, setExportingId] = useState(null);
  const [printStudent, setPrintStudent] = useState(null);
  const [expandedId, setExpandedId] = useState(null); // Cho Responsive Table

  // Lọc Ngân hàng câu hỏi nâng cao
  const [qSearch, setQSearch] = useState('');
  const [qSection, setQSection] = useState('all');
  const [qDifficulty, setQDifficulty] = useState('all');
  const [qSort, setQSort] = useState('newest');
  const [qForm, setQForm] = useState(null); // null=closed, {}=add, {id}=edit

  // Nhắc nợ Zalo
  const sendDebtReminder = (student) => {
    const message = `Chào ${student.name}, Trung tâm gửi lời nhắn nhắc bạn hoàn thiện học phí khóa ${student.course}. Trân trọng!`;
    const url = `https://zalo.me/${student.zalo}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const [approveModal, setApproveModal] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);
  // payoutModal: { step:1|2, isLoading, teacher, teacherId, teacherName, baseSalaryPerSession,
  //                pendingSessionsCount, sessionsCount, amount, note, bankInfo }
  const [payoutModal, setPayoutModal] = useState(null);

  // Training management state
  const [trainingTab, setTrainingTab] = useState('videos');
  const [trainingForm, setTrainingForm] = useState(null);
  const [courseBuilderMode, setCourseBuilderMode] = useState(null); // The course object being edited
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Student Training management state
  const [sTrainingTab, setSTrainingTab] = useState('videos');
  const [sTrainingForm, setSTrainingForm] = useState(null);
  const [sDeleteConfirm, setSDeleteConfirm] = useState(null);

  // Student Question Bank states
  const [sqSearch, setSqSearch] = useState('');
  const [sqSection, setSqSection] = useState('all');
  const [sqForm, setSqForm] = useState(null);

  // Exam Results states (Học viên - Đào tạo HV)
  const [erSearch, setErSearch] = useState('');
  const [gradingRow, setGradingRow] = useState(null);   // e.g. 'studentId-subjectId'
  const [gradingValue, setGradingValue] = useState('');
  const [erForm, setErForm] = useState(null);
  const BLANK_ER = {
    type: 'student',
    studentId: '', studentName: '',
    subject: 'THVP NÂNG CAO (12 BUỔI)',
    multipleChoiceCorrect: '', multipleChoiceTotal: '',
    essayScore: '', essayNote: '',
    passed: false, date: new Date().toISOString().split('T')[0]
  };

  // Exam Results states (Giảng viên - Đào tạo GV)
  const [erGvSearch, setErGvSearch] = useState('');
  const [erGvForm, setErGvForm] = useState(null);
  const BLANK_ER_GV = {
    type: 'teacher',
    teacherId: '', teacherName: '',
    subject: 'BÀI TEST GIẢNG VIÊN',
    multipleChoiceCorrect: '', multipleChoiceTotal: '',
    essayScore: '', essayNote: '',
    passed: false, date: new Date().toISOString().split('T')[0]
  };

  // Cấp quyền giảng viên
  const approveTeacher = async (id) => {
    await ctxApproveTeacher(id);
    const t = teachers.find(x => String(x.id) === String(id));
    if(t) addSystemLog('Phê duyệt Giảng viên', t.name, 'Admin', 'bg-green-50 text-green-600');
    setApproveModal(null);
    fetchTeachers();
  };

  // Đánh dấu đã xem file thực hành
  const markFileReviewed = async (id) => {
    try {
      await ctxUpdateTeacher(id, {
        practicalStatus: 'passed',
        status: 'active'
      });
      toast.success('Đã cập nhật: Giảng viên đủ điều kiện giảng dạy!');
      fetchTeachers();
    } catch (e) {
      toast.error('Lỗi khi lưu trạng thái.');
    } finally {
      setReviewModal(null);
    }
  };

  // Mở popup xác nhận xoá giảng viên
  const removeTeacher = (id) => {
    const t = teachers.find(x => String(x.id) === String(id));
    setDeleteModal({ type: 'teacher', id, name: t?.name || 'Giảng viên' });
  };

  // Mở popup xác nhận xoá học viên
  const removeStudent = (id) => {
    const s = students.find(x => String(x.id) === String(id));
    setDeleteModal({ type: 'student', id, name: s?.name || 'Học viên' });
  };

  // Thực hiện xoá sau khi xác nhận
  const confirmDelete = async () => {
    if (!deleteModal) return;
    try {
      if (deleteModal.type === 'teacher') {
        await ctxRemoveTeacher(deleteModal.id);
        addSystemLog('Xoá bản ghi', `Giảng viên - ${deleteModal.name}`, 'Admin', 'bg-red-50 text-red-600');
        toast.success(`Đã xoá giảng viên ${deleteModal.name}`);
        fetchTeachers();
      } else {
        await ctxRemoveStudent(deleteModal.id);
        addSystemLog('Xoá bản ghi', `Học viên - ${deleteModal.name}`, 'Admin', 'bg-red-50 text-red-600');
        toast.success(`Đã xoá học viên ${deleteModal.name}`);
        mutate(['admin_stats', selectedBranchId]);
        mutate(['admin_finance', selectedBranchId]);
        // Refresh paginated data
        fetchStudentsPaginated({ page: currentPage, limit: PAGE_SIZE, search, paid: filterPaid, course: filterCourse, branch_id: selectedBranchId });
      }
    } catch (err) {
      toast.error('Lỗi xoá: ' + (err.message || 'Không xác định'));
    }
    setDeleteModal(null);
  };

  // Thêm học viên
  const addStudent = async (student) => {
    try {
      await ctxAddStudent({
        name: student.name,
        age: student.age,
        phone: student.phone,
        zalo: student.zalo,
        courseId: student.courseId,
        course: student.course,
        price: student.price,
        totalSessions: 12,
        paid: student.paid,
        learningMode: student.learningMode,
        teacherId: student.teacherId,
        branchId: student.branchId,
      });
      toast.success('Đã thêm học viên thành công!');
      mutate(['admin_stats', selectedBranchId]);
      mutate(['admin_finance', selectedBranchId]);
      // Refresh paginated data
      fetchStudentsPaginated({ page: 1, limit: PAGE_SIZE, search, paid: filterPaid, course: filterCourse, branch_id: selectedBranchId });
      setCurrentPage(1);
    } catch (err) {
      toast.error('Lỗi thêm học viên: ' + (err.message || 'Không xác định'));
    }
  };

  // Bước 1 → 2: Chuyển sang QR
  const handleGoToQR = () => {
    if (!payoutModal?.sessionsCount || Number(payoutModal.sessionsCount) <= 0) {
      toast.error('Số buổi phải lớn hơn 0');
      return;
    }
    if (!payoutModal?.amount || Number(payoutModal.amount) <= 0) {
      toast.error('Số tiền phải lớn hơn 0');
      return;
    }
    setPayoutModal(prev => ({ ...prev, step: 2 }));
  };

  // Bước 2: Xác nhận đã chuyển khoản → gọi API lưu DB
  const handlePayout = async () => {
    if (!payoutModal?.teacherId) return;
    const loadingId = toast.loading('Đang lưu giao dịch...');
    try {
      const res = await api.teachers.payFlexible(
        payoutModal.teacherId,
        Number(payoutModal.sessionsCount),
        Number(payoutModal.amount),
        payoutModal.note,
      );
      toast.dismiss(loadingId);
      if (res.success) {
        const { paidSessions, totalAmount } = res.data || {};
        toast.success(`✅ Thanh toán ${paidSessions} buổi — ${Number(totalAmount).toLocaleString('vi-VN')}đ cho ${payoutModal.teacherName}`);
        setPayoutModal(null);
        mutate(['admin_finance', selectedBranchId]);
        triggerBackgroundSync();
      } else {
        toast.error(res.message || 'Thanh toán thất bại');
      }
    } catch (err) {
      toast.dismiss(loadingId);
      toast.error('Lỗi kết nối: ' + (err.message || 'Không rõ nguyên nhân'));
    }
  };

  // Phân giảng viên
  const assignTeacher = (studentId, teacherId) => {
    ctxAssignTeacher(studentId, teacherId);
  };

  // Thanh toán lương giảng viên cho học viên cụ thể
  const handlePayTeacherForStudent = async (student, action) => {
    const isPack = action === 'PAID_IN_ADVANCE';
    const actionText = isPack ? 'thanh toán TRỌN GÓI lương Giảng viên' : 'thanh toán các buổi CHƯA TRẢ LƯƠNG (cộng dồn)';
    showGlobalModal({
      title: 'Xác nhận thanh toán lương',
      content: `Xác nhận ${actionText} cho môn của học viên ${student.name}?\n\nChú ý: Hành động này sẽ thay đổi trạng thái nhận lương của giảng viên.`,
      type: 'question',
      confirmText: 'Xác nhận',
      cancelText: 'Quay lại',
      onConfirm: async () => {
        const tid = toast.loading(`Đang xử lý thanh toán GV cho ${student.name}...`);
        try {
          const res = await api.students.payTeacher(student.id || student._id, action).catch(e => e);
          if (res && res.success) {
            toast.dismiss(tid);
            toast.success(res.message || 'Cập nhật thành công');
            fetchStudentsPaginated({ page: currentPage, limit: PAGE_SIZE, search, paid: filterPaid, course: filterCourse, branch_id: selectedBranchId });
          } else {
            toast.dismiss(tid);
            toast.error('Lỗi: ' + (res?.message || 'Không xác định'));
          }
        } catch (err) {
          toast.dismiss(tid);
          toast.error('Lỗi kết nối API');
        }
      }
    });
  };

  // Xuất PDF hóa đơn
  const handlePrintInvoice = async (student) => {
    setExportingId(student.id);
    setPrintStudent(student);
    const tid = toast.loading(`Đang tạo hóa đơn cho ${student.name}...`);
    try {
      await new Promise(r => setTimeout(r, 600));
      await exportPDF({ studentName: student.name });
      toast.dismiss(tid);
      toast.success(`Xuất hóa đơn thành công!`);
    } catch {
      toast.dismiss(tid);
      toast.error('Xuất hóa đơn thất bại. Vui lòng thử lại.');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    const tid = toast.loading('Đang xuất dữ liệu học viên sang Excel(CSV)...');
    try {
      const dataToExport = filteredStudents.map(s => ({
        'Họ Tên': s.name,
        'Khóa học': s.course,
        'Tuổi': s.age || '',
        'SĐT': s.phone || '',
        'Zalo': s.zalo || '',
        'Học phí': s.price,
        'Trạng thái': s.paid ? 'Đã thanh toán' : 'Chưa thanh toán'
      }));
      
      exportToCSV(dataToExport, `DanhSachHocVien_${Date.now()}.csv`);
      toast.dismiss(tid);
      toast.success('Xuất Excel thành công!');
    } catch (e) {
      toast.dismiss(tid);
      toast.error('Xuất Excel thất bại: ' + (e.message || 'Lỗi không xác định'));
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Học viên đã được phân trang từ server — không cần lọc client-side nữa
  const filteredStudents = students;

  // Lọc giảng viên
  const filteredTeachers = teachers.filter(t =>
    (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  const activeTeachers = teachers.filter(t => t.status === 'Active' || t.status === 'active').length;
  const paidStudents = students.filter(s => s.paid).length;
  const totalRevenue = students.filter(s => s.paid).reduce((sum, s) => sum + (s.price || 0), 0);

  // ── Stats cards: ưu tiên dùng dữ liệu từ API (branch-aware), fallback về các giá trị local
  const statTotalStudents  = branchStats?.total       ?? students.length;
  const statPaidStudents   = branchStats?.paid        ?? students.filter(s => s.paid).length;
  const statActiveTeachers = branchStats?.activeTeachers ?? teachers.filter(t => t.status === 'Active' || t.status === 'active').length;
  const statTotalTeachers  = branchStats?.activeTeachers != null ? branchStats.activeTeachers : teachers.length;
  const statTotalRevenue   = branchStats?.totalRevenue   ?? students.filter(s => s.paid).reduce((sum, s) => sum + (s.price || 0), 0);
  const statPendingTeachers = branchStats?.pendingTeachers ?? teachers.filter(t => t.status === 'Pending').length;

  return (
    <div className="bg-transparent h-full">

      {/* Main content */}
      <div className="min-w-0">
        {/* Topbar removed - using DashboardLayout header */}

        <div className="p-8 space-y-8">
          {/* ===== TAB: TỔNG QUAN (DASHBOARD) ===== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              
              {/* STAT CARDS - PREMIUM RED THEME */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  icon={Users} 
                  label="Tổng học viên" 
                  value={statTotalStudents} 
                  sub={`${statPaidStudents} đã hoàn tất học phí`} 
                  color="bg-gradient-to-br from-red-600 to-red-800"
                  trend={12} 
                />
                <StatCard 
                  icon={GraduationCap} 
                  label="Giảng viên" 
                  value={statTotalTeachers} 
                  sub={`${statActiveTeachers} đang trực tiếp giảng dạy`} 
                  color="bg-gradient-to-br from-slate-800 to-slate-950" 
                />
                <StatCard 
                  icon={DollarSign} 
                  label="Doanh thu" 
                  value={`${(statTotalRevenue / 1000000).toFixed(1)}M`} 
                  sub="VNĐ doanh thu thực tế" 
                  color="bg-gradient-to-br from-red-500 to-rose-700"
                  trend={8}
                />
                <StatCard 
                  icon={TrendingUp} 
                  label="Hồ sơ mới" 
                  value={statPendingTeachers} 
                  sub="đang chờ xét duyệt hồ sơ" 
                  color="bg-gradient-to-br from-amber-500 to-orange-600" 
                />
              </div>

              {/* Quick info panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Học viên mới */}
                <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-gray-100 p-8 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-gray-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                        <Users size={18} />
                      </div>
                      Học viên vừa đăng ký
                    </h3>
                    <button onClick={() => navigate('/admin#students')} className="text-[11px] font-black text-red-600 hover:underline uppercase tracking-widest">Xem tất cả</button>
                  </div>
                  
                  {students.slice(0, 5).length > 0 ? (
                    <div className="space-y-4">
                      {students.slice(0, 5).map(s => (
                        <div key={s.id || s._id} className="group flex items-center justify-between p-4 rounded-2xl hover:bg-red-50/50 transition-all border border-transparent hover:border-red-100">
                          <div className="flex items-center gap-4">
                             <Avatar initials={(s.name || '?').charAt(0).toUpperCase()} color={s.paid ? 'bg-red-600' : 'bg-slate-400'} />
                            <div>
                              <p className="text-sm font-black text-gray-800 group-hover:text-red-700 transition-colors uppercase tracking-tight">{s.name}</p>
                              <p className="text-[10px] text-gray-400 font-bold">{s.course || 'Chưa chọn khóa'}</p>
                            </div>
                          </div>
                          <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${s.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {s.paid ? 'Đã thu' : 'Chờ thu'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                       <p className="text-sm text-gray-300 font-bold italic">Chưa có dữ liệu học viên mới</p>
                    </div>
                  )}
                </div>

                {/* Giảng viên */}
                <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-gray-100 p-8 transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-gray-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
                        <GraduationCap size={18} />
                      </div>
                      Đội ngũ Giảng viên
                    </h3>
                    <button onClick={() => navigate('/admin#teachers')} className="text-[11px] font-black text-red-600 hover:underline uppercase tracking-widest">Quản lý GV</button>
                  </div>

                  {teachers.slice(0, 5).length > 0 ? (
                    <div className="space-y-4">
                      {teachers.slice(0, 5).map(t => (
                        <div key={t.id || t._id} className="group flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                          <div className="flex items-center gap-4">
                            <Avatar initials={(t.name || '?').substring(0,2).toUpperCase()} color={['Active','active'].includes(t.status) ? 'bg-red-600' : 'bg-amber-500'} />
                            <div>
                              <p className="text-sm font-black text-gray-800 uppercase tracking-tight">{t.name}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">{t.phone} {t.branchCode ? `· ${t.branchCode}` : ''}</p>
                            </div>
                          </div>
                          <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${
                            ['Active','active'].includes(t.status) ? 'bg-emerald-100 text-emerald-700 font-black' :
                            t.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {['Active','active'].includes(t.status) ? 'Đang dạy' : t.status === 'Pending' ? 'Chờ duyệt' : t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                       <p className="text-sm text-gray-300 font-bold italic">Chưa có dữ liệu giảng viên</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick navigation - PREMIUM CARDS */}
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 px-2">Truy cập nhanh hệ thống</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Học viên', hash: 'students', icon: Users, color: 'from-red-600 to-red-700', desc: 'Quản lý danh sách' },
                    { label: 'Giảng viên', hash: 'teachers', icon: GraduationCap, color: 'from-slate-800 to-slate-900', desc: 'Duyệt hồ sơ mới' },
                    { label: 'Tài chính', hash: 'finance', icon: DollarSign, color: 'from-red-700 to-rose-800', desc: 'Thu chi & báo cáo' },
                    { label: 'Doanh thu', hash: 'analytics', icon: TrendingUp, color: 'from-slate-900 to-black', desc: 'Phân tích tăng trưởng' },
                  ].map(q => (
                    <button key={q.hash} onClick={() => navigate(`/admin#${q.hash}`)}
                      className={`group relative bg-gradient-to-br ${q.color} text-white rounded-[24px] p-6 text-left hover:shadow-2xl hover:shadow-red-900/20 transition-all duration-300 overflow-hidden`}>
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700" />
                      <q.icon size={28} className="mb-4 text-white/50 group-hover:text-white transition-colors" />
                      <p className="text-base font-black uppercase tracking-tight">{q.label}</p>
                      <p className="text-[10px] text-white/60 font-medium group-hover:text-white/100 transition-colors uppercase tracking-wider">{q.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: HỌC VIÊN ===== */}
          {activeTab === 'students' && (
            <div className="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* ── TOOLBAR ──────────────────────────────────────────────── */}
              <div className="px-8 py-6 border-b border-gray-50">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  <h2 className="text-xl font-black text-gray-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                      <BookOpen size={22} />
                    </div>
                    Quản lý Học Viên
                    <span className="text-[11px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg ml-2">{studentsPagination.totalRecords} HV</span>
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 lg:flex-none">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-2xl text-xs font-bold focus:border-red-600 focus:bg-white outline-none w-full lg:w-60 transition-all shadow-sm"
                        placeholder="Tìm tên / SĐT..."
                      />
                    </div>
                    {/* Filter: Course */}
                    <select
                      value={filterCourse}
                      onChange={e => setFilterCourse(e.target.value)}
                      className="py-2.5 px-4 bg-gray-50 border-2 border-transparent rounded-2xl text-[11px] font-black uppercase focus:border-red-600 outline-none cursor-pointer transition-all shadow-sm"
                    >
                      <option value="all">Tất cả khóa học</option>
                      <option value="THVP">THVP Nâng Cao</option>
                      <option value="MOS">MOS Excel</option>
                      <option value="THIET KE">Thiết Kế Đồ Họa</option>
                      <option value="AUTOCAD">AutoCAD</option>
                      <option value="PYTHON">Lập trình Python</option>
                    </select>
                    {/* Filter: Payment */}
                    <select
                      value={filterPaid}
                      onChange={e => setFilterPaid(e.target.value)}
                      className="py-2.5 px-4 bg-gray-50 border-2 border-transparent rounded-2xl text-[11px] font-black uppercase focus:border-red-600 outline-none cursor-pointer transition-all shadow-sm"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="paid">✅ Đã đóng phí</option>
                      <option value="unpaid">❌ Chưa đóng phí</option>
                    </select>
                    {/* Export button */}
                    <button
                      onClick={handleExportExcel}
                      disabled={isExportingExcel}
                      className="flex items-center gap-2 bg-white border-2 border-gray-100 text-gray-500 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase hover:bg-gray-50 transition-all disabled:opacity-50 shadow-sm"
                    >
                      {isExportingExcel
                        ? <><Loader2 size={14} className="animate-spin" /> ...</>
                        : <><Download size={14} /> Xuất</>
                      }
                    </button>
                    {/* Import button */}
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-2 bg-emerald-50 border-2 border-emerald-100 text-emerald-600 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase hover:bg-emerald-100 transition-all shadow-sm"
                    >
                      <FileSpreadsheet size={14} /> Nhập Excel
                    </button>
                    {/* Add button */}
                    <button
                      onClick={() => setShowModal(true)}
                      className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase shadow-lg shadow-red-200 hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                    >
                      <Plus size={16} /> Thêm Học Viên
                    </button>
                  </div>
                </div>
              </div>

              {/* ── TABLE ────────────────────────────────────────────────── */}
              <div className="overflow-x-auto min-h-[600px]">
                <table className="w-full text-left border-collapse min-w-[900px] lg:min-w-0">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Học viên</th>
                      <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Khóa học</th>
                      <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Giáo viên</th>
                      <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Học phí</th>
                      <th className="px-5 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Trạng thái</th>
                      <th className="px-4 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-16 text-center text-gray-400">
                          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Users size={28} className="opacity-30" />
                          </div>
                          <p className="text-sm font-bold">Không tìm thấy học viên nào</p>
                          <p className="text-xs text-gray-300 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                        </td>
                      </tr>
                    ) : filteredStudents.map(s => {
                      const teacherVal = (typeof s.teacherId === 'object' && s.teacherId !== null) ? s.teacherId._id : (s.teacherId || '');
                      const teacherName = (typeof s.teacherId === 'object' && s.teacherId !== null) ? s.teacherId.name : teachers.find(t => String(t.id) === String(s.teacherId))?.name;
                      const regDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '';
                      return (
                        <tr key={s.id} className="group hover:bg-slate-50/80 transition-colors">
                          {/* Cột Học viên */}
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar initials={s.name?.substring(0, 2).toUpperCase() || 'HV'} color={s.paid ? 'bg-indigo-500' : 'bg-rose-500'} />
                              <div className="min-w-0">
                                <p className="font-black text-slate-900 text-[13px] group-hover:text-blue-600 transition-colors leading-none mb-0.5 uppercase tracking-tight truncate max-w-[180px]">{s.name}</p>
                                <p className="text-[10px] text-gray-400 font-medium">{regDate}{s.phone ? ` · ${s.phone}` : ''}</p>
                              </div>
                            </div>
                          </td>
                          {/* Cột Khóa học */}
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] font-bold text-slate-700 leading-tight block truncate max-w-[160px]">{s.course}</span>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase ${s.learningMode === 'ONLINE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                                {s.learningMode === 'ONLINE' ? '🌐 ONLINE' : '🏢 OFFLINE'}
                              </span>
                              {s.branchId && branches?.find(b => String(b._id) === String(s.branchId)) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-orange-50 text-orange-600 border border-orange-100">
                                  <MapPin size={9} />
                                  {branches.find(b => String(b._id) === String(s.branchId))?.name?.toUpperCase()}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-gray-50 text-gray-400 border border-gray-100">
                                  <MapPin size={9} />
                                  CHƯA PHÂN CƠ SỞ
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Cột Giáo viên */}
                          <td className="px-5 py-3.5">
                            <select
                              value={teacherVal}
                              onChange={(e) => { e.stopPropagation(); assignTeacher(s.id, e.target.value); }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full max-w-[150px] bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all cursor-pointer"
                            >
                              <option value="">Chưa phân công</option>
                              {teachers
                                .filter(t => t.status === 'Active' || t.status === 'active')
                                .map(t => (
                                  <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>
                                ))
                              }
                            </select>
                          </td>
                          {/* Cột Học phí */}
                          <td className="px-5 py-3.5">
                            <p className="text-[13px] font-black text-slate-800">{(s.price || 0).toLocaleString('vi-VN')}đ</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-0.5">Tiến độ HV: {(s.completedSessions || 0)}/{(s.totalSessions || 12)} buổi</p>
                          </td>
                          {/* Cột Trạng thái */}
                          <td className="px-5 py-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-[10px] tracking-tight ${
                              s.paid
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-600 border border-rose-200'
                            }`}>
                              {s.paid ? <><CheckCircle2 size={11} /> Hoàn tất</> : <><AlertTriangle size={11} /> Chưa nộp</>}
                            </span>
                          </td>
                          {/* Cột Thao tác: 3-dot menu */}
                          <td className="px-4 py-3.5 text-center">
                            <div className="relative inline-block">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === s.id ? null : s.id); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
                              >
                                <MoreHorizontal size={16} />
                              </button>
                              {actionMenuId === s.id && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] py-1.5 min-w-[180px] animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setShowStudentDetailId(s.id); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-50 transition-colors border-b border-gray-50 mb-1">
                                    <ClipboardList size={13} /> Xem hồ sơ chi tiết
                                  </button>
                                  <button onClick={() => { setEditStudent({ ...s }); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                                    <Edit3 size={13} /> Sửa thông tin
                                  </button>
                                  {!s.paid && (
                                    <button onClick={() => { sendDebtReminder(s); setActionMenuId(null); }}
                                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                                      <Bell size={13} /> Nhắc nợ
                                    </button>
                                  )}
                                  <button onClick={() => { s.studentExamUnlocked ? revokeStudentExam(s.id) : approveStudentExam(s.id); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                    {s.studentExamUnlocked ? <><Lock size={13} /> Khóa phòng thi</> : <><Unlock size={13} /> Cho phép thi</>}
                                  </button>
                                  <button onClick={() => { ctxUpdateStudent(s.id || s._id, { requireWebcam: !s.requireWebcam }); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors">
                                    <Camera size={13} /> {s.requireWebcam !== false ? 'Tắt giám sát Webcam' : 'Bật giám sát Webcam'}
                                  </button>
                                  <button onClick={() => { handlePrintInvoice(s); setActionMenuId(null); }}
                                    disabled={!s.paid}
                                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold transition-colors ${
                                      s.paid
                                        ? 'text-gray-700 hover:bg-green-50 hover:text-green-600'
                                        : 'text-gray-300 cursor-not-allowed'
                                    }`}>
                                    <Printer size={13} /> Xuất hóa đơn PDF
                                  </button>
                                  
                                  <div className="border-t border-gray-100 my-1" />
                                  <button onClick={() => { removeStudent(s.id); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                                    <Trash2 size={13} /> Xóa học viên
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── PAGINATION FOOTER ────────────────────────────────────── */}
              <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-gray-400">
                  Hiển thị {filteredStudents.length} / {studentsPagination.totalRecords} học viên · Trang {studentsPagination.currentPage}/{studentsPagination.totalPages}
                </p>
                <div className="flex items-center gap-1">
                  {/* Trước */}
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {/* Page numbers */}
                  {(() => {
                    const tp = studentsPagination.totalPages;
                    const cp = currentPage;
                    const pages = [];
                    if (tp <= 7) {
                      for (let i = 1; i <= tp; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (cp > 3) pages.push('...');
                      for (let i = Math.max(2, cp - 1); i <= Math.min(tp - 1, cp + 1); i++) pages.push(i);
                      if (cp < tp - 2) pages.push('...');
                      pages.push(tp);
                    }
                    return pages.map((p, idx) => (
                      p === '...' ? (
                        <span key={`dot-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-300 text-xs">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            p === cp
                              ? 'bg-red-500 text-white shadow-md shadow-red-200'
                              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >{p}</button>
                      )
                    ));
                  })()}
                  {/* Sau */}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(studentsPagination.totalPages, p + 1))}
                    disabled={currentPage >= studentsPagination.totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: GIẢNG VIÊN ===== */}
          {activeTab === 'teachers' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-black text-gray-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <GraduationCap size={22} />
                    </div>
                    Duyệt Giảng Viên & Kiểm Tra Bài Thực Hành
                    <span className="text-[11px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg ml-2">{teachers.length} GV</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {teachers.filter(t => t.practicalFile && t.practicalStatus === 'submitted').length > 0 && (
                      <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-bold animate-pulse">
                        📎 {teachers.filter(t => t.practicalFile && t.practicalStatus === 'submitted').length} file chờ kiểm tra
                      </span>
                    )}
                    <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full font-bold">
                      {teachers.filter(t => t.status === 'Pending').length} chờ duyệt
                    </span>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Tìm giảng viên..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-300 transition-all w-48 lg:w-64"
                      />
                    </div>
                    {isSuperAdmin && (
                    <button
                      onClick={() => setShowTeacherModal(true)}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-4 py-2 rounded-xl text-sm font-black shadow-lg shadow-emerald-900/10 hover:shadow-emerald-900/20 hover:from-emerald-700 transition-all active:scale-95"
                    >
                      <Plus size={16} /> THÊM GIẢNG VIÊN
                    </button>
                    )}
                  </div>
                </div>

                {/* Quy trình duyệt */}
                <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                  <p className="text-xs font-bold text-blue-700 mb-2">📋 QUY TRÌNH DUYỆT GIẢNG VIÊN</p>
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    {['Bài Test ≥ 80đ', '→', 'Nộp file thực hành', '→', 'Admin kiểm tra công thức', '→', 'Cấp quyền'].map((step, i) => (
                      <span key={i} className={i % 2 === 1 ? 'text-blue-400' : 'bg-white px-2 py-1 rounded-lg font-semibold'}>{step}</span>
                    ))}
                  </div>
                </div>

                {/* Teacher list */}
                <div className="divide-y divide-gray-50">
                  {filteredTeachers.length > 0 ? filteredTeachers.map(t => (
                    <div key={t.id} className={`px-6 py-5 transition-colors ${t.practicalStatus === 'submitted' ? 'bg-orange-50/30' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-4">
                        {/* Left info */}
                        <div className="flex items-start gap-4 flex-1">
                          <Avatar initials={t.name?.substring(0, 2).toUpperCase() || 'GV'} color={t.status === 'Active' ? 'bg-green-500' : (t.testScore || 0) >= 80 ? 'bg-yellow-500' : 'bg-red-400'} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-800">{t.name}</p>
                              <span className="text-xs text-gray-400">SĐT: {t.phone}</span>
                              {t.branchCode && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold border border-teal-200">🏢 {t.branchCode}</span>}
                              {t.specialty && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{t.specialty}</span>}
                            </div>

                            {/* Scores & info */}
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              {/* Test score */}
                              <div className="flex items-center gap-1.5">
                                <Star size={12} className="text-yellow-500 fill-yellow-500" />
                                <span className={`text-xs font-bold ${(t.testScore || 0) >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                                  {t.testScore ?? 'Chưa thi'}{t.testScore != null && '/100'}
                                </span>
                                {t.testScore != null && (
                                  <>
                                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${(t.testScore || 0) >= 80 ? 'bg-green-500' : 'bg-red-400'}`}
                                        style={{ width: `${t.testScore}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] font-bold ${(t.testScore || 0) >= 80 ? 'text-green-500' : 'text-red-500'}`}>
                                      {(t.testScore || 0) >= 80 ? 'ĐẠT' : 'TRƯỢT'}
                                    </span>
                                  </>
                                )}
                              </div>

                              {t.testDate && <span className="text-xs text-gray-400">Ngày thi: {new Date(t.testDate).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}

                              {(() => {
                                const rating = getTeacherRating(t.id);
                                return rating.count > 0 ? (
                                  <span className="text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-100 flex items-center gap-1">
                                    <Star size={10} className="fill-yellow-500 text-yellow-500" /> {rating.avg}/5 ({rating.count})
                                  </span>
                                ) : null;
                              })()}
                              {/* Assigned Students */}
                              {t.assignedStudents?.length > 0 && (
                                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                  Đang dạy: {t.assignedStudents.length} học viên
                                </span>
                              )}
                            </div>

                            {/* File thực hành */}
                            <div className="mt-3">
                              {t.practicalFile ? (
                                <div className="flex items-center gap-3 flex-wrap">
                                  <div className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border ${t.practicalStatus === 'reviewed'
                                      ? 'bg-green-50 border-green-200 text-green-700'
                                      : 'bg-orange-50 border-orange-200 text-orange-700'
                                    }`}>
                                    <FileSpreadsheet size={14} />
                                    {t.practicalFile}
                                    {t.practicalStatus === 'reviewed' && <CheckCircle2 size={12} />}
                                    {t.practicalStatus === 'submitted' && <AlertTriangle size={12} />}
                                  </div>
                                  <button
                                    onClick={() => setReviewModal(t)}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 underline"
                                  >
                                    <Download size={12} /> Tải & Kiểm tra
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">📭 Chưa nộp bài thực hành</span>
                              )}
                            </div>

                            {/* Approved date */}
                            {t.approvedAt && (
                              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                                <CheckCircle2 size={11} /> Được duyệt ngày {new Date(t.approvedAt).toLocaleString('vi-VN')}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right actions */}
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${['Active', 'active'].includes(t.status) ? 'bg-green-100 text-green-700' :
                              ['Pending', 'pending'].includes(t.status) ? 'bg-yellow-100 text-yellow-700' :
                                t.status === 'Locked' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                            }`}>
                            {['Active', 'active'].includes(t.status) ? <><CheckCircle2 size={12} /> Đã cấp quyền giảng dạy</> :
                              ['Pending', 'pending'].includes(t.status) ? <><Clock size={12} /> Chờ duyệt</> :
                                t.status === 'Locked' ? <><XCircle size={12} /> Đã khóa (Trượt)</> :
                                  <><Lock size={12} /> Chưa cấp quyền</>}
                          </span>
                          {t.status === 'Locked' && t.lockReason && (
                            <p className="text-[10px] text-red-500 font-bold mt-1 bg-red-50 px-2 py-0.5 rounded italic border border-red-100 max-w-[200px] text-right">
                              🛡️ {t.lockReason}
                            </p>
                          )}

                          {/* Inactive hoặc Locked → cấp lại quyền thi */}
                          {isSuperAdmin && (t.status === 'Inactive' || t.status === 'Locked') && (
                            <button
                              onClick={() => setGrantModal({ id: t.id, name: t.name || t.email || t.phone, type: t.status === 'Locked' ? 'retry' : 'first' })}
                              className={`flex items-center gap-1.5 bg-gradient-to-r ${t.status === 'Locked' ? 'from-orange-600 to-orange-500' : 'from-blue-600 to-blue-500'} text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all`}
                            >
                              <Unlock size={15} /> {t.status === 'Locked' ? 'Cấp quyền thi lại' : 'Cấp truy cập thi'}
                            </button>
                          )}

                          {/* Pending → cấp quyền giảng dạy đầy đủ (CHỈ CHO PHÉP KHI ĐỦ 80 ĐIỂM VÀ ĐÃ KIỂM TRA FILE) */}
                          {isSuperAdmin && t.status === 'Pending' && (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                onClick={() => setApproveModal(t)}
                                disabled={(t.testScore || 0) < 80 || t.practicalStatus !== 'reviewed'}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all 
                                    ${((t.testScore || 0) < 80 || t.practicalStatus !== 'reviewed')
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-70'
                                    : 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:shadow-lg'
                                  }`}
                              >
                                <UserCheck size={15} /> Cấp quyền giảng dạy
                              </button>
                              {(t.testScore || 0) < 80 && (
                                <span className="text-[9px] text-red-500 font-bold uppercase">Chưa đủ 80đ</span>
                              )}
                              {t.practicalStatus !== 'reviewed' && (
                                <span className="text-[9px] text-orange-500 font-bold uppercase">Chưa duyệt bài thực hành</span>
                              )}
                            </div>
                          )}


                          {/* Nút chỉnh sửa + xóa + thanh toán — ⭐ CHỈ SUPER_ADMIN */}
                          {isSuperAdmin && (
                          <div className="flex items-center gap-1.5">
                            {(t.status === 'Active' || t.status === 'active') && (
                              <button
                                onClick={() => handlePayTeacher(t)}
                                className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold border border-green-100"
                                title="Thanh toán lương (Tất cả buổi dạy chưa nhận)"
                              >
                                <DollarSign size={14} /> Thanh toán
                              </button>
                            )}
                            <button
                              onClick={() => setEditTeacher(t)}
                              className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Chỉnh sửa thông tin"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => removeTeacher(t.id)}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                              title="Xoá giảng viên"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
                        <User size={32} />
                      </div>
                      <p className="text-gray-400 font-bold">Không tìm thấy giảng viên nào</p>
                    </div>
                  )}
                </div>
                
                {/* Teacher list footer */}
                <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-[11px] font-bold text-gray-400">
                    Hiển thị {filteredTeachers.length} / {teachers.length} giảng viên
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ===== MODAL: KIỂM TRA FILE THỰC HÀNH ===== */}
          {reviewModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 rounded-t-2xl">
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    <FileSpreadsheet size={20} /> Kiểm Tra Bài Thực Hành
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm"><strong>Giảng viên:</strong> {reviewModal.name}</p>
                    <p className="text-sm mt-1"><strong>File:</strong> {reviewModal.practicalFile}</p>
                    <p className="text-sm mt-1"><strong>Điểm test:</strong> {reviewModal.testScore}/100</p>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                    <p className="font-bold mb-2">📋 Hướng dẫn kiểm tra:</p>
                    <ol className="space-y-1 text-xs">
                      <li>1. Tải file Excel về máy</li>
                      <li>2. Mở file, nhấn <strong>Ctrl + ~</strong> để xem toàn bộ công thức</li>
                      <li>3. Kiểm tra xem GV có sử dụng <strong>VLOOKUP + IFERROR</strong> đúng logic</li>
                      <li>4. Kiểm tra <strong>SUMIFS</strong> tổng hợp dữ liệu</li>
                      <li>5. Kiểm tra <strong>Pivot Table</strong> đã tạo đúng</li>
                      <li>6. Nếu ĐẠT → nhấn "Đã kiểm tra, đạt yêu cầu"</li>
                    </ol>
                  </div>

                  <a
                    href={`/uploads/${reviewModal.practicalFile}`}
                    download
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition-all"
                  >
                    <Download size={16} /> Tải file {reviewModal.practicalFile}
                  </a>
                </div>
                <div className="px-6 pb-6 flex gap-3">
                  <button onClick={() => setReviewModal(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">
                    Đóng
                  </button>
                  <button
                    onClick={() => markFileReviewed(reviewModal.id)}
                    className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl font-bold hover:from-green-700 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} /> Đã kiểm tra, đạt yêu cầu
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== MODAL: XÁC NHẬN CẤP QUYỀN ===== */}
          {approveModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[32px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                {/* Decorative Header */}
                <div className="pt-8 px-8 pb-4 text-center relative">
                  <div className="w-16 h-16 bg-emerald-50 rounded-[20px] flex items-center justify-center mx-auto mb-5 rotate-3 shadow-[0_8px_16px_-6px_rgba(16,185,129,0.2)]">
                    <Unlock size={28} className="text-emerald-600 -rotate-3" />
                  </div>
                  <h3 className="text-slate-900 font-black text-[22px] tracking-tight leading-none mb-2">
                    Cấp Truy Cập Giảng Viên
                  </h3>
                  <p className="text-slate-500 text-sm font-medium">Bạn đang cấp quyền giảng dạy hệ thống cho:</p>
                </div>

                <div className="px-8 pb-8 space-y-6">
                  {/* User Card */}
                  <div className="bg-slate-50 rounded-[20px] p-5 flex items-center gap-4 border border-slate-100">
                    <Avatar initials={approveModal.name?.substring(0, 2).toUpperCase() || 'GV'} color="bg-emerald-500" />
                    <div>
                      <p className="font-bold text-lg text-slate-900 leading-none">{approveModal.name}</p>
                      <p className="text-[13px] font-bold text-slate-500 flex items-center gap-1.5 mt-1.5">
                        Điểm test năng lực: <span className="text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-md">{approveModal.testScore}/100</span>
                      </p>
                    </div>
                  </div>

                  {/* Permissions list */}
                  <div>
                    <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase mb-3 px-1">Quyền hạn được mở khóa</p>
                    <div className="space-y-3 px-1">
                      {[
                        { icon: Phone, label: 'Xem danh sách học viên trực tiếp' },
                        { icon: CalendarCheck, label: 'Thực hiện điểm danh & trừ buổi' },
                        { icon: MessageSquare, label: 'Nhắn tin qua Zalo và Hộp thư' },
                        { icon: FileSpreadsheet, label: 'Cập nhật tài liệu và Link học' },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-3 text-[14px] text-slate-600 font-medium">
                          <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Icon size={12} className="text-emerald-600" />
                          </div>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setApproveModal(null)}
                      className="flex-1 py-4 bg-slate-50 text-slate-600 rounded-[16px] font-bold hover:bg-slate-100 transition-colors border border-slate-200"
                    >
                      Huỷ bỏ
                    </button>
                    <button
                      onClick={() => approveTeacher(approveModal.id)}
                      className="flex-[1.5] py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-[16px] font-black hover:from-emerald-700 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      <UserCheck size={18} /> CẤP QUYỀN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: ĐÁNH GIÁ NỘI BỘ (Chỉ Admin) ===== */}
          {activeTab === 'evaluations' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-red-500" />
                    Báo Cáo Đánh Giá Chất Lượng Nội Bộ (Milestone)
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">Đây là các đánh giá riêng tư từ học viên được gửi trực tiếp cho Admin tại các mốc Buổi 1 và 50% khóa học.</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {getPrivateEvaluationsForAdmin().length === 0 ? (
                    <div className="p-20 text-center animate-in fade-in duration-700">
                      <div className="w-20 h-20 bg-gray-50 rounded-[32px] flex items-center justify-center mx-auto mb-4 border border-gray-100 shadow-sm">
                        <ShieldAlert size={32} className="text-gray-200" />
                      </div>
                      <h3 className="text-gray-900 font-bold text-lg">Chưa có đánh giá nội bộ</h3>
                      <p className="text-gray-400 text-sm max-w-xs mx-auto">Phản hồi bí mật từ học viên về chất lượng giảng dạy sẽ xuất hiện tại đây.</p>
                    </div>
                  ) : getPrivateEvaluationsForAdmin().map(ev => (
                    <div key={ev.id} className={`p-6 transition-colors border-l-4 ${ev.read ? 'border-transparent hover:bg-gray-50' : 'border-red-500 bg-red-50/30'}`}>
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            {!ev.read && <span className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded animate-pulse">MỚI</span>}
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ev.milestone === 'lesson_1' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {ev.milestone === 'lesson_1' ? 'BUỔI ĐẦU TIÊN' : ev.milestone === 'manual_feedback' ? 'PHẢN HỒI TỰ NGUYỆN' : 'MỐC 50% KHÓA'}
                            </span>
                            <span className="text-xs text-gray-400">{ev.date}</span>
                          </div>
                          <h4 className="font-bold text-gray-800">HV: {ev.studentName} → GV: {ev.teacherName}</h4>
                          {ev.courseName && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
                                📚 {ev.courseName}
                              </span>
                            </div>
                          )}
                          <div className="flex gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-100 rounded-xl shadow-sm">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Hài lòng:</span>
                              <span className={`text-xs font-black ${ev.criteria?.satisfied === 'yes' ? 'text-green-600' : 'text-red-600'}`}>
                                {ev.criteria?.satisfied === 'yes' ? 'CÓ' : 'KHÔNG'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-100 rounded-xl shadow-sm">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Dễ hiểu:</span>
                              <span className={`text-xs font-black ${ev.criteria?.lessonClear === 'yes' ? 'text-green-600' : 'text-orange-600'}`}>
                                {ev.criteria?.lessonClear === 'yes' ? 'HIỂU' : 'HƠI KHÓ'}
                              </span>
                            </div>
                          </div>
                          <div className="bg-white p-5 rounded-3xl border-2 border-red-50 relative mt-4 shadow-sm min-h-[80px] flex items-center">
                            <div className="absolute -left-3 -top-3 bg-red-100 rounded-full p-2 border-4 border-white shadow-sm">
                               <MessageSquare size={18} className="text-red-500" />
                            </div>
                            <p className="text-base text-gray-800 font-medium leading-relaxed italic pl-2">
                              {ev.comment ? `"${ev.comment}"` : <span className="text-gray-400">Không có lời nhắn đi kèm.</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {!ev.read && (
                            <button
                              onClick={() => markEvaluationRead(ev.id)}
                              className="flex items-center justify-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition shadow-md"
                            >
                              <CheckCircle2 size={14} /> Đã xem
                            </button>
                          )}
                          <button
                            onClick={() => navigate('/admin/inbox', { state: { selectUserId: ev.studentId } })}
                            className="flex items-center justify-center gap-1.5 bg-gray-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition shadow-lg"
                          >
                            <MessageCircle size={14} /> Phản hồi học viên
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== TAB: TÀI CHÍNH ===== */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              <div className={`grid grid-cols-1 ${isSuperAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
                {/* Revenue Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <DollarSign size={18} className="text-green-600" /> Doanh Thu Học Phí
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          
                            const tid = toast.loading('Đang xuất báo cáo hóa đơn...');
                            try {
                              const financialData = transactions.map(t => ({
                                "Mã GD": t.id || "N/A",
                                "Ngày": t.date || "N/A",
                                "Mô tả": `Thanh toán lương: ${t.teacherName} (Khóa ${t.course})`,
                                "Số tiền": t.amount,
                                "Trạng thái": t.status === 'completed' ? 'Hoàn thành' : (t.status === 'pending' ? 'Đang xử lý' : t.status),
                              }));
                              if (financialData.length === 0) throw new Error('Không có dữ liệu giao dịch');
                              exportToCSV(financialData, `BaoCaoTaiChinh_${new Date().toISOString().split('T')[0]}.csv`);
                              addSystemLog('Xuất báo cáo', 'Tài chính (Chi lương)', 'Admin', 'bg-orange-500 text-white');
                              toast.dismiss(tid);
                              toast.success('Xuất báo cáo tài chính thành công!');
                            } catch (e) {
                              toast.dismiss(tid);
                              toast.error('Xuất thất bại: ' + (e.message || 'Lỗi'));
                            }
                        }}
                        className="text-[10px] font-black bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50 flex items-center gap-1.5">
                        <Download size={12} /> XUẤT BÁO CÁO CHI PHÍ
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="bg-gradient-to-br from-indigo-700 to-blue-800 rounded-3xl p-6 text-white shadow-xl shadow-blue-200 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <DollarSign size={80} />
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">Tổng doanh thu thực tế (Đã thu)</p>
                          <p className="text-4xl font-black mt-2">{(financeStudents.filter(s => s.paid).reduce((sum, s) => sum + (s.price || 0), 0)).toLocaleString('vi-VN')}đ</p>
                        </div>
                        <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 animate-pulse">
                          <TrendingUp size={14} className="text-emerald-300" />
                          <span className="text-[10px] font-black">+12.5% vs tháng trước</span>
                        </div>
                      </div>

                      {/* Mini Line Chart Mockup */}
                      <div className="mt-8 h-16 flex items-end gap-1.5 px-1">
                        {[30, 45, 35, 60, 50, 80, 75, 95].map((h, i) => (
                          <div key={i} className="flex-1 bg-white/20 rounded-t-sm hover:bg-white/40 transition-all cursor-pointer relative group" style={{ height: `${h}%` }}>
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white text-blue-600 px-1.5 py-0.5 rounded text-[8px] font-black opacity-0 group-hover:opacity-100 transition-opacity">
                              {h}M
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-4 mt-6 text-[10px] font-bold text-blue-100 border-t border-white/10 pt-4">
                        <div className="flex-1 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                          <p className="opacity-60 uppercase mb-0.5">Dự kiến (Tất cả)</p>
                          <p className="text-sm">{(financeStudents.reduce((sum, s) => sum + (s.price || 0), 0)).toLocaleString('vi-VN')}đ</p>
                        </div>
                        <div className="flex-1 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                          <p className="opacity-60 uppercase mb-0.5 tracking-tighter">Công nợ (Chưa thu)</p>
                          <p className="text-sm text-red-300">{(financeStudents.filter(s => !s.paid).reduce((sum, s) => sum + (s.price || 0), 0)).toLocaleString('vi-VN')}đ</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50 border-t border-gray-50 max-h-80 overflow-y-auto relative">
                    {isLoadingFinance && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10"><RefreshCw className="animate-spin text-indigo-500" /></div>}
                    {financeStudents.map(s => (
                      <div key={s.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${s.paid ? 'bg-green-500' : 'bg-red-400'}`}>
                            {s.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800">{s.name}</p>
                            <p className="text-[10px] text-gray-400">{s.course}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-gray-800">{(s.price || 0).toLocaleString('vi-VN')}đ</p>
                          <span className={`text-[10px] font-bold ${s.paid ? 'text-green-600' : 'text-red-500'}`}>
                            {s.paid ? 'Đã nộp' : 'Chưa nộp'}
                          </span>
                        </div>
                        {!s.paid && (
                          <button
                            onClick={() => markStudentPaid(s.id)}
                            className="ml-4 px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded hover:bg-green-100"
                          >
                            Xác nhận thu
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expense Card (Teacher Payouts) — CHỈ Super Admin */}
                {isSuperAdmin && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <CreditCard size={18} className="text-blue-600" /> Thanh Toán Giảng Viên
                    </h3>
                    <button
                      onClick={() => {
                        
                          const tid = toast.loading('Đang xuất báo cáo hóa đơn...');
                          try {
                            const exportData = financialData.map(t => ({
                              "Mã GD": t.id || t._id || "N/A",
                              "Ngày": t.date || new Date(t.createdAt).toLocaleDateString('vi-VN'),
                              "Loại": t.description || 'Thù lao',
                              "Người nhận": t.teacherId?.name || t.teacherName || "N/A",
                              "SĐT": t.teacherPhone || "N/A",
                              "Số tiền (VNĐ)": t.amount,
                              "Trạng thái": t.status === 'confirmed' ? "Đã thanh toán" : "Chờ xử lý"
                            }));
                            if (exportData.length === 0) throw new Error('Không có dữ liệu giao dịch');
                            exportToCSV(exportData, `BaoCaoTaiChinh_${new Date().toISOString().split('T')[0]}.csv`);
                            toast.dismiss(tid);
                            toast.success('Xuất báo cáo tài chính thành công!');
                          } catch (e) {
                            toast.dismiss(tid);
                            toast.error(e.message || 'Lỗi khi xuất file');
                          }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition shadow-sm font-semibold text-sm"
                    >
                      <Download size={16} /> Xuất Báo Cáo
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="bg-slate-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                      {isLoadingFinance ? <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center"><RefreshCw className="animate-spin text-white" size={24}/></div> : null}
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tổng thù lao đã chi</p>
                      <p className="text-4xl font-black mt-2">{(financialData.reduce((s, p) => s + (p.amount || 0), 0)).toLocaleString('vi-VN')}đ</p>
                      <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase italic tracking-widest">Giai đoạn: 01/01 - Hiện tại</p>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50 border-t border-gray-50 max-h-80 overflow-y-auto">
                    {financialData.map(t => {
                      const bankInfo = t.teacherId?.bankAccount || t.bankAccount;
                      return (
                      <div key={t.id || t._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                              <Users size={14} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{t.teacherId?.name || t.teacherName || 'Giảng viên'}</p>
                              <p className="text-[10px] text-gray-400">{t.description || t.note || 'Thù lao'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-blue-600">-{t.amount ? t.amount.toLocaleString('vi-VN') : 0}đ</p>
                            <p className="text-[10px] text-gray-400 font-medium">{t.date || new Date(t.createdAt).toLocaleDateString('vi-VN')}</p>
                          </div>
                        </div>
                        {/* Bank info row */}
                        {bankInfo?.accountNumber && (
                          <div className="mt-2 ml-11 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100">
                              <CreditCard size={10} /> {bankInfo.bankName || 'N/A'}
                            </span>
                            <span className="text-[10px] font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                              STK: {bankInfo.accountNumber}
                            </span>
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 uppercase">
                              {bankInfo.accountName}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${bankInfo.bankName} - ${bankInfo.accountNumber} - ${bankInfo.accountName}`);
                                toast.success('Đã copy thông tin ngân hàng!');
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                              title="Copy thông tin ngân hàng"
                            >
                              📋 Copy
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {financialData.length === 0 && !isLoadingFinance && (
                      <div className="p-12 text-center text-gray-400">Chưa có giao dịch chi nào.</div>
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {/* ===== ĐÀO TẠO GIẢNG VIÊN ===== */}
          {activeTab === 'training' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen size={20} className="text-purple-600" /> Quản lý Đào tạo Giảng viên
                </h2>
              </div>

              {courseBuilderMode ? (
                 <AdminCourseBuilder course={courseBuilderMode} onBack={() => setCourseBuilderMode(null)} onSave={(updatedCourse) => {
                     updateTrainingItem('videos', courseBuilderMode.id, updatedCourse);
                     setCourseBuilderMode(null);
                 }} />
              ) : (
                <>
              {/* Sub-tabs */}
              <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
                {[
                  { key: 'videos', icon: Video, label: 'Quản lý Khóa học', count: trainingData?.videos?.length || 0 },
                  { key: 'guides', icon: FileText, label: 'Quy trình', count: trainingData?.guides?.length || 0 },
                  { key: 'files', icon: Download, label: 'Tài liệu', count: trainingData?.files?.length || 0 },
                  { key: 'questions', icon: ClipboardList, label: 'Ngân hàng câu hỏi', count: questions?.length || 0 },
                  { key: 'exam-results-gv', icon: Trophy, label: 'Kết quả thi', count: (teachers || []).filter(t => t.testDate || t.testScore > 0 || t.status === 'Locked').length },
                ].map(t => (
                  <button key={t.key} onClick={() => { setTrainingTab(t.key); setTrainingForm(null); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      trainingTab === t.key
                        ? t.key === 'exam-results-gv' ? 'bg-amber-600 text-white shadow-md' : 'bg-purple-600 text-white shadow-md'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    <t.icon size={15} /> {t.label} <span className="text-[10px] opacity-70">({t.count})</span>
                  </button>
                ))}
              </div>

              {/* Add button */}
              {trainingTab !== 'questions' && trainingTab !== 'exam-results-gv' && (
                <button onClick={() => setTrainingForm({})}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2">
                  <Plus size={15} /> {trainingTab === 'videos' ? 'Thêm Khóa học' : trainingTab === 'guides' ? 'Thêm quy trình' : 'Thêm tài liệu'}
                </button>
              )}
              {trainingTab === 'exam-results-gv' && (
                <button onClick={() => setErGvForm({ ...BLANK_ER_GV })}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2">
                  <Plus size={15} /> Thêm kết quả thi
                </button>
              )}

              {/* Add/Edit Form */}
              {trainingForm && (
                <div className="bg-white rounded-2xl shadow-sm border border-purple-200 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-purple-700 flex items-center gap-2">
                      <Edit3 size={16} /> {trainingForm.id ? 'Chỉnh sửa' : 'Thêm mới'}
                    </h3>
                    <button onClick={() => setTrainingForm(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                      <input value={trainingForm.title || ''} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="Nhập tiêu đề..." />
                    </div>
                    {trainingTab === 'videos' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả Khóa học (Tóm tắt)</label>
                        <input value={trainingForm.desc || ''} onChange={e => setTrainingForm({ ...trainingForm, desc: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="Nhập mô tả tóm tắt..." />
                      </div>
                    )}
                    {trainingTab === 'guides' && (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Icon (emoji)</label>
                        <input value={trainingForm.icon || ''} onChange={e => setTrainingForm({ ...trainingForm, icon: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="📋" />
                      </div>
                    )}
                    {trainingTab === 'files' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Loại file</label>
                          <select value={trainingForm.fileType || 'PDF'} onChange={e => setTrainingForm({ ...trainingForm, fileType: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none">
                            {['PDF', 'PPTX', 'XLSX', 'DOCX', 'ZIP'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Dung lượng</label>
                          <input value={trainingForm.fileSize || ''} onChange={e => setTrainingForm({ ...trainingForm, fileSize: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="2.4MB" />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Mô tả - Rich Text Editor (ẩn với khóa học) */}
                  {trainingTab !== 'videos' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nội dung mô tả (có định dạng)</label>
                      <RichTextEditor
                        value={trainingForm.desc || ''}
                        onChange={(val) => setTrainingForm(prev => ({ ...prev, desc: val }))}
                        placeholder="Nhập nội dung mô tả chi tiết..."
                      />
                    </div>
                  )}
                  <button onClick={() => {
                    if (!trainingForm.title?.trim()) { 
                        showGlobalModal({ title: 'Thiếu thông tin', content: 'Vui lòng nhập tiêu đề bài học!', type: 'warning' });
                        return; 
                    }
                    if (trainingForm.id) {
                      updateTrainingItem(trainingTab, trainingForm.id, trainingForm);
                    } else {
                      addTrainingItem(trainingTab, { ...trainingForm, createdAt: new Date().toISOString().split('T')[0] });
                    }
                    setTrainingForm(null);
                  }} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2">
                    <Save size={15} /> {trainingForm.id ? 'Cập nhật' : 'Thêm mới'}
                  </button>
                </div>
              )}

              {/* ===== TEACHER EXAM RESULTS TAB ===== */}
              {trainingTab === 'exam-results-gv' && (() => {
                // Sử dụng mảng teachers thay vì examResults để phản ánh dữ liệu thật
                const gvResults = (teachers || []).filter(t => t.testDate || t.testScore > 0 || t.status === 'Locked');
                const filteredGv = gvResults.filter(t =>
                  !erGvSearch || (t.name || '').toLowerCase().includes(erGvSearch.toLowerCase())
                );
                return (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex flex-wrap gap-3 items-center">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={erGvSearch} onChange={e => setErGvSearch(e.target.value)}
                          className="pl-8 pr-4 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 outline-none w-56"
                          placeholder="Tìm theo tên giảng viên..." />
                      </div>
                      <span className="text-xs text-gray-400 font-bold ml-auto">{filteredGv.length} bản ghi</span>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                          <thead>
                            <tr className="bg-blue-50 border-b border-blue-100">
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest">Giảng viên</th>
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center">Trắc nghiệm</th>
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center">Bài tự luận (File)</th>
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center">Trạng thái chung</th>
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest">Ngày thi</th>
                              <th className="px-4 py-3 text-[10px] font-black text-blue-700 uppercase tracking-widest text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {filteredGv.map(t => {
                              const mcScore = Number(t.testScore) || 0;
                              const isPassedMC = mcScore >= 80;
                              return (
                                <tr key={t.id || t._id} className="hover:bg-blue-50/20 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center text-white text-xs font-black">
                                        {(t.name || '?')[0]}
                                      </div>
                                      <div>
                                        <span className="font-bold text-sm text-gray-800 block">{t.name}</span>
                                        <span className="text-[10px] text-gray-400 font-bold">{t.phone}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex flex-col items-center">
                                      <span className={`text-lg font-black ${isPassedMC ? 'text-green-600' : 'text-red-500'}`}>{mcScore}/100</span>
                                      <span className="text-[9px] text-gray-400 font-bold uppercase">{isPassedMC ? 'ĐẠT' : 'TRƯỢT'}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {t.practicalFile ? (
                                      <a href="#" onClick={(e) => { 
                                          e.preventDefault(); 
                                          showGlobalModal({ 
                                            title: 'Tính năng nâng cao', 
                                            content: `Về sau hệ thống sẽ liên kết nút này với CSDL Cloud (AWS S3 / Google Storage) để tải file: ${t.practicalFile}. Hiện tại hệ thống đang sử dụng lưu trữ cục bộ.`, 
                                            type: 'info' 
                                          }); 
                                      }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all border border-purple-200">
                                        <Download size={12} /> {t.practicalFile}
                                      </a>
                                    ) : (
                                      <span className="text-gray-300 text-xs font-bold italic">Chưa nộp</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black ${
                                      t.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                                      t.status === 'Locked' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                                    }`}>
                                      {t.status === 'active' ? 'CHÍNH THỨC' : t.status === 'Locked' ? 'BỊ KHÓA' : 'ĐANG CHỜ'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-gray-400 font-bold">{t.testDate ? new Date(t.testDate).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      {String(t.status || '').toLowerCase() === 'pending' && t.practicalFile ? (
                                        <>
                                          <button onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'passed', status: 'active' })} className="px-3 py-1.5 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 text-[10px] font-black tracking-wide border border-green-200">CHẤM ĐẠT</button>
                                          <button onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'failed', status: 'Locked', lockReason: 'Bài thi Tự luận/Thực hành chưa đạt yêu cầu' })} className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-black tracking-wide border border-red-200">CHẤM TRƯỢT</button>
                                        </>
                                      ) : String(t.status || '').toLowerCase() === 'active' ? (
                                        <span className="text-[10px] text-green-600 font-black">XONG</span>
                                      ) : String(t.status || '').toLowerCase() === 'locked' ? (
                                        <button onClick={() => ctxUpdateTeacher(t.id || t._id, { status: 'pending', lockReason: null, practicalStatus: 'none', testScore: 0 })} className="px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 text-[10px] font-black">CHO THI LẠI</button>
                                      ) : (
                                        <span className="text-[10px] text-gray-400 font-bold border px-2 py-1 border-gray-100 rounded-lg">ĐANG THI...</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredGv.length === 0 && (
                              <tr>
                                <td colSpan="6" className="px-6 py-14 text-center text-gray-400">
                                  <Trophy size={36} className="mx-auto mb-3 text-gray-200" />
                                  <p className="text-sm font-bold">Chưa có kết quả thi nào</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* List items (training content) */}
              {trainingTab !== 'exam-results-gv' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {trainingTab === 'questions' ? (
                    (() => {
                      const SECTION_OPTS = [
                        { value: 'excel', label: 'Microsoft Excel' },
                        { value: 'word', label: 'Microsoft Word' },
                        { value: 'powerpoint', label: 'Microsoft PowerPoint' },
                        { value: 'computer', label: 'Máy tính & Windows' },
                        { value: 'situation', label: 'Tình Huống Sư Phạm' },
                        { value: 'other', label: 'Kiến thức Khác' },
                      ];
                      const filtered = (questions || []).filter(q => {
                        const matchS = qSection === 'all' || q.section === qSection;
                        const matchD = qDifficulty === 'all' || q.difficulty === qDifficulty;
                        const matchQ = !qSearch || (q.q || '').toLowerCase().includes(qSearch.toLowerCase());
                        return matchS && matchD && matchQ;
                      }).sort((a, b) => {
                        if (qSort === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
                        if (qSort === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
                        if (qSort === 'failure') return (b.failRate || 0) - (a.failRate || 0);
                        return 0;
                      });
                      return (
                        <div className="p-4 space-y-5">
                          {/* Header inline for Training Tab */}
                          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                            <h2 className="text-md font-bold text-gray-800 flex items-center gap-2">
                              <ClipboardList size={18} className="text-red-500" /> Ngân hàng câu hỏi bài test GV
                            </h2>
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => { 
                                showGlobalModal({
                                  title: 'Reset ngân hàng câu hỏi?',
                                  content: 'Bạn có chắc chắn muốn reset toàn bộ câu hỏi về mặc định? Hành động này không thể hoàn tác.',
                                  type: 'warning',
                                  confirmText: 'Xác nhận Reset',
                                  cancelText: 'Huỷ bỏ',
                                  onConfirm: () => resetQuestions()
                                });
                              }}
                                className="px-3 py-2 border-2 border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1">
                                <RefreshCw size={12} /> Reset
                              </button>
                              <button onClick={() => setQForm({ ...BLANK_Q })}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow flex items-center gap-2">
                                <Plus size={14} /> Thêm câu hỏi
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3 items-center">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input value={qSearch} onChange={e => setQSearch(e.target.value)}
                                className="pl-8 pr-4 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-red-400 outline-none w-full sm:w-auto"
                                placeholder="Tìm câu hỏi..." />
                            </div>
                            <select value={qSection} onChange={e => setQSection(e.target.value)}
                              className="py-2 px-3 border-2 border-gray-200 rounded-xl text-sm focus:border-red-400 outline-none">
                              <option value="all">Tất cả phần</option>
                              {SECTION_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select value={qDifficulty} onChange={e => setQDifficulty(e.target.value)}
                              className="py-2 px-3 border-2 border-gray-200 rounded-xl text-sm focus:border-red-400 outline-none font-bold text-gray-700">
                              <option value="all">📊 Độ khó</option>
                              <option value="easy">🟢 Cơ bản</option>
                              <option value="medium">🟡 Trung bình</option>
                              <option value="hard">🔴 Nâng cao</option>
                            </select>
                          </div>

                          {/* Add/Edit Modal */}
                          {qForm && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                                <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center justify-between">
                                  <h3 className="text-white font-bold flex items-center gap-2">
                                    <ClipboardList size={18} /> {qForm.id ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}
                                  </h3>
                                  <button onClick={() => setQForm(null)}><X size={20} className="text-white/80 hover:text-white" /></button>
                                </div>
                                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                                  {/* Question Type */}
                                  <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                                    <button onClick={() => setQForm({ ...qForm, type: 'multiple' })}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${qForm.type === 'multiple' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>
                                      Trắc nghiệm
                                    </button>
                                    <button onClick={() => setQForm({ ...qForm, type: 'essay' })}
                                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${qForm.type === 'essay' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>
                                      Tự luận
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Phần thi</label>
                                      <select value={qForm.section} onChange={e => setQForm({ ...qForm, section: e.target.value })}
                                        className="w-full border-2 border-gray-100 rounded-xl p-2.5 focus:border-red-500 outline-none text-sm font-semibold">
                                        {SECTION_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Độ khó</label>
                                      <select value={qForm.difficulty} onChange={e => setQForm({ ...qForm, difficulty: e.target.value })}
                                        className="w-full border-2 border-gray-100 rounded-xl p-2.5 focus:border-red-500 outline-none text-sm font-semibold">
                                        <option value="easy">Cơ bản</option>
                                        <option value="medium">Trung bình</option>
                                        <option value="hard">Nâng cao</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Câu hỏi</label>
                                    <textarea value={qForm.q} onChange={e => setQForm({ ...qForm, q: e.target.value })}
                                      rows={3} className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-red-500 outline-none text-sm resize-none"
                                      placeholder="Nhập nội dung câu hỏi..." />
                                  </div>
                                  {qForm.type === 'multiple' ? (
                                    <div>
                                      <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Đáp án (Chọn nút để đánh dấu câu đúng)</label>
                                      <div className="space-y-2">
                                        {(qForm.options || ['', '', '', '']).map((opt, i) => (
                                          <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 transition ${qForm.correct === i ? 'border-green-400 bg-green-50' : 'border-gray-100'}`}>
                                            <button onClick={() => setQForm({ ...qForm, correct: i })}
                                              className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-black transition ${qForm.correct === i ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                              {['A', 'B', 'C', 'D'][i]}
                                            </button>
                                            <input value={opt} onChange={e => { const o = [...(qForm.options || [])]; o[i] = e.target.value; setQForm({ ...qForm, options: o }); }}
                                              className="flex-1 bg-transparent outline-none text-sm" placeholder={`Nội dung đáp án ${['A', 'B', 'C', 'D'][i]}...`} />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-4">
                                      <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Gợi ý đáp án / Nội dung mẫu</label>
                                        <textarea value={qForm.sampleAnswer || ''} onChange={e => setQForm({ ...qForm, sampleAnswer: e.target.value })}
                                          rows={3} className="w-full border-2 border-gray-100 rounded-xl p-3 focus:border-red-500 outline-none text-sm resize-none"
                                          placeholder="Nhập nội dung gợi ý hoặc đáp án mẫu..." />
                                      </div>
                                      <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Đính kèm tài liệu thực hành (Nếu có)</label>
                                        <div className="flex items-center gap-3">
                                          <label className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 hover:bg-gray-50 transition cursor-pointer flex flex-col items-center justify-center text-center">
                                            <input type="file" className="hidden" onChange={e => {
                                              const file = e.target.files[0];
                                              if (file) setQForm({ ...qForm, attachedFile: file.name });
                                            }} />
                                            {qForm.attachedFile ? (
                                              <span className="text-blue-600 font-bold text-sm flex items-center gap-2">
                                                <FileText size={16} /> {qForm.attachedFile}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400 text-xs py-1">Nhấn để chọn file tài liệu...</span>
                                            )}
                                          </label>
                                          {qForm.attachedFile && (
                                            <button onClick={() => setQForm({ ...qForm, attachedFile: null })} className="p-2 text-red-500 bg-red-50 rounded-lg"><X size={16} /></button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="px-6 pb-6 flex gap-3">
                                  <button onClick={() => setQForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600">Huỷ</button>
                                  <button onClick={() => {
                                    if (!qForm.q?.trim()) { toast.error('Vui lòng nhập nội dung câu hỏi!'); return; }
                                    if (qForm.type === 'multiple') {
                                      const validCount = (qForm.options || []).filter(o => o?.trim()).length;
                                      if (validCount < 2) { toast.error('Trắc nghiệm cần ít nhất 2 đáp án!'); return; }
                                    }
                                    
                                    try {
                                      if (qForm.id) {
                                        updateQuestion(qForm.id, qForm);
                                        toast.success('Đã cập nhật câu hỏi!');
                                      } else {
                                        addQuestion({ ...qForm, createdAt: Date.now() });
                                        toast.success('Đã thêm câu hỏi mới!');
                                      }
                                      setQForm(null);
                                    } catch (err) {
                                      toast.error('Có lỗi xảy ra khi lưu!');
                                    }
                                  }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                    <Save size={16} /> Lưu
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                            {filtered.length === 0 ? (
                              <p className="p-8 text-center text-gray-400 text-sm">Không tìm thấy câu hỏi nào</p>
                            ) : (
                              filtered.map((q, idx) => {
                                const sOpt = SECTION_OPTS.find(s => s.value === q.section);
                                                                const colors = { 
                                  excel: 'bg-green-100 text-green-700', 
                                  word: 'bg-blue-100 text-blue-700', 
                                  powerpoint: 'bg-orange-100 text-orange-700', 
                                  computer: 'bg-indigo-100 text-indigo-700',
                                  situation: 'bg-purple-100 text-purple-700',
                                  other: 'bg-gray-100 text-gray-700'
                                };
                                return (
                                  <div key={q.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                                    <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-black text-gray-400 flex-shrink-0 mt-0.5">{idx + 1}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${colors[q.section] || 'bg-gray-100 text-gray-500'}`}>{sOpt?.label}</span>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${q.type === 'essay' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                                          {q.type === 'essay' ? 'TỰ LUẬN' : 'TRẮC NGHIỆM'}
                                        </span>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-gray-50 text-gray-400">{q.difficulty === 'hard' ? 'NÂNG CAO' : q.difficulty === 'medium' ? 'TRUNG BÌNH' : 'CƠ BẢN'}</span>
                                      </div>
                                      <p className="text-sm font-semibold text-gray-800 leading-relaxed">{q.q}</p>
                                      {q.type === 'essay' && (
                                        <div className="mt-2 space-y-2">
                                          {q.sampleAnswer && (
                                            <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                                              <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">Gợi ý đáp án:</p>
                                              <p className="text-xs text-gray-600 italic line-clamp-2">{q.sampleAnswer}</p>
                                            </div>
                                          )}
                                          {q.attachedFile && (
                                            <div className="flex items-center gap-2 text-xs text-blue-600 font-bold bg-blue-50 w-fit px-3 py-1.5 rounded-lg border border-blue-100">
                                              <Download size={14} /> {q.attachedFile}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {q.type !== 'essay' && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                          {(q.options || []).map((opt, i) => (
                                            <p key={i} className={`text-[11px] px-2 py-1 rounded-lg ${q.correct === i ? 'bg-green-100 text-green-700 font-bold' : 'text-gray-400 border border-gray-50'}`}>
                                              {['A', 'B', 'C', 'D'][i]}. {opt}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <button onClick={() => setQForm({ ...q })} className="p-2 rounded-lg bg-blue-50 text-blue-600"><Edit3 size={13} /></button>
                                      <button onClick={() => { 
                                        showGlobalModal({
                                          title: 'Xoá câu hỏi?',
                                          content: 'Câu hỏi này sẽ bị xoá vĩnh viễn khỏi ngân hàng câu hỏi.',
                                          type: 'warning',
                                          confirmText: 'Xoá',
                                          cancelText: 'Huỷ',
                                          onConfirm: () => removeQuestion(q.id)
                                        });
                                      }} className="p-2 rounded-lg bg-red-50 text-red-500"><Trash2 size={13} /></button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (trainingData?.[trainingTab] || []).slice(0, trainingTab === 'videos' ? 4 : 20).map(item => (
                    <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition">
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        {trainingTab === 'videos' && (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-105 transition" onClick={() => setCourseBuilderMode(item)}>
                            <BookOpen size={20} className="text-white" />
                          </div>
                        )}
                        {trainingTab === 'guides' && (
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                            {item.icon || '📄'}
                          </div>
                        )}
                        {trainingTab === 'files' && (
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${item.fileType === 'PDF' ? 'bg-red-500' : item.fileType === 'PPTX' ? 'bg-orange-500' : 'bg-green-500'
                            }`}>
                            {item.fileType || 'FILE'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-800 truncate">{item.title}</p>
                          <p className="text-xs text-gray-400 truncate">{(item.desc?.replace(/<[^>]*>/g, '') || '').slice(0, 80)}</p>
                          {item.duration && <p className="text-[10px] text-purple-500 mt-0.5">⏱ {item.duration}</p>}
                          {item.fileSize && <p className="text-[10px] text-gray-400 mt-0.5">{item.fileSize}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-3 flex-shrink-0 items-center">
                        {trainingTab === 'videos' && (
                           <button onClick={() => setCourseBuilderMode(item)} className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-600 text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5">
                             <Layers size={13} /> Giáo trình
                           </button>
                        )}
                        <button onClick={() => setTrainingForm({ ...item })}
                          className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition"><Edit3 size={14} /></button>
                        <button onClick={() => setDeleteConfirm({ category: trainingTab, id: item.id, title: item.title })}
                          className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  )))}
                  {trainingTab !== 'questions' && (trainingData?.[trainingTab] || []).length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                      <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Chưa có nội dung nào</p>
                      <p className="text-xs text-gray-300 mt-1">Bấm "Thêm" để tạo nội dung đào tạo cho giảng viên</p>
                    </div>
                  )}
                </div>
              </div>
              )}
                </>
              )}
            </div>
          )}

          {/* ===== MODAL KẾT QUẢ THI GIẢNG VIÊN ===== */}
          {erGvForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
                <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-5 flex items-center justify-between text-white">
                  <h3 className="font-bold text-lg flex items-center gap-3">
                    <GraduationCap size={22} /> {erGvForm.id ? 'Chỉnh sửa kết quả' : 'Thêm kết quả thi Giảng viên'}
                  </h3>
                  <button onClick={() => setErGvForm(null)} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Giảng viên</label>
                      <select value={erGvForm.teacherId || ''}
                        onChange={e => { const t = teachers.find(x => String(x.id) === e.target.value || String(x._id) === e.target.value); setErGvForm({ ...erGvForm, teacherId: e.target.value, teacherName: t?.name || '' }); }}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold">
                        <option value="">-- Chọn giảng viên --</option>
                        {teachers.map(t => (<option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Bài / Môn thi</label>
                      <select value={erGvForm.subject || ''} onChange={e => setErGvForm({ ...erGvForm, subject: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold">
                        <option value="BÀI TEST GIẢNG VIÊN">BÀI TEST GIẢNG VIÊN</option>
                        <option value="THỰC HÀNH GIẢNG DẠY">THỰC HÀNH GIẢNG DẠY</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">📝 Phần Trắc nghiệm</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Điểm Trắc nghiệm (0-100)</label><input type="number" min="0" max="100" value={erGvForm.testScore || ''} onChange={e => setErGvForm({ ...erGvForm, testScore: e.target.value })} className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800" placeholder="Chấm theo thang điểm 100" /></div>
                      <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ngày thi</label><input type="datetime-local" value={erGvForm.testDate ? new Date(erGvForm.testDate).toISOString().slice(0,16) : ''} onChange={e => setErGvForm({ ...erGvForm, testDate: new Date(e.target.value).toISOString() })} className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm" /></div>
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-2xl p-4 space-y-3 border border-purple-100">
                    <p className="text-xs font-black text-purple-700 uppercase tracking-widest">✍️ BÀI TỰ LUẬN & GHI CHÚ</p>
                    <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Đánh giá chung (Ghi chú)</label><textarea value={erGvForm.testNotes || ''} onChange={e => setErGvForm({ ...erGvForm, testNotes: e.target.value })} rows={2} className="w-full border-2 border-purple-100 rounded-xl p-3 focus:border-purple-500 outline-none text-sm resize-none" placeholder="Đánh giá kết quả của giảng viên..." /></div>
                  </div>
                  <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-sm font-black text-gray-700 flex-1">Kết quả: Xét duyệt Giảng dạy?</p>
                    <div className="flex gap-3">
                       <button onClick={() => setErGvForm({ ...erGvForm, status: 'active' })} 
                         className={`flex-1 px-5 py-3 rounded-2xl text-[12px] font-black transition-all duration-300 border-2 ${
                           erGvForm.status === 'active' 
                             ? 'bg-gradient-to-br from-emerald-500 to-emerald-400 border-transparent text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] scale-[1.02]' 
                             : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 hover:scale-[1.02]'
                         }`}>ĐẠT (CẤP QUYỀN)</button>
                       <button onClick={() => setErGvForm({ ...erGvForm, status: 'Locked' })} 
                         className={`flex-1 px-5 py-3 rounded-2xl text-[12px] font-black transition-all duration-300 border-2 ${
                           erGvForm.status === 'Locked' 
                             ? 'bg-gradient-to-br from-red-500 to-pink-500 border-transparent text-white shadow-[0_8px_20px_rgba(239,68,68,0.3)] scale-[1.02]' 
                             : 'bg-white border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50/50 hover:scale-[1.02]'
                         }`}>CHƯA ĐẠT (KHÓA LẠI)</button>
                    </div>
                  </div>
                </div>
                <div className="px-8 pb-8 flex gap-3">
                  <button onClick={() => setErGvForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600">Huỷ</button>
                  <button onClick={() => {
                    if (!erGvForm.teacherId) { toast.error('Vui lòng chọn giảng viên!'); return; }
                    ctxUpdateTeacher(erGvForm.teacherId, {
                      testScore: Number(erGvForm.testScore) || 0,
                      testStatus: erGvForm.status === 'active' ? 'passed' : 'failed',
                      testDate: erGvForm.testDate || new Date().toISOString(),
                      testNotes: erGvForm.testNotes || '',
                      status: erGvForm.status || 'Locked'
                    });
                    toast.success('Đã cập nhật kết quả và trạng thái Giảng viên!');
                    setErGvForm(null);
                  }} className="flex-1 py-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                    <Save size={16} /> Lưu & Áp dụng
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ===== ĐÀO TẠO HỌC VIÊN ===== */}
          {activeTab === 'student-training' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen size={20} className="text-green-600" /> Quản lý Đào tạo Học viên
                </h2>
              </div>

              {/* Sub-tabs */}
              <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit">
                {[
                  { key: 'videos', icon: Video, label: 'Quản lý Khóa học', count: studentTrainingData?.videos?.length || 0 },
                  
                  { key: 'files', icon: Download, label: 'Tài liệu', count: studentTrainingData?.files?.length || 0 },
                  { key: 'questions', icon: HelpCircle, label: 'Ngân hàng câu hỏi', count: studentQuestions?.length || 0 },
                  { key: 'exam-results', icon: Trophy, label: 'Kết quả thi', count: (students || []).reduce((acc, s) => acc + (s.examProgress || []).filter(ep => ep.status && ep.status !== 'chua_thi').length, 0) },
                ].map(t => (
                  <button key={t.key} onClick={() => { setSTrainingTab(t.key); setSTrainingForm(null); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      sTrainingTab === t.key
                        ? t.key === 'exam-results' ? 'bg-amber-600 text-white shadow-md' : 'bg-green-600 text-white shadow-md'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    <t.icon size={15} /> {t.label} <span className="text-[10px] opacity-70">({t.count})</span>
                  </button>
                ))}
              </div>

              {/* Add button */}
              {sTrainingTab !== 'questions' && sTrainingTab !== 'exam-results' && (
                <button onClick={() => setSTrainingForm({})}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2">
                  <Plus size={15} /> {sTrainingTab === 'videos' ? 'Thêm Khóa học' : 'Thêm tài liệu'}
                </button>
              )}
              {sTrainingTab === 'questions' && (
                <button onClick={() => setSqForm({ ...BLANK_Q })}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition flex items-center gap-2">
                  <Plus size={15} /> Thêm câu hỏi
                </button>
              )}
              {/* Kết quả thi tự động từ bài thi của học viên - không cần thêm thủ công */}

              {/* Add/Edit Form */}
              {sTrainingForm && (
                <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-green-700 flex items-center gap-2">
                      <Edit3 size={16} /> {sTrainingForm.id ? 'Chỉnh sửa' : 'Thêm mới'}
                    </h3>
                    <button onClick={() => setSTrainingForm(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                      <input value={sTrainingForm.title || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, title: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="Nhập tiêu đề..." />
                    </div>
                    {sTrainingTab === 'videos' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả Khóa học (Tóm tắt)</label>
                        <input value={sTrainingForm.desc || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, desc: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="Nhập mô tả tóm tắt..." />
                      </div>
                    )}

                    {sTrainingTab === 'files' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Loại file</label>
                          <select value={sTrainingForm.fileType || 'PDF'} onChange={e => setSTrainingForm({ ...sTrainingForm, fileType: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none">
                            {['PDF', 'PPTX', 'XLSX', 'DOCX', 'ZIP'].map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Dung lượng</label>
                          <input value={sTrainingForm.fileSize || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, fileSize: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="2.4MB" />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Mô tả - Rich Text Editor */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nội dung (có định dạng)</label>
                    <RichTextEditor
                      value={sTrainingForm.desc || ''}
                      onChange={(val) => setSTrainingForm(prev => ({ ...prev, desc: val }))}
                      placeholder="Nhập nội dung mô tả chi tiết..."
                    />
                  </div>
                  <button onClick={() => {
                    if (!sTrainingForm.title?.trim()) { 
                        showGlobalModal({ title: 'Thiếu thông tin', content: 'Vui lòng nhập tiêu đề tài liệu!', type: 'warning' });
                        return; 
                    }
                    if (sTrainingForm.id) {
                      updateStudentTrainingItem(sTrainingTab, sTrainingForm.id, sTrainingForm);
                    } else {
                      addStudentTrainingItem(sTrainingTab, { ...sTrainingForm, createdAt: new Date().toISOString().split('T')[0] });
                    }
                    setSTrainingForm(null);
                  }} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2">
                    <Save size={15} /> {sTrainingForm.id ? 'Cập nhật' : 'Thêm mới'}
                  </button>
                </div>
              )}

              {/* ===== EXAM RESULTS TAB - ĐỌC TỪ students.examProgress ===== */}
              {sTrainingTab === 'exam-results' && (() => {
                const SUBJECT_LABELS = { coban: 'Máy vi tính (Cơ bản)', word: 'Microsoft Word', excel: 'Microsoft Excel', powerpoint: 'Microsoft PowerPoint' };
                // Flatten all students' examProgress into rows
                const allRows = (students || []).flatMap(s => 
                  (s.examProgress || [])
                    .filter(ep => ep.status && ep.status !== 'chua_thi')
                    .map(ep => ({
                      studentId: s._id || s.id,
                      studentName: s.name,
                      course: s.course,
                      subjectId: ep.id,
                      subjectLabel: SUBJECT_LABELS[ep.id] || ep.id,
                      score: ep.tracNghiem?.score ?? 0,
                      total: ep.tracNghiem?.total ?? 15,
                      thucHanh: ep.thucHanh || 'chua_nop',
                      essayFile: ep.essayFile || '',
                      essayScore: ep.essayScore ?? null,
                      status: ep.status,
                      lockUntil: ep.lockUntil,
                    }))
                );
                const filtered = allRows.filter(r => 
                  !erSearch || r.studentName?.toLowerCase().includes(erSearch.toLowerCase())
                );

                // Helper: save essay score to student's examProgress
                const saveEssayScore = async (studentId, subjectId, newScore) => {
                  const student = (students || []).find(s => (s._id || s.id) === studentId);
                  if (!student) return;
                  const progress = (student.examProgress || []).map(ep => ({...ep}));
                  const idx = progress.findIndex(ep => ep.id === subjectId);
                  if (idx === -1) return;
                  progress[idx].essayScore = newScore;
                  const subjectLabel = SUBJECT_LABELS[subjectId] || subjectId;
                  // Nếu trắc nghiệm đạt >= 50% VÀ tự luận >= 5 => đạt, nếu < 5 => rớt + khóa 7 ngày
                  const tn = progress[idx].tracNghiem;
                  const tnPct = tn ? Math.round((tn.score / tn.total) * 100) : 0;
                  let finalResult = null;
                  if (tnPct >= 50 && progress[idx].thucHanh === 'da_nop') {
                    if (newScore >= 5) {
                      progress[idx].status = 'dat';
                      progress[idx].lockUntil = null;
                      finalResult = 'dat';
                    } else {
                      progress[idx].status = 'khong_dat';
                      progress[idx].lockUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
                      finalResult = 'khong_dat';
                    }
                  }
                  try {
                    await ctxUpdateStudent(studentId, { examProgress: progress });
                    toast.success(`Đã chấm ${newScore}/10 điểm tự luận cho ${student.name}!`);
                    // 🔔 Thông báo cho học viên
                    addNotification(studentId, 'student', `📝 Bài thực hành môn ${subjectLabel} đã được chấm: ${newScore}/10 điểm.`);
                    if (finalResult === 'dat') {
                      addNotification(studentId, 'student', `🎉 Chúc mừng! Bạn đã ĐẠT môn ${subjectLabel}!`);
                    } else if (finalResult === 'khong_dat') {
                      addNotification(studentId, 'student', `❌ Bạn CHƯA ĐẠT môn ${subjectLabel}. Môn thi sẽ bị khóa 7 ngày trước khi thi lại.`);
                    }
                  } catch (err) {
                    toast.error('Lỗi khi lưu điểm!');
                  }
                };

                return (
                <div className="space-y-4 animate-in fade-in duration-300">
                  {/* Filters */}
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={erSearch} onChange={e => setErSearch(e.target.value)}
                        className="pl-8 pr-4 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 outline-none w-56"
                        placeholder="Tìm theo tên học viên..." />
                    </div>
                    <span className="text-xs text-gray-400 font-bold ml-auto">
                      {filtered.length} bản ghi
                    </span>
                  </div>

                  {/* Table */}
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1050px]">
                        <thead>
                          <tr className="bg-amber-50 border-b border-amber-100">
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest">Học viên</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest">Khóa học</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest">Môn thi</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Trắc nghiệm</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Tự luận (File)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Chấm điểm TL</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Trạng thái</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Khóa đến</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((r, idx) => {
                            const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
                            const isLocked = r.lockUntil && r.lockUntil > Date.now();
                            const tnPass = pct >= 50;
                            // Trạng thái tổng hợp: TN đạt + TL đã nộp + chấm >= 5 => ĐẠT
                            const finalStatus = !tnPass ? 'khong_dat'
                              : r.thucHanh !== 'da_nop' ? r.status
                              : r.essayScore === null ? 'cho_cham' // chờ chấm
                              : r.essayScore >= 5 ? 'dat' : 'khong_dat';
                            return (
                              <tr key={`${r.studentId}-${r.subjectId}`} className="hover:bg-amber-50/30 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-white text-xs font-black">
                                      {(r.studentName || '?')[0]}
                                    </div>
                                    <span className="font-bold text-sm text-gray-800">{r.studentName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs font-semibold text-gray-500">{r.course}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs font-bold text-gray-700">{r.subjectLabel}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className={`text-lg font-black ${pct >= 50 ? 'text-green-600' : 'text-red-500'}`}>{r.score}/{r.total}</span>
                                    <span className="text-[9px] text-gray-400 font-bold">{pct}%</span>
                                  </div>
                                </td>
                                {/* Cột Tự luận: Chưa nộp / Nút tải xuống */}
                                <td className="px-4 py-3 text-center">
                                  {r.thucHanh === 'da_nop' ? (
                                    r.essayFile ? (
                                      <a href={r.essayFile.startsWith('http') ? r.essayFile : `http://localhost:5000${r.essayFile}`} 
                                         target="_blank" rel="noopener noreferrer"
                                         className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[10px] font-black transition border border-blue-200">
                                        <Download size={12} /> Tải bài
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-50 text-green-700 border border-green-200">
                                        ✅ Đã nộp
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-gray-50 text-gray-400 border border-gray-200">
                                      ⏳ Chưa nộp
                                    </span>
                                  )}
                                </td>
                                {/* Cột Chấm điểm Tự luận (0-10) — INLINE INPUT */}
                                <td className="px-4 py-3 text-center">
                                  {r.thucHanh === 'da_nop' ? (() => {
                                    const rowKey = `${r.studentId}-${r.subjectId}`;
                                    const isGrading = gradingRow === rowKey;
                                    if (r.essayScore !== null && !isGrading) {
                                      // Đã chấm: hiện điểm + nút chấm lại
                                      return (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className={`text-lg font-black ${r.essayScore >= 5 ? 'text-green-600' : 'text-red-500'}`}>
                                            {r.essayScore}/10
                                          </span>
                                          <button onClick={() => { setGradingRow(rowKey); setGradingValue(String(r.essayScore)); }}
                                            className="text-[9px] text-blue-500 hover:text-blue-700 font-bold cursor-pointer">
                                            Chấm lại
                                          </button>
                                        </div>
                                      );
                                    }
                                    if (isGrading) {
                                      // Đang nhập điểm inline
                                      return (
                                        <div className="flex items-center gap-1.5 justify-center">
                                          <input
                                            type="number" min="0" max="10" step="0.5"
                                            value={gradingValue}
                                            onChange={e => setGradingValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter' && gradingValue !== '' && !isNaN(gradingValue)) {
                                                saveEssayScore(r.studentId, r.subjectId, Math.min(10, Math.max(0, Number(gradingValue))));
                                                setGradingRow(null); setGradingValue('');
                                              }
                                              if (e.key === 'Escape') { setGradingRow(null); setGradingValue(''); }
                                            }}
                                            autoFocus
                                            className="w-14 px-2 py-1.5 border-2 border-amber-400 rounded-lg text-center text-sm font-black outline-none focus:border-amber-600 bg-amber-50"
                                            placeholder="0-10"
                                          />
                                          <button onClick={() => {
                                            if (gradingValue !== '' && !isNaN(gradingValue)) {
                                              saveEssayScore(r.studentId, r.subjectId, Math.min(10, Math.max(0, Number(gradingValue))));
                                              setGradingRow(null); setGradingValue('');
                                            }
                                          }} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition" title="Lưu điểm">
                                            <CheckCircle2 size={14} />
                                          </button>
                                          <button onClick={() => { setGradingRow(null); setGradingValue(''); }}
                                            className="p-1.5 bg-gray-200 text-gray-500 rounded-lg hover:bg-gray-300 transition" title="Huỷ">
                                            <X size={14} />
                                          </button>
                                        </div>
                                      );
                                    }
                                    // Chưa chấm: nút bấm để mở input
                                    return (
                                      <button onClick={() => { setGradingRow(rowKey); setGradingValue(''); }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg text-[10px] font-black transition border border-amber-300">
                                        ✏️ Chấm điểm
                                      </button>
                                    );
                                  })() : (
                                    <span className="text-[10px] text-gray-300">—</span>
                                  )}
                                </td>
                                {/* Trạng thái tổng hợp */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black ${
                                    finalStatus === 'dat' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : finalStatus === 'khong_dat' ? 'bg-red-50 text-red-600 border border-red-200'
                                    : finalStatus === 'cho_cham' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : finalStatus === 'dang_thi' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                                  }`}>
                                    {finalStatus === 'dat' && <><CheckCircle2 size={11} /> ĐẠT</>}
                                    {finalStatus === 'khong_dat' && <><XCircle size={11} /> RỚT</>}
                                    {finalStatus === 'dang_thi' && '⏳ ĐANG THI'}
                                    {finalStatus === 'cho_cham' && '📝 CHỜ CHẤM'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {isLocked ? (
                                    <div className="group relative inline-flex flex-col items-center cursor-pointer">
                                      <span className="text-[10px] font-bold text-red-500 group-hover:opacity-30 transition-opacity">
                                        🔒 {new Date(r.lockUntil).toLocaleDateString('vi-VN')}
                                      </span>
                                      <button
                                        onClick={() => {
                                          showGlobalModal({
                                            title: 'Mở khóa cho học viên thi lại?',
                                            content: `Bạn có chắc muốn mở khóa môn "${r.subjectLabel}" cho học viên ${r.studentName}? Học viên sẽ được phép thi lại ngay lập tức.`,
                                            type: 'question',
                                            confirmText: 'Mở khóa',
                                            cancelText: 'Huỷ',
                                            onConfirm: async () => {
                                              const student = (students || []).find(s => (s._id || s.id) === r.studentId);
                                              if (!student) return;
                                              const progress = (student.examProgress || []).map(ep => ({...ep}));
                                              const epIdx = progress.findIndex(ep => ep.id === r.subjectId);
                                              if (epIdx === -1) return;
                                              // Xóa khóa + reset trạng thái để thi lại
                                              progress[epIdx].attemptCount = (progress[epIdx].attemptCount || 0) + 1;
                                              progress[epIdx].lockUntil = null;
                                              progress[epIdx].status = 'chua_thi';
                                              progress[epIdx].tracNghiem = null;
                                              progress[epIdx].thucHanh = 'chua_nop';
                                              progress[epIdx].essayScore = null;
                                              progress[epIdx].essayFile = null;
                                              try {
                                                await ctxUpdateStudent(r.studentId, { examProgress: progress });
                                                toast.success(`Đã mở khóa "${r.subjectLabel}" cho ${r.studentName}. Học viên có thể thi lại!`);
                                                // 🔔 Thông báo cho học viên
                                                addNotification(r.studentId, 'student', `🔓 Môn ${r.subjectLabel} đã được mở khóa! Bạn có thể thi lại ngay bây giờ.`);
                                              } catch (err) {
                                                toast.error('Lỗi khi mở khóa!');
                                              }
                                            }
                                          });
                                        }}
                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                                      >
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black shadow-lg hover:bg-blue-700 transition whitespace-nowrap">
                                          🔓 Mở khóa thi lại
                                        </span>
                                      </button>
                                    </div>
                                  ) : r.status === 'khong_dat' ? (
                                    <button
                                      onClick={() => {
                                        showGlobalModal({
                                          title: 'Cho học viên thi lại?',
                                          content: `Bạn có chắc muốn reset môn "${r.subjectLabel}" cho học viên ${r.studentName}? Học viên sẽ được phép thi lại.`,
                                          type: 'question',
                                          confirmText: 'Cho thi lại',
                                          cancelText: 'Huỷ',
                                          onConfirm: async () => {
                                            const student = (students || []).find(s => (s._id || s.id) === r.studentId);
                                            if (!student) return;
                                            const progress = (student.examProgress || []).map(ep => ({...ep}));
                                            const epIdx = progress.findIndex(ep => ep.id === r.subjectId);
                                            if (epIdx === -1) return;
                                            progress[epIdx].attemptCount = (progress[epIdx].attemptCount || 0) + 1;
                                            progress[epIdx].lockUntil = null;
                                            progress[epIdx].status = 'chua_thi';
                                            progress[epIdx].tracNghiem = null;
                                            progress[epIdx].thucHanh = 'chua_nop';
                                            progress[epIdx].essayScore = null;
                                            progress[epIdx].essayFile = null;
                                            try {
                                              await ctxUpdateStudent(r.studentId, { examProgress: progress });
                                              toast.success(`Đã mở cho ${r.studentName} thi lại "${r.subjectLabel}"!`);
                                              // 🔔 Thông báo cho học viên
                                              addNotification(r.studentId, 'student', `🔓 Môn ${r.subjectLabel} đã được cấp quyền thi lại! Bạn có thể vào thi ngay.`);
                                            } catch (err) {
                                              toast.error('Lỗi khi reset bài thi!');
                                            }
                                          }
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-bold transition border border-blue-200"
                                    >
                                      🔓 Cho thi lại
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-gray-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr>
                              <td colSpan="8" className="px-6 py-14 text-center text-gray-400">
                                <Trophy size={36} className="mx-auto mb-3 text-gray-200" />
                                <p className="text-sm font-bold">Chưa có kết quả thi nào</p>
                                <p className="text-xs text-gray-300 mt-1">Khi học viên hoàn thành bài thi, kết quả sẽ tự động hiện tại đây</p>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* List items (training content) */}
              {sTrainingTab !== 'exam-results' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {sTrainingTab === 'questions' ? (
                    (() => {
                      const SECTION_OPTS = [
                        { value: 'excel', label: 'Microsoft Excel' },
                        { value: 'word', label: 'Microsoft Word' },
                        { value: 'powerpoint', label: 'Microsoft PowerPoint' },
                        { value: 'computer', label: 'Máy tính & Windows' },
                        { value: 'situation', label: 'Tình Huống Sư Phạm' },
                        { value: 'other', label: 'Kiến thức Khác' },
                      ];
                      const filtered = (studentQuestions || []).filter(q => {
                        const matchS = sqSection === 'all' || q.section === sqSection;
                        const matchQ = !sqSearch || q.q.toLowerCase().includes(sqSearch.toLowerCase());
                        return matchS && matchQ;
                      });

                      return (
                        <div className="p-4 space-y-4">
                          <div className="flex flex-wrap gap-2 mb-4">
                            <select value={sqSection} onChange={e => setSqSection(e.target.value)} className="border-2 border-gray-100 rounded-xl px-3 py-1.5 text-xs font-bold focus:border-green-500 outline-none">
                              <option value="all">Tất cả phần</option>
                              {SECTION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                              <input type="text" value={sqSearch} onChange={e => setSqSearch(e.target.value)} placeholder="Tìm câu hỏi học viên..." className="w-full pl-9 pr-4 py-1.5 border-2 border-gray-100 rounded-xl text-xs focus:border-green-500 outline-none" />
                            </div>
                          </div>

                          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                            {filtered.length === 0 ? <p className="p-8 text-center text-gray-400 text-sm">Trống</p> : filtered.map((q, idx) => {
                              const sOpt = SECTION_OPTS.find(s => s.value === q.section);
                              const colors = { excel: 'bg-green-100 text-green-700', word: 'bg-blue-100 text-blue-700', powerpoint: 'bg-orange-100 text-orange-700', computer: 'bg-indigo-100 text-indigo-700', situation: 'bg-purple-100 text-green-700', other: 'bg-gray-100 text-gray-700' };
                              return (
                                <div key={q.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                                  <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-black text-gray-400 flex-shrink-0 mt-0.5">{idx + 1}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${colors[q.section] || 'bg-gray-100 text-gray-500'}`}>{sOpt?.label}</span>
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${q.type === 'essay' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>{q.type === 'essay' ? 'TỰ LUẬN' : 'TRẮC NGHIỆM'}</span>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800">{q.q}</p>
                                    {q.type === 'essay' && q.attachedFile && (
                                      <div className="mt-1 text-[10px] font-bold text-green-600 flex items-center gap-1"><Download size={12} /> {q.attachedFile}</div>
                                    )}
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => setSqForm({ ...q })} className="p-2 rounded-lg bg-blue-50 text-blue-600"><Edit3 size={13} /></button>
                                    <button onClick={() => { 
                                      showGlobalModal({
                                        title: 'Xoá câu hỏi dành cho học viên?',
                                        content: 'Câu hỏi này sẽ bị xoá khỏi bộ đề thi của học viên.',
                                        type: 'warning',
                                        confirmText: 'Xoá',
                                        cancelText: 'Huỷ',
                                        onConfirm: () => removeStudentQuestion(q.id)
                                      });
                                    }} className="p-2 rounded-lg bg-red-50 text-red-500"><Trash2 size={13} /></button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (studentTrainingData?.[sTrainingTab] || []).map(item => (
                      <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {sTrainingTab === 'videos' && (
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-105 transition" onClick={() => setSCourseBuilderMode(item)}>
                              <BookOpen size={20} className="text-white" />
                            </div>
                          )}

                          {sTrainingTab === 'files' && (
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${item.fileType === 'PDF' ? 'bg-red-500' : item.fileType === 'PPTX' ? 'bg-orange-500' : 'bg-green-500'
                              }`}>
                              {item.fileType || 'FILE'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-gray-800 truncate">{item.title}</p>
                            <p className="text-xs text-gray-400 truncate">{(item.desc?.replace(/<[^>]*>/g, '') || '').slice(0, 80)}</p>
                            {item.duration && <p className="text-[10px] text-green-500 mt-0.5">⏱ {item.duration}</p>}
                            {item.fileSize && <p className="text-[10px] text-gray-400 mt-0.5">{item.fileSize}</p>}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-3 flex-shrink-0 items-center">
                          {sTrainingTab === 'videos' && (
                             <button onClick={() => setSCourseBuilderMode(item)} className="px-3 py-1.5 rounded-lg bg-green-50 border border-green-100 hover:bg-green-100 text-green-600 text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5">
                               <Layers size={13} /> Giáo trình
                             </button>
                          )}
                          <button onClick={() => setSTrainingForm({ ...item })}
                            className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition"><Edit3 size={14} /></button>
                          <button onClick={() => {
                            showGlobalModal({
                              title: 'Xác nhận xoá tài liệu',
                              content: `Bạn có chắc muốn xoá tài liệu "${item.title}" dành cho học viên không?`,
                              type: 'warning',
                              confirmText: 'Xoá vĩnh viễn',
                              cancelText: 'Huỷ bỏ',
                              onConfirm: () => removeStudentTrainingItem(sTrainingTab, item.id)
                            });
                          }} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))
                  )}
                  {sTrainingTab !== 'questions' && (studentTrainingData?.[sTrainingTab] || []).length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                      <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Chưa có nội dung nào</p>
                      <p className="text-xs text-gray-300 mt-1">Bấm "Thêm" để tạo nội dung đào tạo cho học viên</p>
                    </div>
                  )}
                 </div>
              )}

              {/* Student Question Form Modal */}
              {sqForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
                    <div className="bg-gradient-to-r from-green-600 to-green-500 px-8 py-5 flex items-center justify-between text-white">
                      <h3 className="font-bold text-lg flex items-center gap-3">
                        <HelpCircle size={24} /> {sqForm.id ? 'Sửa câu hỏi học viên' : 'Thêm câu hỏi học viên mới'}
                      </h3>
                      <button onClick={() => setSqForm(null)} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
                    </div>
                    <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar text-left text-gray-800">
                      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                        <button onClick={() => setSqForm({ ...sqForm, type: 'multiple' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${sqForm.type === 'multiple' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Trắc nghiệm</button>
                        <button onClick={() => setSqForm({ ...sqForm, type: 'essay' })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${sqForm.type === 'essay' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Tự luận</button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Phần thi</label>
                          <select value={sqForm.section} onChange={e => setSqForm({ ...sqForm, section: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-green-500 outline-none text-sm font-bold">
                            <option value="excel">Microsoft Excel</option>
                            <option value="word">Microsoft Word</option>
                            <option value="powerpoint">Microsoft PowerPoint</option>
                            <option value="computer">Máy tính & Windows</option>
                            <option value="situation">Tình Huống Sư Phạm</option>
                            <option value="other">Kiến thức Khác</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Độ khó</label>
                          <select value={sqForm.difficulty} onChange={e => setSqForm({ ...sqForm, difficulty: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-green-500 outline-none text-sm font-bold">
                            <option value="easy">Cơ bản</option>
                            <option value="medium">Trung bình</option>
                            <option value="hard">Nâng cao</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Câu hỏi</label>
                        <textarea value={sqForm.q} onChange={e => setSqForm({ ...sqForm, q: e.target.value })}
                          rows={3} className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-green-500 outline-none text-sm resize-none" placeholder="Nhập nội dung câu hỏi..." />
                      </div>
                      {sqForm.type === 'multiple' ? (
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Đáp án (Chọn để đánh dấu câu đúng)</label>
                          <div className="space-y-2">
                            {(sqForm.options || ['', '', '', '']).map((opt, i) => (
                              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 transition ${sqForm.correct === i ? 'border-green-400 bg-green-50' : 'border-gray-100'}`}>
                                <button onClick={() => setSqForm({ ...sqForm, correct: i })} className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-black transition ${sqForm.correct === i ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{['A', 'B', 'C', 'D'][i]}</button>
                                <input value={opt} onChange={e => { const o = [...(sqForm.options || [])]; o[i] = e.target.value; setSqForm({ ...sqForm, options: o }); }} className="flex-1 bg-transparent outline-none text-sm" placeholder={`Đáp án ${['A', 'B', 'C', 'D'][i]}...`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Gợi ý đáp án / Nội dung mẫu</label>
                            <textarea value={sqForm.sampleAnswer || ''} onChange={e => setSqForm({ ...sqForm, sampleAnswer: e.target.value })} rows={3} className="w-full border-2 border-gray-100 rounded-xl p-3 focus:border-green-500 outline-none text-sm resize-none" placeholder="Nhập nội dung gợi ý..." />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Đính kèm tài liệu (Nếu có)</label>
                            <div className="flex items-center gap-3">
                              <label className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 hover:bg-gray-50 transition cursor-pointer flex flex-col items-center justify-center text-center">
                                <input type="file" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) setSqForm({ ...sqForm, attachedFile: f.name }); }} />
                                {sqForm.attachedFile ? <span className="text-green-600 font-bold text-sm flex items-center gap-2"><FileText size={16} /> {sqForm.attachedFile}</span> : <span className="text-gray-400 text-xs py-1">Nhấn để chọn file...</span>}
                              </label>
                              {sqForm.attachedFile && <button onClick={() => setSqForm({ ...sqForm, attachedFile: null })} className="p-2 text-red-500 bg-red-50 rounded-lg"><X size={16} /></button>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="px-6 pb-6 flex gap-3">
                      <button onClick={() => setSqForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600">Huỷ</button>
                      <button onClick={() => {
                        if (!sqForm.q?.trim()) { toast.error('Vui lòng nhập câu hỏi!'); return; }
                        if (sqForm.type === 'multiple' && (sqForm.options || []).filter(o => o?.trim()).length < 2) { toast.error('Cần ít nhất 2 đáp án!'); return; }
                        try {
                          if (sqForm.id) { updateStudentQuestion(sqForm.id, sqForm); toast.success('Đã cập nhật câu hỏi học viên!'); }
                          else { addStudentQuestion({ ...sqForm, createdAt: Date.now() }); toast.success('Đã thêm câu hỏi học viên mới!'); }
                          setSqForm(null);
                        } catch (err) { toast.error('Lỗi khi lưu!'); }
                      }} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                        <Save size={16} /> Lưu câu hỏi
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== MODAL THÊM / CHỈNH SỬA KẾT QUẢ THI ===== */}
          {erForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
                <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-8 py-5 flex items-center justify-between text-white">
                  <h3 className="font-bold text-lg flex items-center gap-3">
                    <Trophy size={22} /> {erForm.id ? 'Chỉnh sửa / Chấm điểm' : 'Thêm kết quả thi mới'}
                  </h3>
                  <button onClick={() => setErForm(null)} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                  {/* Chọn học viên */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Học viên</label>
                      <select
                        value={erForm.studentId || ''}
                        onChange={e => {
                          const s = students.find(x => String(x.id) === e.target.value || String(x._id) === e.target.value);
                          setErForm({ ...erForm, studentId: e.target.value, studentName: s?.name || '' });
                        }}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm font-bold"
                      >
                        <option value="">-- Chọn học viên --</option>
                        {students.map(s => (
                          <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Môn / Khóa học thi</label>
                      <select value={erForm.subject || ''} onChange={e => setErForm({ ...erForm, subject: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm font-bold">
                        <option value="THVP NÂNG CAO (12 BUỔI)">THVP NÂNG CAO (12 BUỔI)</option>
                        <option value="MOS EXCEL CHUYÊN SÂU (10 BUỔI)">MOS EXCEL CHUYÊN SÂU (10 BUỔI)</option>
                        <option value="THIẾT KẾ ĐỒ HỌA CƠ BẢN">THIẾT KẾ ĐỒ HỌA CƠ BẢN</option>
                        <option value="AUTOCAD 2D - 3D (15 BUỔI)">AUTOCAD 2D - 3D (15 BUỔI)</option>
                        <option value="LẬP TRÌNH PYTHON CƠ BẢN">LẬP TRÌNH PYTHON CƠ BẢN</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </div>
                  </div>

                  {/* Trắc nghiệm */}
                  <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">📝 Phần Trắc nghiệm</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Số câu đúng</label>
                        <input type="number" min="0"
                          value={erForm.multipleChoiceCorrect || ''}
                          onChange={e => setErForm({ ...erForm, multipleChoiceCorrect: e.target.value })}
                          className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800"
                          placeholder="30" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tổng số câu</label>
                        <input type="number" min="0"
                          value={erForm.multipleChoiceTotal || ''}
                          onChange={e => setErForm({ ...erForm, multipleChoiceTotal: e.target.value })}
                          className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800"
                          placeholder="40" />
                      </div>
                    </div>
                    {erForm.multipleChoiceTotal > 0 && (
                      <p className="text-xs text-blue-600 font-bold">
                        Tỉ lệ: {Math.round((erForm.multipleChoiceCorrect / erForm.multipleChoiceTotal) * 100) || 0}%
                        {' '}({Number(erForm.multipleChoiceCorrect) >= Number(erForm.multipleChoiceTotal) * 0.7 ? '✅ Đạt phần trắc nghiệm' : '❌ Chưa đạt'})
                      </p>
                    )}
                  </div>

                  {/* Tự luận */}
                  <div className="bg-purple-50 rounded-2xl p-4 space-y-3 border border-purple-100">
                    <p className="text-xs font-black text-green-700 uppercase tracking-widest">✍️ Phần Tự luận (Admin tự chấm)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Điểm tự luận (0–10)</label>
                        <input type="number" min="0" max="10" step="0.5"
                          value={erForm.essayScore !== undefined ? erForm.essayScore : ''}
                          onChange={e => setErForm({ ...erForm, essayScore: e.target.value })}
                          className="w-full border-2 border-purple-200 rounded-xl p-3 focus:border-green-500 outline-none text-sm font-bold text-purple-800"
                          placeholder="7.5" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ngày thi</label>
                        <input type="date"
                          value={erForm.date || ''}
                          onChange={e => setErForm({ ...erForm, date: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nhận xét tự luận</label>
                      <textarea value={erForm.essayNote || ''} onChange={e => setErForm({ ...erForm, essayNote: e.target.value })}
                        rows={2} className="w-full border-2 border-purple-100 rounded-xl p-3 focus:border-green-500 outline-none text-sm resize-none"
                        placeholder="Nhận xét bài tự luận, ghi chú..." />
                    </div>
                  </div>

                  {/* Kết quả tổng */}
                  <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-sm font-black text-gray-700 flex-1">Kết quả tổng: Đạt môn?</p>
                    <div className="flex gap-3">
                      <button onClick={() => setErForm({ ...erForm, passed: true })}
                        className={`flex-1 px-8 py-3 rounded-2xl text-[13px] font-black transition-all duration-300 border-2 ${
                          erForm.passed 
                            ? 'bg-gradient-to-br from-emerald-500 to-emerald-400 border-transparent text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] scale-[1.02]' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 hover:scale-[1.02]'
                        }`}>ĐẠT</button>
                      <button onClick={() => setErForm({ ...erForm, passed: false })}
                        className={`flex-1 px-8 py-3 rounded-2xl text-[13px] font-black transition-all duration-300 border-2 ${
                          !erForm.passed 
                            ? 'bg-gradient-to-br from-red-500 to-pink-500 border-transparent text-white shadow-[0_8px_20px_rgba(239,68,68,0.3)] scale-[1.02]' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50/50 hover:scale-[1.02]'
                        }`}>CHƯA ĐẠT</button>
                    </div>
                  </div>
                </div>

                <div className="px-8 pb-8 flex gap-3">
                  <button onClick={() => setErForm(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600">Huỷ</button>
                  <button onClick={() => {
                    if (!erForm.studentName?.trim()) { toast.error('Vui lòng chọn học viên!'); return; }
                    if (!erForm.subject?.trim()) { toast.error('Vui lòng chọn môn thi!'); return; }
                    if (erForm.id) {
                      updateExamResult(erForm.id, erForm);
                      toast.success('Đã cập nhật kết quả thi!');
                    } else {
                      addExamResult(erForm);
                      toast.success('Đã thêm kết quả thi!');
                    }
                    setErForm(null);
                  }} className="flex-1 py-3 bg-gradient-to-r from-amber-600 to-orange-500 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                    <Save size={16} /> {erForm.id ? 'Cập nhật' : 'Lưu kết quả'}
                  </button>
                </div>
              </div>
            </div>
          )}



          {/* ===== TAB: NHẬT KÝ HỆ THỐNG (Enhanced) ===== */}
          {activeTab === 'logs' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Lock size={20} className="text-slate-600" />
                    Nhật Ký Hoạt Động Hệ Thống
                  </h2>
                  <button onClick={() => {
                      setIsLoadingLogs(true);
                      api.systemLogs.getAll(1, 100)
                        .then(res => setDbLogs(res.data))
                        .finally(() => setIsLoadingLogs(false));
                    }} className="text-xs font-bold text-blue-600 flex items-center gap-1.5 hover:underline decoration-2 underline-offset-4">
                    <RefreshCw size={14} className={isLoadingLogs ? "animate-spin" : ""} /> Làm mới
                  </button>
                </div>
                <div className="divide-y divide-gray-50">
                  {isLoadingLogs ? (
                    <div className="p-12 text-center text-gray-400">
                      <RefreshCw size={40} className="mx-auto mb-3 text-gray-300 animate-spin" />
                      <p className="text-sm">Đang tải nhật ký...</p>
                    </div>
                  ) : dbLogs && dbLogs.length > 0 ? dbLogs.map(log => {
                    // Action icon + color
                    const actionStyles = {
                      'ĐĂNG NHẬP':     { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', icon: '🔑' },
                      'ĐĂNG XUẤT':     { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: '🚪' },
                      'THÊM HỌC VIÊN': { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: '👤' },
                      'THÊM GIẢNG VIÊN': { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', icon: '🎓' },
                      'THÊM NHÂN VIÊN': { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', icon: '👥' },
                      'THÊM MỚI':     { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', icon: '➕' },
                      'CẬP NHẬT':     { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: '✏️' },
                      'CẬP NHẬT HV':  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: '✏️' },
                      'CẬP NHẬT GV':  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', icon: '✏️' },
                      'SỬA HỌC PHÍ':  { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', icon: '💰' },
                      'XÓA':          { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: '🗑️' },
                      'XÓA HỌC VIÊN': { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: '🗑️' },
                      'XÓA GIẢNG VIÊN': { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: '🗑️' },
                      'XÓA NHÂN VIÊN': { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: '🗑️' },
                      'DUYỆT GV':     { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', icon: '✅' },
                      'TỪ CHỐI GV':   { bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200', icon: '❌' },
                      'PHÂN QUYỀN':   { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', icon: '🛡️' },
                      'TẠO LỊCH HỌC': { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', icon: '📅' },
                      'CẬP NHẬT LỊCH': { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', icon: '📅' },
                      'XÁC NHẬN LƯƠNG': { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', icon: '💵' },
                      'TẠO GIAO DỊCH': { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', icon: '💳' },
                      'THANH TOÁN':   { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', icon: '✅' },
                      'CÀI ĐẶT':     { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', icon: '⚙️' },
                      'ĐỔI MẬT KHẨU': { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', icon: '🔐' },
                    };
                    const style = actionStyles[log.action] || { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: '📋' };
                    const roleName = log.role === 'admin' ? (log.adminRole === 'SUPER_ADMIN' ? 'SUPER ADMIN' : log.adminRole === 'STAFF' ? 'NHÂN VIÊN' : 'ADMIN') : log.role?.toUpperCase() || 'HỆ THỐNG';
                    const isLogin = log.action === 'ĐĂNG NHẬP';

                    return (
                      <div key={log._id || log.id} className={`px-6 py-4 hover:bg-slate-50/50 transition-colors ${isLogin ? 'border-l-4 border-l-emerald-400' : ''}`}>
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${style.bg} border ${style.border} shadow-sm`}>
                            <span className="text-lg">{style.icon}</span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Action + message */}
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-xs font-black px-2 py-0.5 rounded-md ${style.bg} ${style.text} border ${style.border}`}>{log.action}</span>
                              <span className="text-sm text-gray-700 font-medium">{log.message || log.target}</span>
                            </div>

                            {/* User info line */}
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                              <span className="font-bold text-slate-500 flex items-center gap-1">
                                <User size={10} /> {log.name}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded font-bold ${log.role === 'admin' ? 'bg-red-50 text-red-600' : log.role === 'staff' ? 'bg-purple-50 text-purple-600' : log.role === 'teacher' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>
                                {roleName}
                              </span>
                              {log.branchCode && (
                                <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-bold border border-teal-200">🏢 {log.branchCode}</span>
                              )}
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400">{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
                            </div>

                            {/* Device + IP line (prominent for login events) */}
                            {(log.device || log.ip) && (
                              <div className={`flex items-center gap-2 flex-wrap mt-1.5 text-[10px] ${isLogin ? 'bg-emerald-50/50 rounded-lg px-2.5 py-1.5 border border-emerald-100' : ''}`}>
                                {log.device && (
                                  <span className={`flex items-center gap-1 ${isLogin ? 'font-bold text-emerald-700' : 'text-slate-400'}`}>
                                    💻 {log.device}
                                  </span>
                                )}
                                {log.ip && log.ip !== 'unknown' && (
                                  <>
                                    <span className="text-slate-200">|</span>
                                    <span className={`flex items-center gap-1 font-mono ${isLogin ? 'font-bold text-emerald-600' : 'text-slate-400'}`}>
                                      🌐 IP: {log.ip}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="p-12 text-center text-gray-400">
                      <Lock size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Chưa có hoạt động nào được ghi nhận</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* ===== TAB: CÀI ĐẶT HỆ THỐNG ===== */}
          {activeTab === 'settings' && (
            <div className="animate-in fade-in duration-300">
              <SystemSettingsTab />
            </div>
          )}

          {/* ===== TAB: PHÂN QUYỀN NHÂN VIÊN ===== */}
          {activeTab === 'staff' && (
            <div className="animate-in fade-in duration-300">
              <StaffManagementTab />
            </div>
          )}

          {/* ===== TAB: BÁO CÁO DOANH THU ===== */}
          {activeTab === 'analytics' && (
            <div className="animate-in fade-in duration-300">
              <RevenueAnalyticsTab />
            </div>
          )}

          {/* ===== TAB: NHÂN SỰ & LƯƠNG ===== */}
          {activeTab === 'hr' && (
            <div className="animate-in fade-in duration-300">
              <EmployeeManagementTab />
            </div>
          )}

        </div>
      </div>

      {/* ===== MODAL XÁC NHẬN XOÁ ĐÀO TẠO ===== */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4">
              <h3 className="text-white font-bold flex items-center gap-2"><Trash2 size={18} /> Xác nhận xoá</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">Bạn có chắc muốn xoá <strong>"{deleteConfirm.title}"</strong>?</p>
              <p className="text-xs text-gray-400 mt-1">Hành động này không thể hoàn tác.</p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 transition">Huỷ</button>
              <button onClick={() => { removeTrainingItem(deleteConfirm.category, deleteConfirm.id); setDeleteConfirm(null); }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition">Xoá ngay</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL THÊM HỌC VIÊN ===== */}
      {showModal && <AddStudentModal teachers={teachers} onAdd={addStudent} onClose={() => setShowModal(false)} />}

      {/* ===== MODAL THANH TOÁN LƯƠNG 2 BƯỚC ===== */}
      {payoutModal && (() => {
        const pm = payoutModal;
        const sessCount = Number(pm.sessionsCount) || 0;
        const salaryPS = pm.baseSalaryPerSession || 0;
        const autoAmt  = sessCount * salaryPS;

        // Dùng shared helper từ BankSelect.jsx — .png + encodeURIComponent đúng chuẩn VietQR
        const qrUrl = generateVietQRUrl(
          pm.bankInfo?.bankCode || '',
          pm.bankInfo?.accountNumber || '',
          Number(pm.amount) || autoAmt,
          pm.note || `Luong GV ${pm.teacherName}`,
          pm.bankInfo?.accountHolder || pm.bankInfo?.accountName || pm.teacherName || '',
        );

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-6 py-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <DollarSign size={20} />
                  <div>
                    <h3 className="font-bold text-base leading-tight">Thanh Toán Lương Giảng Viên</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {['Nhập thông tin', 'Quét QR chuyển khoản'].map((s, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${pm.step === i + 1 ? 'bg-white text-emerald-700 font-bold' : 'bg-emerald-800/50 text-emerald-200'}`}>
                          {i + 1}. {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => setPayoutModal(null)} className="hover:bg-emerald-800/40 rounded-lg p-1 transition"><X size={20} /></button>
              </div>

              {/* BƯỚC 1: FORM NHẬP */}
              {pm.step === 1 && (
                <>
                  <div className="p-6 space-y-4">
                    {pm.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-3 text-gray-500">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <span>Đang tải thông tin giảng viên...</span>
                      </div>
                    ) : (
                      <>
                        {/* Teacher card */}
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4">
                          <p className="font-bold text-emerald-800 text-lg">{pm.teacherName}</p>
                          <div className="grid grid-cols-3 gap-3 mt-3">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-bold">Lương/buổi</p>
                              <p className="font-bold text-gray-800 text-sm">{salaryPS.toLocaleString('vi-VN')}đ</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-bold">Buổi còn nợ</p>
                              <p className="font-bold text-amber-600 text-sm">{pm.pendingSessionsCount} buổi</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase font-bold">Tổng nợ</p>
                              <p className="font-bold text-red-600 text-sm">{(pm.pendingSessionsCount * salaryPS).toLocaleString('vi-VN')}đ</p>
                            </div>
                          </div>
                          {pm.bankInfo?.bankName && (
                            <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center gap-2 text-sm text-gray-600">
                              <CreditCard size={14} className="text-emerald-600" />
                              <span className="font-semibold">{pm.bankInfo.bankName}</span>
                              <span>·</span>
                              <span className="font-mono font-bold">{pm.bankInfo.accountNumber}</span>
                              {pm.bankInfo.accountHolder && <span className="text-gray-400">· {pm.bankInfo.accountHolder}</span>}
                            </div>
                          )}
                        </div>

                        {salaryPS === 0 && (
                          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2">
                            <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-700 font-medium">Giảng viên chưa có mức lương/buổi. Hãy cập nhật ở trang Giảng viên → Chỉnh sửa trước.</p>
                          </div>
                        )}

                        {/* Số buổi thanh toán */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">
                              Số buổi muốn thanh toán
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = Math.max(0, Number(pm.sessionsCount || 0) - 1);
                                  setPayoutModal(prev => ({ ...prev, sessionsCount: String(cur), amount: String(cur * salaryPS) }));
                                }}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-black text-xl flex items-center justify-center transition flex-shrink-0"
                              >−</button>
                              <input
                                type="number" min="0"
                                value={pm.sessionsCount}
                                onChange={e => {
                                  const s = e.target.value;
                                  const autoA = Math.max(0, Number(s)) * salaryPS;
                                  setPayoutModal(prev => ({ ...prev, sessionsCount: s, amount: String(autoA) }));
                                }}
                                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-center focus:border-emerald-400 outline-none"
                                placeholder="0"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = Number(pm.sessionsCount || 0) + 1;
                                  setPayoutModal(prev => ({ ...prev, sessionsCount: String(cur), amount: String(cur * salaryPS) }));
                                }}
                                className="w-10 h-10 rounded-xl bg-emerald-100 hover:bg-emerald-200 font-black text-xl text-emerald-700 flex items-center justify-center transition flex-shrink-0"
                              >+</button>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {pm.pendingSessionsCount > 0
                                ? `Hệ thống ghi nhận: ${pm.pendingSessionsCount} buổi chưa thanh toán`
                                : '⚠️ Chưa có lịch dạy completed — nhập thủ công'}
                            </p>
                          </div>

                          {/* Số tiền */}
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">
                              Số tiền thanh toán (VND)
                            </label>
                            <input
                              type="number" min="0"
                              value={pm.amount}
                              onChange={e => setPayoutModal(prev => ({ ...prev, amount: e.target.value }))}
                              className="w-full border-2 border-emerald-300 rounded-xl px-3 py-2.5 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none bg-emerald-50"
                              placeholder="Tự nhập hoặc tự tính"
                            />
                            {autoAmt > 0 && Number(pm.amount) !== autoAmt && (
                              <button onClick={() => setPayoutModal(prev => ({ ...prev, amount: String(autoAmt) }))}
                                className="text-[10px] text-emerald-600 mt-1 underline">
                                Khôi phục = {autoAmt.toLocaleString('vi-VN')}đ
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Ghi chú */}
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">
                            Nội dung chuyển khoản
                          </label>
                          <textarea
                            value={pm.note || ''}
                            onChange={e => setPayoutModal(prev => ({ ...prev, note: e.target.value }))}
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-400 outline-none resize-none"
                            rows={2} placeholder="Thù lao dạy tháng 4..."
                          />
                        </div>

                        {Number(pm.amount) > 0 && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-sm text-emerald-700 font-medium">💸 Tổng cần chuyển:</span>
                            <span className="text-xl font-black text-emerald-700">{Number(pm.amount).toLocaleString('vi-VN')}đ</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="px-6 pb-6 flex gap-3">
                    <button onClick={() => setPayoutModal(null)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">Huỷ</button>
                    <button
                      onClick={handleGoToQR}
                      disabled={pm.isLoading || !Number(pm.amount) || !Number(pm.sessionsCount)}
                      className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-700 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <CreditCard size={16} /> Xem QR Chuyển Khoản →
                    </button>
                  </div>
                </>
              )}

              {/* BƯỚC 2: QR CODE */}
              {pm.step === 2 && (
                <>
                  <div className="p-6 space-y-4">
                    <div className="text-center">
                      <p className="font-bold text-gray-800 text-base">Quét mã QR để chuyển khoản</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {Number(pm.amount).toLocaleString('vi-VN')}đ → <span className="font-semibold">{pm.teacherName}</span>
                      </p>
                    </div>

                    {qrUrl ? (
                      <div className="flex justify-center">
                        <div className="border-4 border-emerald-100 rounded-2xl p-2 bg-white shadow-lg">
                          <img
                            src={qrUrl}
                            alt="QR Chuyển khoản"
                            className="w-56 h-56 object-contain rounded-xl"
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                          <div style={{ display: 'none' }} className="w-56 h-56 flex flex-col items-center justify-center text-gray-400 gap-2">
                            <AlertCircle size={32} />
                            <p className="text-xs text-center">Không thể tải QR.<br/>Vui lòng chuyển thủ công.</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                        <AlertCircle size={28} className="text-amber-500 mx-auto mb-2" />
                        <p className="text-sm text-amber-700 font-medium">Giảng viên chưa có thông tin ngân hàng đầy đủ (mã ngân hàng &amp; số TK)</p>
                        <p className="text-xs text-amber-600 mt-1">Vui lòng cập nhật trang hồ sơ của giảng viên</p>
                      </div>
                    )}

                    {/* Summary */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Ngân hàng</span>
                        <span className="font-semibold">{pm.bankInfo?.bankName || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Số tài khoản</span>
                        <span className="font-mono font-bold">{pm.bankInfo?.accountNumber || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Chủ tài khoản</span>
                        <span className="font-semibold">{pm.bankInfo?.accountHolder || pm.teacherName}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-500">Nội dung CK</span>
                        <span className="font-medium text-right max-w-[60%]">{pm.note}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-bold text-gray-700">Số tiền</span>
                        <span className="font-black text-lg text-emerald-700">{Number(pm.amount).toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-6 flex gap-3">
                    <button onClick={() => setPayoutModal(prev => ({ ...prev, step: 1 }))}
                      className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2">
                      ← Quay lại chỉnh sửa
                    </button>
                    <button
                      onClick={handlePayout}
                      className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-700 flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                    >
                      <CheckCircle2 size={16} /> Đã chuyển khoản xong
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        );
      })()}


      {/* ===== INVOICE ẨN ĐỂ XUẤT PDF ===== */}
      {printStudent && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceTemplate data={{
            studentName: printStudent.name,
            courseName: printStudent.course,
            tuitionFee: printStudent.price,
            date: new Date(),
            receiverName: 'Hồ Thị Nga',
            isPaid: printStudent.paid,
          }} />
        </div>
      )}
      {/* ===== MODAL THÊM GIẢNG VIÊN ===== */}
      {showTeacherModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><GraduationCap size={18} /> Thêm Giảng viên mới</h3>
              <button onClick={() => setShowTeacherModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Họ tên</label>
                <input type="text" value={teacherForm.name} onChange={e => setTeacherForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Số điện thoại / Zalo (dùng đăng nhập)</label>
                <input type="text" value={teacherForm.phone} onChange={e => setTeacherForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" placeholder="0912345678" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Chuyên môn</label>
                <input type="text" value={teacherForm.specialty} onChange={e => setTeacherForm(p => ({ ...p, specialty: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" placeholder="Excel, Word, PowerPoint" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Email</label>
                <input type="email" value={teacherForm.email || ''} onChange={e => setTeacherForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" placeholder="email@example.com" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ngày vào làm</label>
                <input type="date" value={teacherForm.startDate} onChange={e => setTeacherForm(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Địa chỉ</label>
                <input type="text" value={teacherForm.address} onChange={e => setTeacherForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none" placeholder="VD: 123 Đường ABC, Quận X..." />
              </div>

              {/* ⭐ Chi nhánh — SUPER_ADMIN chọn, STAFF auto-fill */}
              {(() => {
                const sess = JSON.parse(localStorage.getItem('admin_user') || localStorage.getItem('staff_user') || '{}');
                const isSA = sess?.id === 'admin' || sess?.adminRole === 'SUPER_ADMIN';
                if (isSA) {
                  // SUPER_ADMIN: dropdown chọn chi nhánh
                  return (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Chi nhánh</label>
                      <select
                        value={teacherForm.branchId || ''}
                        onChange={e => {
                          const opt = e.target.selectedOptions[0];
                          setTeacherForm(p => ({ ...p, branchId: e.target.value, branchCode: opt?.dataset.code || '' }));
                        }}
                        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-blue-400 outline-none"
                      >
                        <option value="">— Chưa phân chi nhánh —</option>
                        {(JSON.parse(localStorage.getItem('thvp_branches') || '[]')).map(b => (
                          <option key={b._id} value={b._id} data-code={b.code}>{b.name} ({b.code})</option>
                        ))}
                      </select>
                    </div>
                  );
                } else {
                  // STAFF: auto-fill, read-only
                  return (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Chi nhánh</label>
                      <input type="text" readOnly value={sess?.branchCode ? `Cơ sở ${sess.branchCode}` : 'Chi nhánh hiện tại'}
                        className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                    </div>
                  );
                }
              })()}

              <p className="text-xs text-gray-400 bg-blue-50 rounded-xl p-3">
                💡 Giảng viên sau khi được tạo sẽ ở trạng thái <strong>"Chưa cấp quyền" (Inactive)</strong>. Admin cần duyệt <i>Cấp quyền thi</i> thì họ mới có thể đăng nhập bằng SĐT.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowTeacherModal(false)} className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50">Huỷ</button>
              <button onClick={async () => {
                const p = teacherForm.phone || '';
                if (!teacherForm.name || !p) { toast.error('Vui lòng nhập họ tên và SĐT'); return; }
                if (p.length < 6) { toast.error('Số điện thoại phải từ 6 ký tự trở lên (Làm Mật Khẩu)'); return; }
                
                try {
                  await ctxAddTeacher({
                    name: teacherForm.name,
                    phone: p,
                    specialty: teacherForm.specialty || '',
                    startDate: teacherForm.startDate,
                    address: teacherForm.address,
                    status: 'pending',
                    branchId: teacherForm.branchId || undefined,
                    branchCode: teacherForm.branchCode || undefined,
                  });
                  setTeacherForm({ name: '', phone: '', specialty: '', startDate: new Date().toISOString().split('T')[0], address: '', branchId: '', branchCode: '' });
                  setShowTeacherModal(false);
                  toast.success('Đã thêm giảng viên thành công!');
                  fetchTeachers();
                } catch (err) {
                  toast.error('Lỗi thêm giảng viên: ' + (err.message || 'Không xác định'));
                }
              }} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-bold hover:from-blue-700">Thêm giảng viên</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CHỈNH SỬA GIẢNG VIÊN ===== */}
      {editTeacher && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white flex flex-col flex-shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-extrabold flex items-center gap-2 text-lg"><Edit3 size={20} /> Hồ sơ Giảng viên</h3>
                <button onClick={() => setEditTeacher(null)} className="hover:bg-blue-800/40 p-1.5 rounded-xl transition-colors"><X size={20} /></button>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setEditTeacher(p => ({ ...p, _tab: 'info' }))}
                  className={`pb-2 px-1 text-sm font-bold border-b-2 transition-colors ${editTeacher._tab !== 'history' ? 'border-white text-white' : 'border-transparent text-blue-200 hover:text-white'}`}
                >
                  Thông tin chung
                </button>
                <button 
                  onClick={() => setEditTeacher(p => ({ ...p, _tab: 'history' }))}
                  className={`pb-2 px-1 text-sm font-bold border-b-2 transition-colors ${editTeacher._tab === 'history' ? 'border-white text-white' : 'border-transparent text-blue-200 hover:text-white'}`}
                >
                  Lịch sử sắp lịch
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
              {editTeacher._tab === 'history' ? (
                <TeacherScheduleHistoryPanel teacherId={editTeacher.id || editTeacher._id} />
              ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Cột 1 */}
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Họ tên</label>
                    <input type="text" value={editTeacher.name || ''} onChange={e => setEditTeacher(p => ({ ...p, name: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-semibold" />
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Số điện thoại / Zalo</label>
                    <input type="text" value={editTeacher.phone || ''} onChange={e => setEditTeacher(p => ({ ...p, phone: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono font-semibold" />
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Chuyên môn</label>
                    <input type="text" value={editTeacher.specialty || ''}
                      onChange={e => setEditTeacher(p => ({ ...p, specialty: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-semibold text-slate-700" 
                      placeholder="VD: Word, Excel" />
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Email</label>
                    <input type="email" value={editTeacher.email || ''}
                      onChange={e => setEditTeacher(p => ({ ...p, email: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-semibold" 
                      placeholder="email@example.com" />
                  </div>
                </div>

                {/* Cột 2 */}
                <div className="space-y-4">
                   <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Trạng thái duyệt</label>
                    <select value={String(editTeacher.status || 'inactive').toLowerCase()} onChange={e => setEditTeacher(p => ({ ...p, status: e.target.value }))}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-slate-700 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%207l5%205%205-5%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:calc(100%-1rem)_center]">
                      <option value="inactive">🔒 Chưa cấp quyền</option>
                      <option value="pending">🕒 Cấp quyền thi (Chờ làm bài)</option>
                      <option value="active">🟢 Đã cấp quyền (Active)</option>
                      <option value="locked">🚫 Đã khóa</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Lương / buổi (VNĐ)</label>
                    <input type="text"
                      value={editTeacher.baseSalaryPerSession || ''}
                      onChange={e => setEditTeacher(p => ({ ...p, baseSalaryPerSession: Number(e.target.value.replace(/\D/g, '')) }))}
                      className="w-full border-2 border-blue-200 bg-blue-50/30 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all font-black text-blue-700 font-mono"
                      placeholder="150000" />
                  </div>

                  {/* ⭐ Chi nhánh — chỉ SUPER_ADMIN */}
                  {(() => {
                    const sess = JSON.parse(localStorage.getItem('admin_user') || '{}');
                    const isSA = sess?.id === 'admin' || sess?.adminRole === 'SUPER_ADMIN';
                    if (!isSA) return null;
                    return (
                      <div>
                        <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Điều chuyển chi nhánh</label>
                        <select
                          value={editTeacher.branchId || ''}
                          onChange={e => {
                            const opt = e.target.selectedOptions[0];
                            setEditTeacher(p => ({ ...p, branchId: e.target.value, branchCode: opt?.dataset.code || '' }));
                          }}
                          className="w-full border-2 border-amber-200 bg-amber-50/30 rounded-xl px-4 py-3 text-sm focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-50 outline-none transition-all font-bold text-amber-900 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%207l5%205%205-5%22%20stroke%3D%22%23b45309%22%20stroke-width%3D%222%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:calc(100%-1rem)_center]"
                        >
                          <option value="">— Chưa phân chi nhánh —</option>
                          {(JSON.parse(localStorage.getItem('thvp_branches') || '[]')).map(b => (
                            <option key={b._id} value={b._id} data-code={b.code}>{b.name} ({b.code})</option>
                          ))}
                        </select>
                        {editTeacher.branchCode && (
                          <p className="text-[10px] text-amber-700 font-bold mt-1.5 flex items-center gap-1"><MapPin size={12}/> Hiện tại: {editTeacher.branchCode}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-100 pt-5">
                 <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Ngày vào làm</label>
                  <input type="date" value={editTeacher.startDate ? new Date(editTeacher.startDate).toISOString().split('T')[0] : ''}
                    onChange={e => setEditTeacher(p => ({ ...p, startDate: e.target.value }))}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none hover:border-slate-300 transition-all font-semibold" />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Địa chỉ</label>
                  <input type="text" value={editTeacher.address || ''}
                    onChange={e => setEditTeacher(p => ({ ...p, address: e.target.value }))}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none hover:border-slate-300 transition-all font-semibold"
                    placeholder="Nhập địa chỉ..." />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Giới thiệu bản thân (Bio)</label>
                <textarea 
                  value={editTeacher.bio || ''}
                  onChange={e => setEditTeacher(p => ({ ...p, bio: e.target.value }))}
                  rows={2}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none hover:border-slate-300 transition-all font-medium resize-none"
                  placeholder="Kinh nghiệm cá nhân, bằng cấp, sở trường..."
                />
              </div>

              {/* Ngân hàng */}
              <div className="border-t-2 border-dashed border-slate-200 pt-5 mt-2">
                <p className="text-xs font-black text-emerald-700 uppercase mb-4 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg w-max"><CreditCard size={14} /> Thông tin ngân hàng (QR Nhận Lương)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Ngân hàng nhận</label>
                    <BankSelect
                      value={editTeacher.bankAccount?.bankCode || ''}
                      onChange={bank => setEditTeacher(p => ({
                        ...p,
                        bankAccount: {
                          ...(p.bankAccount || {}),
                          bankCode: bank.bin,
                          bankName: bank.shortName,
                        }
                      }))}
                    />
                    {editTeacher.bankAccount?.bankCode && (
                      <p className="text-[10px] font-bold text-emerald-600 mt-1.5 flex items-center gap-1">✓ Đã chọn: {editTeacher.bankAccount.bankName}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Số tài khoản</label>
                    <input type="text"
                      value={editTeacher.bankAccount?.accountNumber || ''}
                      onChange={e => setEditTeacher(p => ({ ...p, bankAccount: { ...(p.bankAccount || {}), accountNumber: e.target.value.replace(/\D/g,'') } }))}
                      className="w-full border-2 border-emerald-200 focus:border-emerald-500 bg-emerald-50/20 focus:bg-white rounded-xl px-4 py-3 text-sm font-mono font-black text-emerald-800 outline-none transition-all"
                      placeholder="VD: 123456789" />
                  </div>
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase block mb-1.5 tracking-wider">Tên chủ tài khoản</label>
                    <input type="text"
                      value={editTeacher.bankAccount?.accountHolder || editTeacher.bankAccount?.accountName || ''}
                      onChange={e => setEditTeacher(p => ({ ...p, bankAccount: { ...(p.bankAccount || {}), accountHolder: e.target.value.toUpperCase(), accountName: e.target.value.toUpperCase() } }))}
                      className="w-full border-2 border-emerald-200 focus:border-emerald-500 bg-emerald-50/20 focus:bg-white rounded-xl px-4 py-3 text-sm outline-none uppercase font-black text-emerald-800 transition-all"
                      placeholder="VD: NGUYEN VAN A" />
                  </div>
                </div>
              </div>
              </>
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-100 px-6 py-5 flex gap-4 flex-shrink-0">
              <button 
                onClick={() => setEditTeacher(null)} 
                className={`${editTeacher._tab === 'history' ? 'w-full' : 'flex-1'} py-3.5 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm`}
              >
                {editTeacher._tab === 'history' ? 'Đóng' : 'Huỷ bỏ'}
              </button>
              {editTeacher._tab !== 'history' && (
                <>
                  <button onClick={() => {
                    setResetPwInput('');
                    setResetPwModal({ id: editTeacher.id || editTeacher._id, name: editTeacher.name, role: 'teacher' });
                  }} className="py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-amber-100 transition-all whitespace-nowrap">
                    <KeyRound size={15} /> Cấp lại MK
                  </button>
                  <button onClick={async () => {
                    try {
                      await ctxUpdateTeacher(editTeacher.id, {
                        name: editTeacher.name,
                        phone: editTeacher.phone,
                        specialty: editTeacher.specialty,
                        startDate: editTeacher.startDate,
                        address: editTeacher.address,
                        status: editTeacher.status,
                        baseSalaryPerSession: editTeacher.baseSalaryPerSession,
                        bankAccount: editTeacher.bankAccount || {},
                        branchId: editTeacher.branchId,
                        branchCode: editTeacher.branchCode,
                      });
                      setEditTeacher(null);
                      toast.success('Đã cập nhật thông tin giảng viên!');
                      fetchTeachers();
                    } catch (err) {
                      toast.error('Lỗi cập nhật giảng viên: ' + (err.message || 'Không xác định'));
                    }
                  }} className="flex-[2] py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-wide hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all">
                    <Save size={18} /> Lưu thay đổi
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {editStudent && (
        <EditStudentModal
          student={editStudent}
          teachers={globalTeachers}
          onClose={() => setEditStudent(null)}
          onSave={async (updatedForm) => {
            const payload = {
              name: updatedForm.name,
              age: updatedForm.age,
              phone: updatedForm.phone,
              zalo: updatedForm.zalo,
              courseId: updatedForm.courseId,
              course: updatedForm.course,
              price: updatedForm.price,
              totalSessions: updatedForm.totalSessions,
              paid: updatedForm.paid,
              studentExamUnlocked: updatedForm.studentExamUnlocked,
              teacherId: updatedForm.teacherId || null,
              learningMode: updatedForm.learningMode,
              branchId: updatedForm.branchId || undefined,
            };

            try {
              await ctxUpdateStudent(editStudent.id || editStudent._id, payload);
              setEditStudent(null);
              toast.success('Đã cập nhật học viên!');
              mutate(['admin_stats', selectedBranchId]);
              mutate(['admin_finance', selectedBranchId]);
              fetchStudentsPaginated({ page: currentPage, limit: PAGE_SIZE, search, paid: filterPaid, course: filterCourse, branch_id: selectedBranchId });
            } catch (err) {
              toast.error('Lỗi cập nhật học viên: ' + (err.message || 'Không xác định'));
            }
          }}
        />
      )}

      {/* ===== POPUP XÁC NHẬN XOÁ ===== */}
      {grantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setGrantModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-[scaleIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                 <Unlock size={24} className="text-white" />
              </div>
              <h3 className="text-xl font-black text-white">Xác nhận cấp truy cập</h3>
            </div>
            <div className="p-6">
              <div className="text-center mb-6">
                <p className="text-gray-600 text-sm mb-4">Bạn có chắc chắn muốn cấp lại quyền truy cập cho Giảng viên này?</p>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-blue-800 font-bold text-base">{grantModal.name}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setGrantModal(null)}
                  className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    await grantPending(grantModal.id);
                    toast.success('Đã cấp lại quyền làm bài thi thành công!');
                    setGrantModal(null);
                  }}
                  className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-white shadow-lg shadow-blue-200 transition-all text-sm"
                >
                  Xác nhận cấp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={() => setDeleteModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-[scaleIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-5 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Trash2 size={32} className="text-white" />
              </div>
              <h3 className="text-white font-black text-lg">Xác nhận xoá</h3>
              <p className="text-red-100 text-sm mt-1">{deleteModal.type === 'teacher' ? 'Giảng viên' : 'Học viên'}</p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                <p className="text-red-800 font-bold text-base">{deleteModal.name}</p>
                <p className="text-red-600 text-xs mt-1">ID: {deleteModal.id}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-orange-700 text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Hành động này không thể hoàn tác!
                </p>
                <p className="text-orange-600 text-xs mt-1">
                  Tất cả dữ liệu liên quan sẽ bị xoá vĩnh viễn.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-bold hover:from-red-700 transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-200"
              >
                <Trash2 size={16} /> Xoá ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: HỒ SƠ CHI TIẾT HỌC VIÊN (Aggregated Data) ── */}
      {showStudentDetailId && (
        <StudentDetailModal 
          studentId={showStudentDetailId} 
          onClose={() => setShowStudentDetailId(null)} 
        />
      )}

      {showImportModal && (
        <StudentImportModal 
          onClose={() => setShowImportModal(false)}
          branchId={selectedBranchId}
        />
      )}

      {/* ===== MODAL CẤP LẠI MẬT KHẨU ===== */}
      {resetPwModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[300] p-4" onClick={() => setResetPwModal(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <KeyRound size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-black text-base">Cấp lại mật khẩu</p>
                  <p className="text-white/80 text-xs">{resetPwModal.role === 'teacher' ? 'Giảng viên' : 'Học viên'}: {resetPwModal.name}</p>
                </div>
              </div>
              <button onClick={() => setResetPwModal(null)} className="hover:bg-white/20 rounded-lg p-1 transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input
                  type="text"
                  value={resetPwInput}
                  onChange={e => setResetPwInput(e.target.value)}
                  autoFocus
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-bold font-mono tracking-widest text-center focus:border-amber-400 outline-none transition"
                  placeholder="Nhập mật khẩu mới..."
                  onKeyDown={e => { if (e.key === 'Enter' && resetPwInput.length >= 6) document.getElementById('btn-confirm-reset-pw').click(); }}
                />
                {resetPwInput && resetPwInput.length < 6 && (
                  <p className="text-xs text-red-500 mt-1 text-center">Mật khẩu phải ít nhất 6 ký tự</p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setResetPwModal(null)}
                  className="flex-1 py-3 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition">
                  Hủy
                </button>
                <button
                  id="btn-confirm-reset-pw"
                  disabled={resetPwInput.length < 6 || resetPwLoading}
                  onClick={async () => {
                    if (resetPwInput.length < 6) return;
                    setResetPwLoading(true);
                    try {
                      const res = await api.auth.adminResetPassword(resetPwModal.id, resetPwModal.role, resetPwInput);
                      if (res.success) {
                        toast.success(`✅ Đã đặt lại mật khẩu cho ${resetPwModal.name}`);
                        setResetPwModal(null);
                        setResetPwInput('');
                      } else {
                        toast.error(res.message || 'Thất bại');
                      }
                    } catch { toast.error('Lỗi kết nối server'); }
                    finally { setResetPwLoading(false); }
                  }}
                  className="flex-[2] py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:from-amber-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-100 transition"
                >
                  {resetPwLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <KeyRound size={16} />}
                  {resetPwLoading ? 'Đang lưu...' : 'Xác nhận đặt lại'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
