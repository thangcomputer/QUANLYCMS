import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, CheckCircle, Lock, ChevronRight, Clock, Award, BookOpen,
  ArrowLeft, Shield, Users, BarChart2, RefreshCw, GraduationCap,
  PlayCircle, ChevronDown, ChevronUp, Star, AlertCircle, CheckCircle2,
  FileBox, Video, Download, FileText, Timer, FileUp, UploadCloud, Link as LinkIcon, X, Crown, Gift,
} from 'lucide-react';

import { useData } from '../context/DataContext';
import { getClientEnrollments } from '../utils/enrollments';
import {
  buildExamSubjectsFromProgress,
  getExamSubjectMeta,
  getSubjectIdsForStudent,
} from '../utils/examSubjects';
import StudentExamRoom from './StudentExamRoom';
import VideoCoursePayModal from './VideoCoursePayModal';
import WelcomeCelebrationOverlay from './WelcomeCelebrationOverlay';
import api, { buildMediaDownloadUrl, downloadMediaFile, resolveMediaUrl, csrfFetch } from '../services/api';
import { useToast } from '../utils/toast';
import { htmlToPlainText, sanitizeRichHtml } from '../utils/htmlContent';
import CmsSelect from './ui/CmsSelect';
import SoftwareLinksTable from './SoftwareLinksTable';
import {
  formatLessonDisplayTitle,
  getPlayerCompletionBadgeText,
  isLessonFullyWatched,
  LMS_PLAYER_PROGRESS_BADGE_CLASS,
  normalizeLmsPlayerTab,
} from '../utils/lmsLessonUi';
import { getGradeBadgeClasses, getGradeIconClasses } from '../utils/gradeColors';
import LmsPlayerPanels, { LmsTabBar } from './lms/LmsPlayerTabs';
import LmsBrandedPlayerChrome, { preferMaxYouTubeQuality } from './lms/LmsBrandedPlayerChrome';
import {
  applyLmsVolumeToPlayer,
  readLmsMuted,
  readLmsVolume,
  writeLmsMuted,
  writeLmsVolume,
} from '../utils/lmsPlayerPrefs';
import LessonSidebarMeta from './lms/LessonSidebarMeta';
import {
  isLessonAntiSeekEnabled,
  requiredWatchSeconds,
  resolveEffectiveDuration,
  evaluateCompletionRequirement,
  isCompletionRequirementCode,
  LESSON_COMPLETION_REQUIREMENT_MESSAGE,
  PREV_LESSON_REQUIRED_CODE,
} from '../utils/antiSeekPolicy';
import { parseLmsHashQuery, clearResumePayFromHash, courseKey, courseIdAliases, readOwnedVideoCourseCache, writeOwnedVideoCourseCache } from '../utils/lmsDeepLink';
import { setLmsPlayerOpen } from '../utils/lmsPlayerOverlay';
import {
  readYouTubeDuration,
  resolveYouTubeDisplayDuration,
  syncYouTubePlaybackState,
} from '../utils/youtubeDuration';

const MOCK_COURSES = [
  {
    _id: '1', title: 'Đào tạo Giảng viên Mới', progress: 0,
    videos: [{ title: 'Giới thiệu về Thắng Tin Học', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 635 }, { title: 'Tổng quan công việc', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 920 }],
    files: [{ title: 'Quy trình giảng dạy.pdf', type: 'PDF', size: '2 MB' }, { title: 'Sổ tay Giảng viên.docx', type: 'DOCX', size: '1 MB' }],
    notices: ['Chào mừng các bạn đến với TT', 'Hãy xem hết các video trước khi nhận lớp']
  },
  {
    _id: '2', title: 'Kỹ năng Đứng lớp Chuyên sâu', progress: 45,
    videos: [{ title: 'Xử lý tình huống học viên yếu', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 2412 }],
    files: [{ title: 'Quy trình xử lý.docx', type: 'DOCX', size: '500 KB' }],
    notices: ['Nhớ nộp bài thu hoạch trước 15/4 ngay sau khi xem video']
  },
  {
    _id: '3', title: 'Khóa học Excel Nâng cao', progress: 100,
    videos: [{ title: 'Hàm logic phức tạp', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 2100 }],
    files: [{ title: 'Bài tập thực hành.xlsx', type: 'EXCEL', size: '3.5 MB' }],
    notices: []
  },
  {
    _id: '4', title: 'Bảo mật và An toàn thông tin', progress: 80,
    videos: [{ title: 'Bảo quản dữ liệu học viên', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 1210 }],
    files: [],
    notices: ['Bắt buộc hoàn thành trong tháng 4']
  }
];

const CountdownTimer = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!deadline) return;
    const calc = () => {
      const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
      const d = new Date(new Date(deadline).toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
      d.setHours(23, 59, 59, 999);
      const diff = d.getTime() - now.getTime();
      if (diff <= 0) return 'Đã hết hạn';
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      return `${days} ngày ${h} giờ ${m} phút ${s}s`;
    };
    setTimeLeft(calc());
    const intv = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(intv);
  }, [deadline]);
  if (!deadline) return <span className="text-slate-400">Không có hạn chót</span>;
  return <span className="text-orange-600 font-bold">{timeLeft}</span>;
};

const CircularProgress = ({ progress, size = 112 }) => {
  const isSmall = size < 100;
  const radius = isSmall ? 25 : 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  let strokeColor = 'text-slate-100';
  let pathColor = 'text-green-500';
  if (progress === 0) pathColor = 'text-slate-200';
  else if (progress === 100) pathColor = 'text-emerald-500';

  const viewBoxSize = isSmall ? 64 : 112;
  const center = viewBoxSize / 2;
  const strokeW = isSmall ? 4 : 6;

  return (
    <div className="relative flex items-center justify-center pt-1">
      <svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} className="transform -rotate-90">
        <circle cx={center} cy={center} r={radius} stroke="currentColor" strokeWidth={strokeW} fill="transparent" className={strokeColor} />
        <circle cx={center} cy={center} r={radius} stroke="currentColor" strokeWidth={strokeW} fill="transparent"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
          className={`${pathColor} transition-all duration-1000 ease-out`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        {progress === 100 ? (
          <CheckCircle2 size={isSmall ? 20 : 32} className="text-emerald-500" />
        ) : (
          <span className={`${isSmall ? 'text-xs pb-1 inline-block' : 'text-xl pb-1'} font-black text-slate-800 tracking-tighter`}>{progress}%</span>
        )}
      </div>
    </div>
  );
};

