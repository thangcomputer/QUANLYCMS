import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Send, ChevronLeft, ChevronRight,
  Upload, CheckCircle, Download, Paperclip, Monitor, XCircle,
  LayoutGrid, Shield, Clock,
} from 'lucide-react';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import { useSocket } from '../context/SocketContext';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';
import { getStudentMcQuestionsForExam } from '../utils/htmlContent';
import api from '../services/api';

const SUBJECT_META = {
  coban:       { label: 'Máy vi tính (Cơ bản)', short: 'Cơ bản',     examFile: 'De_thi_Co_ban.docx', time: 90 * 60 },
  word:        { label: 'Microsoft Word',       short: 'Word',       examFile: 'De_thi_Word.docx',   time: 90 * 60 },
  excel:       { label: 'Microsoft Excel',      short: 'Excel',      examFile: 'De_thi_Excel.xlsx',  time: 90 * 60 },
  powerpoint:  { label: 'Microsoft PowerPoint', short: 'PowerPoint', examFile: 'De_thi_PPT.pptx',   time: 90 * 60 },
};

/** Logo từ cấu hình web (đồng bộ sidebar); fallback SVG chỉnh tông cho nền tối */
function ExamBrandLogo({ resolvedUrl, className }) {
  return (
    <img
      src={resolvedUrl || '/logo-thang-tin-hoc.svg'}
      alt="Logo"
      className={className}
      style={
        resolvedUrl
          ? { objectFit: 'contain' }
          : { filter: 'brightness(0) invert(1)' }
      }
    />
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, boldText, onConfirm, onCancel, confirmLabel = 'Nộp bài', cancelLabel = 'Làm tiếp' }) => (
  <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h3 className="font-bold text-gray-800 text-base mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-1">
        {boldText && <><strong>{boldText}</strong> </>}
        {message}
      </p>
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 font-semibold text-sm hover:bg-gray-50">{cancelLabel}</button>
        <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-bold text-sm transition-all">{confirmLabel}</button>
      </div>
    </div>
  </div>
);

