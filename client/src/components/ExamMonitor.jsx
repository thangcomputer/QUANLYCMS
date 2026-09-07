import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { PROCTOR_CONFIG as CONFIG } from '../utils/proctor/config.js';
import {
  drawMirroredVideoFrame,
  evaluateFacePresence,
  getValidatedFrameFaces,
  frameLooksLikeLensBlocked,
  measureOvalBrightness,
  eyesVisibleFromFace,
  heuristicEyesInFrame,
  faceLookingStraightAtScreen,
  heuristicLookingStraight,
  sampleLumaGrid,
  detectMotionFromGrids,
  faceBoxInProctorOval,
} from '../utils/proctor/vision.js';
import {
  openProctorCamera,
  stopStream,
  waitForVideoFrames,
  getTrackHealth,
  createFpsTracker,
  mapGetUserMediaError,
} from '../utils/proctor/cameraHealth.js';
import { createRiskEngine, createConfirmTracker } from '../utils/proctor/riskEngine.js';
import { createProctorEventLog, resolveProctorUiStatus } from '../utils/proctor/eventLog.js';
import { playExamWarningSound, unlockAudio } from '../utils/sound';
import { proctorAPI, resolveMediaUrl } from '../services/api.js';

function readStoredFaceViolations(persistKey, initialCount = 0) {
  let fromLs = 0;
  if (persistKey) {
    try {
      fromLs = parseInt(localStorage.getItem(persistKey) || '0', 10) || 0;
    } catch { /* ignore */ }
  }
  const fromServer = Number(initialCount) || 0;
  return Math.min(CONFIG.MAX_FACE_VIOLATIONS, Math.max(0, fromLs, fromServer));
}

function writeStoredFaceViolations(persistKey, count) {
  if (!persistKey) return;
  try {
    localStorage.setItem(persistKey, String(count));
  } catch { /* ignore */ }
}

const STATUS_DOT = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-300',
  orange: 'bg-orange-400',
  red: 'bg-red-500',
};