// ─── Helper: Gọi API training-lms ────────────────────────────────────────────
const lmsApiFetch = async (endpoint, options = {}) => {
  const token =
    localStorage.getItem('student_access_token') ||
    localStorage.getItem('teacher_access_token') ||
    localStorage.getItem('admin_access_token') ||
    (() => {
      try { return JSON.parse(localStorage.getItem('student_user') || '{}').token; } catch { return null; }
    })() ||
    (() => {
      try { return JSON.parse(localStorage.getItem('teacher_user') || '{}').token; } catch { return null; }
    })() ||
    (() => {
      try { return JSON.parse(localStorage.getItem('admin_user') || '{}').token; } catch { return null; }
    })();

  const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
  const res = await csrfFetch(`${API_BASE}/training-lms${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res.json();
};

// ─── Helper: Extract YouTube ID ──────────────────────────────────────────────
const extractYouTubeId = (url = '') => {
  if (!url) return '';
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : url.trim();
};

/** Clamp resume/seek vào [0, duration-1] — tránh start vượt độ dài thật làm YT không phát. */
const clampYtTime = (t, duration) => {
  const n = Math.max(0, Math.floor(Number(t) || 0));
  const d = Math.max(0, Math.floor(Number(duration) || 0));
  if (d <= 1) return 0;
  return Math.min(n, d - 1);
};

const resolveLessonVideoUrl = (lesson) =>
  lesson?.videoUrl || lesson?.url || lesson?.youtubeUrl || lesson?.link || '';

// ─── YOUTUBE PLAYER COMPONENT ────────────────────────────────────────────────
// Logic mới: Cho phép tua nhưng đếm giây XEM THỰC TẾ
// Mở khóa khi đã xem đủ 2/3 tổng thời lượng video
// ─── PLAYER LINH HOẠT CHO HỌC VIÊN ─────────────────────────────────────────────


const StudentVideoPlayer = ({
  videoId,
  lessonId,
  courseId,
  initialWatchedSeconds = 0,
  adminDurationSeconds = 0,
  antiSeekEnabled = true,
  lessonCompleted = false,
  onSaveProgress,
  onVideoEnded,
  onEligibilityReached,
  onWatchProgress = null,
  playerApiRef = null,
}) => {
  const yId = extractYouTubeId(videoId);
  const [isReady, setIsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [hasEnded, setHasEnded] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [displayWatched, setDisplayWatched] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTabActive, setIsTabActive] = useState(true);
  const [maxSeekableUi, setMaxSeekableUi] = useState(0);
  const [volume, setVolume] = useState(() => readLmsVolume(80));
  const [muted, setMuted] = useState(() => readLmsMuted(false));
  const [playerError, setPlayerError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ytPlaybackQuality, setYtPlaybackQuality] = useState('default');

  // Restore watched seconds: lấy max(session, server) — không để session thấp ghi đè SoT
  const bestInitial = useMemo(() => {
    if (lessonCompleted) return 0; // If already completed, restart from 0 when revisiting
    const sessionWatched = Number(sessionStorage.getItem(`student_lms_watched_${lessonId}`) || 0);
    const serverWatched = Number(initialWatchedSeconds) || 0;
    return Math.max(sessionWatched, serverWatched);
  }, [lessonId, initialWatchedSeconds, lessonCompleted]);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const intervalRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const pauseTimeoutRef = useRef(null);
  const maxPosRef = useRef(0);
  const seekGuardRef = useRef(false);
  const eligibilitySentRef = useRef(false);
  const uiTickRef = useRef(null);
  const seekUnlockedRef = useRef(false);
  const lessonCompletedRef = useRef(lessonCompleted);
  const antiSeekEnabledRef = useRef(antiSeekEnabled);
  const watchPctSentRef = useRef(-1);
  const bestInitialRef = useRef(bestInitial);
  const handleStateChangeRef = useRef(null);
  const isReadyRef = useRef(false);
  const actualWatchedRef = useRef(bestInitial);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const uiTimeRef = useRef(0);
  volumeRef.current = volume;
  mutedRef.current = muted;

  lessonCompletedRef.current = lessonCompleted;
  antiSeekEnabledRef.current = antiSeekEnabled;
  bestInitialRef.current = bestInitial;

  const effectiveDuration = resolveEffectiveDuration(adminDurationSeconds, totalDuration);
  // Server completed / đủ threshold → tua tự do (không phụ thuộc session watch thấp)
  const seekUnlocked = !antiSeekEnabled
    || lessonCompleted
    || (effectiveDuration > 0 && displayWatched >= requiredWatchSeconds(effectiveDuration) && displayWatched > 0);
  seekUnlockedRef.current = seekUnlocked;

  // Chỉ reset overlay khi đổi bài — không bật lại nút Play khi parent cập nhật tiến độ
  useEffect(() => {
    const sessionWatched = Number(sessionStorage.getItem(`student_lms_watched_${lessonId}`) || 0);
    const serverWatched = Number(initialWatchedSeconds) || 0;
    const initial = Math.max(sessionWatched, serverWatched);
    actualWatchedRef.current = initial;
    setDisplayWatched(initial);
    setHasEnded(false);
    setOverlayVisible(true);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayerError('');
    setIsReady(false);
    isReadyRef.current = false;
    eligibilitySentRef.current = !!lessonCompleted;
    watchPctSentRef.current = -1;
    const posKey = `student_lms_pos_${lessonId}`;
    const savedPos = Number(sessionStorage.getItem(posKey) || 0);
    // Completed / antiSeek off: cho tua full. Anti-seek đang học: chỉ maxPos đã xem.
    if (!antiSeekEnabled || lessonCompleted) {
      maxPosRef.current = Math.max(0, savedPos, initial, Number(totalDuration) || 0);
    } else {
      maxPosRef.current = Math.max(0, savedPos);
    }
    setMaxSeekableUi(maxPosRef.current);
    seekGuardRef.current = false;
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps -- lesson switch only

  // Khi vừa complete trên server hoặc duration YT load xong → mở seek full
  useEffect(() => {
    if (!lessonCompleted && antiSeekEnabled) return;
    const full = Number(totalDuration) || Number(effectiveDuration) || 0;
    if (full > maxPosRef.current) {
      maxPosRef.current = full;
      setMaxSeekableUi(full);
    }
  }, [lessonCompleted, antiSeekEnabled, totalDuration, effectiveDuration]);

  useEffect(() => {
    if (bestInitial > actualWatchedRef.current) {
      actualWatchedRef.current = bestInitial;
      setDisplayWatched(bestInitial);
    }
  }, [bestInitial]);

  // ── Complete khi đủ threshold 2/3 (COMPLETION ≠ SEEK) — chờ player ready ──
  useEffect(() => {
    if (!isReady || !effectiveDuration || !onEligibilityReached) return;
    if (eligibilitySentRef.current) return;
    const completion = evaluateCompletionRequirement({
      watchedSeconds: displayWatched,
      effectiveDuration,
    });
    if (completion.completionEligible && displayWatched > 0) {
      eligibilitySentRef.current = true;
      Promise.resolve(onEligibilityReached(displayWatched, totalDuration || effectiveDuration)).then(success => {
        if (success === false) {
          eligibilitySentRef.current = false; // Reset to allow retry
        }
      }).catch(() => {
        eligibilitySentRef.current = false;
      });
    }
  }, [isReady, displayWatched, effectiveDuration, totalDuration, onEligibilityReached]);

  // ── Giám sát tab ẩn (không dùng window.blur — iframe YouTube fire blur khi rê/click) ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabActive(false);
        if (playerRef.current?.pauseVideo) {
          try { playerRef.current.pauseVideo(); } catch (e) { void 0; }
        }
      } else {
        setIsTabActive(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ── Khởi tạo YouTube Iframe API — chỉ remount khi đổi bài/video (không vì completed) ──
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setPlayerError('');
    setIsReady(false);
    isReadyRef.current = false;

    const resolveResumeAt = (durationSec) => {
      const completed = lessonCompletedRef.current;
      const antiOn = antiSeekEnabledRef.current;
      // Rewatch bài đã hoàn thành: luôn từ đầu (tránh start > duration làm YT chết)
      if (completed) return 0;
      const raw = antiOn ? (maxPosRef.current || 0) : (bestInitialRef.current || 0);
      return clampYtTime(raw, durationSec);
    };

    const initPlayer = () => {
      if (cancelled) return;
      const elId = `student-yt-player-${lessonId}`;
      const host = document.getElementById(elId);
      if (!host) return;

      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }

      const ytId = extractYouTubeId(videoId);
      if (!ytId) {
        setPlayerError('Link video không hợp lệ');
        return;
      }

      const approxDur = Math.max(
        Number(adminDurationSeconds) || 0,
        Number(totalDuration) || 0,
      );
      const startAt = resolveResumeAt(approxDur);

      playerRef.current = new window.YT.Player(elId, {
        videoId: ytId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          start: startAt,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setIsReady(true);
            isReadyRef.current = true;
            setPlayerError('');
            const dur = readYouTubeDuration(event.target);
            if (dur > 0) {
              setTotalDuration((prev) => Math.max(prev, dur));
              // Sync sidebar % to real YouTube duration (fixes Admin 0s mismatch)
              onWatchProgress?.(lessonId, actualWatchedRef.current, dur);
            }
            preferMaxYouTubeQuality(event.target);
            applyLmsVolumeToPlayer(event.target, volumeRef.current, mutedRef.current);
            const resumeAt = resolveResumeAt(dur || approxDur);
            if (resumeAt > 0) {
              try {
                event.target.seekTo(resumeAt, true);
                setCurrentTime(resumeAt);
              } catch { /* ignore */ }
            }
          },
          onStateChange: (event) => {
            handleStateChangeRef.current?.(event);
          },
          onPlaybackQualityChange: (event) => {
            if (cancelled) return;
            if (event?.data) setYtPlaybackQuality(String(event.data));
          },
          onError: () => {
            setPlayerError('Không phát được video. Kiểm tra link YouTube hoặc quyền nhúng.');
            setIsReady(false);
            isReadyRef.current = false;
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { if (typeof prev === 'function') prev(); } catch { /* ignore */ }
        initPlayer();
      };
      if (!document.getElementById('yt-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
      clearInterval(autoSaveTimerRef.current);
      clearInterval(uiTickRef.current);
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      isReadyRef.current = false;
    };
  // eslint-disable-line react-hooks/exhaustive-deps -- remount only on video/lesson change
  }, [videoId, lessonId]);

  // ── Đếm giây thực tế khi PLAYING + snap seek vượt maxPos ───────────────
  const startCounting = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      try {
        const player = playerRef.current;
        const { duration: syncDur, currentTime: syncTime, rawTime: t } = syncYouTubePlaybackState(
          player,
          Math.max(Number(adminDurationSeconds) || 0, totalDuration),
        );
        if (syncDur > 0) setTotalDuration((prev) => Math.max(prev, syncDur));
        setCurrentTime(syncTime);
        uiTimeRef.current = Number(syncTime) || 0;
        const unlocked = seekUnlockedRef.current;
        if (antiSeekEnabled && !unlocked && !seekGuardRef.current) {
          if (t > maxPosRef.current + 1.25) {
            seekGuardRef.current = true;
            playerRef.current?.seekTo?.(maxPosRef.current, true);
            setTimeout(() => { seekGuardRef.current = false; }, 450);
            return;
          }
          if (t >= maxPosRef.current - 0.35) {
            maxPosRef.current = Math.max(maxPosRef.current, t);
            setMaxSeekableUi(maxPosRef.current);
            sessionStorage.setItem(`student_lms_pos_${lessonId}`, String(maxPosRef.current));
          }
        } else if (t > maxPosRef.current) {
          maxPosRef.current = t;
          setMaxSeekableUi(t);
          if (antiSeekEnabled) {
            sessionStorage.setItem(`student_lms_pos_${lessonId}`, String(t));
          }
        }
      } catch { /* ignore */ }

      if (seekGuardRef.current) return;
      actualWatchedRef.current += 1;
      setDisplayWatched(actualWatchedRef.current);
      sessionStorage.setItem(`student_lms_watched_${lessonId}`, actualWatchedRef.current);
      try {
        const player = playerRef.current;
        const dur = resolveYouTubeDisplayDuration(
          Math.max(Number(adminDurationSeconds) || 0, totalDuration),
          player,
        );
        const req = requiredWatchSeconds(resolveEffectiveDuration(adminDurationSeconds, dur)) || 1;
        // % theo full video — tránh kẹt cập nhật sau cửa ≥67% (req)
        const base = dur > 0 ? dur : Math.max(1, Math.round(req * 1.5));
        const pct = Math.min(100, Math.round((actualWatchedRef.current / base) * 100));
        if (pct !== watchPctSentRef.current) {
          watchPctSentRef.current = pct;
          onWatchProgress?.(lessonId, actualWatchedRef.current, dur);
        }
      } catch { /* ignore */ }
    }, 1000);
  }, [lessonId, antiSeekEnabled, onWatchProgress, totalDuration, adminDurationSeconds]);

  const stopCounting = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  // ── Auto-save mỗi 30 giây ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady || !lessonId || !courseId) return;
    autoSaveTimerRef.current = setInterval(() => {
      if (actualWatchedRef.current > 0 && onSaveProgress) {
        onSaveProgress(lessonId, actualWatchedRef.current);
      }
    }, 30000);
    return () => clearInterval(autoSaveTimerRef.current);
  }, [isReady, lessonId, courseId, onSaveProgress]);

  useEffect(() => {
    if (!playerApiRef) return undefined;
    playerApiRef.current = {
      getCurrentTime: () => {
        try {
          const live = syncYouTubePlaybackState(playerRef.current, totalDuration).currentTime;
          return Math.max(Number(live) || 0, Number(uiTimeRef.current) || 0);
        } catch {
          return Number(uiTimeRef.current) || 0;
        }
      },
      getDuration: () => {
        try {
          return syncYouTubePlaybackState(playerRef.current, totalDuration).duration;
        } catch {
          return Number(totalDuration) || 0;
        }
      },
    };
    return () => {
      playerApiRef.current = null;
    };
  }, [playerApiRef, isReady, lessonId, totalDuration]);

  const handleStateChange = useCallback((event) => {
    const state = event.data;
    if (state === window.YT.PlayerState.PLAYING) {
      setOverlayVisible(false);
      setIsPaused(false);
      setIsPlaying(true);
      setHasEnded(false);
      setPlayerError('');
      // Không gọi preferMaxYouTubeQuality ở đây — pause/seek mỗi PLAYING gây giật
      startCounting();
      if (!totalDuration || totalDuration === 0) {
        const dur = readYouTubeDuration(event.target);
        if (dur > 0) setTotalDuration((prev) => Math.max(prev, dur));
      }
    }
    if (state === window.YT.PlayerState.PAUSED) {
      stopCounting();
      setIsPlaying(false);
      setIsPaused(true);
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = setTimeout(() => setIsPaused(false), 1200);
    }
    if (state === window.YT.PlayerState.ENDED) {
      stopCounting();
      setIsPlaying(false);
      setHasEnded(true);
      setOverlayVisible(true);
      const { duration: finalDur, currentTime: finalTime } = syncYouTubePlaybackState(
        event.target,
        Math.max(Number(adminDurationSeconds) || 0, totalDuration),
      );
      if (finalDur > 0) setTotalDuration(finalDur);
      setCurrentTime(finalTime);
      // Đảm bảo sidebar nhận đủ 100% khi hết video
      if (finalDur > 0 && actualWatchedRef.current < finalDur) {
        actualWatchedRef.current = finalDur;
        setDisplayWatched(finalDur);
        sessionStorage.setItem(`student_lms_watched_${lessonId}`, String(finalDur));
        onWatchProgress?.(lessonId, finalDur, finalDur);
      }
      // Flush server ngay (kể cả khi bài đã completed ở cửa 67%)
      onSaveProgress?.(lessonId, actualWatchedRef.current);
      if (onVideoEnded) {
        onVideoEnded(actualWatchedRef.current, finalDur);
      }
    }
  }, [onVideoEnded, onWatchProgress, onSaveProgress, lessonId, startCounting, stopCounting, totalDuration, adminDurationSeconds]);
  handleStateChangeRef.current = handleStateChange;

  const handlePlayClick = useCallback(() => {
    if (!isReadyRef.current || !playerRef.current?.playVideo) {
      setPlayerError((prev) => prev || 'Đang tải video, thử lại sau 1–2 giây…');
      return;
    }
    try {
      playerRef.current.playVideo();
      setOverlayVisible(false);
      setPlayerError('');
    } catch {
      setPlayerError('Không phát được video. Thử tải lại trang.');
    }
  }, []);

  // Smoother progress UI while playing
  useEffect(() => {
    clearInterval(uiTickRef.current);
    if (!isPlaying) return undefined;
    uiTickRef.current = setInterval(() => {
      try {
        const player = playerRef.current;
        const { duration: syncDur, currentTime: syncTime, rawTime: t } = syncYouTubePlaybackState(
          player,
          Math.max(Number(adminDurationSeconds) || 0, totalDuration),
        );
        if (syncDur > 0) setTotalDuration((prev) => Math.max(prev, syncDur));
        setCurrentTime(syncTime);
        uiTimeRef.current = Number(syncTime) || 0;
        const unlocked = seekUnlockedRef.current;
        if (antiSeekEnabled && !unlocked && t > maxPosRef.current) {
          maxPosRef.current = t;
          setMaxSeekableUi(t);
          sessionStorage.setItem(`student_lms_pos_${lessonId}`, String(t));
        } else if ((!antiSeekEnabled || unlocked) && t > maxPosRef.current) {
          maxPosRef.current = t;
          setMaxSeekableUi(t);
        }
      } catch { /* ignore */ }
    }, 250);
    return () => clearInterval(uiTickRef.current);
  }, [isPlaying, antiSeekEnabled, lessonId, adminDurationSeconds, totalDuration]);

  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch { /* ignore */ }
  }, []);

  if (!yId) {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center rounded-2xl relative overflow-hidden group">
        <AlertCircle size={40} className="text-slate-600 mb-4" />
        <p className="text-slate-400 font-bold">Chưa có link video</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      <div
        ref={containerRef}
        className={`relative w-full h-full min-h-0 overflow-hidden bg-black shadow-lg group ${isFullscreen ? 'rounded-none' : 'lg:rounded-2xl'}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          id={`student-yt-player-${lessonId}`}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />

        <LmsBrandedPlayerChrome
          overlayVisible={overlayVisible}
          hasEnded={hasEnded}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={totalDuration}
          maxSeekable={maxSeekableUi}
          antiSeekEnabled={antiSeekEnabled}
          seekUnlocked={seekUnlocked}
          volume={volume}
          muted={muted}
          onPlay={handlePlayClick}
          onPause={() => playerRef.current?.pauseVideo?.()}
          onSeek={(t) => {
            try {
              const unlocked = seekUnlockedRef.current;
              const cap = (antiSeekEnabled && !unlocked)
                ? Math.max(maxPosRef.current, currentTime)
                : Number.POSITIVE_INFINITY;
              const capped = (antiSeekEnabled && !unlocked) ? Math.min(t, cap) : t;
              seekGuardRef.current = true;
              playerRef.current?.seekTo?.(capped, true);
              setCurrentTime(capped);
              setTimeout(() => { seekGuardRef.current = false; }, 500);
            } catch { /* ignore */ }
          }}
          onVolumeChange={(v) => {
            setVolume(v);
            setMuted(v === 0);
            writeLmsVolume(v);
            writeLmsMuted(v === 0);
            try {
              playerRef.current?.setVolume?.(v);
              if (v > 0) playerRef.current?.unMute?.();
              else playerRef.current?.mute?.();
            } catch { /* ignore */ }
          }}
          onToggleMute={() => {
            try {
              if (muted) {
                playerRef.current?.unMute?.();
                const nextVol = volume || 80;
                playerRef.current?.setVolume?.(nextVol);
                setMuted(false);
                writeLmsMuted(false);
                if (volume === 0) {
                  setVolume(80);
                  writeLmsVolume(80);
                }
              } else {
                playerRef.current?.mute?.();
                setMuted(true);
                writeLmsMuted(true);
              }
            } catch { /* ignore */ }
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          getPlayer={() => playerRef.current}
          actualPlaybackQuality={ytPlaybackQuality}
        />

        {/* INACTIVE TAB OVERLAY */}
        {!isTabActive && !overlayVisible && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 text-center bg-slate-950/95"
            onContextMenu={e => e.preventDefault()}
          >
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mb-4">
              <Lock size={28} />
            </div>
            <h3 className="text-red-400 font-black text-sm uppercase tracking-wider">Video Đã Tạm Dừng</h3>
            <p className="text-slate-400 text-xs mt-2 max-w-[240px] leading-relaxed">
              Bạn đã chuyển tab hoặc rời khỏi trang học. Vui lòng quay lại tab này để tiếp tục học.
            </p>
          </div>
        )}
        {playerError ? (
          <div className="absolute bottom-16 left-3 right-3 z-40 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-200 font-semibold text-center">
            {playerError}
          </div>
        ) : null}
        {!isReady && !playerError && overlayVisible ? (
          <div className="absolute top-3 right-3 z-40 text-[10px] font-bold uppercase tracking-wider text-white/90 bg-black/50 px-2 py-1 rounded-md border border-white/15">
            Đang tải…
          </div>
        ) : null}
        {!overlayVisible && !hasEnded && effectiveDuration > 0 ? (
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap gap-1.5 justify-between pointer-events-none">
            <span className={`text-[10px] px-2 py-1 rounded-md border backdrop-blur-md font-bold ${
              antiSeekEnabled
                ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            }`}>
              {antiSeekEnabled ? 'Chống tua đang bật' : 'Tua tự do'}
            </span>
            <span className={`text-[10px] px-2 py-1 rounded-md border backdrop-blur-md font-bold ${
              lessonCompleted || seekUnlocked
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                : LMS_PLAYER_PROGRESS_BADGE_CLASS
            }`}>
              {getPlayerCompletionBadgeText({
                lessonCompleted,
                displayWatched,
                effectiveDuration,
                requiredWatchSecondsFn: requiredWatchSeconds,
              })}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};




// ─── LESSON SIDEBAR ITEM ─────────────────────────────────────────────────────
const LessonItem = ({ lesson, index, isCurrent, onClick }) => {
  const mins = lesson.duration ? Math.floor(lesson.duration / 60) : 0;
  const secs = lesson.duration ? String(lesson.duration % 60).padStart(2, '0') : '00';
  const fullyWatched = isLessonFullyWatched(lesson);

  return (
    <div
      onClick={() => lesson.isUnlocked && onClick(lesson)}
      title={!lesson.isUnlocked ? 'Hoàn thành bài trước để mở bài này' : undefined}
      className={`flex items-start gap-3 px-5 py-4 border-b border-slate-100 transition-all relative
        ${!lesson.isUnlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${isCurrent ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : fullyWatched ? 'bg-slate-50 border-l-4 border-l-transparent' : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'}
      `}
    >
      {/* Status Icon — tick chỉ khi xem đủ 100% (không dùng cửa ≥67%) */}
      <div className="mt-0.5 flex-shrink-0">
        {isCurrent ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-emerald-600 flex items-center justify-center">
            <div className="w-2 h-2 bg-emerald-600 rounded-full animate-ping" />
          </div>
        ) : fullyWatched ? (
          <CheckCircle size={18} className="text-emerald-600" />
        ) : !lesson.isUnlocked ? (
          <Lock size={16} className="text-slate-400" />
        ) : (
          <PlayCircle size={18} className="text-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className={`text-sm leading-snug line-clamp-2 ${isCurrent ? 'text-emerald-700 font-black' : fullyWatched ? 'text-slate-500 font-semibold' : 'text-slate-700 font-bold'}`}>
          {formatLessonDisplayTitle(lesson.title, index)}
        </h4>
        {lesson.duration ? (
          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 font-semibold">
            <Clock size={9} /> {mins}:{secs}
          </span>
        ) : null}
      </div>

      {fullyWatched && !isCurrent && (
        <div className="flex-shrink-0 w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center">
          <CheckCircle size={10} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
};

// ─── ADMIN PROGRESS PANEL ────────────────────────────────────────────────────
const AdminProgressPanel = ({ courseId }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await lmsApiFetch(`/admin/progress/${courseId}`);
      if (res.success) setData(res.data);
    } catch (e) { void 0 }
    setLoading(false);
  };

  useEffect(() => { if (courseId) load(); }, [courseId]);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 overflow-hidden">
      <div className="px-8 py-6 bg-gradient-to-r from-green-900 to-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <Users size={20} />
          <h3 className="font-black text-base uppercase tracking-wide">Tiến độ Giảng viên</h3>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400">Đang tải...</div>
      ) : data.length === 0 ? (
        <div className="p-10 text-center text-slate-300 text-sm">Chưa có dữ liệu</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {data.map(t => (
            <div key={t.teacherId} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-green-100 rounded-2xl flex items-center justify-center font-black text-green-700 text-sm flex-shrink-0">
                {(t.teacherName || 'GV')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 text-sm truncate">{t.teacherName}</p>
                <p className="text-[10px] text-slate-400">{t.teacherPhone}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className="text-xs font-black text-slate-700">
                    {t.completedLessons}/{t.totalLessons} bài
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${t.isCertified ? 'bg-emerald-500' : 'bg-green-500'}`}
                        style={{ width: `${t.progressPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-black text-slate-500">{t.progressPct}%</span>
                  </div>
                </div>
                {t.isCertified ? (
                  <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Award size={16} className="text-emerald-600" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Lock size={14} className="text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const StudentTrainingLMS = ({ trainingDataProp, onBack, initialMainTab = null, hideTabBar = true }) => {
  const toast = useToast();
  const trainingData = trainingDataProp || { videos: [], guides: [], files: [] };
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [courseProgressMap, setCourseProgressMap] = useState({});
  const [expandedChapters, setExpandedChapters] = useState({});
  const [courseTab, setCourseTab] = useState('overview');
  const [highlightQaId, setHighlightQaId] = useState(null);
  const deepLinkRef = useRef(null);
  const playerApiRef = useRef(null);
  const [mainTab, setMainTab] = useState(() => {
    const allowed = ['courses', 'files', 'software', 'assignments', 'exams'];
    if (initialMainTab && allowed.includes(initialMainTab)) return initialMainTab;
    return 'courses';
  }); // courses | files | software | assignments | exams
  const [localSubmissions, setLocalSubmissions] = useState({});
  const [uploadingAssignId, setUploadingAssignId] = useState(null);
  const [expandedFileDescKey, setExpandedFileDescKey] = useState(null);
  const [expandedAssignKey, setExpandedAssignKey] = useState(null);
  const [ownedCourseIds, setOwnedCourseIds] = useState(() => {
    try {
      const session = JSON.parse(localStorage.getItem('student_user') || '{}');
      return readOwnedVideoCourseCache(session.id || session._id);
    } catch {
      return new Set();
    }
  });
  const [pendingByCourseId, setPendingByCourseId] = useState({});
  const [payCheckout, setPayCheckout] = useState(null);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [videoPurchaseCelebration, setVideoPurchaseCelebration] = useState(null);
  const resumePayCourseIdRef = useRef(null);
  const [courseFilterStatus, setCourseFilterStatus] = useState('all'); // all | done | learning | new
  const [courseFilterPrice, setCourseFilterPrice] = useState('all'); // all | paid | free
  const [courseFilterSubject, setCourseFilterSubject] = useState('all');
  const [catalogInfoTab, setCatalogInfoTab] = useState('content'); // content | desc | info

  useEffect(() => {
    const allowed = ['courses', 'files', 'software', 'assignments', 'exams'];
    if (initialMainTab && allowed.includes(initialMainTab)) {
      setMainTab(initialMainTab);
      // Đổi hash sidebar (Video ↔ Tài liệu ↔ …) trên cùng LMS instance:
      // phải thoát catalog/player, không giữ selectedCourse.
      if (initialMainTab !== 'courses') {
        setSelectedCourse(null);
        setLessons([]);
        setCurrentLesson(null);
        setPayCheckout(null);
        try {
          sessionStorage.removeItem('lms_courseId');
          sessionStorage.removeItem('lms_courseTitle');
          sessionStorage.removeItem('lms_lessonId');
        } catch { /* ignore */ }
      }
    }
  }, [initialMainTab]);

  useEffect(() => {
    try {
      const tab = sessionStorage.getItem('student_lms_main_tab');
      if (tab && ['courses', 'files', 'assignments', 'exams'].includes(tab)) {
        if (!initialMainTab) setMainTab(tab);
        sessionStorage.removeItem('student_lms_main_tab');
      }
    } catch {
      /* ignore */
    }
    const { params } = parseLmsHashQuery();
    if (params.resumePay === '1' && params.courseId) {
      resumePayCourseIdRef.current = String(params.courseId);
    }
    if (params.courseId || params.lessonId || params.tab || params.qaId) {
      deepLinkRef.current = params;
      if (params.tab) setCourseTab(normalizeLmsPlayerTab(params.tab));
      if (params.qaId) setHighlightQaId(params.qaId);
      // Deep-link video/QA → luôn mở tab video; không đè menu Tài liệu/Bài tập/Điểm thi
      if (!initialMainTab) setMainTab('courses');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ bootstrap 1 lần khi mount
  }, []);

  const handleFileChange = async (assignmentObj, idx, file) => {
    if (!file) return;
    setUploadingAssignId(idx);
    try {
      const res = await api.assignments.uploadFile(file);
      if (res.success) {
        const fileUrl = res.fileUrl;
        const submitRes = await api.assignments.submit(assignmentObj._id, {
           studentId: student?.id || session?.id,
           teacherId: assignmentObj.teacherId || student?.teacherId || undefined,
           submittedFileUrl: fileUrl
        });

        if (submitRes.success) {
          setLocalSubmissions(prev => ({
            ...prev,
            [idx]: { fileName: file.name, date: new Date().toISOString() }
          }));
          toast?.success('Nộp bài thành công!');
        } else {
          toast?.error('Lỗi nộp bài: ' + submitRes.message);
        }
      } else {
        toast?.error('Lỗi tải file: ' + res.message);
      }
    } catch (e) {
      toast?.error('Lỗi mạng khi tải file. Vui lòng thử lại sau.');
    }
    setUploadingAssignId(null);
  };
  const isAdmin = false; // Always false for student view

  const { students, examSubjectsCatalog } = useData();
  const session = (() => { try { return JSON.parse(localStorage.getItem('student_user') || '{}'); } catch { return {}; } })();
  const student = (students || []).find(s => s.id === session.id) || {};
  const studentCacheId = student?.id || session.id || session._id || '';

  useEffect(() => {
    if (!studentCacheId) return;
    writeOwnedVideoCourseCache(studentCacheId, ownedCourseIds);
  }, [ownedCourseIds, studentCacheId]);

  const enrollments = useMemo(() => getClientEnrollments(student), [student]);
  const examScoreSubjectIds = useMemo(
    () => getSubjectIdsForStudent(enrollments, student?.course, examSubjectsCatalog),
    [enrollments, student?.course, examSubjectsCatalog]
  );
  const examScoreRows = useMemo(
    () => buildExamSubjectsFromProgress(student?.examProgress, examScoreSubjectIds).map((sub) => ({
      ...sub,
      label: getExamSubjectMeta(sub.id, examSubjectsCatalog).label,
    })),
    [student?.examProgress, examScoreSubjectIds, examSubjectsCatalog]
  );

  /** Bài tập chưa nộp — đã nộp/chấm điểm thì không tính badge tab */
  const pendingAssignmentCount = useMemo(() => {
    const list = trainingData?.assignments || [];
    return list.filter((a, idx) => !a.mySubmission && !localSubmissions[idx]).length;
  }, [trainingData?.assignments, localSubmissions]);

  // Lấy tiến độ khóa học từ server (TrainingProgress) — không dùng localStorage SoT
  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await lmsApiFetch('/progress/me');
        if (cancelled || !res?.success || !res.data) return;
        setCourseProgressMap(res.data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, mainTab, selectedCourse, courses]);

  // Sync with trainingData from props
  useEffect(() => {
    if (trainingData && trainingData.videos) {
      setCourses(trainingData.videos);
      setLoading(false);
    }
  }, [trainingData]);

  const refreshVideoPurchases = useCallback(async () => {
    try {
      const res = await api.trainingLms.listVideoPurchases();
      if (!res?.success) return;
      const paidIds = new Set();
      (res.data || [])
        .filter((p) => p.status === 'paid')
        .forEach((p) => {
          const cid = String(p.courseId);
          paidIds.add(cid);
          courses.forEach((c) => {
            const aliases = courseIdAliases(c);
            if (aliases.some((a) => a === cid || cid === courseKey(c))) {
              aliases.forEach((a) => paidIds.add(a));
            }
          });
        });
      setOwnedCourseIds((prev) => {
        const merged = new Set(prev);
        paidIds.forEach((id) => merged.add(id));
        return merged;
      });
      const pending = {};
      (res.data || []).forEach((p) => {
        const cid = String(p.courseId);
        if (p.status === 'pending' && !paidIds.has(cid)) pending[cid] = p;
      });
      setPendingByCourseId(pending);
    } catch { /* ignore */ }
    finally {
      setPurchasesLoaded(true);
    }
  }, [courses]);

  useEffect(() => {
    refreshVideoPurchases();
  }, [refreshVideoPurchases]);

  // Quay lại danh sách khóa → refresh trạng thái đã mua (nút "Vào học")
  useEffect(() => {
    if (mainTab === 'courses' && !selectedCourse) {
      refreshVideoPurchases();
    }
  }, [mainTab, selectedCourse, refreshVideoPurchases]);

  // Deep-link: mở đúng khóa từ hash (?courseId=)
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (!dl?.courseId || !courses.length || selectedCourse) return;
    const hit = courses.find((c) => String(c._id || c.id) === String(dl.courseId));
    if (hit) setSelectedCourse(hit);
  }, [courses, selectedCourse]);

  // Deep-link: mở đúng bài + tab qa sau khi lessons load
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (!dl || !lessons.length) return;
    if (dl.lessonId) {
      const hit = lessons.find((l) => String(l._id) === String(dl.lessonId) && l.isUnlocked);
      if (hit) setCurrentLesson(hit);
    }
    if (dl.tab) setCourseTab(normalizeLmsPlayerTab(dl.tab));
    if (dl.qaId) setHighlightQaId(dl.qaId);
    deepLinkRef.current = null;
  }, [lessons]);

  // Load lessons khi chọn khoá học — ưu tiên API server (completed/unlocked)
  useEffect(() => {
    if (!selectedCourse) return;
    const courseId = courseKey(selectedCourse);
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await lmsApiFetch(`/courses/${courseId}/lessons`);
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          setLessons(res.data);
          if (res.meta?.owned && courseId) {
            setOwnedCourseIds((prev) => new Set(prev).add(String(courseId)));
            setPendingByCourseId((prev) => {
              if (!prev[String(courseId)]) return prev;
              const next = { ...prev };
              delete next[String(courseId)];
              return next;
            });
          }
          const chapters = {};
          res.data.forEach((l) => { chapters[l.chapterTitle || 'Danh mục'] = true; });
          setExpandedChapters(chapters);
          const savedLessonId = sessionStorage.getItem('lms_lessonId');
          const firstActive = (savedLessonId && res.data.find((l) => String(l._id) === savedLessonId && l.isUnlocked))
            || res.data.find((l) => l.isUnlocked && !l.isCompleted)
            || res.data[0];
          setCurrentLesson(firstActive);
        } else {
          // Fallback cấu trúc từ props — completed chỉ từ server khi có API
          let list = [];
          (selectedCourse.chapters || [{ title: 'Danh mục', lessons: selectedCourse.lessons || selectedCourse.videos || [] }]).forEach((chap) => {
            (chap.lessons || []).forEach((l) => {
              const lId = l.id || l._id || `${courseId}-${list.length}`;
              // Offline fallback: chỉ mở bài 1 — không tin UI state để mở tuần tự
              list.push({
                ...l,
                chapterTitle: chap.title,
                isUnlocked: list.length === 0,
                isCompleted: false,
                _id: lId,
              });
            });
          });
          setLessons(list);
          const chapters = {};
          list.forEach((l) => { chapters[l.chapterTitle || 'Danh mục'] = true; });
          setExpandedChapters(chapters);
          setCurrentLesson(list.find((l) => l.isUnlocked) || list[0]);
        }
      } catch {
        /* keep prior lessons */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCourse]);

  // ── Persist session khi reload (Issue #3) ──
  // Lưu courseId đang mở vào sessionStorage
  useEffect(() => {
    if (selectedCourse?._id || selectedCourse?.id) {
      sessionStorage.setItem('lms_courseId', courseKey(selectedCourse));
      sessionStorage.setItem('lms_courseTitle', selectedCourse.title || '');
    } else {
      sessionStorage.removeItem('lms_courseId');
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (currentLesson?._id) {
      sessionStorage.setItem('lms_lessonId', currentLesson._id);
    }
  }, [currentLesson]);

  const fetchLessons = async (courseId) => {
    setLoading(true);
    try {
      const res = await lmsApiFetch(`/courses/${courseId}/lessons`);
      if (res?.success && Array.isArray(res.data)) {
        setLessons(res.data);
        if (res.meta?.owned && courseId) {
          setOwnedCourseIds((prev) => new Set(prev).add(String(courseId)));
          setPendingByCourseId((prev) => {
            if (!prev[String(courseId)]) return prev;
            const next = { ...prev };
            delete next[String(courseId)];
            return next;
          });
        }
        const savedLessonId = sessionStorage.getItem('lms_lessonId');
        const firstActive = (savedLessonId && res.data.find(l => String(l._id) === savedLessonId && l.isUnlocked))
          || res.data.find(l => l.isUnlocked && !l.isCompleted)
          || res.data[0];
        setCurrentLesson(firstActive);
        const chapters = {};
        res.data.forEach(l => { chapters[l.chapterTitle || 'Chương 1'] = true; });
        setExpandedChapters(chapters);
      }
    } catch (e) { void 0 }
    setLoading(false);
  };

  // Restore session khi courses đã load
  useEffect(() => {
    const savedCourseId = sessionStorage.getItem('lms_courseId');
    if (!savedCourseId || selectedCourse) return; // Đã có course rồi
    if (courses.length === 0) return;
    const course = courses.find((c) => courseKey(c) === String(savedCourseId));
    if (course) {
      setSelectedCourse(course);
      fetchLessons(courseKey(course));
    }
  }, [courses, selectedCourse]);

  // Complete chỉ khi SERVER xác nhận — flush progress trước, gửi videoDuration để FE/BE cùng threshold
  const completeLessonOnServer = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse) return { success: false };
    const lessonId = currentLesson._id || currentLesson.id;
    const courseId = selectedCourse._id || selectedCourse.id;
    const videoDuration = Math.floor(Number(totalDur) || Number(playerApiRef.current?.getDuration?.()) || 0);
    const payload = {
      lessonId,
      courseId,
      watchedSeconds: actualWatched,
      videoDuration,
    };
    try {
      await lmsApiFetch('/save-watch-progress', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch { /* ignore flush errors; complete still validates */ }

    const res = await lmsApiFetch('/complete-lesson', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  }, [currentLesson, selectedCourse]);

  const handleEligibilityReached = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse) return false;
    try {
      const res = await completeLessonOnServer(actualWatched, totalDur);
      if (res?.success === false && isCompletionRequirementCode(res?.code)) {
        toast.error(res.message || LESSON_COMPLETION_REQUIREMENT_MESSAGE);
        return false;
      }
      if (res?.success === false && res?.code === PREV_LESSON_REQUIRED_CODE) {
        toast.error(res.message || 'Hoàn thành bài trước để mở bài này.');
        return false;
      }
      if (res?.success === false) {
        toast.error('Lỗi khi mở bài: ' + (res?.message || 'Không thể ghi nhận hoàn thành'));
        return false;
      }
      const courseId = selectedCourse._id || selectedCourse.id;
      await fetchLessons(courseId);
      
      try {
        const prog = await lmsApiFetch('/progress/me');
        if (prog?.success && prog.data) setCourseProgressMap(prog.data);
      } catch { /* ignore */ }
      return true;
    } catch (e) { 
      toast.error('Lỗi mạng khi ghi nhận hoàn thành');
      return false; 
    }
  }, [currentLesson, selectedCourse, toast, completeLessonOnServer, fetchLessons, setCurrentLesson]);

  // Video kết thúc
  const handleVideoEnded = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse || completing) return;

    const effDur = resolveEffectiveDuration(currentLesson?.duration, totalDur);
    const completion = evaluateCompletionRequirement({
      watchedSeconds: actualWatched,
      effectiveDuration: effDur,
    });
    if (!completion.completionEligible) {
      toast.error(LESSON_COMPLETION_REQUIREMENT_MESSAGE);
      return;
    }

    setCompleting(true);
    try {
      const res = await completeLessonOnServer(actualWatched, totalDur);
      if (res?.success === false && isCompletionRequirementCode(res?.code)) {
        toast.error(res.message || LESSON_COMPLETION_REQUIREMENT_MESSAGE);
        setCompleting(false);
        return;
      }
      if (res?.success === false && res?.code === PREV_LESSON_REQUIRED_CODE) {
        toast.error(res.message || 'Hoàn thành bài trước để mở bài này.');
        setCompleting(false);
        return;
      }
      if (res?.success === false) {
        setCompleting(false);
        return;
      }
      const courseId = selectedCourse._id || selectedCourse.id;
      const lessonsRes = await lmsApiFetch(`/courses/${courseId}/lessons`);
      if (lessonsRes?.success && Array.isArray(lessonsRes.data)) {
        const updatedLessons = lessonsRes.data;
        setLessons(updatedLessons);
        const currentIdx = updatedLessons.findIndex(l => String(l._id) === String(currentLesson._id));
        const next = updatedLessons[currentIdx + 1];
        if (next?.isUnlocked) {
          setTimeout(() => setCurrentLesson(next), 800);
        }
      }
      try {
        const prog = await lmsApiFetch('/progress/me');
        if (prog?.success && prog.data) setCourseProgressMap(prog.data);
      } catch { /* ignore */ }
    } catch (e) { void 0 }
    setCompleting(false);
  }, [currentLesson, selectedCourse, completing, toast, completeLessonOnServer]);

  // Handle lưu progress tạm thời + cập nhật % sidebar
  const patchLessonWatchLocal = useCallback((lessonId, watchedSeconds, videoDuration = 0) => {
    const apply = (lesson) => {
      if (String(lesson._id) !== String(lessonId) && String(lesson.id) !== String(lessonId)) return lesson;
      // Prefer live YouTube duration when available (Admin 0s / sai lệch)
      const eff = resolveEffectiveDuration(lesson.duration, videoDuration);
      const ytReq = requiredWatchSeconds(eff);
      const prevReq = Number(lesson.requiredSeconds ?? lesson.requiredWatchSeconds) || 0;
      // Never keep stale required=1 from API when Admin duration was 0
      const req = ytReq > 0
        ? ytReq
        : (prevReq > 1 ? prevReq : 0);
      const watched = Math.max(Number(lesson.watchedSeconds) || 0, Number(watchedSeconds) || 0);
      return {
        ...lesson,
        watchedSeconds: watched,
        requiredSeconds: req,
        requiredWatchSeconds: req,
        adminDurationSeconds: lesson.adminDurationSeconds || Number(lesson.duration) || 0,
        effectiveDurationSeconds: eff || lesson.effectiveDurationSeconds || 0,
        durationUnknown: !(eff > 0),
        completionEligible: req > 0 ? watched >= req : false,
      };
    };
    setLessons((prev) => prev.map(apply));
    setCurrentLesson((prev) => (prev ? apply(prev) : prev));
  }, []);

  const handleWatchProgress = useCallback((lessonId, watchedSeconds, videoDuration) => {
    patchLessonWatchLocal(lessonId, watchedSeconds, videoDuration);
  }, [patchLessonWatchLocal]);

  const handleSaveProgress = useCallback((lessonId, watchedSeconds) => {
    if (!selectedCourse) return;
    const videoDuration = Math.floor(Number(playerApiRef.current?.getDuration?.()) || 0);
    patchLessonWatchLocal(lessonId, watchedSeconds, videoDuration);
    lmsApiFetch('/save-watch-progress', {
      method: 'POST',
      body: JSON.stringify({
        lessonId: lessonId,
        courseId: selectedCourse._id || selectedCourse.id,
        watchedSeconds: watchedSeconds,
        videoDuration,
      }),
    }).catch(e => void 0);
  }, [selectedCourse, patchLessonWatchLocal]);

  const overallProgress = lessons.length > 0
    ? Math.round((lessons.filter(l => l.isCompleted).length / lessons.length) * 100)
    : 0;

  const courseProgressOf = useCallback((course) => {
    const id = courseKey(course);
    return Math.max(
      0,
      Math.min(
        100,
        Number(courseProgressMap[id] ?? course?.overallProgress ?? course?.progress ?? 0) || 0,
      ),
    );
  }, [courseProgressMap]);

  const courseIdAliasesMemo = useCallback((course) => courseIdAliases(course), []);

  const isCourseOwned = useCallback((course) => {
    if (!course) return false;
    const price = Math.max(0, Number(course.price) || 0);
    if (price <= 0) return true;
    return courseIdAliasesMemo(course).some((id) => ownedCourseIds.has(id));
  }, [courseIdAliasesMemo, ownedCourseIds]);

  const addOwnedCourseIds = useCallback((courseOrId, prev) => {
    const merged = new Set(prev);
    if (typeof courseOrId === 'object' && courseOrId) {
      courseIdAliasesMemo(courseOrId).forEach((a) => merged.add(a));
    } else if (courseOrId) {
      merged.add(String(courseOrId));
    }
    return merged;
  }, [courseIdAliasesMemo]);

  const ownedProbeRef = useRef(new Set());

  // Sau reload: xác minh quyền sở hữu từ API lessons (meta.owned) — server là nguồn tin cậy
  useEffect(() => {
    if (!courses.length) return undefined;
    let cancelled = false;
    (async () => {
      const priced = courses.filter((c) => Math.max(0, Number(c.price) || 0) > 0);
      await Promise.all(priced.map(async (c) => {
        const id = courseKey(c);
        if (!id || ownedProbeRef.current.has(id)) return;
        ownedProbeRef.current.add(id);
        try {
          const res = await lmsApiFetch(`/courses/${id}/lessons`);
          if (cancelled || !res?.meta?.owned) return;
          setOwnedCourseIds((prev) => addOwnedCourseIds(c, prev));
        } catch { /* ignore */ }
      }));
    })();
    return () => { cancelled = true; };
  }, [courses, addOwnedCourseIds]);

  const selectedCoursePrice = Math.max(0, Number(selectedCourse?.price) || 0);
  const selectedCourseId = selectedCourse ? courseKey(selectedCourse) : '';
  const lessonsIndicateOwned = useMemo(() => {
    if (!lessons.length) return false;
    return lessons.some((l) => l.isUnlocked && !l.paywallLocked && !l.isPreview);
  }, [lessons]);
  const selectedCourseOwned = !selectedCourse
    || isCourseOwned(selectedCourse)
    || lessonsIndicateOwned;
  const selectedCoursePending = !selectedCourseOwned && Boolean(pendingByCourseId[selectedCourseId]);
  const selectedCourseHasProgress = selectedCourse ? courseProgressOf(selectedCourse) > 0 : false;
  const canContinueLearning = selectedCourseOwned || selectedCourseHasProgress;
  // Player full-screen (z-100) — nhấc chat/popup tin·lịch lên trên lớp học
  const isLmsFullscreenPlayer = Boolean(selectedCourse) && selectedCourseOwned;
  useEffect(() => {
    if (!isLmsFullscreenPlayer) {
      setLmsPlayerOpen(false);
      return undefined;
    }
    setLmsPlayerOpen(true);
    return () => setLmsPlayerOpen(false);
  }, [isLmsFullscreenPlayer]);

  const enterCourseLearning = useCallback(() => {
    if (!selectedCourse) return;
    setOwnedCourseIds((prev) => addOwnedCourseIds(selectedCourse, prev));
    const id = courseKey(selectedCourse);
    if (id) {
      setPendingByCourseId((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    setCourseTab('overview');
    setCatalogInfoTab('content');
    const first = lessons.find((l) => l.isUnlocked && !l.isCompleted)
      || lessons.find((l) => l.isUnlocked)
      || lessons[0];
    if (first) setCurrentLesson(first);
  }, [selectedCourse, lessons, addOwnedCourseIds]);

  const startVideoCheckout = async (course) => {
    const id = courseKey(course);
    if (!id) return;
    try {
      const res = await api.trainingLms.checkoutVideoCourse(id);
      if (!res?.success) {
        toast.error(res?.message || 'Không tạo được thanh toán');
        return;
      }
      clearResumePayFromHash();
      if (res.data?.owned) {
        setOwnedCourseIds((prev) => addOwnedCourseIds(course, prev));
        await fetchLessons(id);
        enterCourseLearning();
        toast.success('Bạn đã sở hữu khóa này');
        return;
      }
      setPayCheckout({ ...res.data, courseId: String(id), courseTitle: course.title });
      refreshVideoPurchases();
    } catch (e) {
      toast.error(e?.message || 'Lỗi thanh toán');
    }
  };

  const handleVideoCoursePaid = async (courseId, { celebrate = false, courseTitle } = {}) => {
    if (!courseId) return;
    const id = String(courseId);
    clearResumePayFromHash();
    setPayCheckout(null);
    setOwnedCourseIds((prev) => {
      const merged = addOwnedCourseIds(id, prev);
      if (selectedCourse && courseKey(selectedCourse) === id) {
        return addOwnedCourseIds(selectedCourse, merged);
      }
      const hit = courses.find((c) => courseIdAliasesMemo(c).includes(id));
      return hit ? addOwnedCourseIds(hit, merged) : merged;
    });
    setPendingByCourseId((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await fetchLessons(courseId);
    await refreshVideoPurchases();
    try {
      window.dispatchEvent(new CustomEvent('lms-video-owned-updated', { detail: { courseId: id } }));
    } catch { /* ignore */ }
    if (celebrate) {
      setVideoPurchaseCelebration({
        courseTitle: courseTitle || selectedCourse?.title || '',
      });
    }
  };

  useEffect(() => {
    if (!purchasesLoaded) return;
    const resumeId = resumePayCourseIdRef.current;
    if (!resumeId || !selectedCourse) return;
    if (selectedCourseId !== resumeId) return;
    resumePayCourseIdRef.current = null;
    clearResumePayFromHash();
    if (selectedCourseOwned) return;
    if (!pendingByCourseId[selectedCourseId]) return;
    startVideoCheckout(selectedCourse);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi deep-link resumePay + purchases đã load
  }, [purchasesLoaded, selectedCourse, selectedCourseId, selectedCourseOwned, pendingByCourseId]);

  const videoPayModal = payCheckout ? (
    <VideoCoursePayModal
      courseTitle={payCheckout.courseTitle}
      sessionId={payCheckout.sessionId}
      refCode={payCheckout.ref}
      amount={payCheckout.amount}
      onClose={() => {
        setPayCheckout(null);
        clearResumePayFromHash();
        refreshVideoPurchases();
      }}
      onPaid={() => handleVideoCoursePaid(payCheckout.courseId, {
        celebrate: true,
        courseTitle: payCheckout.courseTitle,
      })}
      onSessionAlreadyPaid={() => handleVideoCoursePaid(payCheckout.courseId, {
        celebrate: false,
        courseTitle: payCheckout.courseTitle,
      })}
    />
  ) : null;

  const videoPurchaseCelebrationModal = videoPurchaseCelebration ? (
    <WelcomeCelebrationOverlay
      open
      variant="video_purchase"
      courseName={videoPurchaseCelebration.courseTitle}
      onClose={() => {
        setVideoPurchaseCelebration(null);
        enterCourseLearning();
      }}
    />
  ) : null;

  const courseSubjectOptions = useMemo(() => {
    const ids = new Set();
    courses.forEach((c) => {
      (Array.isArray(c.examSubjects) ? c.examSubjects : []).forEach((sid) => {
        if (sid) ids.add(String(sid));
      });
    });
    return [...ids]
      .map((id) => ({ id, label: getExamSubjectMeta(id, examSubjectsCatalog).label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [courses, examSubjectsCatalog]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const progress = courseProgressOf(course);
      if (courseFilterStatus === 'done' && progress < 100) return false;
      if (courseFilterStatus === 'learning' && !(progress > 0 && progress < 100)) return false;
      if (courseFilterStatus === 'new' && progress > 0) return false;

      const price = Math.max(0, Number(course.price) || 0);
      if (courseFilterPrice === 'paid' && price <= 0) return false;
      if (courseFilterPrice === 'free' && price > 0) return false;

      if (courseFilterSubject !== 'all') {
        const subjects = Array.isArray(course.examSubjects) ? course.examSubjects.map(String) : [];
        if (!subjects.includes(String(courseFilterSubject))) return false;
      }
      return true;
    });
  }, [courses, courseFilterStatus, courseFilterPrice, courseFilterSubject, courseProgressOf]);

  const hasActiveCourseFilters = courseFilterStatus !== 'all'
    || courseFilterPrice !== 'all'
    || courseFilterSubject !== 'all';

  const freeFilteredCourses = useMemo(
    () => filteredCourses.filter((c) => Math.max(0, Number(c.price) || 0) <= 0),
    [filteredCourses],
  );
  const paidFilteredCourses = useMemo(
    () => filteredCourses.filter((c) => Math.max(0, Number(c.price) || 0) > 0),
    [filteredCourses],
  );

  const renderVideoCourseCard = (course, idx) => {
    const gradients = [
      'from-red-600 to-red-800',
      'from-emerald-500 to-teal-600',
      'from-violet-600 to-fuchsia-600',
      'from-red-500 to-red-700',
    ];
    const bgClass = gradients[idx % gradients.length];
    const progress = courseProgressOf(course);
    const lessonCount = course.chapters
      ? course.chapters.reduce((acc, ch) => acc + (ch.lessons ? ch.lessons.length : 0), 0)
      : ((course.lessons || course.videos || [1]).length);
    const price = Math.max(0, Number(course.price) || 0);
    const owned = isCourseOwned(course);
    const coverSrc = course.coverImage ? resolveMediaUrl(course.coverImage) : '';
    return (
      <div
        onClick={() => {
          setSelectedCourse(course);
          setCourseTab('overview');
          setCatalogInfoTab('content');
          fetchLessons(courseKey(course));
        }}
        key={course.id || course._id}
        className="bg-white rounded-2xl border border-slate-100/90 shadow-sm ring-1 ring-slate-900/5 transition-all duration-200 cursor-pointer group flex flex-col overflow-hidden hover:shadow-xl hover:ring-red-100 lg:hover:-translate-y-1"
      >
        <div className={`relative aspect-video bg-gradient-to-r ${bgClass} overflow-hidden`}>
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <>
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)] pointer-events-none" />
            </>
          )}
          {coverSrc ? <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent pointer-events-none" /> : null}

          {price > 0 ? (
            <div className="absolute top-3 left-3 z-[1]" title={owned ? 'Khóa đã mua' : 'Khóa có phí'}>
              <span className={`inline-flex items-center justify-center w-9 h-9 aspect-square shrink-0 rounded-full shadow-md border ${
                owned
                  ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 border-amber-200/90 text-amber-950 shadow-amber-400/40'
                  : 'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-amber-200/80 text-amber-950'
              }`}>
                <Crown size={16} className="shrink-0" fill="currentColor" aria-hidden="true" />
                <span className="sr-only">{owned ? 'Đã mua' : 'Khóa VIP'}</span>
              </span>
            </div>
          ) : (
            <div className="absolute top-3 left-3 z-[1]" title="Khóa miễn phí">
              <span className="inline-flex items-center justify-center w-9 h-9 aspect-square shrink-0 rounded-full shadow-md border border-emerald-200/80 bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-emerald-500/30">
                <Gift size={16} className="shrink-0" strokeWidth={2.25} aria-hidden="true" />
                <span className="sr-only">Miễn phí</span>
              </span>
            </div>
          )}

          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-[1]">
            {price > 0 ? (
              <span className={`backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full font-black shadow-sm ${owned ? 'bg-emerald-600/90' : 'bg-red-600/95'}`}>
                {owned ? 'Đã mua' : `${price.toLocaleString('vi-VN')}đ`}
              </span>
            ) : null}
            {course.category && String(course.category).trim() && String(course.category).toUpperCase() !== 'MẶC ĐỊNH' ? (
              <span className="bg-black/35 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full font-medium uppercase tracking-wider">
                {course.category}
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-4 sm:p-5 flex-1 flex flex-col">
          <div className="flex items-start gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 text-base sm:text-lg group-hover:text-red-600 transition-colors line-clamp-2 leading-snug">
                {course.title}
              </h3>
            </div>
            <div className="shrink-0 text-right min-w-[3rem]">
              <p className="text-sm font-bold text-slate-700 tabular-nums">{progress}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/80">
              <div className="h-full rounded-full bg-red-600 border border-white/60 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4 flex-1">
            {htmlToPlainText(course.description || course.desc) ||
              'Hoàn thành khóa học này để nâng cao kiến thức và kỹ năng thực hành.'}
          </p>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 mt-auto">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 min-w-0">
              <Video size={14} className="text-slate-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{lessonCount} bài học</span>
            </div>

            <span
              className={`inline-flex items-center gap-1 shrink-0 min-h-9 px-3 rounded-xl text-[11px] font-black uppercase tracking-wide shadow-sm transition-all ${
                owned
                  ? 'bg-emerald-600 text-white group-hover:bg-emerald-700 group-hover:shadow-md'
                  : 'bg-red-600 text-white group-hover:bg-red-700 group-hover:shadow-md'
              }`}
            >
              {owned ? 'Vào học' : 'Xem / Mua'}
              <ChevronRight size={14} className="opacity-90 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Group lessons theo chapter
  const groupedLessons = lessons.reduce((acc, l) => {
    const ch = l.chapterTitle || 'Chương 1';
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(l);
    return acc;
  }, {});

  // ── COURSE LIST VIEW ────────────────────────────────────────────────────────
  if (!selectedCourse) {
    return (
      <>
      <div className="w-full animate-in fade-in duration-500 min-h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex gap-3 min-w-0">
            {onBack && (
              <button type="button" onClick={onBack} className="w-10 h-10 flex flex-shrink-0 items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm mt-0.5">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-2xl lg:text-3xl font-bold text-slate-800 tracking-tight leading-snug">
                {hideTabBar
                  ? ({
                    courses: 'Video học tập',
                    files: 'Tài liệu',
                    software: 'Link phần mềm',
                    assignments: 'Bài tập về nhà',
                    exams: 'Điểm thi',
                  }[mainTab] || 'Tài liệu học tập')
                  : 'Tài liệu học tập'}
              </h1>
              <p className="text-slate-500 font-medium mt-1 text-xs sm:text-sm leading-relaxed">
                {hideTabBar
                  ? ({
                    courses: 'Xem video bài giảng theo khóa học của bạn',
                    files: 'Tải và xem tài liệu học tập được phát hành',
                    software: 'Tải phần mềm và xem hướng dẫn cài đặt',
                    assignments: 'Hoàn thành và nộp bài tập về nhà',
                    exams: 'Theo dõi kết quả các bài thi của bạn',
                  }[mainTab] || 'Xem nội dung học tập')
                  : 'Xem video bài giảng và hoàn thành bài tập về nhà để nắm vững kiến thức'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${showAdminPanel ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
              >
                <BarChart2 size={16} /> <span className="hidden sm:inline">Xem tiến độ</span>
              </button>
            )}
          </div>
        </div>

        {/* Admin Progress Panel */}
        {isAdmin && showAdminPanel && courses.length > 0 && (
          <div className="mb-6">
            <AdminProgressPanel courseId={courses[0]?._id} />
          </div>
        )}

        {/* Tabs — ẩn khi vào từ menu riêng (Video / Tài liệu / Bài tập / Điểm thi) */}
        {!hideTabBar && (
        <div className="grid grid-cols-4 gap-2 border-b border-slate-200 pb-2 w-full mb-5 relative z-10">
          {[
            { key: 'courses', icon: PlayCircle, label: 'Video học tập', count: courses.length },
            { key: 'files', icon: FileBox, label: 'Tài liệu', count: trainingData?.files?.length || 0 },
            { key: 'assignments', icon: BookOpen, label: 'Bài tập về nhà', count: pendingAssignmentCount },
            { key: 'exams', icon: Award, label: 'Điểm thi', count: (student.examProgress || []).filter(ep => ep.status && ep.status !== 'chua_thi').length },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              title={t.label}
              aria-label={t.label}
              className={`relative flex w-full min-w-0 flex-col items-center justify-center gap-1 px-2 py-2 rounded-xl text-sm font-semibold transition-all ${mainTab === t.key
                ? 'bg-red-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              <t.icon size={15} className="shrink-0" aria-hidden="true" />
              <span className="text-[11px] leading-tight text-center line-clamp-2 min-h-[2.1rem]">
                {t.label}
              </span>
              {t.count > 0 && (
                <span className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-black leading-none ${mainTab === t.key ? 'bg-white/20 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        )}
        {hideTabBar && <div className="mb-5 border-b border-slate-200" />}

        {mainTab === 'courses' && (
          <>
          <div className="mb-4 flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-end">
            <label className="flex flex-col gap-1 min-w-0 sm:min-w-[9.5rem] flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Trạng thái học</span>
              <CmsSelect
                value={courseFilterStatus}
                onChange={(e) => setCourseFilterStatus(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="all">Tất cả</option>
                <option value="done">Đã học xong</option>
                <option value="learning">Đang học</option>
                <option value="new">Chưa học</option>
              </CmsSelect>
            </label>
            <label className="flex flex-col gap-1 min-w-0 sm:min-w-[8.5rem] flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Học phí</span>
              <CmsSelect
                value={courseFilterPrice}
                onChange={(e) => setCourseFilterPrice(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="all">Tất cả</option>
                <option value="paid">Có phí</option>
                <option value="free">Miễn phí</option>
              </CmsSelect>
            </label>
            <label className="flex flex-col gap-1 min-w-0 sm:min-w-[10rem] flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Môn học</span>
              <CmsSelect
                value={courseFilterSubject}
                onChange={(e) => setCourseFilterSubject(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value="all">Tất cả môn</option>
                {courseSubjectOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </CmsSelect>
            </label>
            {hasActiveCourseFilters && (
              <button
                type="button"
                onClick={() => {
                  setCourseFilterStatus('all');
                  setCourseFilterPrice('all');
                  setCourseFilterSubject('all');
                }}
                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <X size={14} aria-hidden="true" /> Xóa lọc
              </button>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-gray-100 animate-pulse rounded-[32px] h-64" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-3xl border border-dashed border-slate-200">
              <BookOpen size={48} className="mx-auto mb-4 text-slate-200" />
              <p className="font-bold">Chưa có khóa học nào</p>
              <p className="text-xs mt-1">Chưa có video đào tạo phù hợp với môn bạn đang học. Liên hệ Admin nếu bạn nghĩ đây là lỗi.</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-3xl border border-dashed border-slate-200">
              <BookOpen size={48} className="mx-auto mb-4 text-slate-200" />
              <p className="font-bold">Không có khóa khớp bộ lọc</p>
              <p className="text-xs mt-1">Thử đổi trạng thái, học phí hoặc môn học.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {freeFilteredCourses.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Gift size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Khóa miễn phí</h2>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full tabular-nums">{freeFilteredCourses.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {freeFilteredCourses.map((course, idx) => renderVideoCourseCard(course, idx))}
                  </div>
                </section>
              )}
              {paidFilteredCourses.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3 pt-1 border-t border-slate-200/80">
                    <Crown size={16} className="text-amber-500 shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Khóa có phí</h2>
                    <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full tabular-nums">{paidFilteredCourses.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                    {paidFilteredCourses.map((course, idx) => renderVideoCourseCard(course, idx))}
                  </div>
                </section>
              )}
            </div>
          )}
          </>
        )}

        {/* FILES TAB */}
        {mainTab === 'files' && (
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <Download className="text-green-600" /> Tài liệu Khóa học
            </h2>
            <div className="space-y-3">
              {trainingData?.files?.map((file, idx) => {
                const fKey = file.id ?? `f-${idx}`;
                const descHtml = file.desc || '';
                const plain = htmlToPlainText(descHtml);
                const defaultNote = 'Tài liệu đính kèm từ Admin.';
                const hasHtml = /<[a-z][\s\S]*>/i.test(descHtml);
                const expanded = expandedFileDescKey === fKey;
                const showToggle = plain.length > 120 || hasHtml;
                return (
                  <div key={fKey} className="p-4 rounded-xl border border-slate-100 hover:bg-green-50/50 hover:border-green-200 transition-all flex flex-col md:flex-row justify-between md:items-start gap-4 group">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm ${file.fileType === 'PDF' ? 'bg-rose-500' : 'bg-green-500'}`}>
                        {file.fileType || 'FILE'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-800 text-base leading-tight group-hover:text-green-700 transition-colors">{file.title}</h3>
                        {!descHtml && !plain ? (
                          <p className="text-[12px] text-slate-500 mt-1 mb-1">{defaultNote}</p>
                        ) : expanded && hasHtml ? (
                          <div
                            className="text-[12px] text-slate-600 mt-1 mb-1 max-h-[240px] overflow-y-auto leading-relaxed break-words [&_p]:mb-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_b]:font-semibold [&_strong]:font-semibold [&_a]:text-green-600 [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(descHtml) }}
                          />
                        ) : (
                          <p className={`text-[12px] text-slate-500 mt-1 mb-1 ${showToggle && !expanded ? 'line-clamp-2' : ''} whitespace-pre-wrap`}>
                            {plain || defaultNote}
                          </p>
                        )}
                        {showToggle ? (
                          <button
                            type="button"
                            onClick={() => setExpandedFileDescKey(expanded ? null : fKey)}
                            className="text-[11px] font-bold text-green-600 hover:text-green-800 mt-0.5"
                          >
                            {expanded ? 'Thu gọn' : 'Xem thêm mô tả / lưu ý'}
                          </button>
                        ) : null}
                        <p className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 w-fit rounded mt-1">{file.fileSize || 'N/A'}</p>
                      </div>
                    </div>
                    {!file.fileUrl && !file.url ? (
                      <span className="w-full md:w-auto px-5 py-2.5 rounded-[10px] text-sm font-bold text-slate-400 border border-slate-100 bg-slate-50 text-center shrink-0 self-center md:self-start">Chưa có file</span>
                    ) : (() => {
                      const rawUrl = file.fileUrl || file.url || '';
                      const href = buildMediaDownloadUrl(
                        rawUrl,
                        file.fileOriginalName || file.title,
                      );
                      if (!href) {
                        return (
                          <span className="w-full md:w-auto px-5 py-2.5 rounded-[10px] text-sm font-bold text-amber-700 border border-amber-200 bg-amber-50 text-center shrink-0 self-center md:self-start">
                            Link lỗi — Admin upload lại
                          </span>
                        );
                      }
                      return (
                        <button
                          type="button"
                          className="w-full md:w-auto px-5 py-2.5 bg-red-600 text-white border border-transparent rounded-[10px] text-sm font-bold hover:bg-red-700 hover:shadow-md transition-all shrink-0 flex items-center justify-center gap-2 self-center md:self-start"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              await downloadMediaFile(rawUrl, file.fileOriginalName || file.title);
                            } catch (err) {
                              toast.error(err?.message || 'Không tải được tài liệu');
                            }
                          }}
                        >
                          <Download size={16} /> Tải về
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
              {(!trainingData?.files || trainingData.files.length === 0) && (
                <div className="col-span-full py-16 text-center text-slate-400">
                  <FileBox size={40} className="mx-auto mb-3 opacity-40" />
                  <p className="font-bold">Chưa có tài liệu</p>
                  <p className="text-xs mt-1">Chưa có tài liệu phù hợp với môn bạn đang học. Liên hệ Admin nếu bạn nghĩ đây là lỗi.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SOFTWARE LINKS TAB */}
        {mainTab === 'software' && (
          <SoftwareLinksTable
            items={trainingData?.softwareLinks || []}
            title=""
          />
        )}

        {/* ASSIGNMENTS TAB */}
        {mainTab === 'assignments' && (
          <div className="bg-white rounded-[24px] p-4 sm:p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-4 flex items-center gap-2.5">
              <BookOpen className="text-green-600" /> Bài tập được giao
            </h2>
            <div className="space-y-3">
              {trainingData?.assignments?.map((a, idx) => {
                const submission = a.mySubmission || localSubmissions[idx];
                let targetDate = null;
                let isLate = false;
                if (a.deadline) {
                  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
                  targetDate = new Date(new Date(a.deadline).toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
                  targetDate.setHours(23, 59, 59, 999);
                  isLate = now.getTime() > targetDate.getTime();
                }
                const aKey = a._id || a.id || `a-${idx}`;
                const aDesc = a.description || '';
                const aPlain = htmlToPlainText(aDesc);
                const aHasHtml = /<[a-z][\s\S]*>/i.test(aDesc);
                const aExpanded = expandedAssignKey === aKey;
                const aShowToggle = aPlain.length > 160 || aHasHtml;
                const aDefault = 'Hoàn thành và nộp file bài tập theo đúng định dạng được yêu cầu (.zip, .rar, .pdf).';
                const isAdminAssign = ['admin', 'staff'].includes(String(a.assignedByRole || '').toLowerCase());
                const isTeacherAssign = String(a.assignedByRole || '').toLowerCase() === 'teacher'
                  || (!a.assignedByRole && !!a.teacherId);
                const assignerLabel = isAdminAssign
                  ? 'Admin giao'
                  : (isTeacherAssign ? 'Giáo viên' : (a.assignedByName ? String(a.assignedByName) : 'Giáo viên'));
                const teacherName = String(a.assignedByName || '').trim();
                return (
                  <div key={aKey} className="p-4 rounded-2xl border border-slate-100 transition-all flex gap-3 items-start bg-slate-50/40">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-100 to-indigo-100 flex items-center justify-center text-green-600 shrink-0 border border-green-200 shadow-inner">
                      <FileUp size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-2 mb-2">
                        <h3 className="font-bold text-slate-800 text-base leading-tight flex items-center gap-2 flex-wrap">
                          <span className="line-clamp-2 min-w-0">{a.title}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide border ${
                            isAdminAssign
                              ? 'bg-violet-100 text-violet-700 border-violet-200'
                              : 'bg-red-100 text-red-700 border-red-200'
                          }`}>
                            {assignerLabel}
                          </span>
                        </h3>
                        {!isAdminAssign && teacherName && teacherName.toLowerCase() !== 'giảng viên' && (
                          <p className="text-[11px] text-slate-500 font-medium -mt-1">
                            Giao bởi: {teacherName}
                          </p>
                        )}
                        {!submission && a.deadline && (
                          <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 whitespace-nowrap w-fit ${isLate ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                            <Timer size={13} className={isLate ? '' : 'animate-pulse'} />
                            <CountdownTimer deadline={a.deadline} />
                          </div>
                        )}
                      </div>
                      {!aDesc && !aPlain ? (
                        <p className="text-xs text-slate-600 mb-3 line-clamp-2">{aDefault}</p>
                      ) : aExpanded && aHasHtml ? (
                        <div
                          className="text-xs text-slate-600 mb-3 max-h-[220px] overflow-y-auto leading-relaxed break-words [&_p]:mb-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_b]:font-semibold [&_a]:text-green-600"
                          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(aDesc) }}
                        />
                      ) : (
                        <p className={`text-xs text-slate-600 mb-3 ${aShowToggle && !aExpanded ? 'line-clamp-2' : ''} whitespace-pre-wrap`}>
                          {aPlain || aDefault}
                        </p>
                      )}
                      {aShowToggle ? (
                        <button
                          type="button"
                          onClick={() => setExpandedAssignKey(aExpanded ? null : aKey)}
                          className="text-[11px] font-bold text-green-600 hover:text-green-800 -mt-1 mb-3"
                        >
                          {aExpanded ? 'Thu gọn' : 'Xem thêm hướng dẫn'}
                        </button>
                      ) : null}

                      <div className="grid grid-cols-1 gap-2">
                        <a href={a.fileUrl || '#'} target="_blank" className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:border-slate-300 hover:bg-slate-50 font-semibold text-sm transition-all shadow-sm">
                          <LinkIcon size={15} /> Tải đề bài
                        </a>
                        {(() => {
                          if (!submission) {
                            return (
                              <label className={`flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm ${uploadingAssignId === idx ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                                {uploadingAssignId === idx ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UploadCloud size={16} />}
                                {uploadingAssignId === idx ? 'Đang tải...' : 'Nộp bài tập'}
                                <input type="file" className="hidden" accept=".zip,.rar,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFileChange(a, idx, e.target.files[0])} disabled={uploadingAssignId === idx} />
                              </label>
                            );
                          }
                          const isGraded = submission.status === 'graded';
                          const feedback = String(submission.teacherFeedback || '').trim();
                          return (
                            <>
                              {isGraded ? (
                                <div className={`flex flex-col gap-1.5 px-4 py-2.5 border rounded-xl font-semibold text-sm shadow-sm ${getGradeBadgeClasses(submission.grade)}`}>
                                  <div className="flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} className={getGradeIconClasses(submission.grade)} />
                                    Điểm: {submission.grade}/10
                                  </div>
                                  {feedback ? (
                                    <p className="text-left text-[11px] font-medium leading-relaxed opacity-90 border-t border-black/5 pt-1.5 mt-0.5">
                                      <span className="font-bold">Góp ý GV: </span>
                                      {feedback}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl font-semibold text-sm cursor-not-allowed shadow-inner opacity-80">
                                  <CheckCircle2 size={16} />
                                  Đã nộp bài
                                </div>
                              )}
                              <label className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${isGraded ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60' : uploadingAssignId === idx ? 'bg-orange-50 border border-orange-200 text-orange-600 cursor-not-allowed opacity-50' : 'bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 cursor-pointer shadow-sm'}`}>
                                {uploadingAssignId === idx ? <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={16} />}
                                {uploadingAssignId === idx ? 'Đang tải...' : 'Nộp lại'}
                                <input type="file" className="hidden" accept=".zip,.rar,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFileChange(a, idx, e.target.files[0])} disabled={uploadingAssignId === idx || isGraded} />
                              </label>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!trainingData?.assignments || trainingData.assignments.length === 0) && (
                <div className="text-center py-12 text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">Hiện tại bạn không có bài tập nào cần nộp.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXAMS TAB */}
        {mainTab === 'exams' && (() => {
          const examSubjects = examScoreRows;

          const renderEssayCell = (sub) => {
            if (sub.essayScore != null) {
              return (
                <span className={`font-bold px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs ${sub.essayScore >= 5 ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-red-700 bg-red-50 border border-red-100'}`}>
                  {sub.essayScore}/10
                </span>
              );
            }
            if (sub.thucHanh === 'da_nop') {
              return <span className="text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs">Chờ chấm</span>;
            }
            if (sub.thucHanh === 'chua_nop' || !sub.thucHanh) {
              return <span className="text-gray-400 font-medium text-[10px] sm:text-xs">Chưa làm</span>;
            }
            return <span className="text-gray-600 font-medium text-[10px] sm:text-xs break-words">{sub.thucHanh}</span>;
          };

          const renderResultCell = (sub) => {
            if (sub.status === 'dat') return <span className="text-emerald-600 font-black text-[10px] sm:text-xs">ĐẠT</span>;
            if (sub.status === 'khong_dat') return <span className="text-red-600 font-black text-[10px] sm:text-xs leading-tight">KHÔNG ĐẠT</span>;
            if (sub.status === 'dang_khoa') return <span className="text-orange-500 font-bold text-[10px] sm:text-xs">ĐANG KHÓA</span>;
            return <span className="text-gray-400 font-bold text-[10px] sm:text-xs">CHƯA THI</span>;
          };

          return (
            <div className="bg-white rounded-2xl p-3 sm:p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[280px]">
              <div className="flex items-center justify-between mb-3 sm:mb-6">
                <h2 className="text-sm sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Award className="text-green-600 shrink-0" size={18} aria-hidden="true" />
                  Bảng Điểm Tổng Hợp
                </h2>
              </div>

              {/* Mobile: card rows — hiện đủ mọi cột */}
              <div className="sm:hidden space-y-2.5">
                {examSubjects.map((sub, idx) => {
                  const trScore = sub.tracNghiem ? `${sub.tracNghiem.score}/${sub.tracNghiem.total}` : '—';
                  return (
                    <article key={sub.id} className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                      <div className="flex items-start gap-2.5 mb-2.5">
                        <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0 pt-0.5">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-xs font-bold text-slate-800 leading-snug flex-1 min-w-0 break-words">
                          {sub.label}
                        </h3>
                        <div className="shrink-0 text-right">{renderResultCell(sub)}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-lg bg-white border border-slate-100 px-2.5 py-2 min-w-0">
                          <p className="font-bold uppercase tracking-wide text-slate-400 mb-0.5">Trắc nghiệm</p>
                          <p className="font-bold text-slate-700 tabular-nums break-words">{trScore}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-slate-100 px-2.5 py-2 min-w-0">
                          <p className="font-bold uppercase tracking-wide text-slate-400 mb-0.5 leading-tight">Tự luận / Thực hành</p>
                          <div className="mt-0.5">{renderEssayCell(sub)}</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {examSubjects.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-8">Chưa có dữ liệu điểm thi.</p>
                )}
              </div>

              {/* Tablet/desktop: bảng chữ nhỏ, cho phép xuống dòng */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-[11px] md:text-[13px] table-fixed">
                  <thead className="bg-[#f8fafc] border-b border-gray-200">
                    <tr>
                      <th className="px-2 md:px-4 py-2.5 md:py-3 font-black text-slate-500 w-10 md:w-14 text-center uppercase tracking-wide leading-tight">STT</th>
                      <th className="px-2 md:px-4 py-2.5 md:py-3 font-black text-slate-500 uppercase tracking-wide leading-tight">Tên môn thi</th>
                      <th className="px-2 md:px-3 py-2.5 md:py-3 font-black text-slate-500 text-center uppercase tracking-wide leading-tight w-[18%]">Trắc nghiệm</th>
                      <th className="px-2 md:px-3 py-2.5 md:py-3 font-black text-slate-500 text-center uppercase tracking-wide leading-tight w-[22%]">Tự luận / Thực hành</th>
                      <th className="px-2 md:px-3 py-2.5 md:py-3 font-black text-slate-500 text-center uppercase tracking-wide leading-tight w-[16%]">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {examSubjects.map((sub, idx) => {
                      const trScore = sub.tracNghiem ? `${sub.tracNghiem.score}/${sub.tracNghiem.total}` : '—';
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-2 md:px-4 py-2.5 md:py-3 font-bold text-slate-400 text-center tabular-nums align-top">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2 md:px-4 py-2.5 md:py-3 font-bold text-slate-800 break-words whitespace-normal align-top leading-snug">
                            {sub.label}
                          </td>
                          <td className="px-2 md:px-3 py-2.5 md:py-3 font-bold text-center text-slate-600 tabular-nums align-top whitespace-normal break-words">
                            {trScore}
                          </td>
                          <td className="px-2 md:px-3 py-2.5 md:py-3 text-center align-top whitespace-normal break-words">
                            {renderEssayCell(sub)}
                          </td>
                          <td className="px-2 md:px-3 py-2.5 md:py-3 text-center align-top whitespace-normal break-words">
                            {renderResultCell(sub)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      </div>
      {videoPayModal}
      {videoPurchaseCelebrationModal}
      </>
    );
  }

  // ── CATALOG / PAYWALL (chưa mua khóa trả phí) ──────────────────────────────
  if (selectedCourse && !selectedCourseOwned && selectedCoursePrice > 0 && !purchasesLoaded) {
    return (
      <div className="w-full min-h-full bg-slate-50 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw size={28} className="animate-spin text-red-500" />
          <p className="text-sm font-semibold">Đang kiểm tra quyền truy cập khóa học…</p>
        </div>
        {videoPayModal}
        {videoPurchaseCelebrationModal}
      </div>
    );
  }

  if (selectedCourse && !selectedCourseOwned) {
    const canPlayPreview = (l) => {
      if (!l) return false;
      if (!(l.isPreview || (l.isUnlocked && !l.paywallLocked))) return false;
      return Boolean(resolveLessonVideoUrl(l));
    };
    const previewLesson = (canPlayPreview(currentLesson) ? currentLesson : null)
      || lessons.find((l) => l.isPreview && resolveLessonVideoUrl(l))
      || lessons.find((l) => l.isUnlocked && !l.paywallLocked && resolveLessonVideoUrl(l));
    return (
      <div className="w-full min-h-full bg-slate-50 pb-10">
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setSelectedCourse(null); setLessons([]); setCurrentLesson(null); }}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center"
            aria-label="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{selectedCourse.title}</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 min-w-0">
            <div className="bg-black rounded-2xl overflow-hidden aspect-video mb-4">
              {previewLesson ? (
                <StudentVideoPlayer
                  key={previewLesson._id}
                  videoId={resolveLessonVideoUrl(previewLesson)}
                  lessonId={previewLesson._id}
                  courseId={selectedCourse._id || selectedCourse.id}
                  initialWatchedSeconds={previewLesson.watchedSeconds || 0}
                  adminDurationSeconds={previewLesson.adminDurationSeconds || previewLesson.duration || 0}
                  antiSeekEnabled={false}
                  lessonCompleted={false}
                  onSaveProgress={() => {}}
                  onWatchProgress={() => {}}
                  onVideoEnded={() => {}}
                  onEligibilityReached={() => {}}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-white/70 text-sm font-semibold px-6 text-center">
                  Chưa có bài xem thử. Đăng ký để xem toàn bộ khóa.
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="flex border-b border-slate-100 overflow-x-auto">
                {[
                  { key: 'content', label: 'Nội dung khóa học' },
                  { key: 'desc', label: 'Mô tả khóa học' },
                  { key: 'info', label: 'Người hướng dẫn' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setCatalogInfoTab(t.key)}
                    className={`flex-1 min-w-[7.5rem] min-h-11 px-3 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
                      catalogInfoTab === t.key
                        ? 'text-red-600 border-b-2 border-red-600 bg-red-50/40'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-4 sm:p-5">
                {catalogInfoTab === 'content' && (
                  <ul className="divide-y divide-slate-100">
                    {lessons.map((lesson, idx) => {
                      const playable = canPlayPreview(lesson);
                      const isActive = previewLesson && String(previewLesson._id) === String(lesson._id);
                      return (
                      <li key={lesson._id || idx}>
                        <button
                          type="button"
                          disabled={!playable}
                          onClick={() => {
                            if (!playable) {
                              toast.error('Bài này cần thanh toán khóa học');
                              return;
                            }
                            setCurrentLesson(lesson);
                          }}
                          className={`w-full flex items-center gap-3 py-2.5 px-1 text-left rounded-lg transition-colors ${
                            playable
                              ? `cursor-pointer hover:bg-slate-50 ${isActive ? 'bg-red-50/70' : ''}`
                              : 'opacity-70 cursor-not-allowed'
                          }`}
                        >
                          {playable ? (
                            <PlayCircle size={16} className={`shrink-0 ${isActive ? 'text-red-600' : 'text-red-500'}`} />
                          ) : (
                            <Lock size={16} className="text-slate-400 shrink-0" />
                          )}
                          <span className={`flex-1 text-sm font-semibold truncate ${isActive ? 'text-red-700' : 'text-slate-700'}`}>
                            {idx + 1}. {lesson.title}
                          </span>
                          {lesson.isPreview || playable ? (
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border shrink-0 ${
                              isActive
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-pink-50 text-pink-700 border-pink-200'
                            }`}>
                              {isActive ? 'Đang xem' : 'Xem thử'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">Có phí</span>
                          )}
                        </button>
                      </li>
                      );
                    })}
                    {lessons.length === 0 && (
                      <li className="py-6 text-center text-sm text-slate-500">Chưa có bài học.</li>
                    )}
                  </ul>
                )}
                {catalogInfoTab === 'desc' && (() => {
                  const raw = selectedCourse.description || selectedCourse.desc || '';
                  const plain = htmlToPlainText(raw);
                  if (!plain) {
                    return <p className="text-sm text-slate-500">Chưa có mô tả khóa học.</p>;
                  }
                  if (/<[a-z][\s\S]*>/i.test(String(raw))) {
                    return (
                      <div
                        className="prose prose-sm max-w-none text-slate-700"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(raw) }}
                      />
                    );
                  }
                  return <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{plain}</p>;
                })()}
                {catalogInfoTab === 'info' && (() => {
                  const totalSec = lessons.reduce((sum, l) => {
                    const d = Number(l.adminDurationSeconds ?? l.duration) || 0;
                    return sum + Math.max(0, d);
                  }, 0);
                  const formatDur = (sec) => {
                    const s = Math.max(0, Math.floor(Number(sec) || 0));
                    if (s <= 0) return 'Chưa cập nhật';
                    const h = Math.floor(s / 3600);
                    const m = Math.floor((s % 3600) / 60);
                    if (h > 0) return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
                    if (m > 0) return `${m} phút`;
                    return `${s} giây`;
                  };
                  const instructor = String(selectedCourse.instructorName || '').trim();
                  const bio = String(selectedCourse.instructorBio || '').trim();
                  const software = String(selectedCourse.software || '').trim();
                  return (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                          <Users size={18} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800">{instructor || 'Chưa cập nhật tên giảng viên'}</p>
                          {bio ? <p className="text-sm text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap">{bio}</p> : null}
                        </div>
                      </div>
                      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tổng số bài</dt>
                          <dd className="text-sm font-bold text-slate-800 mt-1 tabular-nums">{lessons.length} bài</dd>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Thời lượng xem</dt>
                          <dd className="text-sm font-bold text-slate-800 mt-1">{formatDur(totalSec)}</dd>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phần mềm</dt>
                          <dd className="text-sm font-bold text-slate-800 mt-1">{software || 'Chưa cập nhật'}</dd>
                        </div>
                      </dl>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <aside className="lg:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm lg:sticky lg:top-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Học phí khóa video</p>
              <p className="text-3xl font-black text-red-600 tabular-nums mb-4">
                {selectedCoursePrice.toLocaleString('vi-VN')}đ
              </p>
              <ul className="text-sm text-slate-600 space-y-1.5 mb-5">
                <li>{lessons.length} bài học</li>
                <li>{lessons.filter((l) => l.isPreview).length} bài xem thử</li>
                <li>Truy cập sau khi thanh toán VietQR / MoMo quét QR</li>
              </ul>
              <button
                type="button"
                onClick={() => (canContinueLearning ? enterCourseLearning() : startVideoCheckout(selectedCourse))}
                className={`w-full min-h-12 rounded-xl text-white font-bold text-sm ${
                  canContinueLearning
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {canContinueLearning
                  ? 'Tiếp tục học'
                  : selectedCoursePending
                    ? 'Tiếp tục thanh toán'
                    : 'Đăng ký / Thanh toán'}
              </button>
            </div>
          </aside>
        </div>
        {videoPayModal}
        {videoPurchaseCelebrationModal}
      </div>
    );
  }

  // ── PLAYER VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex flex-col w-screen h-screen bg-[#0d1117] text-white overflow-hidden">

      {/* ─── TOPBAR ───────────────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 z-50" style={{ background: 'linear-gradient(180deg,#090e18 0%,#0d1117 100%)' }}>
        {/* Progress rail */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
          <div
            className={`h-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-400' : 'bg-emerald-500'}`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        <div className="h-13 px-3 sm:px-5 flex items-center justify-between gap-2" style={{ height: '52px' }}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => { setSelectedCourse(null); setLessons([]); setCurrentLesson(null); }}
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all text-slate-400 hover:text-white flex-shrink-0"
              aria-label="Quay lại"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="w-px h-5 bg-white/10 flex-shrink-0 hidden sm:block" />
            <h2 className="font-bold text-[13px] text-slate-100 truncate leading-snug min-w-0">{selectedCourse.title}</h2>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {completing && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold animate-pulse uppercase tracking-widest">
                <RefreshCw size={11} className="animate-spin" /> Đang lưu...
              </div>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 tabular-nums">
              {overallProgress}%
              {overallProgress === 100 && <Award size={12} className="text-emerald-400" />}
            </span>
          </div>
        </div>
      </div>

      {/* ─── BODY: Udemy-style — cột trái scroll; video+tabs sticky; sidebar độc lập ─── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden" style={{ background: '#0b1018' }}>

        {/* ══ LEFT COLUMN ══ */}
        <div
          data-lms-scroll
          className="flex-1 basis-0 min-w-0 min-h-0 w-full overflow-y-scroll overscroll-y-contain custom-scrollbar-dark"
        >

          <div className="bg-[#0b1018]">
            <div className="px-0 sm:px-4 pt-0 sm:pt-3 pb-0 sm:pb-2 flex justify-center w-full bg-black/40">
              <div
                className="relative overflow-hidden shadow-2xl shadow-black/80 w-full rounded-none sm:rounded-2xl bg-black h-[calc(48dvh+40px)] sm:h-[calc(54dvh+40px)] lg:h-[min(calc(56dvh+40px),660px)]"
              >
                <StudentVideoPlayer
                  key={currentLesson?._id}
                  videoId={resolveLessonVideoUrl(currentLesson)}
                  lessonId={currentLesson?._id}
                  courseId={selectedCourse?._id || selectedCourse?.id}
                  initialWatchedSeconds={currentLesson?.watchedSeconds || 0}
                  adminDurationSeconds={
                    currentLesson?.adminDurationSeconds
                    || resolveEffectiveDuration(currentLesson?.duration, 0)
                  }
                  antiSeekEnabled={isLessonAntiSeekEnabled(currentLesson)}
                  lessonCompleted={!!currentLesson?.isCompleted}
                  onSaveProgress={handleSaveProgress}
                  onWatchProgress={handleWatchProgress}
                  onVideoEnded={handleVideoEnded}
                  onEligibilityReached={handleEligibilityReached}
                  playerApiRef={playerApiRef}
                />
              </div>
            </div>
            <LmsTabBar courseTab={courseTab} setCourseTab={setCourseTab} />
          </div>

          <div className="px-4 sm:px-6 py-4 sm:py-5 pb-16 w-full" style={{ background: '#0d1117' }}>
            <LmsPlayerPanels
              courseTab={courseTab}
              userId={session?.id || student?.id || 'student'}
              userName={student?.name || session?.name || 'Học viên'}
              selectedCourse={selectedCourse}
              currentLesson={currentLesson}
              lessons={lessons}
              groupedLessons={groupedLessons}
              overallProgress={overallProgress}
              expandedChapters={expandedChapters}
              setExpandedChapters={setExpandedChapters}
              onSelectLesson={(lesson) => {
                setCurrentLesson(lesson);
                setCourseTab('overview');
              }}
              getCurrentTime={() => {
                try {
                  return Number(playerApiRef.current?.getCurrentTime?.()) || 0;
                } catch {
                  return 0;
                }
              }}
              antiSeekEnabled={isLessonAntiSeekEnabled(currentLesson)}
              audience="student"
              canAnswerQa={false}
              highlightQaId={highlightQaId}
            />
          </div>
        </div>

        {/* ══ RIGHT SIDEBAR ══ */}
        <div
          className="hidden lg:flex flex-col lg:w-80 flex-shrink-0 border-l min-h-0 self-stretch overflow-hidden"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0b1018' }}
        >

          {/* Sidebar Header */}
          <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">Nội dung khóa học</h3>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${overallProgress === 100
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  }`}
              >
                {lessons.filter(l => l.isCompleted).length}/{lessons.length} BÀI
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-500' : 'bg-emerald-500'
                  }`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Lesson List */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}
          >
            {Object.entries(groupedLessons).map(([chapter, chapterLessons]) => {
              const isExpanded = expandedChapters[chapter] !== false;
              const chapterCompleted = chapterLessons.filter(l => l.isCompleted).length;
              return (
                <div key={chapter}>
                  {/* Chapter Header */}
                  <button
                    onClick={() => setExpandedChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }))}
                    className="w-full px-5 py-3 flex items-center justify-between text-left transition-colors hover:bg-white/5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div>
                      <p className="text-[11px] font-bold text-slate-300">{chapter}</p>
                      <p className="text-[9px] text-slate-600 mt-0.5 font-semibold">{chapterCompleted}/{chapterLessons.length} hoàn thành</p>
                    </div>
                    {isExpanded
                      ? <ChevronUp size={13} className="text-slate-600" />
                      : <ChevronDown size={13} className="text-slate-600" />
                    }
                  </button>

                  {isExpanded && chapterLessons.map((lesson, idx) => {
                    const isCurrent = currentLesson?._id === lesson._id;
                    const fullyWatched = isLessonFullyWatched(lesson);
                    return (
                      <div
                        key={lesson._id}
                        onClick={() => {
                          if (!lesson.isUnlocked) return;
                          setCurrentLesson(lesson);
                        }}
                          title={
                          lesson.paywallLocked
                            ? 'Cần thanh toán khóa học để xem bài này'
                            : !lesson.isUnlocked
                            ? `Hoàn thành bài trước (≥67%) để mở bài này`
                            : (lesson.allowEarlyAccess && !lesson.prerequisiteCompleted && !lesson.isCompleted)
                              ? 'Có thể học sớm'
                              : undefined
                        }
                        className={`flex items-start gap-3 px-4 py-3 transition-all relative ${!lesson.isUnlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                          } ${isCurrent
                            ? 'bg-emerald-500/10 border-l-4 border-emerald-500'
                            : 'border-l-4 border-transparent hover:bg-white/[0.04]'
                          }`}
                      >
                        {/* Status icon — tick chỉ khi 100%; đang xem → đang học */}
                        <div className="mt-0.5 flex-shrink-0">
                          {isCurrent ? (
                            <div className="w-[18px] h-[18px] rounded-full border-2 border-emerald-500 flex items-center justify-center">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            </div>
                          ) : fullyWatched ? (
                            <div className="w-[18px] h-[18px] rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <CheckCircle size={12} className="text-emerald-400" />
                            </div>
                          ) : !lesson.isUnlocked ? (
                            <Lock size={14} className="text-slate-600" />
                          ) : (
                            <PlayCircle size={16} className="text-slate-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className={`text-[12px] leading-snug line-clamp-2 normal-case ${isCurrent ? 'text-emerald-400 font-bold' : fullyWatched ? 'text-slate-500 font-semibold' : 'text-slate-300 font-semibold'
                            }`}>
                            {formatLessonDisplayTitle(lesson.title, idx)}
                          </h4>
                          <LessonSidebarMeta lesson={lesson} isCurrent={isCurrent} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Completion Card */}
            {overallProgress === 100 && (
              <div className="m-4 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 text-center">
                <Award size={26} className="text-emerald-400 mx-auto mb-2" />
                <p className="font-black text-emerald-400 text-sm">Hoàn thành 100%</p>
                <p className="text-emerald-600/70 text-[11px] mt-1 font-medium">Chúc mừng bạn đã hoàn tất lộ trình</p>
              </div>
            )}
            <div className="h-6" />
          </div>
        </div>

      </div>

      {videoPayModal}
      {videoPurchaseCelebrationModal}

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar-dark::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />
    </div>
  );
};

export default StudentTrainingLMS;






