import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { AlertTriangle, ShieldCheck, Camera } from 'lucide-react';

const CONFIG = {
  MAX_CONSECUTIVE_NO_FACE: 5,      // 5 lần liên tiếp không thấy mặt → reset
  CAMERA_CHECK_INTERVAL: 20000,    // Check mỗi 20 giây — thoáng hơn
  MAX_RESETS: 1,                   // Cho phép reset 1 lần, lần sau hủy bài thi
};

const ExamMonitor = forwardRef(({ isActive, onViolate, onResetExam, requireWebcam = true }, ref) => {
  const [cameraWarnings, setCameraWarnings] = useState(0);
  const [tabWarnings, setTabWarnings] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('loading');
  const [lastFaceDetected, setLastFaceDetected] = useState(true);
  const [warningOverlay, setWarningOverlay] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [resetCount, setResetCount] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const consecutiveNoFaceRef = useRef(0);
  const cameraWarningsRef = useRef(0);
  const tabWarningsRef = useRef(0);
  const resetCountRef = useRef(0);
  const lastViolationTimeRef = useRef(0);

  const terminateExam = useCallback((reason) => {
    if (isTerminated) return;
    setIsTerminated(true);
    setWarningOverlay({ type: 'terminated', message: 'KẾT THÚC BÀI THI!', sub: reason, persistent: true });
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (onViolate) onViolate(reason);
  }, [onViolate, isTerminated]);

  const playWarningBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      oscillator.connect(audioCtx.destination);
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { }
  };



  useImperativeHandle(ref, () => ({
    getStats: () => ({ cameraWarnings: cameraWarningsRef.current, tabWarnings: tabWarningsRef.current, lastFaceDetected, cameraStatus, consecutiveNoFace: consecutiveNoFaceRef.current, resetCount: resetCountRef.current }),
    videoRef: videoRef
  }), [lastFa  // CAMERA DETECTION - NATIVE / HEURISTIC
  useEffect(() => {
    if (!isActive || isTerminated) return;
    if (!requireWebcam) {
      setCameraStatus('active');
      setLastFaceDetected(true);
      return;
    }
    
    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let faceDetector = null;
    try {
      if ('FaceDetector' in window) {
        faceDetector = new window.FaceDetector({ maxDetectedFaces: 1 });
      }
    } catch(e) {}

    const setupCamera = async () => {
      try {
        // Use more standard constraints
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } 
        });
        
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Ensure it starts playing
          videoRef.current.play().catch(() => {});
        }
        setCameraStatus('active');

        intervalRef.current = setInterval(async () => {
          if (!isMounted || isTerminated || !videoRef.current || videoRef.current.readyState < 2) return;
          try {
            let hasFace = true;
            
            if (faceDetector) {
              const faces = await faceDetector.detect(videoRef.current);
              hasFace = faces.length > 0;
            } else {
               // Improved Skin Color + Luminosity Heuristic
               ctx.drawImage(videoRef.current, 0, 0, 160, 120);
               const frame = ctx.getImageData(0, 0, 160, 120);
               const data = frame.data;
               
               let skinPixels = 0;
               let totalLuminance = 0;
               
               // Sample only the central 60% of the image
               for (let y = 30; y < 90; y++) {
                 for (let x = 40; x < 120; x++) {
                   const i = (y * 160 + x) * 4;
                   const r = data[i], g = data[i+1], b = data[i+2];
                   
                   // Luminance
                   totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
                   
                   // Normalized skin color detection (robust to brightness)
                   const sum = r + g + b;
                   if (sum > 0) {
                     const nr = r / sum, ng = g / sum;
                     if (nr > 0.35 && nr < 0.55 && ng > 0.25 && ng < 0.35) skinPixels++;
                   }
                 }
               }
               
               const avgLuminance = totalLuminance / (60 * 80);
               const skinRatio = skinPixels / (60 * 80);
               
               // If too dark, don't punish immediately
               if (avgLuminance < 15) {
                 hasFace = true; // Temporary pass for dark room
               } else {
                 hasFace = skinRatio > 0.05; // 5% skin pixels in center
               }
            }
            
            setLastFaceDetected(hasFace);
            if (!hasFace) {
              consecutiveNoFaceRef.current += 1;
              cameraWarningsRef.current += 1;
              const consecutive = consecutiveNoFaceRef.current;
              const n = cameraWarningsRef.current;
              setCameraWarnings(n);

              if (consecutive === 3) {
                playWarningBeep();
                setWarningOverlay({
                  type: 'camera',
                  message: '📸 KIỂM TRA CAMERA!',
                  sub: `Hệ thống không nhận diện được khuôn mặt của bạn ${consecutive} lần liên tiếp. Vui lòng ngồi đúng vị trí trước camera.`,
                  count: consecutive,
                  max: CONFIG.MAX_CONSECUTIVE_NO_FACE
                });
              }

              if (consecutive >= CONFIG.MAX_CONSECUTIVE_NO_FACE) {
                playWarningBeep();
                if (resetCountRef.current >= CONFIG.MAX_RESETS) {
                  terminateExam('Không phát hiện khuôn mặt sau 2 lần kiểm tra liên tiếp. Bài thi bị hủy.');
                } else {
                  resetCountRef.current += 1;
                  setResetCount(resetCountRef.current);
                  consecutiveNoFaceRef.current = 0;
                  setWarningOverlay({
                    type: 'reset',
                    message: '🔄 RESET BÀI THI!',
                    sub: 'Hệ thống không nhận diện được khuôn mặt của bạn 5 lần liên tiếp. Bài thi được reset lại từ đầu. Nếu tiếp tục vi phạm, bài thi sẽ bị HỦY.',
                    persistent: false,
                    isReset: true
                  });
                  if (onResetExam) onResetExam();
                }
              }
            } else {
              consecutiveNoFaceRef.current = 0;
            }
          } catch (e) { }
        }, CONFIG.CAMERA_CHECK_INTERVAL);
      } catch (err) {
        setCameraStatus('denied');
        setLastFaceDetected(true);
      }
    };
    setupCamera();
    return () => { 
      isMounted = false; 
      if (intervalRef.current) clearInterval(intervalRef.current); 
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); 
    };
  }, [isActive, isTerminated, requireWebcam, terminateExam, onResetExam]);

  // TAB DETECTION
  useEffect(() => {
    if (!isActive || isTerminated || !requireWebcam) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabWarningsRef.current += 1;
        setTabWarnings(tabWarningsRef.current);
        const w = tabWarningsRef.current;
        playWarningBeep();

        if (w >= 2) {
          terminateExam('Chuyển tab hoặc rời khỏi màn hình thi quá 2 lần. Bài thi bị hủy tự động!');
        } else {
          setWarningOverlay({
            type: 'tab',
            message: 'CẢNH BÁO CHUYỂN TAB!',
            sub: 'Hệ thống phát hiện bạn vừa rời khỏi màn hình thi. Nếu tiếp tục vi phạm nốt lần nữa, bài thi sẽ tự động HỦY.',
            count: w,
            max: 2
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, isTerminated, requireWebcam, terminateExam]);

  if (!isActive) return null;

  return (
    <>
      {/* Hidden but active video element for processing */}
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline 
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0.01, pointerEvents: 'none' }} 
      />
      {warningOverlay && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-red-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-[0_32px_120px_-15px_rgba(220,38,38,0.5)] w-full max-w-sm overflow-hidden border-t-[12px] border-red-600 animate-in zoom-in duration-500 scale-100">
            <div className="p-10 text-center space-y-6">
              <div className={`w-24 h-24 rounded-[35%] flex items-center justify-center mx-auto shadow-2xl ${warningOverlay.type === 'tab' ? 'bg-orange-100 text-orange-600 shadow-orange-100' : 'bg-red-100 text-red-600 shadow-red-100'} animate-bounce`}>
                <AlertTriangle size={48} />
              </div>
              <div>
                <h2 className="text-gray-900 font-extrabold text-3xl uppercase tracking-tighter leading-none">{warningOverlay.message}</h2>
                <p className="text-gray-400 font-bold mt-3 text-sm leading-relaxed">{warningOverlay.sub}</p>
              </div>
              
              {warningOverlay.count != null && (
                <div className="space-y-3 pt-2">
                   <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mức độ vi phạm</span>
                      <span className="text-sm font-black text-red-600">{warningOverlay.count}/{warningOverlay.max}</span>
                   </div>
                   <div className="h-5 bg-gray-100 rounded-full overflow-hidden border border-gray-200 p-1">
                      <div className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.4)]" style={{ width: `${(warningOverlay.count / warningOverlay.max) * 100}%` }} />
                   </div>
                   <p className="text-[9px] text-gray-400 font-bold uppercase italic">* Đạt {warningOverlay.max}/{warningOverlay.max} bài thi sẽ bị hủy tự động</p>
                </div>
              )}

              {!warningOverlay.persistent ? (
                <button onClick={() => setWarningOverlay(null)} className="w-full py-5 bg-gray-900 text-white font-black rounded-3xl shadow-2xl shadow-gray-200 hover:bg-black hover:scale-[1.03] active:scale-95 transition-all text-lg tracking-tight">
                  TÔI ĐÃ HIỂU, TIẾP TỤC THI
                </button>
              ) : (
                <div className="pt-4">
                  <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export const CameraHeaderPanel = ({ monitorRef }) => {
  const [stats, setStats] = useState({ cameraWarnings: 0, tabWarnings: 0, lastFaceDetected: true, cameraStatus: 'loading' });
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => { 
      if (monitorRef.current) {
        const currentStats = monitorRef.current.getStats();
        setStats(currentStats);
        
        // Continuous sync of srcObject to ensure preview works
        const monitorVideo = monitorRef.current.videoRef?.current;
        if (previewVideoRef.current && monitorVideo && monitorVideo.srcObject) {
          if (previewVideoRef.current.srcObject !== monitorVideo.srcObject) {
            previewVideoRef.current.srcObject = monitorVideo.srcObject;
          }
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [monitorRef]);orRef.current.getStats());
        // Sync srcObject to preview video
        if (previewVideoRef.current && monitorRef.current.videoRef?.current && !previewVideoRef.current.srcObject) {
          previewVideoRef.current.srcObject = monitorRef.current.videoRef.current.srcObject;
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [monitorRef]);

  return (
    <div className="flex items-center gap-4 p-2.5 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl">
      <div className="relative w-24 h-16 bg-black/40 rounded-xl overflow-hidden hidden sm:block border border-white/10">
        <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1] opacity-50" />
        <div className={`absolute inset-0 ${stats.lastFaceDetected ? 'bg-blue-500/10' : 'bg-red-500/20 animate-pulse'}`} />
        <div className="absolute top-1 left-1.5 flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[8px] text-white/60 font-black uppercase">Live</span>
        </div>
        {!stats.lastFaceDetected && (
          <div className="absolute bottom-1 left-0 right-0 text-center">
            <span className="text-[7px] text-red-400 font-bold bg-black/60 px-1.5 py-0.5 rounded">Không thấy mặt</span>
          </div>
        )}
      </div>
      <div className="flex flex-col pr-3">
        <div className="flex items-center gap-2">
           <ShieldCheck size={14} className="text-blue-400" />
           <span className="text-xs text-white/50 uppercase font-black tracking-wider">Giám sát bài thi</span>
        </div>
        <div className="flex items-center gap-5 mt-1.5 font-mono">
           <span className="text-sm font-bold text-white">Cam: <span className={(stats.consecutiveNoFace || 0) > 0 ? 'text-red-400' : 'text-green-400'}>{stats.consecutiveNoFace || 0}/{5}</span></span>
           <span className="text-sm font-bold text-white">Tab: <span className={stats.tabWarnings > 0 ? 'text-orange-400' : 'text-green-400'}>{stats.tabWarnings}/2</span></span>
        </div>
        {(stats.resetCount || 0) > 0 && (
          <span className="text-[9px] text-yellow-400 font-bold mt-1">⚠️ Đã reset {stats.resetCount} lần</span>
        )}
      </div>
    </div>
  );
};

export default ExamMonitor;
