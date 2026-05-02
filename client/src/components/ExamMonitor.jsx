import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

const CONFIG = {
  MAX_CONSECUTIVE_NO_FACE: 5,
  CAMERA_CHECK_INTERVAL: 3500,
  DETECT_W: 320,
  DETECT_H: 240,
  /** Diện tích bbox / diện tích khung (canvas), tối thiểu ~3% */
  MIN_FACE_AREA_RATIO: 0.028,
  /** Tâm mặt không được quá thấp trong khung (tránh chỉ lộ chút trán/cằm mép dưới) */
  FACE_CENTER_MAX_Y_RATIO: 0.72,
  FACE_CENTER_MIN_X_RATIO: 0.14,
  FACE_CENTER_MAX_X_RATIO: 0.86,
  MIN_FACE_BOX_ASPECT: 0.48,
  MAX_FACE_BOX_ASPECT: 1.08,
};

function isSkinLike(r, g, b) {
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331364 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const sum = r + g + b + 1e-6;
  const nr = r / sum;
  const ng = g / sum;
  const rgbLoose =
    nr > 0.31 &&
    nr < 0.64 &&
    ng > 0.17 &&
    ng < 0.47 &&
    r > 50 &&
    r > g * 0.82 &&
    r > b;
  const darkerTone =
    L > 24 &&
    L < 158 &&
    r > 30 &&
    g > 24 &&
    b > 14 &&
    Math.max(r, g, b) - Math.min(r, g, b) > 10;
  const chromaRg = Math.max(r, g, b) - Math.min(r, g, b);
  if (chromaRg < 13 && L > 18 && L < 138) return false;
  const neutralGray =
    Math.abs(cb - 128) < 22 && Math.abs(cr - 128) < 22 && chromaRg < 22;
  if (neutralGray && L > 22 && L < 125) return false;

  const skinYcbcr2 =
    !neutralGray && cr >= 123 && cr <= 198 && cb >= 62 && cb <= 140;
  return skinYcbcr2 || rgbLoose || darkerTone;
}

/**
 * Phát hiện bịt camera / khung gần như đen hoặc đồng nhất không có chi tiết khuôn mặt.
 * Tránh báo “đạt” khi preview toàn đen nhưng heuristic nhầm xám là da.
 */
function frameLooksLikeLensBlocked(imageData, w, h) {
  const d = imageData.data;
  let sumL = 0;
  let sumL2 = 0;
  let chromaSum = 0;
  let dark = 0;
  let n = 0;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      sumL += L;
      sumL2 += L * L;
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      if (L < 14) dark++;
      n++;
    }
  }

  if (n === 0) return true;

  const avgL = sumL / n;
  const variance = Math.max(0, sumL2 / n - avgL * avgL);
  const stdL = Math.sqrt(variance);
  const darkRatio = dark / n;
  const avgChroma = chromaSum / n;

  if (avgL < 12 && darkRatio > 0.72) return true;
  if (avgL < 22 && darkRatio > 0.88) return true;

  /** Khung quá đồng nhất + ít màu → lens cap / tay che (chỉ khi rất “phẳng” để tránh báo che cam nhầm) */
  if (avgL < 48 && stdL < 4.0 && avgChroma < 4.6) return true;
  if (avgL >= 48 && avgL < 118 && stdL < 3.8 && avgChroma < 5.0) return true;

  /** Đen / xám nhưng có nhiễu nhẹ — vẫn coi là che ống kính */
  if (avgL < 32 && stdL < 9 && avgChroma < 7 && darkRatio > 0.42) return true;

  return false;
}

/** Face Detection API: bbox đủ lớn, gần giữa ngang, không chỉ “một cục nhỏ” dưới đáy khung */
function facePassesFraming(face, vw, vh) {
  const box = face?.boundingBox;
  if (!box || !vw || !vh) return false;
  const bw = box.width;
  const bh = box.height;
  const left = box.left;
  const top = box.top;
  const areaRatio = (bw * bh) / (vw * vh);
  if (areaRatio < CONFIG.MIN_FACE_AREA_RATIO) return false;

  const cx = left + bw / 2;
  const cy = top + bh / 2;
  if (cx < vw * CONFIG.FACE_CENTER_MIN_X_RATIO || cx > vw * CONFIG.FACE_CENTER_MAX_X_RATIO) return false;
  if (cy > vh * CONFIG.FACE_CENTER_MAX_Y_RATIO) return false;

  const ar = bw / Math.max(bh, 1);
  if (ar < CONFIG.MIN_FACE_BOX_ASPECT || ar > CONFIG.MAX_FACE_BOX_ASPECT) return false;
  return true;
}

