import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Send, AlertTriangle,
  Upload, Shield, Zap, Lock, FileText, ClipboardCheck, UserCheck, Camera,
  Info, ChevronRight, ChevronLeft, CheckCircle, User, Clock, Star, Layout, BookOpen, HelpCircle,
  RefreshCw, Slash, Video, Monitor, LayoutGrid, ArrowLeft,
} from 'lucide-react';
import { gradeAnswers } from '../data/questionBank';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import api from '../services/api';

const PASS_SCORE = 80;

/** Thời gian làm bài (giây): đủ cho toàn bộ câu trong ngân hàng — tối thiểu 10 phút, ~90s/câu, tối đa 2 giờ. */
export function computeTeacherExamTimeLimitSeconds(questionCount) {
  const n = Math.max(0, Number(questionCount) || 0);
  if (n < 1) return 600;
  const perQ = 90;
  const floor = 600;
  const cap = 7200;
  return Math.min(cap, Math.max(floor, n * perQ));
}

/** Logo phòng thi — đồng bộ StudentTest */
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

// ─── STEPPER COMPONENT ───────────────────────────────────────────────────────
const EvaluationStepper = ({ currentStep = 1, results = {}, practicalSubmitted = false, currentTeacher = null, compact = false }) => {
    const steps = [
        { id: 1, label: 'Thi trắc nghiệm', sub: results.quiz?.passed ? '✓ Hoàn thành' : (currentStep === 1 ? '• Đang thực hiện' : 'Chưa bắt đầu') },
        { id: 2, label: 'Thi thực hành', sub: practicalSubmitted || currentTeacher?.practicalFile ? '✓ Đã nộp' : (results.quiz?.passed ? '• Đang thực hiện' : 'Chờ kết quả') },
        { id: 3, label: 'Admin xét duyệt', sub: practicalSubmitted || currentTeacher?.practicalFile ? '• Đang thực hiện' : 'Chờ kết quả' },
    ];

    const pad = compact ? 'p-3 md:p-4' : 'p-6';
    const mb = compact ? 'mb-3 md:mb-4' : 'mb-8';
    const titleMb = compact ? 'mb-3' : 'mb-6';
    const lineTop = compact ? 'top-4' : 'top-5';
    const px = compact ? 'px-2 md:px-8' : 'px-4 md:px-12';
    const lineInset = compact ? 'left-14 right-14 md:left-16 md:right-16' : 'left-20 right-20';
    const dot = compact ? 'w-9 h-9' : 'w-11 h-11';
    const iconSz = compact ? 16 : 20;
    const labelMt = compact ? 'mt-2' : 'mt-4';

    return (
        <div className={`w-full bg-white rounded-2xl md:rounded-3xl ${pad} shadow-sm border border-slate-100 max-w-4xl mx-auto ${mb}`}>
            <p className={`text-[10px] font-black text-gray-400 uppercase tracking-widest text-center ${titleMb}`}>Quy trình đánh giá giảng viên</p>
            <div className={`flex items-center justify-between relative ${px}`}>
                {/* Line Background */}
                <div className={`absolute ${lineTop} ${lineInset} h-0.5 bg-gray-100 -z-0`} />
                
                {steps.map((step, i) => (
                    <div key={step.id} className="relative z-10 flex flex-col items-center group">
                        <div className={`${dot} rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${
                            (i + 1 < currentStep || results.quiz?.passed && i === 0) ? 'bg-green-500 text-white' : 
                            (i + 1 === currentStep) ? 'bg-blue-600 text-white scale-110' : 'bg-white border-2 border-slate-200 text-slate-300'
                        }`}>
                            {i + 1 < currentStep || (results.quiz?.passed && i === 0) ? <CheckCircle size={iconSz} /> : 
                             i + 1 === currentStep ? (i === 2 ? <User size={iconSz} /> : <FileText size={iconSz} />) : 
                             (i === 2 ? <User size={iconSz} /> : <FileText size={iconSz} />)}
                        </div>
                        <div className={`${labelMt} text-center max-w-[5.5rem] sm:max-w-none`}>
                            <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-tight ${i + 1 === currentStep ? 'text-blue-700' : 'text-slate-900'}`}>{step.label}</p>
                            <p className={`text-[10px] font-bold mt-0.5 ${
                                step.sub.includes('Hoàn thành') ? 'text-green-500' : 
                                step.sub.includes('thực hiện') ? 'text-blue-500 animate-pulse' : 'text-slate-400'
                            }`}>{step.sub}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TeacherTest = ({ teacherName = 'Giảng Viên', onBack }) => {
  const {
    questions: contextQuestionBank,
    teachers,
    updateTeacher,
    teacherExamTimeLimitMinutes,
    setTeacherExamTimeLimitMinutes,
  } = useData();
  const { showModal } = useModal();
  const [phase, setPhase] = useState('intro'); // intro, test, result, banned
  const [banReason, setBanReason] = useState('');
  const [timeLeft, setTimeLeft] = useState(600);
  const [answers, setAnswers] = useState({});
  const [grade, setGrade] = useState(null);
  const [practicalSubmitted, setPracticalSubmitted] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const fileRef = useRef(null);
  const [tabViolations, setTabViolations] = useState(0);
  const [cameraViolations, setCameraViolations] = useState(0);
  const [warningOverlay, setWarningOverlay] = useState(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const previewRef = useRef(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [webLogoUrl, setWebLogoUrl] = useState('');

  const monitorRef = useRef(null);
  const timerRef = useRef(null);
  const lastViolationTime = useRef(0);

  const teacherId = (() => { try { return JSON.parse(localStorage.getItem('teacher_user') || '{}').id; } catch { return null; } })();

  const [questions, setQuestions] = useState([]);
  /** Khi DataContext chưa kịp sync, tải thẳng ngân hàng GV từ API */
  const [fetchedQuestionBank, setFetchedQuestionBank] = useState(null);

  const pool =
    contextQuestionBank?.length > 0 ? contextQuestionBank : (fetchedQuestionBank || []);

  const teacherExamQCount = pool?.length || 0;
  const teacherTimeIsAdmin =
    teacherExamTimeLimitMinutes != null && Number.isFinite(Number(teacherExamTimeLimitMinutes));
  const resolveTeacherExamTimeSeconds = (qCount) => {
    if (teacherTimeIsAdmin) return Math.round(Number(teacherExamTimeLimitMinutes)) * 60;
    return computeTeacherExamTimeLimitSeconds(qCount);
  };
  const teacherExamMinutes =
    teacherTimeIsAdmin
      ? Math.round(Number(teacherExamTimeLimitMinutes))
      : teacherExamQCount > 0
        ? Math.ceil(computeTeacherExamTimeLimitSeconds(teacherExamQCount) / 60)
        : null;

  const lastTeacherBankKeyRef = useRef('');

  useEffect(() => {
    if (contextQuestionBank?.length > 0) {
      setFetchedQuestionBank(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.settings.getTeacherExamConfig();
        if (cancelled || !res?.success || !res.data) return;
        const qs = Array.isArray(res.data.questions) ? res.data.questions : [];
        if (qs.length > 0) setFetchedQuestionBank(qs);
        const tm = res.data.timeLimitMinutes;
        setTeacherExamTimeLimitMinutes(
          tm != null && Number.isFinite(Number(tm)) ? Math.round(Number(tm)) : null
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [contextQuestionBank?.length]);

  useEffect(() => {
    const origin = import.meta.env.VITE_API_URL || '';
    fetch(`${origin}/api/settings/web`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.logoUrl) {
          const u = res.data.logoUrl;
          setWebLogoUrl(u.startsWith('http') ? u : `${origin}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCurrentQ((c) => Math.max(0, Math.min(c, Math.max(0, questions.length - 1))));
  }, [questions.length]);

  useEffect(() => {
    if (phase === 'test' || phase === 'result' || phase === 'banned') return;
    const key = pool?.length
      ? `${pool.length}:${pool.map((q) => q?.id ?? q?._id ?? '').join(',')}`
      : '';
    if (pool?.length > 0) {
      if (key !== lastTeacherBankKeyRef.current) {
        lastTeacherBankKeyRef.current = key;
        setQuestions([...pool].sort(() => Math.random() - 0.5));
      }
    } else {
      lastTeacherBankKeyRef.current = '';
      setQuestions([]);
    }
  }, [pool, phase]);

  const currentTeacher = teachers?.find(t => String(t.id) === String(teacherId));

  const handleViolate = useCallback((reason) => {
    if (timerRef.current) clearInterval(timerRef.current);
    localStorage.removeItem('teacher_test_phase');
    localStorage.removeItem('teacher_test_tabs');
    setBanReason(reason);
    setPhase('banned');
    if (teacherId) {
      updateTeacher(teacherId, { 
        status: 'Locked', 
        testScore: 0,
        lockReason: reason 
      });
    }
  }, [teacherId, updateTeacher]);

  // Tự động khôi phục phase nếu đã có kết quả trong DB
  useEffect(() => {
    if (phase === 'test') return; // Đang thi thì không ghi đè
    
    if (currentTeacher?.testStatus === 'passed') {
      // Nếu đã hoàn tất cả 2 phần và cố tình load lại -> Logout (Yêu cầu khách hàng)
      if (currentTeacher?.practicalFile && phase === 'intro') {
         localStorage.clear();
         window.location.href = '/login';
         return;
      }
      setGrade({ total: currentTeacher.testScore, pass: true });
      setPhase('result');
    } else if (currentTeacher?.status === 'Locked') {
      setBanReason("Tài khoản đã bị KHÓA do kết quả thi KHÔNG ĐẠT. Vui lòng liên hệ Admin để được thi lại.");
      setPhase('banned');
    }
  }, [currentTeacher, phase]);

  // Kiểm tra trừng phạt khi load lại trang
  useEffect(() => {
    const punished = localStorage.getItem('punish_teacher_exam');
    if (punished === 'true') {
        localStorage.removeItem('punish_teacher_exam');
        setTimeout(() => {
            handleViolate("Hệ thống phát hiện bạn đã cố tình tải lại trang hoặc thoát trình duyệt trong khi đang làm bài. Tài khoản đã bị khóa.");
        }, 1000);
    }
  }, [handleViolate]);

  const triggerAlert = (type, message, count) => {
     const now = Date.now();
     if (now - lastViolationTime.current < 3000) return; // Debounce 3s
     lastViolationTime.current = now;
     setWarningOverlay({ type, message, count });
     
     // Phát tiếng động cảnh báo
     try {
       const ctx = new AudioContext();
       const osc = ctx.createOscillator();
       osc.connect(ctx.destination);
       osc.start(); osc.stop(ctx.currentTime + 0.3);
     } catch(e) {}
  };

  const failAndExitRef = useRef();
  failAndExitRef.current = (reasonTxt) => {
    const fullReason = `HỦY BÀI: Hành vi cố tình ${reasonTxt} khi đang thi!`;
    handleViolate(fullReason);
    
    // Gỡ token nhưng không đẩy ra /login ngay, để giao diện 'BÀI THI BỊ HỦY' kịp hiện ra cho họ biết lý do.
    setTimeout(() => {
      localStorage.setItem('teacher_ban_error', fullReason);
      localStorage.removeItem('teacher_user');
      localStorage.removeItem('teacher_access_token');
      localStorage.removeItem('teacher_refresh_token');
    }, 500); 
  };

  // Kiểm tra dấu vết tải lại trang từ lần trước
  useEffect(() => {
    const violation = localStorage.getItem('punish_teacher_exam');
    if (violation === 'true') {
      localStorage.removeItem('punish_teacher_exam');
      failAndExitRef.current('tải lại trang (F5) hoặc đóng tab');
    }
  }, []);

  // ── ANTI-CHEAT: Chống F5 & Nút Back của Browser ──
  useEffect(() => {
    if (phase !== 'test') return;

    const confirmExit = (reasonTxt) => {
      showModal({
        title: 'CẢNH BÁO TỪ HỆ THỐNG',
        content: `Nếu bạn ${reasonTxt}, đồng nghĩa với việc HỦY BÀI THI và vô hiệu hóa tài khoản Giảng viên. Bạn có chắc chắn muốn thoát?`,
        type: 'warning',
        confirmText: 'ĐỒNG Ý HỦY BÀI',
        cancelText: 'Làm bài tiếp',
        onConfirm: () => {
          if (failAndExitRef.current) failAndExitRef.current(reasonTxt);
        }
      });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        confirmExit('tải lại trang hiện tại (F5)');
      }
    };

    // Kỹ thuật ngăn nút Back (Push history forward một lần duy nhất)
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      confirmExit('quay lại trạng thái trước đó');
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Bạn đang trong bài thi. Thoát sẽ bị hủy kết quả và đăng xuất?';
    };

    const handleActualUnload = () => {
      localStorage.setItem('punish_teacher_exam', 'true');
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
  }, [phase]); // Loại bỏ handleViolate khỏi mảng deps để tránh loop

  // 4. GIÁM SÁT TAB & FOCUS (polling 500ms) - CỰC KỲ CHIẾN
  useEffect(() => {
    if (phase !== 'test' || banReason) return;

    let focusLostTicks = 0;
    const interval = setInterval(() => {
      if (!document.hasFocus() || document.visibilityState === 'hidden') {
        focusLostTicks++;
      } else {
        focusLostTicks = 0;
      }

      if (focusLostTicks >= 2) { // 1 giây mất focus
        focusLostTicks = 0;
        setTabViolations(prev => {
          const n = prev + 1;
          if (n >= 2) handleViolate("HỦY BÀI: Bạn đã chuyển Tab hoặc thoát màn hình quá nhiều lần!");
          else triggerAlert('tab', '🚨 PHÁT HIỆN THOÁT KHỎI BÀI THI!', n);
          return n;
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [phase, banReason, handleViolate]);

  // 5. YÊU CẦU CAMERA Ở BƯỚC HARDWARE CHECK TRƯỚC KHI VÀO THI
  useEffect(() => {
    if (phase !== 'hardware_check') return;

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
  }, [phase]);

  // Timer
  useEffect(() => {
    if (phase !== 'test') return;
    timerRef.current = setInterval(() => setTimeLeft(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleSubmit = useCallback((auto = false) => {
    if (!auto && Object.keys(answers).length === 0) {
        showModal({ title: 'Cảnh báo', content: 'Vui lòng hoàn thành bài trước khi nộp!', type: 'warning' });
        return;
    }
    const result = gradeAnswers(questions, answers);
    setGrade(result);
    setPhase('result');
    localStorage.removeItem('teacher_test_phase');
    
    if (teacherId) {
      updateTeacher(teacherId, { 
        testScore: result.total, 
        testDate: new Date().toISOString(),
        testStatus: result.pass ? 'passed' : 'failed',
        // Nếu rớt thì khoá tài khoản, không cho thi lại cho đến khi Admin mở
        status: result.pass ? 'Pending' : 'Locked',
        lockReason: result.pass ? null : `Thi trượt trắc nghiệm (${result.total}/100)`
      });
    }
  }, [questions, answers, teacherId, updateTeacher]);

  const handlePracticalSubmit = useCallback(async (fileObj) => {
    if (!teacherId || !fileObj) return;

    try {
      showModal({ title: 'Đang tải file...', content: 'Vui lòng chờ trong giây lát.', type: 'info' });
      const res = await api.teachers.uploadPractical(fileObj);
      if (res.success && res.fileUrl) {
         updateTeacher(teacherId, {
           practicalFile: res.fileUrl,
           practicalStatus: 'submitted'
         });
         setPracticalSubmitted(true);
         showModal({ title: 'Thành công', content: 'Bài thực hành đã được lưu.', type: 'success' });
      } else {
         showModal({ title: 'Lỗi', content: res.message || 'Lỗi tải file.', type: 'error' });
      }
    } catch (err) {
      showModal({ title: 'Lỗi', content: 'Lỗi máy chủ khi tải file lên.', type: 'error' });
    }
  }, [teacherId, updateTeacher, showModal]);

  // UI LAYOUTS
  if (phase === 'banned') return (
    <div className="hide-scrollbar flex-1 min-h-0 w-full h-full overflow-y-auto bg-black flex items-center justify-center p-6">
      <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-t-[12px] border-red-600">
        <XCircle size={80} className="text-red-600 mx-auto mb-6" />
        <h2 className="text-3xl font-black text-red-600 uppercase italic">BÀI THI BỊ HỦY</h2>
        <div className="bg-red-50 p-6 rounded-3xl mt-6 border border-red-100">
           <p className="text-red-900 font-bold leading-relaxed">{banReason}</p>
        </div>
        <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} className="w-full mt-8 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all">✓ QUAY LẠI ĐĂNG NHẬP</button>
      </div>
    </div>
  );

  if (phase === 'hardware_check') return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 border-[12px] border-[#203DB5]/30 pointer-events-none rounded-[32px] m-4 animate-pulse" />
      <div className="bg-white rounded-[28px] p-5 max-w-[320px] w-full text-center shadow-[0_0_80px_rgba(32,61,181,0.4)] z-10 border-t-[6px] border-[#203DB5] animate-in zoom-in duration-500 overflow-y-auto max-h-[90vh] no-scrollbar">
         <h2 className="text-lg font-black text-slate-900 tracking-tight mt-0">Yêu cầu bật Camera</h2>
         <p className="text-slate-500 font-bold mt-1 mb-3 px-2 text-[10px] leading-relaxed">
             Để đảm bảo tính công bằng, bạn <span className="text-[#E13B35]">bắt buộc phải bật camera</span> xuyên suốt quá trình làm bài thi.
         </p>
         
         {/* Hướng dẫn Box (Mô phỏng Dialog Chrome) */}
         <div className="relative mb-3">
           <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full z-20 shadow-sm animate-bounce">HƯỚNG DẪN</div>
           <div className="border-[1.5px] border-slate-200 rounded-[20px] p-3 relative text-left bg-[#F4F7F6] shadow-inner select-none pointer-events-none">
            <div className="flex items-center justify-between mb-2">
               <div>
                  <p className="font-bold text-slate-700 text-[13px]">{window.location.hostname} muốn</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1 font-semibold"><Camera size={12}/> Sử dụng camera có sẵn (3)</p>
               </div>
               <XCircle size={16} className="text-slate-400" />
            </div>

            {/* Khung Camera Xem trước */}
            <div className="bg-slate-900 rounded-xl h-20 mb-2 relative overflow-hidden flex items-center justify-center border-[3px] border-white shadow-md">
               {cameraReady ? (
                   <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
               ) : (
                   <div className="text-white/50 text-xs flex flex-col items-center gap-2 font-bold">
                      <Camera size={24} className="animate-pulse" />
                      {cameraError ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-red-400 text-[8px]">{cameraError}</span>
                          <button onClick={() => window.location.reload()} className="px-2 py-0.5 bg-white/20 rounded text-[8px] hover:bg-white/30">Thử lại</button>
                        </div>
                      ) : 'Đang chờ cấp quyền...'}
                   </div>
               )}
               <div className="absolute top-2 right-2 bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white flex items-center gap-1 font-bold">
                 <Video size={10} /> Xem trước
               </div>
            </div>

            {/* Fake Dropdown */}
            <div className="border border-slate-200/80 rounded-[10px] px-3 py-1.5 text-[9px] font-bold text-slate-600 mb-2 flex justify-between bg-white shadow-sm">
               <span>HD WEB CAMERA (0a50:6100)</span>
               <span className="text-slate-400">▼</span>
            </div>

            {/* Fake Buttons Hướng dẫn */}
            <div className="space-y-1.5 relative mt-3">
               {/* Nút số 1 được đóng khung đỏ */}
               <div className="relative">
                  <div className="absolute -left-[5px] -right-[5px] -top-[5px] -bottom-[5px] border-2 border-red-500 rounded-[14px] pointer-events-none" />
                  <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-[10px]">Cho phép mỗi khi truy cập...</div>
                  {/* SVG Arrow Pointing UP-LEFT */}
                  <svg className="absolute -right-[20px] -bottom-[20px] w-6 h-6 text-red-500 animate-bounce pointer-events-none" 
                       fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M6 6L20 20" />
                     <path d="M6 6v8" />
                     <path d="M6 6h8" />
                  </svg>
               </div>

               <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-[10px] opacity-40 mix-blend-luminosity">Cho phép lần này</div>
               <div className="bg-[#B9F5C5] text-[#1E5C2A] text-center py-1.5 rounded-[10px] font-bold text-[10px] opacity-40 mix-blend-luminosity">Không bao giờ cho phép</div>
            </div>
         </div>
         </div>

         {/* Trạng thái Sẵn sàng */}
         <div className={`py-2 rounded-[14px] font-black text-[10px] mb-3 flex items-center justify-center gap-1.5 transition-all duration-300 ${cameraReady ? 'bg-[#E1FDEB] text-[#008945]' : 'bg-slate-100 text-slate-400 opacity-60'}`}>
            <CheckCircle2 size={13} className={cameraReady ? '' : 'grayscale'}/> Camera đã sẵn sàng!
         </div>

         {(pool?.length || 0) === 0 && (
           <p className="text-[9px] font-bold text-red-600 mb-2 px-1 leading-relaxed">
             Chưa có câu hỏi trong ngân hàng. Admin cần thêm câu tại mục Ngân hàng câu hỏi (GV).
           </p>
         )}
         {(pool?.length || 0) > 0 && questions.length === 0 && (
           <p className="text-[9px] font-bold text-amber-700 mb-2 px-1 leading-relaxed">
             Đang chuẩn bị đề thi từ ngân hàng…
           </p>
         )}

         {/* Nút Vào thi */}
         <button 
             type="button"
             disabled={!cameraReady || questions.length === 0}
             onClick={() => {
               setTimeLeft(resolveTeacherExamTimeSeconds(questions.length));
               setPhase('test');
               localStorage.setItem('teacher_test_phase', 'test');
             }} 
             className={`w-full py-2.5 font-black rounded-[14px] transition-all text-[11px] flex items-center justify-center gap-2 ${
                 cameraReady && questions.length > 0
                 ? 'bg-[#E13B35] text-white shadow-xl shadow-red-500/30 hover:bg-black hover:scale-[1.02] active:scale-95' 
                 : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-70'
             }`}>
             TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI
         </button>
      </div>
    </div>
  );

  if (phase === 'intro') return (
    <div className="hide-scrollbar flex-1 min-h-0 w-full h-full overflow-y-auto overscroll-contain bg-slate-50 p-4 md:p-8 pt-20">
      <div className="max-w-6xl mx-auto">
        <EvaluationStepper 
          currentStep={1} 
          practicalSubmitted={practicalSubmitted} 
          currentTeacher={currentTeacher} 
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: Banner & Main Info */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-[#203DB5] rounded-[40px] overflow-hidden shadow-2xl relative group min-h-[320px] flex items-center">
                {/* Abstract Background Elements */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4" />
                
                {/* 3D-like Icon Elements */}
                <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden md:block">
                    <div className="relative w-64 h-64">
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-indigo-400 rounded-full opacity-20 animate-pulse blur-2xl" />
                        <div className="absolute inset-4 bg-white/10 backdrop-blur-3xl rounded-[40px] border border-white/20 shadow-2xl flex items-center justify-center rotate-12 group-hover:rotate-6 transition-transform duration-700">
                            <Shield size={100} className="text-white/90 drop-shadow-lg" strokeWidth={1} />
                        </div>
                        <div className="absolute -bottom-4 -left-8 bg-blue-500/20 backdrop-blur-xl border border-white/20 p-4 rounded-3xl -rotate-12 group-hover:-rotate-6 transition-transform duration-700 delay-100">
                            <CheckCircle2 size={48} className="text-white drop-shadow-md" />
                        </div>
                        <div className="absolute -top-6 -right-6 bg-red-500/20 backdrop-blur-xl border border-white/20 p-4 rounded-full rotate-45 group-hover:rotate-90 transition-transform duration-1000">
                            <Star size={40} className="text-white drop-shadow-md" />
                        </div>
                    </div>
                </div>

                <div className="p-8 md:p-14 relative z-10 w-full lg:w-1/2">
                   <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-md px-4 py-2 rounded-full text-blue-100 text-[10px] font-black uppercase tracking-widest mb-6">
                      <Zap size={14} className="text-yellow-400" /> Xác thực chuyên môn
                   </div>
                   <h1 className="text-4xl md:text-5xl font-black text-white leading-[1.1] mb-4 tracking-tight">
                       Đánh Giá<br/>Năng Lực Giảng Viên
                   </h1>
                   <p className="text-blue-100/80 text-sm md:text-base font-medium max-w-sm leading-relaxed mb-10">
                       Vượt qua bài test chuyên môn để chính thức kích hoạt tài khoản giảng dạy tại Thắng Tin Học.
                   </p>
                   
                   <button onClick={() => setPhase('hardware_check')} 
                       className="w-full sm:w-max py-4 px-8 bg-white text-[#203DB5] font-black rounded-2xl text-base hover:bg-blue-50 focus:ring-4 focus:ring-white/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-[0_10px_40px_rgba(255,255,255,0.2)]">
                       BẮT ĐẦU TEST <ChevronRight size={20} strokeWidth={3} />
                   </button>
                </div>
            </div>

            {/* Grid Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 {[
                     {
                       icon: Layout,
                       label: 'Số câu hỏi',
                       val: teacherExamQCount > 0 ? `${teacherExamQCount} câu (toàn bộ ngân hàng)` : 'Chưa có đề',
                       color: 'text-purple-600',
                       bg: 'bg-purple-50',
                     },
                     {
                       icon: Clock,
                       label: 'Thời gian',
                       val:
                         teacherExamMinutes != null
                           ? `${teacherExamMinutes} phút ${teacherTimeIsAdmin ? '(Admin)' : '(tự động theo số câu)'}`
                           : '—',
                       color: 'text-orange-600',
                       bg: 'bg-orange-50',
                     },
                     { icon: Star, label: 'Điểm đạt', val: '≥ 80/100', color: 'text-red-600', bg: 'bg-red-50' },
                     { icon: HelpCircle, label: 'Hình thức', val: 'Xáo ngẫu nhiên', color: 'text-blue-600', bg: 'bg-blue-50' },
                 ].map((s, i) => (
                    <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-2 hover:shadow-md transition">
                        <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.color} flex items-center justify-center`}><s.icon size={20} /></div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                        <p className="text-lg font-black text-slate-800">{s.val}</p>
                    </div>
                 ))}
            </div>

            {/* Tags/Categories */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BookOpen size={12} /> Nội dung 4 phần thi:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['Excel Nâng Cao', 'Microsoft Word', 'PowerPoint', 'Tình Huống'].map((tag, i) => (
                        <div key={i} className={`py-3 px-4 rounded-xl text-xs font-black text-center ${
                            i === 0 ? 'bg-green-100 text-green-700' : 
                            i === 1 ? 'bg-blue-100 text-blue-700' : 
                            i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                        }`}>{tag}</div>
                    ))}
                </div>
            </div>
          </div>

          {/* RIGHT: Rules Sidebar - Visual Cards Upgrade */}
          <div className="lg:col-span-5 space-y-6 text-left">
             <div className="bg-slate-900 rounded-[32px] p-8 shadow-xl text-white relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-red-600/20 blur-3xl rounded-full" />
                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-red-500 shadow-sm border border-white/10"><Camera size={24} /></div>
                    <h3 className="font-black text-xl tracking-tight uppercase">Giám sát AI Camera</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4 relative z-10">
                    {[
                        { text: 'Camera BẬT suốt thời gian', icon: Camera, color: 'text-blue-400' },
                        { text: 'Face ID mỗi 5s', icon: UserCheck, color: 'text-green-400' },
                        { text: 'Rời Face 5 lần = HỦY', icon: AlertTriangle, color: 'text-red-400' },
                        { text: 'Lưu log toàn màn hình', icon: Video, color: 'text-orange-400' },
                    ].map((item, i) => (
                        <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col items-center text-center gap-2 hover:bg-white/10 transition">
                            <item.icon size={24} className={`${item.color} mb-1`} />
                            <span className="text-xs font-bold text-white/90 leading-tight">{item.text}</span>
                        </div>
                    ))}
                </div>
             </div>

             <div className="bg-red-50 rounded-[32px] p-8 border border-red-100 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-600 shadow-sm"><Shield size={24} /></div>
                    <h3 className="font-black text-red-900 text-xl tracking-tight uppercase">Luật chống gian lận</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    {[
                        { title: 'Cấm chuyển Tab', desc: 'Chuyển tab hoặc rời màn hình 2 lần = HỦY bài.', icon: XCircle, textCol: 'text-red-700', bg: 'bg-red-100/50 border-red-200' },
                        { title: 'Cấm Reset/F5', desc: 'Hệ thống tự động hủy nếu làm mới trang.', icon: RefreshCw, textCol: 'text-orange-700', bg: 'bg-orange-100/50 border-orange-200' },
                        { title: 'Cấm DevTools', desc: 'Sử dụng F12 hoặc Inspect sẽ bị khóa luồng.', icon: Slash, textCol: 'text-purple-700', bg: 'bg-purple-100/50 border-purple-200' },
                        { title: 'Ngân hàng đề', desc: 'Lấy toàn bộ câu từ ngân hàng Admin; thứ tự xáo ngẫu nhiên mỗi lần tải.', icon: Layout, textCol: 'text-blue-700', bg: 'bg-blue-100/50 border-blue-200' },
                    ].map((item, i) => (
                        <div key={i} className={`p-4 rounded-2xl border flex flex-col gap-2 ${item.bg}`}>
                            <div className={`flex items-center gap-2 font-black ${item.textCol}`}>
                               <item.icon size={16} /> <span className="text-sm">{item.title}</span>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{item.desc}</span>
                        </div>
                    ))}
                </div>
             </div>

             <div className="bg-[#203DB5] rounded-3xl p-6 shadow-xl shadow-blue-200 space-y-4">
                <div className="flex items-center gap-3 mb-2 text-white">
                    <Info size={20} />
                    <h3 className="font-bold text-sm uppercase tracking-tight">Lưu ý quan trọng</h3>
                </div>
                <ul className="space-y-3">
                    <li className="text-blue-50 text-[13px] font-medium leading-relaxed">• Bài thi gồm 2 phần: Trắc nghiệm + Tự luận</li>
                    <li className="text-blue-50 text-[13px] font-medium leading-relaxed">• Phần trắc nghiệm cần đạt ≥≥ 80/100 để mở khóa tự luận</li>
                    <li className="text-blue-50 text-[13px] font-medium leading-relaxed">• Sau khi hoàn tất cả 2 phần, Admin sẽ xét duyệt</li>
                    <li className="text-blue-50 text-[13px] font-medium leading-relaxed">• Kết quả được thông báo qua Zalo</li>
                </ul>
             </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (phase === 'result') {
    const waitingAdmin = !!(practicalSubmitted || currentTeacher?.practicalFile);
    return (
    <div className="hide-scrollbar flex-1 min-h-0 w-full h-full overflow-y-auto overscroll-contain bg-slate-50 p-3 md:p-5 pb-6 md:pb-8">
      <div className="max-w-4xl mx-auto">
        <EvaluationStepper 
            currentStep={waitingAdmin ? 3 : 2} 
            results={{ quiz: { passed: grade.pass } }} 
            practicalSubmitted={practicalSubmitted}
            currentTeacher={currentTeacher}
            compact={waitingAdmin}
        />

        {/* Status Bar */}
        <div className={`w-full ${grade.pass ? 'bg-[#008945]' : 'bg-red-700'} rounded-2xl md:rounded-3xl ${waitingAdmin ? 'p-3 md:p-4 mb-3' : 'p-4 md:p-5 mb-4 md:mb-6'} flex items-center justify-between shadow-lg relative overflow-hidden group`}>
            <div className={`flex items-center gap-3 md:gap-4 relative z-10 ${waitingAdmin ? 'min-w-0' : ''}`}>
                <div className={`${waitingAdmin ? 'w-9 h-9' : 'w-10 h-10'} shrink-0 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-md`}>
                    {grade.pass ? <CheckCircle size={waitingAdmin ? 20 : 24} /> : <XCircle size={24} />}
                </div>
                <div className="text-left min-w-0">
                   <h3 className={`text-white font-black uppercase tracking-tighter flex flex-wrap items-center gap-x-2 gap-y-0 leading-tight mb-0.5 ${waitingAdmin ? 'text-sm md:text-base' : 'text-xl md:text-2xl'}`}>
                        Phần 1: Trắc nghiệm — {grade.pass ? 'ĐẠT' : 'CHƯA ĐẠT'} {grade.pass && <span className={waitingAdmin ? 'text-lg' : 'text-2xl'}>✓</span>}
                   </h3>
                   <p className="text-white/70 text-[10px] md:text-xs font-bold leading-none uppercase tracking-widest">Điểm thi: {grade.total}/100</p>
                </div>
            </div>
            <div className={`text-white font-black opacity-90 relative z-10 tracking-tighter shrink-0 ${waitingAdmin ? 'text-2xl md:text-3xl' : 'text-4xl md:text-5xl'}`}>
                {grade.total}
            </div>
            {/* Decor circle */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
        </div>

        {/* Success Card */}
        {grade.pass && (
            <div className="bg-white rounded-2xl md:rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 animate-in slide-in-from-bottom-5 duration-700">
                {!(practicalSubmitted || currentTeacher?.practicalFile) && (
                <div className="bg-[#008945] py-7 md:py-10 text-center space-y-3 relative group overflow-hidden">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-2xl text-[#008945] scale-110 group-hover:rotate-12 transition-transform duration-500 relative z-10">
                        <CheckCircle className="h-10 w-10 md:h-12 md:w-12" strokeWidth={3} />
                    </div>
                    <div className="relative z-10 px-3">
                        <h2 className="text-white text-2xl md:text-3xl font-black tracking-tighter leading-tight mb-1.5">Vượt qua Phần 1! 🎉</h2>
                        <p className="text-green-50/80 font-bold text-xs md:text-sm">Bạn đã đạt {grade.total}/100 điểm trắc nghiệm</p>
                    </div>
                </div>
                )}

                <div className={`${practicalSubmitted || currentTeacher?.practicalFile ? 'p-4 md:p-5 space-y-4' : 'p-5 md:p-8 space-y-6 md:space-y-8'}`}>
                    {!practicalSubmitted && !currentTeacher?.practicalFile ? (
                        /* PHẦN 2: NỘP BÀI THỰC HÀNH */
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg leading-none uppercase italic">Phần 2: Thi thực hành</h3>
                                    <p className="text-slate-400 text-xs font-bold mt-1">Vui lòng nộp file giáo án bài dạy hoặc video thực hành</p>
                                </div>
                            </div>

                            <React.Fragment>
                              <label
                                className="border-4 border-dashed border-slate-100 rounded-[24px] md:rounded-[32px] py-8 px-5 md:p-10 flex flex-col items-center justify-center text-center space-y-3 md:space-y-4 hover:border-blue-200 transition-colors group cursor-pointer relative block w-full"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50/30'); }}
                                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/30'); }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/30');
                                  const file = e.dataTransfer.files?.[0];
                                  if (!file) return;
                                  if (file.size > 50 * 1024 * 1024) { 
                                     showModal({ title: 'File quá lớn', content: 'Kích thước file vượt quá giới hạn 50MB. Vui lòng nén file hoặc dùng link Drive.', type: 'error' });
                                     return; 
                                  }
                                  setUploadFile(file);
                                  handlePracticalSubmit(file);
                                }}
                              >
                                <input
                                  type="file"
                                  accept=".pdf,.zip,.mp4,.doc,.docx,.pptx,.xlsx"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 50 * 1024 * 1024) {
                                      showModal({ title: 'File quá lớn', content: 'Kích thước file vượt quá giới hạn 50MB. Vui lòng nén file hoặc dùng link Drive.', type: 'error' });
                                      return;
                                    }
                                    setUploadFile(file);
                                    handlePracticalSubmit(file);
                                  }}
                                />
                                <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 text-blue-500 rounded-2xl md:rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform mx-auto">
                                  <Upload className="w-8 h-8 md:w-10 md:h-10" />
                                </div>
                                <div className="w-full">
                                  <p className="text-slate-600 font-black text-base md:text-lg">Bấm để chọn hoặc kéo thả file vào đây</p>
                                  <p className="text-slate-400 text-[11px] md:text-xs font-bold mt-1">Hỗ trợ: PDF, ZIP, MP4, DOCX, PPTX, XLSX (Tối đa 50MB)</p>
                                </div>
                                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors rounded-[32px] pointer-events-none" />
                              </label>
                            </React.Fragment>

                            <div className="bg-blue-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-blue-100 flex items-start gap-3 md:gap-4">
                                <Info size={20} className="text-blue-500 shrink-0 mt-1" />
                                <p className="text-blue-900 text-[13px] font-bold leading-relaxed">
                                    Lưu ý: Bài thực hành là yếu tố quyết định để Admin cấp quyền giảng dạy chính thức. Hãy nộp file chất lượng nhất của bạn.
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* PHẦN 3: CHỜ DUYỆT — gọn để vừa khung, không cần hero xanh (đã có banner điểm) */
                        <div className="space-y-4 animate-in fade-in zoom-in duration-500">
                            <div className="bg-[#FFF9E6] rounded-2xl p-4 md:p-5 border border-orange-100 flex flex-col items-center text-center space-y-2 shadow-inner">
                                <div className="flex items-center justify-center gap-2 text-[#D97706] font-black uppercase text-xs md:text-sm italic tracking-tight text-center">
                                    <Clock size={20} className="animate-pulse shrink-0" /> Đang chờ xét duyệt hồ sơ
                                </div>
                                <p className="text-[#92400E] font-bold text-[13px] md:text-sm max-w-md leading-snug">
                                    Hồ sơ đã chuyển bộ phận chuyên môn. Kết quả qua <span className="text-[#D97706]">Zalo</span> trong 24h làm việc.
                                </p>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100 space-y-1 group hover:bg-white transition-colors">
                                <p className="text-gray-400 font-bold text-[9px] md:text-[10px] uppercase tracking-widest leading-none">Cần hỗ trợ gấp, vui lòng liên hệ:</p>
                                <p className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter group-hover:text-blue-600 transition-colors">093.5758.462</p>
                            </div>

                            <button type="button" onClick={() => { localStorage.clear(); window.location.href = '/login'; }} 
                                className="w-full py-3.5 md:py-4 bg-[#203DB5] text-white font-black rounded-2xl text-base md:text-lg shadow-xl shadow-blue-900/25 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 border-b-4 border-blue-900 leading-none">
                                ✓ HOÀN TẤT & ĐĂNG XUẤT
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Case fail */}
        {!grade.pass && (
            <div className="bg-white rounded-[40px] shadow-2xl p-12 text-center space-y-8 border border-slate-100">
                <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                    <XCircle size={56} strokeWidth={3} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-4">Rất tiếc! Bài thi chưa đạt</h2>
                    <p className="text-slate-400 font-bold">Bạn chưa đạt mức điểm tối thiểu (80/100). Hãy ôn tập kỹ và thử lại sau nhé!</p>
                </div>
                <button onClick={() => { 
                    localStorage.clear(); 
                    localStorage.setItem('teacher_ban_error', 'Tài khoản đã bị KHÓA do kết quả thi KHÔNG ĐẠT (Dưới ranh giới 80 điểm).');
                    window.location.href = '/login'; 
                }} 
                    className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl text-xl shadow-2xl hover:bg-black transition-all">
                    QUAY LẠI ĐĂNG NHẬP
                </button>
            </div>
        )}
      </div>
    </div>
    );
  }

  const isQDone = (idx) => {
    const qq = questions[idx];
    if (!qq) return false;
    if (qq.type === 'essay') return typeof answers[idx] === 'string' && String(answers[idx]).trim().length > 0;
    return answers[idx] !== undefined;
  };
  const answeredCount = questions.reduce((acc, _, i) => acc + (isQDone(i) ? 1 : 0), 0);
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const qCur = questions[currentQ];
  const TOTAL = questions.length;

  return (
    <div className="relative flex min-h-0 h-full max-h-full w-full flex-1 flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-950">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `radial-gradient(at 0% 0%, rgb(224, 231, 255) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgb(254, 226, 226) 0px, transparent 45%),
            radial-gradient(at 50% 100%, rgb(226, 232, 240) 0px, transparent 40%)`,
        }}
      />

      <ExamMonitor ref={monitorRef} isActive={phase === 'test'} onViolate={handleViolate} tabViolations={tabViolations} />

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
                    content: 'Nếu bạn thoát bây giờ, bài thi sẽ BỊ HỦY và tài khoản có thể bị khóa. Bạn có chắc chắn?',
                    type: 'warning',
                    confirmText: 'ĐỒNG Ý HỦY BÀI',
                    cancelText: 'Làm bài tiếp',
                    onConfirm: () => {
                      if (failAndExitRef.current) failAndExitRef.current('thoát phòng thi');
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
                  <span className="text-slate-400">GV</span>
                  <span className="max-w-[10rem] truncate font-bold text-white">{teacherName}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-inner shadow-black/30 md:px-3 md:py-2 md:text-xs">
                  <LayoutGrid size={12} className="shrink-0 text-sky-400" />
                  <span className="font-semibold text-white">{TOTAL}</span>
                  <span className="text-slate-400">câu</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-1.5 min-w-[6rem] flex-1 max-w-[13rem] overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] font-bold text-slate-400 md:text-[11px]">
                  {answeredCount}/{TOTAL}
                </span>
              </div>
              <div
                className={`flex w-full max-w-[13.5rem] shrink-0 flex-col items-center text-center self-start rounded-xl border px-3 py-2 shadow-md backdrop-blur-md md:px-3.5 md:py-2.5 ${
                  timeLeft < 120
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
                    timeLeft < 120 ? 'text-red-200' : 'text-white'
                  }`}
                >
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center text-center lg:col-span-4 lg:px-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/50 md:h-11 md:w-11">
                <BookOpen size={22} className="text-white" />
              </div>
              <ExamBrandLogo resolvedUrl={webLogoUrl} className="mt-2 h-8 w-auto max-w-[min(100%,200px)] md:h-9 lg:h-10" />
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300 md:mt-2 md:text-[11px]">
                THẮNG TIN HỌC — LMS
              </p>
              <h1 className="mt-0.5 text-base font-black leading-tight tracking-tight text-white md:text-lg lg:text-xl">
                KIỂM TRA NĂNG LỰC GIẢNG VIÊN
              </h1>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.35em] text-white/35 md:text-[11px]">SECURE EXAM</p>
              <p className="text-xs font-bold text-indigo-200 md:text-sm">Phiên làm bài có giám sát</p>
            </div>

            <div className="flex min-w-0 w-full flex-col lg:col-span-4 lg:items-end">
              <div className="w-full max-w-[17.5rem] min-w-0 lg:flex lg:justify-end">
                <CameraHeaderPanel monitorRef={monitorRef} variant="large" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── VIOLATION OVERLAY ─── */}
      {warningOverlay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-6">
           <div className="bg-white rounded-[48px] p-10 max-w-sm w-full text-center shadow-[0_0_80px_rgba(220,38,38,0.3)] border border-red-100 animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                 <AlertTriangle size={48} className="text-red-600 animate-pulse" />
                 <div className="absolute inset-0 border-2 border-red-200 rounded-full animate-ping scale-150 opacity-20" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">{warningOverlay.message}</h2>
              <p className="text-slate-500 font-bold mt-4">Vui lòng quay lại làm bài. Đây là vi phạm lần <span className="text-red-600">{warningOverlay.count}/2</span>.</p>
              
              <div className="h-4 bg-slate-100 rounded-full mt-8 overflow-hidden border border-slate-200 p-1">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000 ease-in-out" 
                  style={{ width: `${(warningOverlay.count / 2) * 100}%` }} 
                />
              </div>
              
              <button 
                onClick={() => setWarningOverlay(null)} 
                className="w-full mt-10 py-5 bg-slate-900 text-white font-black rounded-3xl text-lg hover:bg-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
              >
                QUAY LẠI BÀI THI
              </button>
           </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-1.5 pt-0.5 md:px-6 md:pb-2">
        <div className="mx-auto grid min-h-0 w-full max-w-[min(100%,90rem)] flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12 lg:gap-4 xl:gap-5">
          <main className="order-1 flex min-h-0 flex-col lg:order-2 lg:col-span-8 xl:col-span-9">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
              <div className="flex shrink-0 items-center justify-center border-b border-slate-100 bg-slate-50/80 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 md:text-xs">
                  Trắc nghiệm &amp; tự luận · Câu {TOTAL > 0 ? currentQ + 1 : 0} / {TOTAL}
                </p>
              </div>
              <div className="h-1 shrink-0 bg-slate-100">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${TOTAL > 0 ? (answeredCount / TOTAL) * 100 : 0}%` }}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {qCur ? (
                  <div className="flex h-full min-h-0 flex-col p-2.5 md:p-3 lg:p-4">
                    <div className="shrink-0 border-b border-slate-100 pb-2 md:pb-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                            isQDone(currentQ) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {currentQ + 1}
                        </div>
                        {qCur.type === 'essay' ? (
                          <span className="rounded-lg bg-purple-100 px-2 py-0.5 text-[10px] font-black text-purple-700">TỰ LUẬN</span>
                        ) : (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">TRẮC NGHIỆM</span>
                        )}
                        {isQDone(currentQ) && <CheckCircle size={18} className="text-emerald-500" />}
                      </div>
                      <h2 className="mt-1.5 text-sm font-bold leading-snug text-slate-900 md:text-base lg:text-lg">{qCur.q}</h2>
                      <p className="mt-1 text-[10px] font-medium text-slate-500 md:text-[11px]">
                        {qCur.type === 'essay' ? 'Trình bày câu trả lời · Có thể sửa trước khi nộp' : 'Chọn một đáp án · Có thể sửa trước khi nộp'}
                      </p>
                    </div>

                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-1 pr-0.5 md:space-y-1.5 md:py-1.5 hide-scrollbar">
                      {qCur.type === 'essay' ? (
                        <div className="space-y-3">
                          <textarea
                            value={answers[currentQ] || ''}
                            onChange={(e) => setAnswers({ ...answers, [currentQ]: e.target.value })}
                            placeholder="Nhập nội dung trả lời..."
                            className="min-h-[200px] w-full resize-none rounded-xl border-2 border-slate-200 bg-white p-4 text-sm text-slate-800 outline-none transition focus:border-indigo-400"
                          />
                          {qCur.attachedFile && (
                            <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/80 p-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <FileText size={18} className="shrink-0 text-blue-600" />
                                <span className="truncate text-xs font-bold text-blue-900">{qCur.attachedFile}</span>
                              </div>
                              <span className="text-[10px] font-bold text-blue-600">Tham khảo đề</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        (qCur.options || []).map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setAnswers({ ...answers, [currentQ]: i })}
                            className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all md:gap-2.5 md:px-3 md:py-2 ${
                              answers[currentQ] === i
                                ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-500/10'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black md:h-8 md:w-8 md:text-[11px] ${
                                answers[currentQ] === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
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
                        ))
                      )}
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
                        disabled={currentQ >= TOTAL - 1}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 md:px-3.5 md:py-2.5 md:text-sm"
                      >
                        Câu sau <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-8 text-sm font-bold text-slate-400">Đang tải đề...</div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white/95 p-3 md:p-4">
                <button
                  type="button"
                  onClick={() => {
                    if (answeredCount < TOTAL) {
                      showModal({
                        title: 'Xác nhận nộp bài',
                        content: `Bạn mới hoàn thành ${answeredCount}/${TOTAL} câu. Vẫn nộp bài?`,
                        type: 'question',
                        confirmText: 'Xác nhận nộp',
                        cancelText: 'Làm tiếp',
                        onConfirm: () => handleSubmit(false),
                      });
                    } else {
                      handleSubmit(false);
                    }
                  }}
                  className="group/btn relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] md:py-4 md:text-base"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent duration-700 group-hover/btn:translate-x-full group-hover/btn:transition-transform" />
                  <Send size={18} className="relative shrink-0" />
                  <span className="relative">NỘP BÀI KIỂM TRA</span>
                </button>
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
                    const done = isQDone(i);
                    const active = i === currentQ;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentQ(i)}
                        className={`flex aspect-square items-center justify-center rounded-lg text-xs font-black transition sm:rounded-xl sm:text-sm md:text-[0.95rem] ${
                          active
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-2 ring-indigo-300 ring-offset-1 ring-offset-white'
                            : done
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
                        }`}
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
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TeacherTest;