// ─── Main StudentTest ─────────────────────────────────────────────────────────
const StudentTest = ({ subjectId = 'word', studentSbd = '11111', studentName = 'THIÊN TRANG', onBack }) => {
  // Socket & Data
  const session = JSON.parse(localStorage.getItem('student_user') || '{}');
  const STUDENT_ID = session.id || 101;
  const { students, studentQuestions, studentExamMinutes, updateStudent, addNotification } = useData() || {
    students: [],
    studentQuestions: [],
    studentExamMinutes: { coban: 90, word: 90, excel: 90, powerpoint: 90 },
    updateStudent: () => {},
    addNotification: () => {},
  };

  const meta = useMemo(() => {
    const base = SUBJECT_META[subjectId] || SUBJECT_META.word;
    const mins = Number(studentExamMinutes?.[subjectId]);
    const m = Number.isFinite(mins) && mins >= 1 ? mins : base.time / 60;
    const secs = Math.max(60, Math.min(8 * 3600, Math.round(m * 60)));
    return { ...base, time: secs };
  }, [subjectId, studentExamMinutes]);

  const questions = useMemo(() => {
    const raw = getStudentMcQuestionsForExam(studentQuestions, subjectId);
    return raw.map((q, i) => ({
      id: q.id ?? `sq-${subjectId}-${i}`,
      text: q.q || '',
      options: (q.options || []).filter((o) => o && String(o).trim()),
      answer: q.correct,
    }));
  }, [studentQuestions, subjectId]);

  const TOTAL = questions.length;

  const questionIdsKey = useMemo(() => questions.map((q) => q.id).join('|'), [questions]);
  const { socket } = useSocket() || {};
  const student = students?.find(s => String(s.id) === String(STUDENT_ID));
  const { showModal } = useModal();
  const teacherId = student?.teacherId;

  const [tab, setTab]           = useState('trac_nghiem');
  const [isTracNghiemSubmitted, setIsTracNghiemSubmitted] = useState(false);
  const [answers, setAnswers]   = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => meta.time);
  const [phase, setPhase]       = useState('hardware_check'); // hardware_check | test | result | banned
  const [banReason, setBanReason] = useState('');

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const previewRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_URL || '';
  const [webLogoUrl, setWebLogoUrl] = useState('');
  useEffect(() => {
    fetch(`${API_BASE}/api/settings/web`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.logoUrl) {
          const u = res.data.logoUrl;
          setWebLogoUrl(u.startsWith('http') ? u : `${API_BASE}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  // Modals
  const [showSubmitConfirm, setShowSubmitConfirm]   = useState(false);
  const [showNoFileConfirm, setShowNoFileConfirm]   = useState(false);

  useEffect(() => {
    if (phase !== 'test') return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [phase]);

  // Tự luận
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [tuLuanSubmitting, setTuLuanSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setAnswers(Array(TOTAL).fill(null));
    setCurrentQ(0);
    setIsTracNghiemSubmitted(false);
    setTab('trac_nghiem');
  }, [questionIdsKey, TOTAL]);

  useEffect(() => {
    setTimeLeft(meta.time);
  }, [meta.time, subjectId]);

  // ── BỎ QUA YÊU CẦU CAMERA NẾU ADMIN ĐÃ TẮT ──
  useEffect(() => {
    if (student?.requireWebcam === false && phase === 'hardware_check' && TOTAL > 0) {
      setPhase('test');
    }
  }, [student?.requireWebcam, phase, TOTAL]);

  const timerRef   = useRef(null);
  const monitorRef = useRef(null);
  const fileRef    = useRef(null);

  const updateExamProgress = useCallback((changes) => {
    if (!student || !updateStudent) return;
    const progress = student.examProgress || [];
    const idx = progress.findIndex(s => s.id === subjectId);
    let newProgress = [...progress];
    if (idx !== -1) {
      newProgress[idx] = { ...newProgress[idx], ...changes };
    } else {
      newProgress.push({ id: subjectId, ...changes });
    }
    updateStudent(student._id || student.id, { examProgress: newProgress });
  }, [student, updateStudent, subjectId]);

  // ── YÊU CẦU CAMERA Ở BƯỚC HARDWARE CHECK TRƯỚC KHI VÀO THI ──
  useEffect(() => {
    if (phase !== 'hardware_check') return;
    if (student?.requireWebcam === false) return;

    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(s => {
        stream = s;
        if (previewRef.current) previewRef.current.srcObject = s;
        setCameraReady(true);
        setCameraError('');
      })
      .catch(err => {
        setCameraReady(false);
        setCameraError(err.message);
      });

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [phase, student?.requireWebcam]);

  // ── Timer ──
  useEffect(() => {
    if (phase !== 'test' || TOTAL < 1) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleSubmitFinal(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, TOTAL]);

  // ── Browser Trap (Chống F5, Ctrl+R, Back) ──
  const failAndExitRef = useRef();
  failAndExitRef.current = () => {
    updateExamProgress({
      tracNghiem: { score: 0, total: TOTAL },
      thucHanh: 'chua_nop',
      status: 'khong_dat',
      lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    onBack?.();
  };


  useEffect(() => {
    if (phase !== 'test') return;

    const confirmExit = (reasonTxt) => {
      showModal({
        title: 'CẢNH BÁO TỪ HỆ THỐNG',
        content: `Nếu bạn ${reasonTxt}, đồng nghĩa với việc HỦY BÀI THI và bạn sẽ bị đánh rớt môn này bắt buộc. Bạn có chắc chắn muốn thoát?`,
        type: 'warning',
        confirmText: 'ĐỒNG Ý HỦY BÀI',
        cancelText: 'Làm bài tiếp',
        onConfirm: () => {
          if (failAndExitRef.current) failAndExitRef.current();
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        confirmExit('tải lại trang hiện tại (F5)');
      }
    };

    // Chỉ push trạng thái MỘT LẦN duy nhất khi mount Test Phase
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      confirmExit('quay lại trạng thái trước đó');
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Rời khỏi lúc này sẽ mất toàn bộ bài làm. Bạn có chắc không?';
    };

    // Bắt sự kiện khi thực sự rời khỏi trang (Reload hoặc Đóng tab)
    const handleActualUnload = () => {
      localStorage.setItem('punish_student_exam', 'true');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleActualUnload);
    window.addEventListener('unload', handleActualUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleActualUnload);
      window.removeEventListener('unload', handleActualUnload);
    };
  }, [phase]); // ĐÃ XÓA onBack, updateExamProgress VÀ showModal ĐỂ TRÁNH LẶP VÒNG LẶP PUSH HISTORY

  const handleViolation = useCallback((reason) => {
    clearInterval(timerRef.current);
    setBanReason(reason);
    setPhase('banned');
    
    updateExamProgress({
      tracNghiem: { score: 0, total: TOTAL },
      thucHanh: 'chua_nop',
      status: 'khong_dat',
      lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    
    // Phát cảnh báo qua socket cho Admin & Giảng viên
    if (socket) {
      socket.emit('exam:violation', {
        studentId: STUDENT_ID,
        studentName: session.name || studentName,
        teacherId: teacherId,
        course: meta.label,
        reason: reason
      });
    }
    // 🔔 Thông báo admin (persistent)
    addNotification(null, 'admin', `⚠️ Vi phạm thi cử: ${session.name || studentName} - môn ${meta.label}. Lý do: ${reason}`);
  }, [socket, STUDENT_ID, session.name, studentName, teacherId, meta.label, addNotification, updateExamProgress, TOTAL]);

  // Kiểm tra dấu vết tải lại trang từ lần trước
  useEffect(() => {
    const violation = localStorage.getItem('punish_student_exam');
    if (violation === 'true') {
      localStorage.removeItem('punish_student_exam');
      handleViolation('HỦY BÀI: Hành vi cố tình tải lại trang hoặc đóng tab khi đang thi!');
    }
  }, [handleViolation]);

  // Lắng nghe lệnh khóa từ Admin/Giảng viên qua Socket
  useEffect(() => {
    if (!socket) return;
    const onLocked = (data) => {
      // Kiểm tra id student hoặc data có khớp không
      if (String(data.studentId) === String(STUDENT_ID)) {
        handleViolation(data.reason || "Bị khóa bởi Giảng viên/Ban quản trị");
      }
    };
    socket.on('exam:locked', onLocked);
    return () => socket.off('exam:locked', onLocked);
  }, [socket, STUDENT_ID, handleViolation]);

  // Reset bài thi khi camera không phát hiện mặt 5 lần liên tiếp (lần đầu)
  const handleResetExam = useCallback(() => {
    setAnswers(Array(TOTAL).fill(null));
    setCurrentQ(0);
    setIsTracNghiemSubmitted(false);
    setTab('trac_nghiem');
    setUploadFile(null);
    setUploadDone(false);
  }, [TOTAL]);

  const handleAnswer = (qi, oi) => {
    const next = [...answers]; next[qi] = oi; setAnswers(next);
  };

  const handleSubmitFinal = () => {
    if (TOTAL < 1) return;
    const finalScore = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
    const finalPct = TOTAL > 0 ? Math.round((finalScore / TOTAL) * 100) : 0;
    const passedTN = finalPct >= 50;

    setIsTracNghiemSubmitted(true);

    if (!passedTN) {
      // Rớt trắc nghiệm => khóa 7 ngày, về result
      clearInterval(timerRef.current);
      updateExamProgress({
        tracNghiem: { score: finalScore, total: TOTAL },
        thucHanh: 'chua_nop',
        status: 'khong_dat',
        lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
      setPhase('result');
      // 🔔 Thông báo admin
      addNotification(null, 'admin', `❌ Học viên ${studentName} rớt trắc nghiệm môn ${meta.label}: ${finalScore}/${TOTAL} (${finalPct}%)`);
    } else {
      // Đậu trắc nghiệm => chuyển sang tab tự luận
      updateExamProgress({
        tracNghiem: { score: finalScore, total: TOTAL },
        status: 'dang_thi'
      });
      setTab('tu_luan');
      // 🔔 Thông báo admin
      addNotification(null, 'admin', `✅ Học viên ${studentName} đạt trắc nghiệm môn ${meta.label}: ${finalScore}/${TOTAL} (${finalPct}%). Đang làm phần thực hành.`);
    }
  };

  const handleFinalTuLuan = useCallback(async () => {
    clearInterval(timerRef.current);
    let essayFileStored = '';
    if (uploadFile) {
      setTuLuanSubmitting(true);
      try {
        const res = await api.assignments.uploadFile(uploadFile);
        if (!res?.success || !res.fileUrl) {
          throw new Error(res?.message || 'Tải file lên thất bại');
        }
        const raw = String(res.fileUrl);
        try {
          essayFileStored = raw.startsWith('http') ? new URL(raw).pathname : raw;
        } catch {
          essayFileStored = raw;
        }
      } catch (err) {
        setTuLuanSubmitting(false);
        showModal({
          title: 'Không tải được bài làm',
          content: err?.message || 'Vui lòng kiểm tra kết nối và định dạng file (tối đa 3MB theo hệ thống).',
          type: 'error',
          confirmText: 'Đóng',
        });
        return;
      }
      setTuLuanSubmitting(false);
    }
    updateExamProgress({
      thucHanh: 'da_nop',
      status: 'dat',
      ...(essayFileStored ? { essayFile: essayFileStored } : {}),
    });
    setUploadDone(true);
    setPhase('result');
    addNotification(null, 'admin', `📝 Học viên ${session.name || studentName} đã nộp bài thực hành môn ${meta.label}. Vui lòng chấm điểm.`);
  }, [uploadFile, updateExamProgress, showModal, addNotification, session.name, studentName, meta.label]);

  const trySubmit = () => {
    const unanswered = answers.filter(a => a === null).length;
    if (unanswered > 0) setShowSubmitConfirm(true);
    else handleSubmitFinal();
  };

  const trySubmitTuLuan = () => {
    if (!uploadFile) setShowNoFileConfirm(true);
    else void handleFinalTuLuan();
  };

  // Drag & drop
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadFile(file);
  };

  const score  = answers.reduce((acc, a, i) => acc + (a === questions[i]?.answer ? 1 : 0), 0);
  const pct    = TOTAL > 0 ? Math.round((score / TOTAL) * 100) : 0;
  const passed = TOTAL > 0 && pct >= 50;
  const mins   = Math.floor(timeLeft / 60);
  const secs   = timeLeft % 60;

  // ══════════════════════════════════════════════════════
  // HARDWARE CHECK
  // ══════════════════════════════════════════════════════
  if (phase === 'hardware_check') return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 border-[12px] border-blue-500/30 pointer-events-none rounded-[32px] m-4 animate-pulse" />
      <div className="bg-white rounded-[28px] p-5 max-w-[320px] w-full text-center shadow-[0_0_80px_rgba(32,61,181,0.4)] z-10 border-t-[6px] border-blue-600 animate-in zoom-in duration-500 overflow-y-auto max-h-[90vh] no-scrollbar">
         <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0">Yêu cầu bật Camera</h2>
         {TOTAL === 0 && (
           <div className="mb-3 px-2 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold leading-relaxed">
             Chưa có câu hỏi trắc nghiệm cho môn <span className="text-amber-950">{meta.short}</span> trong ngân hàng. Vui lòng liên hệ Admin.
           </div>
         )}
         <p className="text-slate-500 font-bold mt-1 mb-3 px-2 text-[10px] leading-relaxed">
             Để đảm bảo tính công bằng, bạn <span className="text-red-500">bắt buộc phải bật camera</span> xuyên suốt quá trình làm bài thi.
         </p>
         
         {/* Hướng dẫn Box (Mô phỏng Dialog Chrome) */}
         <div className="border-[1.5px] border-slate-200 rounded-[20px] p-3 mb-3 relative text-left bg-slate-50 shadow-inner select-none pointer-events-none">
            <div className="flex items-center justify-between mb-2">
               <div>
                  <p className="font-bold text-slate-700 text-[13px]">dashboard.thangcomputer.com muốn</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1 font-semibold"><Monitor size={12}/> Sử dụng camera có sẵn</p>
               </div>
               <XCircle size={16} className="text-slate-400" />
            </div>

            {/* Khung Camera Xem trước */}
            <div className="bg-slate-900 rounded-xl h-20 mb-2 relative overflow-hidden flex items-center justify-center border-[3px] border-white shadow-md">
               {cameraReady ? (
                   <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
               ) : (
                   <div className="text-white/50 text-xs flex flex-col items-center gap-2 font-bold">
                      <Monitor size={24} className="animate-pulse" />
                      {cameraError ? 'Lỗi Camera: Bị từ chối' : 'Đang chờ cấp quyền...'}
                   </div>
               )}
               <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white flex items-center gap-1 font-bold">
                 <CheckCircle size={10} /> Xem trước
               </div>
            </div>

            {/* Fake Dropdown */}
            <div className="border border-slate-200/80 rounded-[10px] px-3 py-1.5 text-[9px] font-bold text-slate-600 mb-2 flex justify-between bg-white shadow-sm">
               <span>HD WEB CAMERA</span>
               <span className="text-slate-400">▼</span>
            </div>

            {/* Fake Buttons Hướng dẫn */}
            <div className="space-y-1.5 relative mt-3">
               {/* Nút số 1 được đóng khung đỏ */}
               <div className="relative">
                  <div className="absolute -left-[5px] -right-[5px] -top-[5px] -bottom-[5px] border-2 border-red-500 rounded-[14px] pointer-events-none" />
                  <div className="bg-green-200/50 text-green-800 text-center py-1.5 rounded-[10px] font-bold text-[10px]">Cho phép mỗi khi truy cập...</div>
                  {/* SVG Arrow Pointing UP-LEFT */}
                  <svg className="absolute -right-[20px] -bottom-[20px] w-6 h-6 text-red-500 animate-bounce pointer-events-none" 
                       fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M6 6L20 20" />
                     <path d="M6 6v8" />
                     <path d="M6 6h8" />
                  </svg>
               </div>

               <div className="bg-green-100/50 text-green-700 text-center py-1.5 rounded-[10px] font-bold text-[10px] opacity-40 mix-blend-luminosity">Cho phép lần này</div>
               <div className="bg-green-100/50 text-green-700 text-center py-1.5 rounded-[10px] font-bold text-[10px] opacity-40 mix-blend-luminosity">Không bao giờ cho phép</div>
            </div>
         </div>

         {/* Trạng thái Sẵn sàng */}
         <div className={`py-2 rounded-[14px] font-black text-[10px] mb-3 flex items-center justify-center gap-1.5 transition-all duration-300 ${cameraReady ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400 opacity-60'}`}>
            <CheckCircle size={13} className={cameraReady ? '' : 'grayscale'}/> Camera đã sẵn sàng!
         </div>

         {/* Nút Vào thi */}
         <button 
             disabled={!cameraReady || TOTAL === 0}
             onClick={() => setPhase('test')} 
             className={`w-full py-2.5 font-black rounded-[14px] transition-all text-[11px] flex items-center justify-center gap-2 ${
                 cameraReady && TOTAL > 0
                 ? 'bg-red-500 text-white shadow-xl shadow-red-500/30 hover:bg-red-600 hover:scale-[1.02] active:scale-95' 
                 : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-70'
             }`}>
             TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI
         </button>
         {TOTAL === 0 && (
           <button type="button" onClick={() => onBack?.()} className="w-full mt-2 py-2 font-bold rounded-[14px] text-[11px] border border-slate-200 text-slate-600 hover:bg-slate-50">
             ← Quay lại
           </button>
         )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // BANNED
  // ══════════════════════════════════════════════════════
  if (phase === 'banned') return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-red-700 to-red-600 px-8 py-6 text-center">
          <div className="text-5xl mb-3">🚫</div>
          <h2 className="text-white font-black text-xl">TẠM KHÓA QUYỀN THI</h2>
          <p className="text-red-200 text-sm mt-1">Hệ thống phát hiện vi phạm</p>
        </div>
        <div className="p-8 space-y-4 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-600 text-sm font-bold">{banReason}</p>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed">
            Hành vi vi phạm đã được báo cáo lập tức tới <strong className="text-gray-800">Giảng viên phụ trách</strong> và <strong className="text-gray-800">Ban quản trị</strong>.
            <br/><br/>
            Quyền thi của bạn bị khóa tạm thời. Vui lòng liên hệ giảng viên để giải trình.
          </p>
          <button onClick={() => onBack?.()} className="w-full mt-4 py-3 bg-gray-900 shadow-xl hover:bg-black text-white font-bold rounded-xl active:scale-95 transition-all">
            OK, TÔI ĐÃ HIỂU VÀ THOÁT
          </button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // RESULT
  // ══════════════════════════════════════════════════════
  if (phase === 'result') return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Simple result header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 md:px-8 py-4 flex items-center gap-4">
        <ExamBrandLogo resolvedUrl={webLogoUrl} className="h-7 w-auto max-w-[140px] flex-shrink-0" />
        <span className="text-white font-bold text-sm">Kết quả — {meta.label}</span>
      </div>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        {/* Score */}
        <div className={`rounded-2xl p-6 text-center ${passed ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'}`}>
          <div className="text-5xl mb-3">{passed ? '🏆' : '😔'}</div>
          <h2 className={`text-2xl font-black ${passed ? 'text-green-700' : 'text-red-700'}`}>{passed ? 'ĐÃ ĐẠT!' : 'CHƯA ĐẠT'}</h2>
          <p className="text-4xl font-black mt-1 text-gray-800">{pct}%</p>
          <p className="text-gray-400 text-sm">Đúng {score}/{TOTAL} câu trắc nghiệm</p>
        </div>

        {/* Review */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {questions.map((q, i) => {
            const chosen = answers[i]; const correct = q.answer; const ok = chosen === correct;
            return (
              <div key={q.id} className={`bg-white rounded-xl p-3.5 border text-sm ${ok ? 'border-green-100' : 'border-red-100'}`}>
                <p className="font-semibold text-gray-700 mb-1">Câu {i + 1}: {q.text}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Bạn chọn: {chosen !== null ? q.options[chosen] : 'Bỏ qua'}
                  </span>
                  {!ok && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Đúng: {q.options[correct]}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nếu đậu trắc nghiệm thì hiện upload thực hành */}
        {passed && (
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm"><Paperclip size={15}/> Nộp bài tự luận</h3>
            {uploadDone ? (
              <div className="flex items-center gap-2 text-green-600 font-semibold p-3 bg-green-50 rounded-xl text-sm">
                <CheckCircle size={16}/> Đã nộp! File đã được gửi đến giám khảo.
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.pptx" className="hidden" onChange={e => setUploadFile(e.target.files[0])} />
                {uploadFile
                  ? <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 mb-3 text-sm"><span className="text-blue-700 font-medium truncate">{uploadFile.name}</span><button onClick={() => setUploadFile(null)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">×</button></div>
                  : <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm flex flex-col items-center gap-1 mb-3"><Upload size={20}/> Chọn file</button>
                }
                <button
                  type="button"
                  disabled={tuLuanSubmitting}
                  onClick={() => { if (!uploadFile) return; void handleFinalTuLuan(); }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm"
                >
                  {tuLuanSubmitting ? 'Đang tải lên…' : 'Nộp bài tự luận'}
                </button>
              </>
            )}
          </div>
        )}
        {/* Nếu rớt: thông báo khóa 7 ngày */}
        {!passed && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold text-sm">⏳ Bạn không đạt phần trắc nghiệm. Bài thi sẽ bị khóa trong 7 ngày trước khi có thể thi lại.</p>
          </div>
        )}
        <button onClick={() => onBack?.()} className="w-full py-3 bg-gray-800 hover:bg-black text-white font-bold rounded-xl">← Về Phòng Thi</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════
  // TEST — Main Layout
  // ══════════════════════════════════════════════════════
  if (phase === 'test' && TOTAL < 1) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center border border-gray-100">
          <p className="text-gray-800 font-bold text-sm mb-2">Không có câu hỏi trắc nghiệm cho môn {meta.label}.</p>
          <p className="text-gray-500 text-xs mb-6">Admin cần thêm câu hỏi (phần thi khớp Word/Excel/PowerPoint) vào ngân hàng học viên.</p>
          <button type="button" onClick={() => onBack?.()} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black">← Quay lại</button>
        </div>
      </div>
    );
  }

  const q              = questions[currentQ];
  const answeredCount  = answers.filter(a => a !== null).length;
  const unanswered     = TOTAL - answeredCount;

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-slate-100 font-sans text-slate-900">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(at 0% 0%, rgb(224, 231, 255) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgb(254, 226, 226) 0px, transparent 45%),
            radial-gradient(at 50% 100%, rgb(226, 232, 240) 0px, transparent 40%)`,
        }}
      />

      {/* ══════════ HEADER — 3 cột cân đối, tập trung tiêu đề giữa ══════════ */}
      <header className="relative z-20 shrink-0 px-2 pt-1.5 pb-1.5 md:px-4 md:pt-2 md:pb-2">
        <div className="mx-auto max-w-[min(100%,90rem)] rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 shadow-[0_16px_50px_-18px_rgba(15,23,42,0.5)] overflow-hidden md:rounded-2xl">
          <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative border-b border-white/10 px-3 py-2 md:px-4 md:py-2">
            <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    showModal({
                      title: 'CẢNH BÁO TỪ HỆ THỐNG',
                      content: 'Nếu bạn quay lại bây giờ, bài thi sẽ lập tức BỊ HỦY và hệ thống sẽ hiển thị RỚT. Bạn có chắc chắn muốn thoát?',
                      type: 'warning',
                      confirmText: 'ĐỒNG Ý HỦY BÀI',
                      cancelText: 'Làm bài tiếp',
                      onConfirm: () => {
                        updateExamProgress({
                          tracNghiem: { score: 0, total: TOTAL },
                          thucHanh: 'chua_nop',
                          status: 'khong_dat',
                          lockUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
                        });
                        onBack?.();
                      },
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-black/20 backdrop-blur-sm transition hover:bg-white/15 md:px-3 md:py-2 md:text-xs"
                >
                  <ArrowLeft size={14} /> Thoát phòng thi
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-200 md:text-[11px]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  Đang giám sát
                </span>
            </div>
          </div>
          <div className="relative grid grid-cols-1 gap-2.5 p-2.5 md:gap-3 md:p-3 lg:grid-cols-12 lg:items-center lg:gap-4">
            <div className="flex min-w-0 flex-col justify-center gap-2 lg:col-span-4">
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2 lg:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 font-mono text-[11px] text-slate-100 shadow-inner shadow-black/30 md:px-3 md:py-2 md:text-xs">
                  <Shield size={12} className="shrink-0 text-sky-400" />
                  <span className="text-slate-400">SBD</span>
                  <span className="font-bold text-white">{studentSbd}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-inner shadow-black/30 md:px-3 md:py-2 md:text-xs">
                  <LayoutGrid size={12} className="shrink-0 text-sky-400" />
                  <span className="font-semibold text-white">{TOTAL}</span>
                  <span className="text-slate-400">câu TN</span>
                </span>
              </div>
              <div
                className={`flex w-full max-w-[13.5rem] shrink-0 flex-col items-center text-center self-start rounded-xl border px-3 py-2 shadow-md backdrop-blur-md md:px-3.5 md:py-2.5 ${
                  timeLeft < 300
                    ? 'border-red-500/45 bg-gradient-to-b from-red-950/50 to-red-950/30 shadow-[0_0_28px_-8px_rgba(239,68,68,0.4)]'
                    : 'border-white/15 bg-gradient-to-b from-white/10 to-black/25'
                }`}
              >
                <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 md:text-[11px]">
                  <Clock size={12} className="shrink-0 text-sky-400" />
                  Thời gian còn lại
                </p>
                <p
                  className={`mt-0.5 w-full text-center font-mono text-2xl font-black tabular-nums leading-none tracking-tight md:text-3xl ${
                    timeLeft < 300 ? 'text-red-200' : 'text-white'
                  }`}
                >
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center lg:col-span-4 lg:px-1">
              <ExamBrandLogo
                resolvedUrl={webLogoUrl}
                className="h-8 w-auto max-w-[min(100%,200px)] md:h-9 lg:h-10"
              />
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300 md:mt-2 md:text-[11px]">
                Hệ thống thi trực tuyến
              </p>
              <h1 className="mt-0.5 text-lg font-black leading-tight tracking-tight text-white md:text-xl lg:text-2xl">
                Ca thi
              </h1>
              <p className="mt-0.5 text-sm font-bold text-indigo-200 md:text-base lg:text-lg">{meta.label}</p>
            </div>

            <div className="flex min-w-0 w-full flex-col lg:col-span-4 lg:items-end">
              <div className="w-full max-w-[17.5rem] min-w-0 lg:flex lg:justify-end">
                <CameraHeaderPanel monitorRef={monitorRef} variant="large" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ══════════ MAIN — gói trong 100dvh, không cuộn trang ══════════ */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-1.5 pt-0.5 md:px-6 md:pb-2">
        <div className="mx-auto grid min-h-0 w-full max-w-[min(100%,90rem)] flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12 lg:gap-4 xl:gap-5">
          <main className="order-1 flex min-h-0 flex-col lg:order-2 lg:col-span-8 xl:col-span-9">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
              <div className="flex shrink-0 border-b border-slate-100 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => setTab('trac_nghiem')}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold transition md:py-3 ${
                    tab === 'trac_nghiem'
                      ? 'text-indigo-900'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'trac_nghiem' && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-indigo-600" />
                  )}
                  Trắc nghiệm
                  {isTracNghiemSubmitted && <CheckCircle size={16} className="text-emerald-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isTracNghiemSubmitted) setTab('tu_luan');
                  }}
                  disabled={!isTracNghiemSubmitted}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold transition md:py-3 ${
                    !isTracNghiemSubmitted
                      ? 'cursor-not-allowed text-slate-300'
                      : tab === 'tu_luan'
                        ? 'text-indigo-900'
                        : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'tu_luan' && isTracNghiemSubmitted && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-indigo-600" />
                  )}
                  Thực hành / Tự luận
                  {!isTracNghiemSubmitted && <span className="text-xs font-semibold text-slate-400">(Khoá)</span>}
                </button>
              </div>
              <div className="h-1 shrink-0 bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
              {tab === 'trac_nghiem' && (
                <div className="flex h-full min-h-0 flex-col p-2.5 md:p-3 lg:p-4">
                  <div className="shrink-0 border-b border-slate-100 pb-2 md:pb-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 md:text-xs">
                      Câu hỏi {currentQ + 1} / {TOTAL}
                    </p>
                    <h2 className="mt-1 text-sm font-bold leading-snug text-slate-900 md:text-base lg:text-lg">
                      {q.text}
                    </h2>
                    <p className="mt-1 text-[10px] font-medium text-slate-500 md:text-[11px]">
                      Chọn một đáp án · Có thể sửa trước khi nộp
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-1 pr-0.5 md:space-y-1.5 md:py-1.5 hide-scrollbar">
                    {q.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          if (!isTracNghiemSubmitted) handleAnswer(currentQ, i);
                        }}
                        disabled={isTracNghiemSubmitted}
                        className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all md:gap-2.5 md:px-3 md:py-2 ${
                          answers[currentQ] === i
                            ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-500/10'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        } ${isTracNghiemSubmitted ? 'cursor-not-allowed opacity-65' : ''}`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black md:h-8 md:w-8 md:text-[11px] ${
                            answers[currentQ] === i
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                          }`}
                        >
                          {['A', 'B', 'C', 'D', 'E', 'F'][i] ?? i + 1}
                        </span>
                        <span
                          className={`min-w-0 flex-1 text-[13px] leading-snug md:text-sm ${
                            answers[currentQ] === i ? 'font-semibold text-indigo-950' : 'font-medium text-slate-700'
                          }`}
                        >
                          {opt}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-t border-slate-100 pt-2 md:pt-2.5">
                    <button
                      type="button"
                      onClick={() => setCurrentQ((p) => Math.max(0, p - 1))}
                      disabled={currentQ === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 md:px-3.5 md:py-2.5 md:text-sm"
                    >
                      <ChevronLeft size={18} /> Câu trước
                    </button>
                    <span className="font-mono text-xs font-semibold text-slate-500 md:text-sm">
                      {currentQ + 1} / {TOTAL}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentQ((p) => Math.min(TOTAL - 1, p + 1))}
                      disabled={currentQ === TOTAL - 1}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 md:px-3.5 md:py-2.5 md:text-sm"
                    >
                      Câu sau <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}

              {tab === 'tu_luan' && (
                <div className="p-4 md:p-6 lg:p-7">
                  {uploadDone ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                        <CheckCircle size={36} />
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Đã nộp bài thực hành</h3>
                      <p className="mt-2 text-sm text-slate-500">Hồ sơ đã được ghi nhận trên hệ thống.</p>
                      <button
                        type="button"
                        onClick={() => onBack?.()}
                        className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        Về phòng thi
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 md:flex md:gap-6">
                        <div className="mb-4 flex w-full shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 md:mb-0 md:w-36">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Đề thi</p>
                          <p className="mt-2 text-center text-xs font-bold text-slate-800">{meta.examFile}</p>
                          <a
                            href="#"
                            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                            onClick={(e) => e.preventDefault()}
                          >
                            <Download size={14} /> Tải đề
                          </a>
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">Hướng dẫn nộp bài</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Tải đề về máy, làm bài theo yêu cầu, sau đó nộp đúng định dạng file quy định. Kiểm tra lại tên file trước khi gửi.
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
                          <Paperclip size={16} className="text-indigo-500" />
                          Tải lên bài làm
                        </p>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".xlsx,.xls,.docx,.pptx"
                          className="hidden"
                          onChange={(e) => setUploadFile(e.target.files[0])}
                        />
                        {uploadFile ? (
                          <div className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                            <span className="truncate text-sm font-semibold text-indigo-900">{uploadFile.name}</span>
                            <button
                              type="button"
                              onClick={() => setUploadFile(null)}
                              className="ml-2 text-slate-400 hover:text-red-500"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                            className={`cursor-pointer rounded-2xl border-2 border-dashed py-12 text-center transition ${
                              isDragging
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                            }`}
                          >
                            <Upload size={32} className="mx-auto text-slate-300" />
                            <p className="mt-2 text-sm text-slate-600">
                              Kéo thả hoặc <span className="font-bold text-indigo-600">chọn file</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-400">Word, Excel, PowerPoint · tối đa 50MB</p>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={tuLuanSubmitting}
                        onClick={trySubmitTuLuan}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
                      >
                        <Send size={18} /> {tuLuanSubmitting ? 'ĐANG TẢI LÊN…' : 'NỘP BÀI THỰC HÀNH'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </main>

          <aside className="order-2 flex max-h-[32vh] min-h-0 flex-col lg:order-1 lg:col-span-4 lg:max-h-none xl:col-span-3">
            <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain lg:gap-3">
              <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-sm md:p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-600">
                    <LayoutGrid size={16} className="text-indigo-600" />
                    Mục lục câu hỏi
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-600 md:text-sm">
                    {answeredCount}/{TOTAL}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-7 md:gap-2 lg:grid-cols-5">
                  {questions.map((_, i) => {
                    const done = answers[i] !== null;
                    const active = i === currentQ;
                    return (
                      <button
                        key={questions[i].id ?? i}
                        type="button"
                        disabled={isTracNghiemSubmitted || tab !== 'trac_nghiem'}
                        onClick={() => setCurrentQ(i)}
                        className={`flex aspect-square items-center justify-center rounded-lg text-xs font-black transition sm:rounded-xl sm:text-sm md:text-[0.95rem] ${
                          active
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-2 ring-indigo-300 ring-offset-1 ring-offset-white'
                            : done
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
                        } ${isTracNghiemSubmitted || tab !== 'trac_nghiem' ? 'cursor-default opacity-60' : ''}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-600 md:text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-indigo-600" />
                    Đang xem
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-emerald-400" />
                    Đã trả lời
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded border border-slate-300 bg-slate-100" />
                    Chưa làm
                  </span>
                </div>
              </div>
              <div className="hidden shrink-0 rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs leading-relaxed text-slate-600 shadow-sm lg:block lg:p-4">
                <p className="font-bold text-slate-800">Lưu ý</p>
                <p className="mt-2">
                  Bạn có thể chuyển câu bất kỳ từ lưới bên trên. Thời gian làm bài được tính liên tục. Hệ thống ghi nhận hành vi
                  chuyển tab và mất hình camera theo quy chế thi.
                </p>
              </div>
            </div>
          </aside>
        </div>

        {tab === 'trac_nghiem' && !isTracNghiemSubmitted && (
          <div className="mx-auto mt-1 w-full max-w-[min(100%,90rem)] shrink-0 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md md:mt-2 md:flex md:items-center md:justify-between md:px-5 md:py-2.5">
            <div className="mb-2 md:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tiến độ</p>
              <p className="text-sm font-semibold text-slate-700">
                Đã trả lời{' '}
                <span className={answeredCount === TOTAL ? 'text-emerald-600' : 'text-amber-600'}>
                  {answeredCount}/{TOTAL}
                </span>{' '}
                câu
              </p>
            </div>
            <button
              type="button"
              onClick={trySubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-sm font-black text-white shadow-md shadow-emerald-500/20 transition hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] md:w-auto md:rounded-2xl md:px-8 md:py-3.5 md:shadow-lg"
            >
              <CheckCircle size={18} /> NỘP BÀI TRẮC NGHIỆM
            </button>
          </div>
        )}
      </div>

      {/* ExamMonitor (logic only) */}
      <ExamMonitor ref={monitorRef} isActive={phase === 'test'} onViolate={handleViolation} onResetExam={handleResetExam} requireWebcam={student?.requireWebcam !== false} />

      {/* ══════════ MODALS ══════════ */}
      {showSubmitConfirm && (
        <ConfirmModal
          title="Cảnh báo"
          message={`câu chưa trả lời.\nVẫn quyết định nộp bài?`}
          boldText={`Bạn còn ${unanswered}`}
          confirmLabel="Nộp bài"
          cancelLabel="Làm tiếp"
          onConfirm={() => { setShowSubmitConfirm(false); handleSubmitFinal(); }}
          onCancel={() => setShowSubmitConfirm(false)}
        />
      )}
      {showNoFileConfirm && (
        <ConfirmModal
          title="Cảnh báo thiếu file"
          boldText="Bạn CHƯA CHỌN FILE"
          message="bài làm đính kèm.\nVẫn nộp bài trắng?"
          confirmLabel="Nộp bài"
          cancelLabel="Quay lại chọn"
          onConfirm={() => { setShowNoFileConfirm(false); setUploadDone(true); updateExamProgress({ thucHanh: 'chua_nop', status: 'dat' }); setPhase('result'); }}
          onCancel={() => setShowNoFileConfirm(false)}
        />
      )}
    </div>
  );
};

export default StudentTest;
