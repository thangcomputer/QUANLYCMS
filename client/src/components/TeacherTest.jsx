import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Timer, CheckCircle2, XCircle, Send, AlertTriangle,
  Upload, Shield, Zap, Lock, FileText, ClipboardCheck, UserCheck, Camera,
  Info, ChevronRight, CheckCircle, User, Clock, Star, Layout, BookOpen, HelpCircle,
  RefreshCw, Slash, Video, Monitor, Download
} from 'lucide-react';
import { gradeAnswers } from '../data/questionBank';
import { useData } from '../context/DataContext';
import { useModal } from '../utils/Modal.jsx';
import ExamMonitor, { CameraHeaderPanel } from './ExamMonitor';
import api, { API_BASE } from '../services/api';

const TOTAL_QUESTIONS = 10;
const TIME_LIMIT      = 600; 
const PASS_SCORE      = 80;

// ─── TIMER COMPONENT ─────────────────────────────────────────────────────────
const TimerBadge = ({ seconds = 0, urgent = false }) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${minutes}:${secs.toString().padStart(2, '0')}`;
  
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-bold shadow-md ${urgent ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}`}>
      <Timer size={14} />
      {display}
    </div>
  );
};

// ─── STEPPER COMPONENT ───────────────────────────────────────────────────────
const EvaluationStepper = ({ currentStep = 1, results = {}, practicalSubmitted = false, currentTeacher = null }) => {
    const steps = [
        { id: 1, label: 'Thi trắc nghiệm', sub: results.quiz?.passed ? '✓ Hoàn thành' : (currentStep === 1 ? '• Đang thực hiện' : 'Chưa bắt đầu') },
        { id: 2, label: 'Thi thực hành', sub: practicalSubmitted || currentTeacher?.practicalFile ? '✓ Đã nộp' : (results.quiz?.passed ? '• Đang thực hiện' : 'Chờ kết quả') },
        { id: 3, label: 'Admin xét duyệt', sub: practicalSubmitted || currentTeacher?.practicalFile ? '• Đang thực hiện' : 'Chờ kết quả' },
    ];

    return (
        <div className="w-full bg-white rounded-3xl p-6 shadow-sm border border-slate-100 max-w-4xl mx-auto mb-8">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center mb-6">Quy trình đánh giá giảng viên</p>
            <div className="flex items-center justify-between relative px-4 md:px-12">
                {/* Line Background */}
                <div className="absolute top-5 left-20 right-20 h-0.5 bg-gray-100 -z-0" />
                
                {steps.map((step, i) => (
                    <div key={step.id} className="relative z-10 flex flex-col items-center group">
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${
                            (i + 1 < currentStep || results.quiz?.passed && i === 0) ? 'bg-green-500 text-white' : 
                            (i + 1 === currentStep) ? 'bg-blue-600 text-white scale-110' : 'bg-white border-2 border-slate-200 text-slate-300'
                        }`}>
                            {i + 1 < currentStep || (results.quiz?.passed && i === 0) ? <CheckCircle size={20} /> : 
                             i + 1 === currentStep ? (i === 2 ? <User size={20} /> : <FileText size={20} />) : 
                             (i === 2 ? <User size={20} /> : <FileText size={20} />)}
                        </div>
                        <div className="mt-4 text-center">
                            <p className={`text-xs font-black uppercase tracking-tight ${i + 1 === currentStep ? 'text-blue-700' : 'text-slate-900'}`}>{step.label}</p>
                            <p className={`text-[10px] font-bold mt-1 ${
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
  const { questions: pool, updateTeacher } = useData();
  const { showModal } = useModal();
  const [phase, setPhase] = useState('intro'); // intro, test, result, banned
  const [banReason, setBanReason] = useState('');
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
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

  const monitorRef = useRef(null);
  const timerRef = useRef(null);
  const lastViolationTime = useRef(0);

  const teacherId = (() => { try { return JSON.parse(localStorage.getItem('teacher_user') || '{}').id; } catch { return null; } })();

  // 1. Dữ liệu câu hỏi bền vững
  const [questions] = useState(() => {
    const saved = localStorage.getItem('teacher_test_questions');
    if (saved) return JSON.parse(saved);
    const randomized = pool?.length >= 10 ? [...pool].sort(() => Math.random() - 0.5).slice(0, 10) : [];
    if (randomized.length > 0) localStorage.setItem('teacher_test_questions', JSON.stringify(randomized));
    return randomized;
  });

  const currentTeacher = pool?.find(t => String(t.id) === String(teacherId));

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
    <div className="h-full  bg-black flex items-center justify-center p-6">
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

         {/* Nút Vào thi */}
         <button 
             disabled={!cameraReady}
             onClick={() => { setPhase('test'); localStorage.setItem('teacher_test_phase', 'test'); }} 
             className={`w-full py-2.5 font-black rounded-[14px] transition-all text-[11px] flex items-center justify-center gap-2 ${
                 cameraReady 
                 ? 'bg-[#E13B35] text-white shadow-xl shadow-red-500/30 hover:bg-black hover:scale-[1.02] active:scale-95' 
                 : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-70'
             }`}>
             TÔI ĐÃ HIỂU VÀ BẮT ĐẦU THI
         </button>
      </div>
    </div>
  );

  if (phase === 'intro') return (
    <div className="h-full  bg-slate-50 p-4 md:p-8 pt-20">
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
                     { icon: Layout, label: 'Số câu hỏi', val: '10 câu', color: 'text-purple-600', bg: 'bg-purple-50' },
                     { icon: Clock, label: 'Thời gian', val: '10 phút', color: 'text-orange-600', bg: 'bg-orange-50' },
                     { icon: Star, label: 'Điểm đạt', val: '≥ 80/100', color: 'text-red-600', bg: 'bg-red-50' },
                     { icon: HelpCircle, label: 'Hình thức', val: 'Random', color: 'text-blue-600', bg: 'bg-blue-50' },
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
                        { title: 'Random câu hỏi', desc: 'Mỗi giảng viên nhận bộ câu hỏi khác nhau.', icon: Layout, textCol: 'text-blue-700', bg: 'bg-blue-100/50 border-blue-200' },
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

  if (phase === 'result') return (
    <div className="h-full  bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <EvaluationStepper 
            currentStep={practicalSubmitted || currentTeacher?.practicalFile ? 3 : 2} 
            results={{ quiz: { passed: grade.pass } }} 
            practicalSubmitted={practicalSubmitted}
            currentTeacher={currentTeacher}
        />

        {/* Status Bar */}
        <div className={`w-full ${grade.pass ? 'bg-[#008945]' : 'bg-red-700'} rounded-3xl p-5 mb-6 flex items-center justify-between shadow-lg relative overflow-hidden group`}>
            <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-md">
                    {grade.pass ? <CheckCircle size={24} /> : <XCircle size={24} />}
                </div>
                <div className="text-left">
                   <h3 className="text-white font-black text-xl md:text-2xl uppercase tracking-tighter flex items-center gap-2 leading-none mb-1">
                        Phần 1: Trắc nghiệm — {grade.pass ? 'ĐẠT' : 'CHƯA ĐẠT'} {grade.pass && <span className="text-2xl">✓</span>}
                   </h3>
                   <p className="text-white/70 text-xs font-bold leading-none uppercase tracking-widest">Điểm thi: {grade.total}/100</p>
                </div>
            </div>
            <div className="text-white text-4xl md:text-5xl font-black opacity-90 relative z-10 tracking-tighter">
                {grade.total}
            </div>
            {/* Decor circle */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
        </div>

        {/* Success Card */}
        {grade.pass && (
            <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 animate-in slide-in-from-bottom-5 duration-700">
                <div className="bg-[#008945] py-12 text-center space-y-4 relative group overflow-hidden">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-2xl text-[#008945] scale-110 group-hover:rotate-12 transition-transform duration-500 relative z-10">
                        <CheckCircle size={48} strokeWidth={3} />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-white text-3xl font-black tracking-tighter leading-none mb-2">Vượt qua Phần 1! 🎉</h2>
                        <p className="text-green-50/70 font-bold text-sm">Bạn đã đạt {grade.total}/100 điểm trắc nghiệm</p>
                    </div>
                </div>

                <div className="p-10 space-y-8">
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
                                className="border-4 border-dashed border-slate-100 rounded-[32px] p-12 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-200 transition-colors group cursor-pointer relative block w-full"
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
                                <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform mx-auto">
                                  <Upload size={40} />
                                </div>
                                <div className="w-full">
                                  <p className="text-slate-600 font-black text-lg">Bấm để chọn hoặc kéo thả file vào đây</p>
                                  <p className="text-slate-400 text-xs font-bold mt-1">Hỗ trợ: PDF, ZIP, MP4, DOCX, PPTX, XLSX (Tối đa 50MB)</p>
                                </div>
                                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors rounded-[32px] pointer-events-none" />
                              </label>
                            </React.Fragment>

                            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex items-start gap-4">
                                <Info size={20} className="text-blue-500 shrink-0 mt-1" />
                                <p className="text-blue-900 text-[13px] font-bold leading-relaxed">
                                    Lưu ý: Bài thực hành là yếu tố quyết định để Admin cấp quyền giảng dạy chính thức. Hãy nộp file chất lượng nhất của bạn.
                                </p>
                            </div>
                        </div>
                    ) : (
                        /* PHẦN 3: CHỜ DUYỆT */
                        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
                            <div className="bg-[#FFF9E6] rounded-3xl p-8 border border-orange-100 flex flex-col items-center text-center space-y-4 shadow-inner">
                                <div className="flex items-center gap-3 text-[#D97706] font-black uppercase text-base italic tracking-tight">
                                    <Clock size={24} className="animate-pulse" /> Đang chờ xét duyệt hồ sơ
                                </div>
                                <p className="text-[#92400E] font-bold max-w-sm leading-relaxed">
                                    Hồ sơ của bạn đã được chuyển đến bộ phận chuyên môn. Kết quả sẽ được thông báo qua <span className="text-[#D97706]">Zalo</span> trong vòng 24h làm việc.
                                </p>
                            </div>

                            {/* Hotline section */}
                            <div className="bg-slate-50 rounded-3xl p-8 text-center border border-slate-100 space-y-2 group hover:bg-white transition-colors">
                                <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest leading-none">Cần hỗ trợ gấp, vui lòng liên hệ:</p>
                                <p className="text-3xl font-black text-slate-800 tracking-tighter group-hover:text-blue-600 transition-colors">093.5758.462</p>
                            </div>

                            <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} 
                                className="w-full py-6 bg-[#203DB5] text-white font-black rounded-3xl text-2xl shadow-2xl shadow-blue-900/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border-b-8 border-blue-900 leading-none">
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

  return (
    <div className="h-full  bg-[#F8FAFC] relative font-sans selection:bg-red-100 selection:text-red-900 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-red-50/50 rounded-full blur-[120px]" />
      </div>

      <ExamMonitor ref={monitorRef} isActive={phase === 'test'} onViolate={handleViolate} tabViolations={tabViolations} />
      
      {/* ─── PREMIUM HEADER ─── */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="backdrop-blur-xl bg-slate-900/90 border-b border-white/10 px-4 md:px-8 py-3 md:py-4 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Left: Brand & Progress */}
            <div className="flex items-center gap-4 md:gap-8 min-w-0">
               <div className="p-2 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl shadow-lg shadow-red-900/40 hidden sm:block">
                  <BookOpen size={20} className="text-white" />
               </div>
               <div className="min-w-0">
                  <h2 className="text-white font-black text-sm md:text-base tracking-widest uppercase leading-none mb-1.5 truncate">
                    KIỂM TRA NĂNG LỰC
                  </h2>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-24 md:w-32 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-700 ease-out" 
                        style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-red-400 text-[10px] font-black uppercase tracking-tighter">
                      {Object.keys(answers).length}/{questions.length} Hoàn thành
                    </span>
                  </div>
               </div>
            </div>

            {/* Center: Title (Desktop) */}
            <div className="absolute left-1/2 -translate-x-1/2 text-center hidden xl:block pointer-events-none">
                <span className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">Thắng Tin Học</span>
                <p className="text-white font-bold text-lg tracking-tight">HỆ THỐNG KIỂM TRA GIẢNG VIÊN V.2</p>
            </div>

            {/* Right: Timer & Camera */}
            <div className="flex items-center justify-end gap-3 md:gap-6">
                <TimerBadge seconds={timeLeft} urgent={timeLeft < 60} />
                <div className="hidden lg:block border-l border-white/10 h-8 mx-1" />
                <CameraHeaderPanel monitorRef={monitorRef} />
            </div>
          </div>
        </div>
      </div>

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

      {/* ─── QUESTION LIST ─── */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-10 pb-40 mt-24 space-y-12">
        {questions.map((q, idx) => {
          const isAnswered = answers[idx] !== undefined;
          return (
            <div 
              key={idx} 
              className={`
                relative bg-white rounded-[32px] p-8 md:p-10 transition-all duration-500 ease-out border
                ${isAnswered 
                  ? 'border-blue-100 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.1)]' 
                  : 'border-slate-100 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)] hover:border-slate-200'
                }
              `}
            >
              {/* Modern Question Label */}
              <div className="flex items-center gap-3 mb-6">
                 <div className={`
                    w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm transition-all duration-500
                    ${isAnswered ? 'bg-[#203DB5] text-white shadow-lg shadow-blue-900/30' : 'bg-slate-100 text-slate-400'}
                 `}>
                    {idx + 1}
                 </div>
                 {isAnswered && <CheckCircle2 size={18} className="text-[#203DB5] animate-in zoom-in" />}
              </div>

              {/* Question Prompt */}
              <h3 className="text-xl md:text-[22px] font-bold text-slate-800 leading-[1.6] mb-8 tracking-tight">
                 {q.q}
              </h3>

              {/* Sophisticated Options Grid / Essay Input */}
              {q.type === 'essay' ? (
                <div className="space-y-4">
                  <textarea 
                    value={answers[idx] || ''} 
                    onChange={(e) => setAnswers({...answers, [idx]: e.target.value})}
                    placeholder="Nhập nội dung trả lời của bạn tại đây..."
                    className={`
                      w-full p-6 rounded-[24px] border-2 min-h-[160px] text-slate-700 font-medium transition-all duration-300 outline-none
                      ${isAnswered 
                        ? 'border-[#203DB5] bg-blue-50/20 shadow-inner' 
                        : 'border-slate-100 bg-slate-50/30 focus:border-blue-300 focus:bg-white'
                      }
                    `}
                  />
                  {q.attachedFile && (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between group/file">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-50">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Tài liệu đính kèm:</p>
                          <p className="text-sm font-bold text-blue-900 leading-none">{q.attachedFile}</p>
                        </div>
                      </div>
                      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                        <Download size={14} /> TẢI VỀ
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 px-2">
                    <Info size={12} className="text-blue-500" />
                    <span>Câu hỏi tự luận: Vui lòng trình bày rõ ràng, đủ ý. Tải tài liệu (nếu có) để làm bài.</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(q.options || []).map((opt, i) => {
                    const isSelected = answers[idx] === i;
                    return (
                      <label 
                        key={i} 
                        className={`
                          relative flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden group/opt
                          ${isSelected 
                            ? 'border-[#203DB5] bg-blue-50/30 shadow-[0_4px_20px_-5px_rgba(32,61,181,0.15)]' 
                            : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-sm'
                          }
                        `}
                      >
                        <input 
                          type="radio" 
                          checked={isSelected} 
                          onChange={() => setAnswers({...answers, [idx]: i})} 
                          className="hidden" 
                        />
                        
                        {/* Refined Radio indicator */}
                        <div className={`
                          w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-300 flex-shrink-0
                          ${isSelected ? 'border-[#203DB5] bg-[#203DB5]' : 'border-slate-300 bg-white group-hover/opt:border-slate-400'}
                        `}>
                           <div className={`w-2 h-2 bg-white rounded-full transition-transform duration-300 ${isSelected ? 'scale-100' : 'scale-0'}`} />
                        </div>

                        <span className={`text-[15px] md:text-base transition-all duration-300 leading-relaxed
                          ${isSelected ? 'text-[#1E3A8A] font-bold' : 'text-slate-600 font-medium group-hover/opt:text-slate-900'}
                        `}>
                          {opt}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ─── FLOATING SUBMIT BAR ─── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-6 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent pointer-events-none flex justify-center">
           <div className="pointer-events-auto bg-white/70 backdrop-blur-xl p-2 rounded-[32px] border border-white/40 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] w-full max-w-[340px] transition-transform hover:-translate-y-1">
              <button 
                onClick={() => {
                  const answeredCount = Object.keys(answers).length;
                  if (answeredCount < questions.length) {
                    showModal({
                      title: 'Xác nhận nộp bài',
                      content: `Bạn mới làm được ${answeredCount}/${questions.length} câu. Bạn có chắc chắn muốn nộp bài sớm không?`,
                      type: 'question',
                      confirmText: 'Xác nhận nộp',
                      cancelText: 'Làm tiếp',
                      onConfirm: () => handleSubmit(false)
                    });
                  } else {
                    handleSubmit(false);
                  }
                }} 
                className="w-full py-4 bg-gradient-to-r from-[#203DB5] to-[#1E3A8A] text-white font-black rounded-3xl shadow-lg shadow-blue-900/30 flex items-center justify-center gap-3 text-lg active:scale-95 transition-all overflow-hidden relative group/btn"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full duration-1000 ease-in-out" />
                <Send size={20} className="group-hover/btn:-translate-y-1 group-hover/btn:translate-x-1 transition-transform" /> 
                <span>NỘP BÀI THI</span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherTest;
