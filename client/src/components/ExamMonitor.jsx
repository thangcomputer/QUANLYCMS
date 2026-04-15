import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { AlertTriangle, ShieldCheck, Camera } from 'lucide-react';

const CONFIG = {
  MAX_CAMERA_WARNINGS: 50,         // Rất thoáng — 50 lần mới cảnh báo nặng
  CAMERA_CHECK_INTERVAL: 15000,    // Check mỗi 15 giây — không quá nhạy
  SHOW_WARNING_EVERY: 10,          // Chỉ hiện popup cảnh báo mỗi 10 lần
};

const ExamMonitor = forwardRef(({ isActive, onViolate }, ref) => {
  const [cameraWarnings, setCameraWarnings] = useState(0);
  const [tabWarnings, setTabWarnings] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('loading');
  const [lastFaceDetected, setLastFaceDetected] = useState(true);
  const [warningOverlay, setWarningOverlay] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const cameraWarningsRef = useRef(0);
  const tabWarningsRef = useRef(0);
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
    getStats: () => ({ cameraWarnings: cameraWarningsRef.current, tabWarnings: tabWarningsRef.current, lastFaceDetected, cameraStatus }),
    videoRef: videoRef
  }), [lastFaceDetected, cameraStatus]);

  // CAMERA DETECTION - NATIVE / HEURISTIC
  useEffect(() => {
    if (!isActive || isTerminated) return;
    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let faceDetector = null;
    if ('FaceDetector' in window) {
      faceDetector = new window.FaceDetector({ maxDetectedFaces: 1 });
    }

    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!isMounted) return;
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraStatus('active');

        intervalRef.current = setInterval(async () => {
          if (!isMounted || isTerminated || !videoRef.current || videoRef.current.readyState < 2) return;
          try {
            let hasFace = true;
            
            if (faceDetector) {
              const faces = await faceDetector.detect(videoRef.current);
              hasFace = faces.length > 0;
            } else {
               // Đề phòng Chrome không hỗ trợ: Dùng heuristic nhưng cực kỳ "thoáng"
               ctx.drawImage(videoRef.current, 0, 0, 160, 120);
               const data = ctx.getImageData(30, 20, 100, 80).data; // Chỉ xét vùng trung tâm
               let skinPixels = 0;
               for (let i = 0; i < data.length; i += 4) {
                 const r = data[i], g = data[i+1], b = data[i+2];
                 // Thuật toán phát hiện màu da đơn giản
                 if (r > 60 && g > 40 && b > 20 && r > g && r > b) skinPixels++;
               }
               const ratio = skinPixels / (100 * 80);
               hasFace = ratio > 0.01; // Chỉ cần 1% pixels vùng giữa giống màu da là pass
            }
            
            setLastFaceDetected(hasFace);
            if (!hasFace) {
              cameraWarningsRef.current += 1;
              const n = cameraWarningsRef.current;
              setCameraWarnings(n);
              // Chỉ hiện cảnh báo mỗi SHOW_WARNING_EVERY lần để tránh spam
              if (n % CONFIG.SHOW_WARNING_EVERY === 0) {
                playWarningBeep();
                if (n >= CONFIG.MAX_CAMERA_WARNINGS) {
                  setWarningOverlay({
                    type: 'camera',
                    message: '⚠️ CẢNH BÁO CAMERA!',
                    sub: `Hệ thống không nhận diện được bạn. Giám khảo sẽ xem xét sau.`,
                    count: n,
                    max: CONFIG.MAX_CAMERA_WARNINGS
                  });
                } else {
                  setWarningOverlay({
                    type: 'camera',
                    message: '📸 KIỂM TRA CAMERA!',
                    sub: `Vui lòng ngồi đúng vị trí trước camera. (${n}/${CONFIG.MAX_CAMERA_WARNINGS})`,
                    count: n,
                    max: CONFIG.MAX_CAMERA_WARNINGS
                  });
                }
              }
            }
          } catch (e) { }
        }, CONFIG.CAMERA_CHECK_INTERVAL);
      } catch (err) {
        setCameraStatus('denied');
        // Không có camera => bỏ qua kiểm tra khuôn mặt hoàn toàn
        setLastFaceDetected(true);
      }
    };
    setupCamera();
    return () => { isMounted = false; clearInterval(intervalRef.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [isActive, isTerminated, terminateExam]);

  if (!isActive) return null;

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />
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
        setStats(monitorRef.current.getStats());
        // Sync srcObject to preview video
        if (previewVideoRef.current && monitorRef.current.videoRef?.current && !previewVideoRef.current.srcObject) {
          previewVideoRef.current.srcObject = monitorRef.current.videoRef.current.srcObject;
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [monitorRef]);

  return (
    <div className="flex items-center gap-3 p-1.5 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl">
      <div className="relative w-14 h-10 bg-black/40 rounded-lg overflow-hidden hidden sm:block border border-white/10">
        <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1] opacity-40" />
        <div className={`absolute inset-0 ${stats.lastFaceDetected ? 'bg-blue-500/10' : 'bg-red-500/20'}`} />
        <div className="absolute top-0.5 left-1 flex items-center gap-1">
          <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[6px] text-white/50 font-black uppercase">Live</span>
        </div>
      </div>
      <div className="flex flex-col pr-2">
        <div className="flex items-center gap-2">
           <ShieldCheck size={10} className="text-blue-400" />
           <span className="text-[9px] text-white/40 uppercase font-black tracking-widest">Giám sát bài thi</span>
        </div>
        <div className="flex items-center gap-4 mt-1 font-mono">
           <span className="text-[10px] font-bold text-white">Cam: <span className={stats.cameraWarnings > 0 ? 'text-red-400' : 'text-green-400'}>{stats.cameraWarnings}/5</span></span>
           <span className="text-[10px] font-bold text-white">Tab: <span className={stats.tabWarnings > 0 ? 'text-orange-400' : 'text-green-400'}>{stats.tabWarnings}/2</span></span>
        </div>
      </div>
    </div>
  );
};

export default ExamMonitor;