/**
 * Khi không có FaceDetector hoặc không detect được mặt:
 * chỉ đếm pixel giống da trong vùng oval phía trên (chỗ mặt thường nằm với webcam laptop).
 */
function heuristicStrictUpperFaceZone(imageData, w, h) {
  const d = imageData.data;
  const x0 = Math.floor(w * 0.26);
  const x1 = Math.floor(w * 0.74);
  const y0 = Math.floor(h * 0.06);
  const y1 = Math.floor(h * 0.52);
  let skin = 0;
  let n = 0;
  let lumSum = 0;
  let darkPixels = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += L;
      n++;
      if (L < 10) darkPixels++;
      if (isSkinLike(r, g, b)) skin++;
    }
  }

  if (n === 0) return false;
  const avgLum = lumSum / n;
  const darkRatio = darkPixels / n;
  const skinRatio = skin / n;

  if (darkRatio > 0.88 || avgLum < 4) return false;
  return skinRatio >= 0.026;
}

const ExamMonitor = forwardRef(({ isActive, onViolate, requireWebcam = true }, ref) => {
  const [cameraWarnings, setCameraWarnings] = useState(0);
  const [tabWarnings, setTabWarnings] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('loading');
  const [lastFaceDetected, setLastFaceDetected] = useState(false);
  const [warningOverlay, setWarningOverlay] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const consecutiveNoFaceRef = useRef(0);
  const cameraWarningsRef = useRef(0);
  const tabWarningsRef = useRef(0);
  const lastViolationTimeRef = useRef(0);
  const onViolateRef = useRef(onViolate);

  useEffect(() => { onViolateRef.current = onViolate; }, [onViolate]);

  const terminateExam = useCallback((reason) => {
    if (isTerminated) return;
    setIsTerminated(true);
    setWarningOverlay({ type: 'terminated', message: 'KẾT THÚC BÀI THI!', sub: reason, persistent: true });
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (onViolateRef.current) onViolateRef.current(reason);
  }, [isTerminated]);

  const playWarningBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      oscillator.connect(audioCtx.destination);
      oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { }
  };

  useImperativeHandle(ref, () => ({
    getStats: () => ({ 
      cameraWarnings: cameraWarningsRef.current, 
      tabWarnings: tabWarningsRef.current, 
      lastFaceDetected, 
      cameraStatus, 
      consecutiveNoFace: consecutiveNoFaceRef.current
    }),
    videoRef: videoRef
  }), [lastFaceDetected, cameraStatus]);

  // CAMERA DETECTION - NATIVE / HEURISTIC
  useEffect(() => {
    if (!isActive || isTerminated) return;
    if (!requireWebcam) {
      setCameraStatus('active');
      setLastFaceDetected(true);
      return;
    }
    
    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.DETECT_W;
    canvas.height = CONFIG.DETECT_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let faceDetector = null;
    if ('FaceDetector' in window) {
      try {
        faceDetector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: false });
      } catch {
        try {
          faceDetector = new window.FaceDetector({ maxDetectedFaces: 1 });
        } catch {
          faceDetector = null;
        }
      }
    }

    const waitForVideoFrames = (video, timeoutMs = 10000) =>
      new Promise((resolve) => {
        if (!video) {
          resolve();
          return;
        }
        const done = () => {
          clearTimeout(tid);
          video.removeEventListener('loadeddata', tick);
          video.removeEventListener('playing', tick);
          video.removeEventListener('canplay', tick);
          resolve();
        };
        const tick = () => {
          if (video.readyState >= 2 && video.videoWidth > 0) done();
        };
        const tid = setTimeout(done, timeoutMs);
        if (video.readyState >= 2 && video.videoWidth > 0) {
          clearTimeout(tid);
          resolve();
          return;
        }
        video.addEventListener('loadeddata', tick, { passive: true });
        video.addEventListener('playing', tick, { passive: true });
        video.addEventListener('canplay', tick, { passive: true });
        tick();
      });

    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.play().catch(() => {});
        }
        await waitForVideoFrames(videoRef.current);
        if (!isMounted) return;

        setCameraStatus('active');

        const runFaceCheck = async () => {
          if (!isMounted || isTerminated || !videoRef.current || videoRef.current.readyState < 2) return;
          const vid = videoRef.current;
          if (!vid.videoWidth) return;
          try {
            ctx.drawImage(vid, 0, 0, CONFIG.DETECT_W, CONFIG.DETECT_H);
            const frame = ctx.getImageData(0, 0, CONFIG.DETECT_W, CONFIG.DETECT_H);

            const lensBlocked = frameLooksLikeLensBlocked(frame, CONFIG.DETECT_W, CONFIG.DETECT_H);

            let faces = null;
            let bboxW = CONFIG.DETECT_W;
            let bboxH = CONFIG.DETECT_H;
            if (faceDetector && !lensBlocked) {
              try {
                faces = await faceDetector.detect(canvas);
                if (!faces || faces.length === 0) {
                  faces = await faceDetector.detect(vid);
                  bboxW = vid.videoWidth || CONFIG.DETECT_W;
                  bboxH = vid.videoHeight || CONFIG.DETECT_H;
                }
              } catch (detErr) {
                console.warn('ExamMonitor: FaceDetector.detect', detErr);
              }
            }

            const anyRawFace = Array.isArray(faces) && faces.length > 0;
            let apiOk = false;
            if (!lensBlocked && anyRawFace) {
              apiOk = faces.some((f) => facePassesFraming(f, bboxW, bboxH));
            }

            let heuristicOk = false;
            if (!lensBlocked && !anyRawFace) {
              heuristicOk = heuristicStrictUpperFaceZone(frame, CONFIG.DETECT_W, CONFIG.DETECT_H);
            } else if (!lensBlocked && anyRawFace && !apiOk) {
              /** API thấy mặt nhưng khung không đạt — vẫn thử heuristic để tránh “treo” đỏ */
              heuristicOk = heuristicStrictUpperFaceZone(frame, CONFIG.DETECT_W, CONFIG.DETECT_H);
            }

            const hasFace = !lensBlocked && (apiOk || heuristicOk);

            setLastFaceDetected(hasFace);
            if (!hasFace) {
              consecutiveNoFaceRef.current += 1;
              const consecutive = consecutiveNoFaceRef.current;

              if (consecutive === 2 || consecutive === 4) {
                playWarningBeep();
                setWarningOverlay({
                  type: 'camera',
                  message: '📸 KIỂM TRA CAMERA!',
                  sub: `Không thấy khuôn mặt rõ trong khung (camera bị che / quá tối / mặt quá nhỏ). Bỏ vật che camera, chỉnh sáng, căn mặt vào oval trên ô LIVE. Vi phạm ${consecutive}/${CONFIG.MAX_CONSECUTIVE_NO_FACE} — đủ ${CONFIG.MAX_CONSECUTIVE_NO_FACE} lần bài bị HỦY.`,
                  count: consecutive,
                  max: CONFIG.MAX_CONSECUTIVE_NO_FACE,
                });
              }

              if (consecutive >= CONFIG.MAX_CONSECUTIVE_NO_FACE) {
                playWarningBeep();
                terminateExam(`Không phát hiện khuôn mặt ${CONFIG.MAX_CONSECUTIVE_NO_FACE} lần liên tiếp. Bài thi bị hủy tự động theo quy định!`);
              }
            } else {
              consecutiveNoFaceRef.current = 0;
            }
          } catch (e) {
            console.error('ExamMonitor: Detection error', e);
          }
        };

        await new Promise((r) => setTimeout(r, 200));
        await runFaceCheck();
        intervalRef.current = setInterval(runFaceCheck, CONFIG.CAMERA_CHECK_INTERVAL);
      } catch (err) {
        console.error("ExamMonitor: Camera access denied", err);
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
  }, [isActive, isTerminated, requireWebcam, terminateExam]);

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
      {/* Video phải nằm trong viewport; kích thước CSS quá nhỏ (vd. 4×4) khiến một số trình duyệt giảm/giật frame → AI luôn lỗi */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          width: 320,
          height: 240,
          opacity: 0.02,
          pointerEvents: 'none',
          zIndex: 2147483646,
          objectFit: 'cover',
        }}
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
  const [stats, setStats] = useState({
    cameraWarnings: 0,
    tabWarnings: 0,
    lastFaceDetected: true,
    cameraStatus: 'loading',
    consecutiveNoFace: 0,
  });
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => { 
      if (monitorRef.current) {
        const currentStats = monitorRef.current.getStats();
        setStats(currentStats);
        
        const monitorVideo = monitorRef.current.videoRef?.current;
        if (previewVideoRef.current && monitorVideo && monitorVideo.srcObject) {
          if (previewVideoRef.current.srcObject !== monitorVideo.srcObject) {
            previewVideoRef.current.srcObject = monitorVideo.srcObject;
            previewVideoRef.current.play().catch(() => {});
          }
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [monitorRef]);

  return (
    <div className="flex items-center gap-4 p-2.5 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl">
      <div className="relative w-24 h-16 bg-black/40 rounded-xl overflow-hidden hidden sm:block border border-white/10">
        <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        {/* Khung oval gợi ý — trùng logic vùng kiểm tra phía trên */}
        <div className="absolute inset-0 flex items-start justify-center pt-0.5 pointer-events-none">
          <div
            className="w-[58%] aspect-[3/4] max-h-[78%] rounded-[42%] border-2 border-dashed border-white/55 opacity-90 shadow-[0_0_6px_rgba(0,0,0,0.6)]"
            aria-hidden
          />
        </div>
        <div className={`absolute inset-0 pointer-events-none ${stats.lastFaceDetected ? 'bg-emerald-500/10' : 'bg-red-500/25 animate-pulse'}`} />
        <div className="absolute top-1 left-1.5 flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[8px] text-white/60 font-black uppercase">Live</span>
        </div>
        {!stats.lastFaceDetected && (
          <div className="absolute bottom-0.5 left-0 right-0 text-center px-0.5">
            <span className="text-[6px] leading-tight text-amber-200 font-black bg-black/70 px-1 py-0.5 rounded block">
              Căn mặt vào oval
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col pr-3">
        <div className="flex items-center gap-2">
           <ShieldCheck size={14} className="text-blue-400" />
           <span className="text-xs text-white/50 uppercase font-black tracking-wider">Giám sát bài thi</span>
        </div>
        <div className="flex flex-col gap-0.5 mt-1.5 font-mono">
           {stats.cameraStatus === 'denied' && (
             <span className="text-[9px] font-bold text-red-400 leading-tight">
               Camera bị chặn — cho phép truy cập camera và tải lại trang.
             </span>
           )}
           {stats.cameraStatus === 'loading' && (
             <span className="text-[9px] font-bold text-amber-200/90 leading-tight">Đang bật camera…</span>
           )}
           <span className="text-[10px] font-bold text-white/70 leading-tight">
             Khung hình:{' '}
             <span className={stats.lastFaceDetected ? 'text-emerald-400' : 'text-amber-300'}>
               {stats.lastFaceDetected ? 'đạt' : 'chưa đạt'}
             </span>
           </span>
           <div className="flex items-center gap-4">
             <span className="text-xs font-bold text-white" title={`Số lần kiểm tra liên tiếp không thấy mặt (${CONFIG.MAX_CONSECUTIVE_NO_FACE} = hủy bài)`}>
               Cảnh báo cam:{' '}
               <span className={(stats.consecutiveNoFace || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                 {stats.consecutiveNoFace || 0}/{CONFIG.MAX_CONSECUTIVE_NO_FACE}
               </span>
             </span>
             <span className="text-xs font-bold text-white">
               Tab:{' '}
               <span className={stats.tabWarnings > 0 ? 'text-orange-400' : 'text-emerald-400'}>{stats.tabWarnings}/2</span>
             </span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMonitor;