const ExamMonitor = forwardRef(({
  isActive,
  onViolate,
  requireWebcam = true,
  enableTabGuard = true,
  /** Số lần rời màn hình thi trước khi hủy bài (1 = rớt ngay lần đầu). */
  maxTabWarnings = CONFIG.MAX_TAB_WARNINGS,
  warningSoundUrl = '',
  persistKey = null,
  initialFaceViolations = 0,
  onFaceViolationChange = null,
  sessionId = '',
  examType = 'exam',
  enableAudit = true,
}, ref) => {
  const [tabWarnings, setTabWarnings] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('loading');
  const [cameraGuide, setCameraGuide] = useState('');
  const [lastFaceDetected, setLastFaceDetected] = useState(false);
  const [lastFacePresent, setLastFacePresent] = useState(false);
  const [lastMotionDetected, setLastMotionDetected] = useState(false);
  const [lastLookingStraight, setLastLookingStraight] = useState(false);
  const [lastMultiFace, setLastMultiFace] = useState(false);
  const [lastInOval, setLastInOval] = useState(true);
  const [lastLowLight, setLastLowLight] = useState(false);
  const [lastLensBlocked, setLastLensBlocked] = useState(false);
  const [uiStatus, setUiStatus] = useState(() => resolveProctorUiStatus({ cameraStatus: 'loading', checking: true }));
  const [riskScore, setRiskScore] = useState(0);
  const [fpsEstimate, setFpsEstimate] = useState(0);
  const [warningOverlay, setWarningOverlay] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const faceViolationCountRef = useRef(readStoredFaceViolations(persistKey, initialFaceViolations));
  const tabWarningsRef = useRef(0);
  const onViolateRef = useRef(onViolate);
  const onFaceViolationChangeRef = useRef(onFaceViolationChange);
  const riskRef = useRef(createRiskEngine());
  const eventLogRef = useRef(null);
  const deviceIdRef = useRef('');
  const cameraFlapRef = useRef({ count: 0, lastLostAt: 0 });
  const lastWarnAtRef = useRef({});
  const lastMotionAtRef = useRef(Date.now());
  const monitorStartedAtRef = useRef(Date.now());
  const prevLumaGridRef = useRef(null);
  const prevFaceCenterRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const fpsTrackerRef = useRef(createFpsTracker());
  const trackersRef = useRef({
    absence: createConfirmTracker({ minFrames: CONFIG.FACE_ABSENT_MIN_FRAMES, confirmMs: CONFIG.FACE_ABSENT_CONFIRM_MS }),
    eye: createConfirmTracker({ minFrames: CONFIG.EYE_MISS_MIN_FRAMES, confirmMs: CONFIG.EYE_MISS_CONFIRM_MS }),
    gaze: createConfirmTracker({ minFrames: CONFIG.GAZE_MISS_MIN_FRAMES, confirmMs: CONFIG.GAZE_MISS_CONFIRM_MS }),
    multi: createConfirmTracker({ minFrames: CONFIG.MULTI_FACE_MIN_FRAMES, confirmMs: CONFIG.MULTI_FACE_CONFIRM_MS }),
    lens: createConfirmTracker({ minFrames: CONFIG.LENS_BLOCK_MIN_FRAMES, confirmMs: CONFIG.LENS_BLOCK_CONFIRM_MS }),
  });

  useEffect(() => { onViolateRef.current = onViolate; }, [onViolate]);
  useEffect(() => { onFaceViolationChangeRef.current = onFaceViolationChange; }, [onFaceViolationChange]);
  useEffect(() => {
    faceViolationCountRef.current = readStoredFaceViolations(persistKey, initialFaceViolations);
  }, [persistKey, initialFaceViolations, isActive]);

  useEffect(() => {
    if (!enableAudit) return undefined;
    const log = createProctorEventLog({
      sessionId: sessionId || persistKey || 'exam',
      examType,
      postEvents: async (events) => {
        try { await proctorAPI.postEvents(events); } catch { /* offline */ }
      },
    });
    eventLogRef.current = log;
    log.startAutoFlush();
    return () => {
      log.push('camera_stop', 'info', { reason: 'unmount' });
      log.stop();
      eventLogRef.current = null;
    };
  }, [enableAudit, sessionId, persistKey, examType]);

  const logEvent = useCallback((type, severity = 'info', detail = {}) => {
    eventLogRef.current?.push(type, severity, detail);
  }, []);

  const terminateExam = useCallback((reason) => {
    if (isTerminated) return;
    setIsTerminated(true);
    setWarningOverlay({ type: 'terminated', message: 'KẾT THÚC BÀI THI!', sub: reason, persistent: true });
    stopStream(streamRef.current);
    streamRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    logEvent('exam_terminate', 'critical', { reason, risk: riskRef.current.getScore() });
    onViolateRef.current?.(reason);
  }, [isTerminated, logEvent]);

  const playWarningBeep = useCallback(() => {
    unlockAudio();
    playExamWarningSound(resolveMediaUrl(warningSoundUrl) || warningSoundUrl);
  }, [warningSoundUrl]);

  const registerHardViolation = useCallback((kind, overlay) => {
    const now = Date.now();
    if (now - (lastWarnAtRef.current[kind] || 0) < CONFIG.WARN_COOLDOWN_MS) return false;

    faceViolationCountRef.current = Math.min(
      CONFIG.MAX_FACE_VIOLATIONS,
      faceViolationCountRef.current + 1,
    );
    const total = faceViolationCountRef.current;
    writeStoredFaceViolations(persistKey, total);
    onFaceViolationChangeRef.current?.(total);

    lastWarnAtRef.current[kind] = now;
    playWarningBeep();
    riskRef.current.add(kind, now);
    setRiskScore(riskRef.current.getScore(now));
    logEvent('hard_violation', 'critical', { kind, total, risk: riskRef.current.getScore(now) });

    setWarningOverlay({
      ...overlay,
      count: total,
      max: CONFIG.MAX_FACE_VIOLATIONS,
    });

    if (total >= CONFIG.MAX_FACE_VIOLATIONS) {
      terminateExam(
        `Vi phạm giám sát camera đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần (cộng dồn). Bài thi bị hủy tự động!`,
      );
    }
    return true;
  }, [persistKey, playWarningBeep, terminateExam, logEvent]);

  const softWarn = useCallback((kind, message, sub) => {
    const now = Date.now();
    if (now - (lastWarnAtRef.current[`soft_${kind}`] || 0) < CONFIG.SOFT_WARN_COOLDOWN_MS) return;
    lastWarnAtRef.current[`soft_${kind}`] = now;
    const r = riskRef.current.add(kind, now);
    setRiskScore(r.score);
    logEvent('soft_warn', 'soft', { kind, message, risk: r.score });
    if (r.hard) {
      registerHardViolation(kind, {
        type: 'camera',
        message: message || '⚠ ĐIỂM RỦI RO CAO',
        sub: sub || 'Hệ thống ghi nhận nhiều dấu hiệu bất thường.',
      });
      return;
    }
    setWarningOverlay({
      type: 'soft',
      message: message || 'Cảnh báo nhẹ',
      sub: sub || 'Hãy điều chỉnh tư thế. Chưa tính vi phạm chính thức.',
      soft: true,
    });
  }, [logEvent, registerHardViolation]);

  const confirmHard = useCallback((kind, overlay, resetFn) => {
    const ok = registerHardViolation(kind, overlay);
    if (ok && typeof resetFn === 'function') resetFn();
    return ok;
  }, [registerHardViolation]);

  useImperativeHandle(ref, () => ({
    getStats: () => ({
      cameraWarnings: faceViolationCountRef.current,
      tabWarnings: tabWarningsRef.current,
      lastFaceDetected,
      lastFacePresent,
      lastMotionDetected,
      lastLookingStraight,
      lastMultiFace,
      lastInOval,
      lastLowLight,
      lastLensBlocked,
      cameraStatus,
      consecutiveNoFace: faceViolationCountRef.current,
      faceViolationCount: faceViolationCountRef.current,
      riskScore,
      fpsEstimate,
      uiStatus,
      maxTabWarnings,
      events: eventLogRef.current?.getEvents?.() || [],
    }),
    getStream: () => streamRef.current,
    getEvents: () => eventLogRef.current?.getEvents?.() || [],
    retryCamera: () => setRetryToken((n) => n + 1),
    videoRef,
  }), [
    lastFaceDetected, lastFacePresent, lastMotionDetected, lastLookingStraight,
    lastMultiFace, lastInOval, lastLowLight, lastLensBlocked, cameraStatus,
    riskScore, fpsEstimate, uiStatus, maxTabWarnings,
  ]);

  useEffect(() => {
    if (!isActive || isTerminated) return undefined;
    if (!requireWebcam) {
      setCameraStatus('active');
      setLastFaceDetected(true);
      setLastFacePresent(true);
      setLastMotionDetected(true);
      setUiStatus(resolveProctorUiStatus({ cameraStatus: 'active', facePresent: true, inOval: true }));
      return undefined;
    }

    const already = readStoredFaceViolations(persistKey, initialFaceViolations);
    faceViolationCountRef.current = already;
    if (already >= CONFIG.MAX_FACE_VIOLATIONS) {
      terminateExam(`Đã đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần vi phạm giám sát (cộng dồn). Bài thi bị hủy!`);
      return undefined;
    }

    let isMounted = true;
    monitorStartedAtRef.current = Date.now();
    lastMotionAtRef.current = Date.now();
    prevLumaGridRef.current = null;
    prevFaceCenterRef.current = null;
    lastVideoTimeRef.current = -1;
    fpsTrackerRef.current.reset();
    Object.values(trackersRef.current).forEach((t) => t.reset());

    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.DETECT_W;
    canvas.height = CONFIG.DETECT_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let faceDetector = null;
    if ('FaceDetector' in window) {
      try {
        faceDetector = new window.FaceDetector({ maxDetectedFaces: 4, fastMode: true });
      } catch {
        try { faceDetector = new window.FaceDetector({ maxDetectedFaces: 4 }); } catch { faceDetector = null; }
      }
    }

    const onTrackEnded = () => {
      if (!isMounted) return;
      setCameraStatus('lost');
      setCameraGuide('Camera mất tín hiệu. Bấm Thử lại để mở lại.');
      logEvent('camera_lost', 'warn', {});
      const now = Date.now();
      if (now - cameraFlapRef.current.lastLostAt < 15000) {
        cameraFlapRef.current.count += 1;
        riskRef.current.add('camera_flap', now);
        if (cameraFlapRef.current.count >= 3) {
          softWarn('camera_flap', '⚠ CAMERA BẬT/TẮT LIÊN TỤC', 'Hệ thống ghi nhận camera mất tín hiệu nhiều lần.');
        }
      } else {
        cameraFlapRef.current.count = 1;
      }
      cameraFlapRef.current.lastLostAt = now;
      riskRef.current.add('camera_lost', now);
      setRiskScore(riskRef.current.getScore(now));
    };

    const setupCamera = async () => {
      try {
        setCameraStatus('loading');
        setCameraGuide('Đang xin quyền camera…');
        const stream = await openProctorCamera();
        if (!isMounted) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        track?.addEventListener('ended', onTrackEnded);
        const health = getTrackHealth(stream);
        if (health.deviceId) {
          if (deviceIdRef.current && deviceIdRef.current !== health.deviceId) {
            logEvent('device_change', 'warn', {
              from: deviceIdRef.current.slice(0, 8),
              to: health.deviceId.slice(0, 8),
            });
            softWarn('device_change', '⚠ ĐỔI THIẾT BỊ CAMERA', 'Phát hiện thay đổi camera giữa buổi thi.');
          }
          deviceIdRef.current = health.deviceId;
        }
        if (health.lowRes) {
          logEvent('low_res', 'soft', { width: health.width, height: health.height });
          riskRef.current.add('low_res');
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.setAttribute('playsinline', '');
          videoRef.current.play().catch(() => {});
        }
        const ready = await waitForVideoFrames(videoRef.current);
        if (!isMounted) return;
        if (!ready) {
          setCameraStatus('error');
          setCameraGuide('Camera không gửi khung hình. Thử lại hoặc kiểm tra driver webcam.');
          logEvent('camera_lost', 'warn', { reason: 'no_frames' });
          return;
        }

        setCameraStatus('active');
        setCameraGuide('');
        logEvent('camera_start', 'info', {
          width: health.width,
          height: health.height,
          hasFaceDetector: Boolean(faceDetector),
        });

        const { absence, eye, gaze, multi, lens } = trackersRef.current;

        const runSample = async () => {
          if (!isMounted || isTerminated || !videoRef.current || videoRef.current.readyState < 2) return;
          const vid = videoRef.current;
          if (!vid.videoWidth) return;
          if (document.hidden) return;

          const trackHealth = getTrackHealth(streamRef.current);
          if (!trackHealth.ok) {
            setCameraStatus('lost');
            setCameraGuide(trackHealth.message);
            return;
          }

          try {
            if (vid.currentTime !== lastVideoTimeRef.current) {
              lastVideoTimeRef.current = vid.currentTime;
              fpsTrackerRef.current.tick();
              const fps = fpsTrackerRef.current.getFps();
              setFpsEstimate(Math.round(fps * 10) / 10);
              if (fps > 0 && fps < CONFIG.MIN_STABLE_FPS) {
                riskRef.current.add('low_fps');
              }
            }

            drawMirroredVideoFrame(ctx, vid, CONFIG.DETECT_W, CONFIG.DETECT_H);
            const frame = ctx.getImageData(0, 0, CONFIG.DETECT_W, CONFIG.DETECT_H);
            const now = Date.now();
            const w = CONFIG.DETECT_W;
            const h = CONFIG.DETECT_H;

            const lensBlocked = frameLooksLikeLensBlocked(frame, w, h);
            const brightness = measureOvalBrightness(frame, w, h);
            const lowLight = brightness > 0 && brightness < CONFIG.LOW_LIGHT_AVG_L;

            let faces = null;
            if (faceDetector) {
              try { faces = await faceDetector.detect(canvas); } catch { faces = null; }
            }

            const frameFaces = getValidatedFrameFaces(faces, frame, w, h);
            const multiFace = frameFaces.length >= 2;
            const presence = evaluateFacePresence(frame, faces, w, h);
            let facePresent = presence.present;
            const ovalFaces = presence.ovalFaces;
            let eyesVisible = false;
            let lookingStraight = false;
            let inOval = ovalFaces.length > 0;
            let faceMoved = false;

            if (ovalFaces.length > 0) {
              eyesVisible = ovalFaces.some((f) => eyesVisibleFromFace(f, w, h));
              lookingStraight = ovalFaces.some((f) => faceLookingStraightAtScreen(f, w, h));
              const box = ovalFaces[0]?.boundingBox;
              if (box) {
                const cx = (box.left + box.width / 2) / w;
                const cy = (box.top + box.height / 2) / h;
                const prev = prevFaceCenterRef.current;
                if (prev && (Math.abs(cx - prev.cx) > 0.01 || Math.abs(cy - prev.cy) > 0.01)) faceMoved = true;
                prevFaceCenterRef.current = { cx, cy };
              }
            } else if (facePresent) {
              inOval = false;
              eyesVisible = heuristicEyesInFrame(frame, w, h);
              lookingStraight = heuristicLookingStraight(frame, w, h);
              prevFaceCenterRef.current = null;
            } else {
              prevFaceCenterRef.current = null;
            }

            if (!inOval && frameFaces.length === 1 && frameFaces[0]?.boundingBox) {
              inOval = faceBoxInProctorOval(frameFaces[0].boundingBox, w, h);
            }

            if (lensBlocked) {
              facePresent = false;
              eyesVisible = false;
              lookingStraight = false;
            }

            const lumaGrid = sampleLumaGrid(frame, w, h);
            const pixelMotion = detectMotionFromGrids(prevLumaGridRef.current, lumaGrid);
            prevLumaGridRef.current = lumaGrid;
            if (pixelMotion || faceMoved) lastMotionAtRef.current = now;

            setLastFacePresent(facePresent);
            setLastFaceDetected(eyesVisible);
            setLastLookingStraight(lookingStraight);
            setLastMultiFace(multiFace);
            setLastInOval(inOval);
            setLastLowLight(lowLight);
            setLastLensBlocked(lensBlocked);
            setLastMotionDetected(now - lastMotionAtRef.current < CONFIG.MOTION_STALE_MS);
            setRiskScore(riskRef.current.getScore(now));
            setUiStatus(resolveProctorUiStatus({
              cameraStatus: 'active',
              facePresent,
              multiFace,
              inOval,
              lowLight,
              lensBlocked,
              checking: false,
            }));

            const lensC = lens.tick(lensBlocked, now);
            if (lensC.confirmed) {
              logEvent('lens_blocked', 'warn', { durationMs: lensC.durationMs });
              confirmHard('lens_blocked', {
                type: 'camera',
                message: '🚫 CAMERA BỊ CHE!',
                sub: `Bỏ vật cản trước ống kính. Lỗi cộng dồn — đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần sẽ hủy bài.`,
              }, () => lens.reset());
            }

            const multiC = multi.tick(multiFace && !lensBlocked, now);
            if (multiC.confirmed) {
              logEvent('multi_face', 'warn', { count: frameFaces.length });
              confirmHard('multi_face', {
                type: 'camera',
                message: '🚫 PHÁT HIỆN NHIỀU KHUÔN MẶT!',
                sub: `Chỉ một người trong khung hình. Lỗi cộng dồn — đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần sẽ hủy bài.`,
              }, () => multi.reset());
            }

            const absentC = absence.tick(!facePresent && !lensBlocked, now);
            if (absentC.confirmed) {
              logEvent('face_absent', 'warn', { durationMs: absentC.durationMs });
              confirmHard('face_absent', {
                type: 'camera',
                message: '🚫 KHÔNG THẤY KHUÔN MẶT!',
                sub: `Đưa mặt vào giữa vòng oval. Mất mặt > ${Math.round(CONFIG.FACE_ABSENT_CONFIRM_MS / 1000)}s.`,
              }, () => absence.reset());
            } else if (facePresent) {
              absence.reset();
            }

            if (facePresent && !lensBlocked) {
              const eyeC = eye.tick(!eyesVisible, now);
              if (eyeC.confirmed) {
                logEvent('eye_miss', 'warn', { durationMs: eyeC.durationMs });
                confirmHard('eye_miss', {
                  type: 'camera',
                  message: '👁 KHÔNG THẤY MẮT TRONG KHUNG!',
                  sub: `Nhìn thẳng camera, không che mặt. Lỗi cộng dồn — đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần sẽ hủy bài.`,
                }, () => eye.reset());
              } else if (eyesVisible) {
                eye.reset();
              }

              const gazeC = gaze.tick(eyesVisible && !lookingStraight, now);
              if (gazeC.confirmed) {
                logEvent('gaze_off', 'soft', { durationMs: gazeC.durationMs });
                const r = riskRef.current.add('gaze_off', now);
                setRiskScore(r.score);
                if (r.hard) {
                  confirmHard('gaze_off', {
                    type: 'camera',
                    message: '⚠ MẶT KHÔNG NHÌN THẲNG MÀN HÌNH!',
                    sub: `Quay mặt vào giữa màn hình. Lỗi cộng dồn — đủ ${CONFIG.MAX_FACE_VIOLATIONS} lần sẽ hủy bài.`,
                  }, () => gaze.reset());
                } else {
                  softWarn('gaze_off', '🟠 Khuôn mặt chưa nhìn thẳng', 'Hãy nhìn vào màn hình / vòng oval.');
                  gaze.reset();
                }
              } else if (lookingStraight) {
                gaze.reset();
              }
            } else {
              eye.reset();
              gaze.reset();
            }

            if (lowLight && facePresent) {
              softWarn('low_light', '🟠 Ánh sáng yếu', 'Ngồi gần nguồn sáng hơn để nhận diện ổn định.');
            }

            const sinceStart = now - monitorStartedAtRef.current;
            const sinceMotion = now - lastMotionAtRef.current;
            if (facePresent && sinceStart > CONFIG.MOTION_GRACE_MS && sinceMotion >= CONFIG.MOTION_STALE_MS) {
              logEvent('motion_stale', 'warn', { sinceMotion });
              confirmHard('motion_stale', {
                type: 'camera',
                message: '⚠ KHÔNG PHÁT HIỆN CHUYỂN ĐỘNG!',
                sub: `Không có chuyển động trong ${Math.round(CONFIG.MOTION_STALE_MS / 1000)}s. Có thể rời chỗ hoặc dùng ảnh tĩnh.`,
              }, () => { lastMotionAtRef.current = now; });
            }
          } catch (e) {
            console.error('ExamMonitor: sample error', e);
          }
        };

        await new Promise((r) => setTimeout(r, 280));
        await runSample();
        intervalRef.current = setInterval(runSample, CONFIG.SAMPLE_INTERVAL_MS);
      } catch (err) {
        const mapped = mapGetUserMediaError(err);
        console.error('ExamMonitor: Camera access denied', err);
        setCameraStatus(mapped.code === 'denied' ? 'denied' : 'error');
        setCameraGuide(`${mapped.message} ${mapped.guide}`);
        setLastFaceDetected(true);
        setLastMotionDetected(true);
        logEvent('camera_denied', 'critical', { code: mapped.code });
        setUiStatus(resolveProctorUiStatus({ cameraStatus: 'denied' }));
      }
    };

    setupCamera();
    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [
    isActive, isTerminated, requireWebcam, terminateExam, persistKey, initialFaceViolations,
    confirmHard, softWarn, logEvent, retryToken,
  ]);

  useEffect(() => {
    if (!isActive || isTerminated || !enableTabGuard) return undefined;
    tabWarningsRef.current = 0;
    setTabWarnings(0);

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      tabWarningsRef.current += 1;
      setTabWarnings(tabWarningsRef.current);
      const w = tabWarningsRef.current;
      playWarningBeep();
      riskRef.current.add('tab_blur');
      setRiskScore(riskRef.current.getScore());
      logEvent('tab_blur', 'warn', { count: w });
      const cap = Number.isFinite(maxTabWarnings) && maxTabWarnings > 0
        ? maxTabWarnings
        : CONFIG.MAX_TAB_WARNINGS;
      if (w >= cap) {
        terminateExam(
          cap <= 1
            ? 'Chuyển tab hoặc rời khỏi màn hình thi. Bài thi bị hủy tự động!'
            : `Chuyển tab hoặc rời khỏi màn hình thi quá ${cap} lần. Bài thi bị hủy tự động!`,
        );
      } else {
        setWarningOverlay({
          type: 'tab',
          message: 'CẢNH BÁO CHUYỂN TAB!',
          sub: 'Hệ thống phát hiện bạn vừa rời khỏi màn hình thi. Nếu tiếp tục vi phạm nốt lần nữa, bài thi sẽ tự động HỦY.',
          count: w,
          max: cap,
        });
      }
    };

    const handleBlur = () => {
      riskRef.current.add('tab_blur');
      logEvent('window_blur', 'soft', {});
    };
    const handleOffline = () => {
      riskRef.current.add('network_offline');
      setRiskScore(riskRef.current.getScore());
      logEvent('network_offline', 'warn', {});
      softWarn('network_offline', '⚠ MẤT KẾT NỐI MẠNG', 'Kiểm tra mạng. Sự kiện đã được ghi nhận.');
    };
    const handleOnline = () => logEvent('network_online', 'info', {});

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [isActive, isTerminated, enableTabGuard, maxTabWarnings, terminateExam, playWarningBeep, logEvent, softWarn]);

  if (!isActive && !warningOverlay) return null;

  const warningPortal = warningOverlay ? createPortal(
    <div data-exam-warning-overlay className="fixed inset-0 z-[200000] flex items-center justify-center bg-red-950/90 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-300">
      <div className={`bg-white rounded-[40px] shadow-[0_32px_120px_-15px_rgba(220,38,38,0.5)] w-full max-w-sm overflow-hidden border-t-[12px] ${warningOverlay.soft ? 'border-amber-500' : 'border-red-600'} animate-in zoom-in duration-500 scale-100`}>
        <div className="p-10 text-center space-y-6">
          <div className={`w-24 h-24 rounded-[35%] flex items-center justify-center mx-auto shadow-2xl ${warningOverlay.type === 'tab' ? 'bg-orange-100 text-orange-600' : warningOverlay.soft ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'} animate-bounce`}>
            <AlertTriangle size={48} />
          </div>
          <div>
            <h2 className="text-gray-900 font-extrabold text-3xl uppercase tracking-tighter leading-none">{warningOverlay.message}</h2>
            <p className="text-gray-400 font-bold mt-3 text-sm leading-relaxed">{warningOverlay.sub}</p>
          </div>
          {warningOverlay.count != null && (
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Mức độ vi phạm</span>
                <span className="text-sm font-black text-red-600">{warningOverlay.count}/{warningOverlay.max}</span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden border border-gray-200 p-1">
                <div className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-1000" style={{ width: `${(warningOverlay.count / warningOverlay.max) * 100}%` }} />
              </div>
            </div>
          )}
          {!warningOverlay.persistent ? (
            <button type="button" onClick={() => setWarningOverlay(null)} className="w-full py-5 bg-gray-900 text-white font-black rounded-3xl hover:bg-black transition-all text-lg">
              TÔI ĐÃ HIỂU, TIẾP TỤC THI
            </button>
          ) : (
            <div className="pt-4">
              <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  const showCameraRetry = cameraStatus === 'denied' || cameraStatus === 'error' || cameraStatus === 'lost';

  return (
    <>
      {isActive && (
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
      )}
      {isActive && showCameraRetry && createPortal(
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200001] max-w-md w-[92%] rounded-2xl border border-red-400/40 bg-slate-950/95 text-white p-4 shadow-2xl">
          <p className="text-sm font-bold text-red-300">{cameraGuide || 'Camera gặp sự cố.'}</p>
          <button
            type="button"
            onClick={() => {
              logEvent('camera_retry', 'info', {});
              setRetryToken((n) => n + 1);
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-black"
          >
            <RefreshCw size={16} /> Thử lại camera
          </button>
        </div>,
        document.body,
      )}
      {warningPortal}
    </>
  );
});

export const CameraHeaderPanel = ({ monitorRef, variant = 'default' }) => {
  const isLarge = variant === 'large';
  const isCompact = variant === 'compact';
  const [stats, setStats] = useState({
    cameraWarnings: 0,
    tabWarnings: 0,
    lastFaceDetected: true,
    lastFacePresent: true,
    lastMotionDetected: true,
    lastMultiFace: false,
    lastInOval: true,
    lastLowLight: false,
    lastLensBlocked: false,
    cameraStatus: 'loading',
    consecutiveNoFace: 0,
    riskScore: 0,
    fpsEstimate: 0,
    uiStatus: resolveProctorUiStatus({ cameraStatus: 'loading', checking: true }),
  });
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const syncPreview = () => {
      const mon = monitorRef.current;
      const prev = previewVideoRef.current;
      if (!mon || !prev) return;
      const stream = typeof mon.getStream === 'function' ? mon.getStream() : null;
      const monitorVideo = mon.videoRef?.current;
      const source = stream || monitorVideo?.srcObject;
      if (source && prev.srcObject !== source) {
        prev.srcObject = source;
        prev.muted = true;
        prev.setAttribute('playsinline', '');
        prev.play().catch(() => {});
      }
    };
    const t = setInterval(() => {
      if (monitorRef.current) {
        setStats(monitorRef.current.getStats());
        syncPreview();
      }
    }, 400);
    return () => clearInterval(t);
  }, [monitorRef]);

  const ui = stats.uiStatus || resolveProctorUiStatus({
    cameraStatus: stats.cameraStatus,
    facePresent: stats.lastFacePresent,
    multiFace: stats.lastMultiFace,
    inOval: stats.lastInOval,
    lowLight: stats.lastLowLight,
    lensBlocked: stats.lastLensBlocked,
  });
  const dot = STATUS_DOT[ui.level] || STATUS_DOT.yellow;
  const levelEmoji = ui.level === 'green' ? '🟢' : ui.level === 'yellow' ? '🟡' : ui.level === 'orange' ? '🟠' : '🔴';

  return (
    <div
      className={`backdrop-blur-xl shadow-2xl min-w-0 max-w-full ${
        isLarge
          ? 'flex flex-col gap-1.5 rounded-xl border border-white/15 bg-gradient-to-br from-slate-800/95 to-slate-950/95 p-2 md:gap-2 md:rounded-2xl md:p-2.5'
          : isCompact
            ? 'flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-1.5'
            : 'flex items-center gap-4 rounded-2xl border border-white/5 bg-slate-900/90 p-2.5'
      }`}
    >
      <div
        className={`relative bg-black/40 overflow-hidden border border-white/10 rounded-lg ${
          isLarge
            ? 'block aspect-[5/3] w-full max-h-[4.75rem] sm:max-h-[5.25rem] md:max-h-24'
            : isCompact
              ? 'block h-11 w-16 shrink-0'
              : 'block h-12 w-[4.5rem] shrink-0 sm:h-14 sm:w-20'
        }`}
      >
        <video ref={previewVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        <div className="absolute inset-0 flex items-start justify-center pt-0.5 pointer-events-none">
          <div className="w-[58%] aspect-[3/4] max-h-[78%] rounded-[42%] border-2 border-dashed border-white/55 opacity-90" aria-hidden />
        </div>
        <div className={`absolute inset-0 pointer-events-none ${stats.lastFacePresent && stats.lastFaceDetected && !stats.lastMultiFace ? 'bg-emerald-500/10' : 'bg-red-500/25 animate-pulse'}`} />
        <div className="absolute top-1 left-1.5 flex items-center gap-1">
          <div className={`w-1.5 h-1.5 ${dot} rounded-full animate-pulse`} />
          <span className="text-white/60 font-black uppercase text-xs cms-min-text-xs">Live</span>
        </div>
        {ui.code !== 'ok' && (
          <div className="absolute bottom-0.5 left-0 right-0 text-center px-0.5">
            <span className="text-xs cms-min-text-xs leading-tight text-amber-200 font-black bg-black/70 px-1 py-0.5 rounded block animate-pulse">
              {ui.label}
            </span>
          </div>
        )}
      </div>
      <div className={`flex flex-col min-w-0 ${isLarge ? 'w-full' : isCompact ? '' : 'pr-3'}`}>
        {!isCompact && (
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-sky-400 shrink-0" />
          <span className={`text-white/60 uppercase font-black tracking-wider ${isLarge ? 'text-xs' : 'text-xs text-white/50'}`}>Giám sát bài thi</span>
        </div>
        )}
        <div className={`flex flex-col font-mono ${isLarge ? 'mt-1 gap-0' : isCompact ? 'gap-0.5' : 'mt-1.5 gap-0.5'}`}>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
            <span className={`font-bold leading-tight text-xs ${
              ui.level === 'green' ? 'text-emerald-400' : ui.level === 'yellow' ? 'text-amber-300' : ui.level === 'orange' ? 'text-orange-300' : 'text-red-400'
            }`}>
              {levelEmoji} {ui.label}
            </span>
          </div>
          {!isCompact && <span className="text-white/55 font-semibold leading-tight text-xs">{ui.guide}</span>}
          {stats.cameraStatus === 'denied' && (
            <span className="text-xs font-bold text-red-400 leading-tight">Camera bị chặn — cho phép rồi bấm Thử lại.</span>
          )}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-0 mt-0.5`}>
            {!isCompact && (
            <>
            <span className="font-bold text-white/70 text-xs">
              Rủi ro:{' '}
              <span className={(stats.riskScore || 0) >= 70 ? 'text-red-400' : (stats.riskScore || 0) >= 25 ? 'text-amber-300' : 'text-emerald-400'}>
                {Math.round(stats.riskScore || 0)}
              </span>
            </span>
            <span className="font-bold text-white/70 text-xs">
              FPS:{' '}
              <span className={(stats.fpsEstimate || 0) < 8 ? 'text-amber-300' : 'text-emerald-400'}>
                {stats.fpsEstimate ? Number(stats.fpsEstimate).toFixed(1) : '—'}
              </span>
            </span>
            </>
            )}
            <span className="font-bold text-white text-xs">
              Vi phạm:{' '}
              <span className={(stats.faceViolationCount ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                {stats.faceViolationCount ?? stats.consecutiveNoFace ?? 0}/{CONFIG.MAX_FACE_VIOLATIONS}
              </span>
            </span>
            <span className="font-bold text-white text-xs">
              Tab:{' '}
              <span className={stats.tabWarnings > 0 ? 'text-orange-400' : 'text-emerald-400'}>
                {stats.tabWarnings}/{stats.maxTabWarnings || CONFIG.MAX_TAB_WARNINGS}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMonitor;
