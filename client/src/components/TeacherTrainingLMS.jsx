import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, CheckCircle, Lock, ChevronRight, Clock, Award, BookOpen,
  ArrowLeft, Shield, Users, BarChart2, RefreshCw, GraduationCap,
  PlayCircle, ChevronDown, ChevronUp, Star, AlertCircle, CheckCircle2,
  FileBox, Video, Download, FileText
} from 'lucide-react';

import { useData } from '../context/DataContext';

const MOCK_COURSES = [
  { _id: '1', title: 'Đào tạo Giảng viên Mới', progress: 0, 
    videos: [{ title: 'Giới thiệu về Thắng Tin Học', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 635 }, { title: 'Tổng quan công việc', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 920 }],
    files: [{ title: 'Quy trình giảng dạy.pdf', type: 'PDF', size: '2 MB' }, { title: 'Sổ tay Giảng viên.docx', type: 'DOCX', size: '1 MB' }],
    notices: ['Chào mừng các bạn đến với TT', 'Hãy xem hết các video trước khi nhận lớp']
  },
  { _id: '2', title: 'Kỹ năng Đứng lớp Chuyên sâu', progress: 45, 
    videos: [{ title: 'Xử lý tình huống học viên yếu', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 2412 }],
    files: [{ title: 'Quy trình xử lý.docx', type: 'DOCX', size: '500 KB' }],
    notices: ['Nhớ nộp bài thu hoạch trước 15/4 ngay sau khi xem video']
  },
  { _id: '3', title: 'Khóa học Excel Nâng cao', progress: 100, 
    videos: [{ title: 'Hàm logic phức tạp', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 2100 }],
    files: [{ title: 'Bài tập thực hành.xlsx', type: 'EXCEL', size: '3.5 MB' }],
    notices: []
  },
  { _id: '4', title: 'Bảo mật và An toàn thông tin', progress: 80, 
    videos: [{ title: 'Bảo quản dữ liệu học viên', url: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 1210 }],
    files: [],
    notices: ['Bắt buộc hoàn thành trong tháng 4']
  }
];

const CircularProgress = ({ progress, size = 112 }) => {
  const isSmall = size < 100;
  const radius = isSmall ? 25 : 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  let strokeColor = 'text-slate-100';
  let pathColor = 'text-blue-500';
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
  // Thử token giảng viên trước, fallback sang admin
  const token =
    localStorage.getItem('teacher_access_token') ||
    localStorage.getItem('admin_access_token') ||
    (() => {
      try { return JSON.parse(localStorage.getItem('teacher_user') || '{}').token; } catch { return null; }
    })() ||
    (() => {
      try { return JSON.parse(localStorage.getItem('admin_user') || '{}').token; } catch { return null; }
    })();

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const res = await fetch(`${API_BASE}/training-lms${endpoint}`, {
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

// ─── YOUTUBE PLAYER COMPONENT ────────────────────────────────────────────────
// Logic mới: Cho phép tua nhưng đếm giây XEM THỰC TẾ
// Mở khóa khi đã xem đủ 2/3 tổng thời lượng video
const YouTubePlayerSecure = ({
  videoId, lessonId, courseId, duration: lessonDuration,
  initialWatchedSeconds = 0,
  onVideoEnded, onSaveProgress, onEligibilityReached, isLocked,
}) => {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const intervalRef = useRef(null);        // Đếm giây thực tế (1s tick)
  const autoSaveTimerRef = useRef(null);   // Auto-save mỗi 30s
  const [isReady, setIsReady] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isTabActive, setIsTabActive] = useState(true);
  const pauseTimeoutRef = useRef(null);

  // ── Bộ đếm thực tế ──────────────────────────────────────────────────────────
  const initialLocal = parseInt(sessionStorage.getItem(`lms_watched_${lessonId}`) || "0", 10);
  const bestInitial = Math.max(initialWatchedSeconds, initialLocal);
  const actualWatchedRef = useRef(bestInitial); // Số giây xem thực tế
  const [displayWatched, setDisplayWatched] = useState(bestInitial);
  const [totalDuration, setTotalDuration] = useState(lessonDuration || 0);

  // Reset khi đổi bài
  useEffect(() => {
    const localSecs = parseInt(sessionStorage.getItem(`lms_watched_${lessonId}`) || "0", 10);
    const bestSecs = Math.max(initialWatchedSeconds, localSecs);
    actualWatchedRef.current = bestSecs;
    setDisplayWatched(bestSecs);
    setTotalDuration(lessonDuration || 0);
    setHasEnded(false);
    setOverlayVisible(true);
  }, [lessonId, initialWatchedSeconds, lessonDuration]);

  const formatTime = (secs) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const requiredSeconds = totalDuration > 0 ? Math.ceil(totalDuration * 2 / 3) : 0;

  // ── Auto-Unlock khi đạt 2/3 (Mới) ──────────────────────────────────────────
  useEffect(() => {
    if (!totalDuration || !onEligibilityReached) return;
    const reqSecs = Math.ceil(totalDuration * 2 / 3);
    // Kích hoạt duy nhất 1 lần khi đúng chạm mốc 2/3
    if (displayWatched === reqSecs && displayWatched > 0) {
       onEligibilityReached(displayWatched, totalDuration);
    }
  }, [displayWatched, totalDuration, onEligibilityReached]);

  // ── Giám sát tương tác Tab (Mới) ───────────────────────────────────────────
  useEffect(() => {
    const handleInactive = () => {
      setIsTabActive(false);
      if (playerRef.current?.pauseVideo) {
        try { playerRef.current.pauseVideo(); } catch (e) { console.error(e); }
      }
    };
    const handleActive = () => {
      setIsTabActive(true);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) handleInactive();
      else handleActive();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleInactive);
    window.addEventListener("focus", handleActive);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleInactive);
      window.removeEventListener("focus", handleActive);
    };
  }, []);

  // ── Khởi tạo YouTube Iframe API ──────────────────────────────────────────────
  useEffect(() => {
    if (!videoId || isLocked) return;

    const initPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setIsReady(false);
      setHasEnded(false);

      playerRef.current = new window.YT.Player(`yt-player-${lessonId}`, {
        videoId: extractYouTubeId(videoId),
        playerVars: {
          controls: 1,           // ✅ Cho phép tua — nhưng chỉ đếm giây thực
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          start: bestInitial ? Math.floor(bestInitial) : 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            setIsReady(true);
            const dur = event.target.getDuration();
            if (dur > 0) setTotalDuration(dur);
            
            // Resume video from where left off
            if (bestInitial > 0) {
              event.target.seekTo(bestInitial, true);
            }
          },
          onStateChange: handleStateChange,
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(autoSaveTimerRef.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId, lessonId, isLocked]);

  // ── Đếm giây thực tế khi PLAYING ─────────────────────────────────────────────
  const startCounting = useCallback(() => {
    if (intervalRef.current) return; // Đã chạy rồi
    intervalRef.current = setInterval(() => {
      actualWatchedRef.current += 1;
      setDisplayWatched(actualWatchedRef.current);
      sessionStorage.setItem(`lms_watched_${lessonId}`, actualWatchedRef.current);
    }, 1000);
  }, [lessonId]);

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

  const handleStateChange = useCallback((event) => {
    const state = event.data;
    // PLAYING = 1
    if (state === window.YT.PlayerState.PLAYING) {
      setOverlayVisible(false);
      setIsPaused(false);
      startCounting();
      // Lấy duration thực nếu chưa có
      if (!totalDuration || totalDuration === 0) {
        const dur = event.target.getDuration?.();
        if (dur > 0) setTotalDuration(dur);
      }
    }
    // PAUSED = 2
    if (state === window.YT.PlayerState.PAUSED) {
      stopCounting();
      setIsPaused(true);
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = setTimeout(() => setIsPaused(false), 1200);
    }
    // ENDED = 0
    if (state === window.YT.PlayerState.ENDED) {
      stopCounting();
      setHasEnded(true);
      setOverlayVisible(true);
      // Kiểm tra 2/3 điều kiện
      if (onVideoEnded) {
        onVideoEnded(actualWatchedRef.current, totalDuration);
      }
    }
  }, [onVideoEnded, startCounting, stopCounting, totalDuration]);

  if (isLocked) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center gap-4 rounded-2xl">
        <div className="w-20 h-20 bg-slate-700/60 rounded-2xl flex items-center justify-center border border-slate-600/40">
          <Lock size={36} className="text-slate-400" />
        </div>
        <p className="text-slate-400 font-bold text-sm">Hoàn thành bài trước để mở khóa</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* YouTube Player */}
      <div ref={containerRef} className="relative flex-1 bg-black group rounded-2xl overflow-hidden">
        <div id={`yt-player-${lessonId}`} className="w-full h-full" />

        {/* ▶️ PREMIUM OVERLAY */}
        {overlayVisible && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(10,14,24,0.88) 0%, rgba(15,25,50,0.75) 100%)', backdropFilter: 'blur(2px)' }}
            onContextMenu={e => e.preventDefault()}
          >
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="bg-red-600 text-white text-[9px] font-black px-2.5 py-1 rounded-md tracking-widest uppercase shadow-lg">THẮNG TIN HỌC</div>
              <div className="bg-white/10 text-white/60 text-[9px] font-bold px-2 py-0.5 rounded backdrop-blur-sm border border-white/10">Nội dung độc quyền</div>
            </div>
            <button
              onClick={() => playerRef.current?.playVideo?.()}
              className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)', boxShadow: '0 0 40px rgba(229,62,62,0.5), 0 8px 32px rgba(0,0,0,0.4)' }}
            >
              <div className="absolute inset-0 rounded-full border-2 border-red-400/40 animate-ping" />
              <Play size={32} className="text-white ml-1 drop-shadow-lg" fill="white" />
            </button>
            <p className="mt-5 text-white/70 text-sm font-semibold tracking-wide">Nhấn để bắt đầu học</p>
            {hasEnded && <span className="mt-2 text-emerald-400 text-xs font-bold flex items-center gap-1.5"><CheckCircle size={13} /> Đã xem xong — Xem lại?</span>}
          </div>
        )}

        {/* INACTIVE TAB OVERLAY */}
        {!isTabActive && !overlayVisible && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm text-center px-4 rounded-2xl">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/40 mb-4 animate-pulse">
               <AlertCircle size={32} className="text-amber-400" />
            </div>
            <h3 className="text-white text-lg font-bold mb-2">Đã tạm dừng tính thời gian</h3>
            <p className="text-slate-300 text-xs max-w-xs font-medium">Vui lòng giữ tương tác và không rời khỏi trình duyệt để hệ thống tiếp tục ghi nhận tiến độ.</p>
          </div>
        )}

        {/* Đã gỡ bỏ Pause flash overlay để không chèn lên component iframe làm lỗi thanh kéo tua video */}

        {/* Loading Overlay */}
        {!isReady && (
          <div className="absolute inset-0 z-20 bg-slate-900 flex items-center justify-center rounded-2xl">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-[3px] border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-400 font-semibold text-xs animate-pulse tracking-widest uppercase">Đang tải video...</p>
            </div>
          </div>
        )}

        {/* Seen badge */}
        {hasEnded && !overlayVisible && (
          <div className="absolute top-3 right-3 z-20 bg-emerald-500 text-white px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1.5 shadow-lg">
            <CheckCircle size={12} /> Đã xem xong
          </div>
        )}
      </div>

      {/* ⏱ TIMER UI — bên dưới video */}
      {isReady && (
        <div className="flex-shrink-0 px-1 py-2 flex items-center justify-between">
          {/* Bên trái: Tiến độ xem thực tế */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <Clock size={12} className="text-blue-400" />
              <span className="text-white font-mono text-[11px] font-bold tabular-nums">
                {formatTime(displayWatched)}
              </span>
              <span className="text-slate-500 text-[11px]">/</span>
              <span className="text-slate-400 font-mono text-[11px] tabular-nums">
                {formatTime(totalDuration)}
              </span>
            </div>

            {/* Progress bar thực tế */}
            {totalDuration > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (displayWatched / totalDuration) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 font-bold">
                  {Math.round((displayWatched / totalDuration) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Bên phải: Yêu cầu 2/3 */}
          {requiredSeconds > 0 && (
            <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
              displayWatched >= requiredSeconds
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400/70 border-amber-500/20'
            }`}>
              {displayWatched >= requiredSeconds
                ? <><CheckCircle size={11} /> Đủ điều kiện</>
                : <><AlertCircle size={11} /> Cần xem {formatTime(Math.max(0, requiredSeconds - displayWatched))} nữa</>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};




// ─── LESSON SIDEBAR ITEM ─────────────────────────────────────────────────────
const LessonItem = ({ lesson, index, isCurrent, onClick }) => {
  const mins = lesson.duration ? Math.floor(lesson.duration / 60) : 0;
  const secs = lesson.duration ? String(lesson.duration % 60).padStart(2, '0') : '00';

  return (
    <div
      onClick={() => lesson.isUnlocked && onClick(lesson)}
      className={`flex items-start gap-3 px-5 py-4 border-b border-slate-100 transition-all relative
        ${!lesson.isUnlocked ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        ${isCurrent ? 'bg-blue-50 border-l-4 border-l-blue-600' : lesson.isCompleted ? 'bg-slate-50 border-l-4 border-l-transparent' : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'}
      `}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {lesson.isCompleted ? (
          <CheckCircle size={18} className="text-blue-600" />
        ) : !lesson.isUnlocked ? (
          <Lock size={16} className="text-slate-400" />
        ) : isCurrent ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-blue-600 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
          </div>
        ) : (
          <PlayCircle size={18} className="text-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">
          Bài {index + 1}
        </p>
        <h4 className={`text-sm leading-snug truncate ${isCurrent ? 'text-blue-700 font-black' : lesson.isCompleted ? 'text-slate-500 font-semibold' : 'text-slate-700 font-bold'}`}>
          {lesson.title}
        </h4>
        {lesson.duration ? (
          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 font-semibold">
            <Clock size={9} /> {mins}:{secs}
          </span>
        ) : null}
      </div>

      {lesson.isCompleted && (
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
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (courseId) load(); }, [courseId]);

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 overflow-hidden">
      <div className="px-8 py-6 bg-gradient-to-r from-blue-900 to-slate-900 flex items-center justify-between">
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
              <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center font-black text-blue-700 text-sm flex-shrink-0">
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
                        className={`h-full rounded-full transition-all ${t.isCertified ? 'bg-emerald-500' : 'bg-blue-500'}`}
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
const TeacherTrainingLMS = ({ onBack, isAdmin = false }) => {
  const { trainingData } = useData() || { trainingData: { videos: [], guides: [], files: [] } };
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [courseProgressMap, setCourseProgressMap] = useState({});
  const [expandedChapters, setExpandedChapters] = useState({});
  const [courseTab, setCourseTab] = useState('video'); // video | data | notice
  const [mainTab, setMainTab] = useState('courses'); // courses | guides | files

  // Lấy tiến độ các khóa học của GV để hiển thị bên ngoài (Bổ sung mới)
  useEffect(() => {
    if (isAdmin) return;
    let isMounted = true;
    lmsApiFetch('/progress/me').then(res => {
      if (res.success && isMounted) setCourseProgressMap(res.data || {});
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [isAdmin, mainTab, selectedCourse]);

  // Sync with trainingData from Admin (via DataContext)
  useEffect(() => {
    if (trainingData && trainingData.videos) {
      setCourses(trainingData.videos);
      setLoading(false);
    }
  }, [trainingData]);

  // ── Persist session khi reload (Issue #3) ──
  // Lưu courseId đang mở vào sessionStorage
  useEffect(() => {
    if (selectedCourse?._id) {
      sessionStorage.setItem('lms_courseId', selectedCourse._id);
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
      if (res.success) {
        setLessons(res.data);
        // Khôi phục lesson đang xem nếu có savedLessonId
        const savedLessonId = sessionStorage.getItem('lms_lessonId');
        const firstActive = (savedLessonId && res.data.find(l => String(l._id) === savedLessonId && l.isUnlocked))
          || res.data.find(l => l.isUnlocked && !l.isCompleted)
          || res.data[0];
        setCurrentLesson(firstActive);
        // Expand all chapters by default
        const chapters = {};
        res.data.forEach(l => { chapters[l.chapterTitle || 'Chương 1'] = true; });
        setExpandedChapters(chapters);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Restore session khi courses đã load
  useEffect(() => {
    const savedCourseId = sessionStorage.getItem('lms_courseId');
    if (!savedCourseId || selectedCourse) return; // Đã có course rồi
    if (courses.length === 0) return;
    const course = courses.find(c => String(c._id || c.id) === String(savedCourseId));
    if (course) {
      setSelectedCourse(course);
      fetchLessons(course._id || course.id);
    }
  }, [courses, selectedCourse]);

  // Auto-Unlock sự kiện khi đạt chuẩn 2/3 (Chạy ngầm, không nhảy video)
  const handleEligibilityReached = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse) return;
    try {
      const token = localStorage.getItem('teacher_access_token') ||
                    (localStorage.getItem('teacher_user') ? JSON.parse(localStorage.getItem('teacher_user')).token : '') ||
                    localStorage.getItem('admin_access_token');
      
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      await fetch(`${API_BASE}/training-lms/complete-lesson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId: currentLesson._id || currentLesson.id,
          courseId: selectedCourse._id || selectedCourse.id,
          watchedSeconds: actualWatched, 
        }),
      });
      // Tải lại bài giảng để UI gỡ bỏ ổ khóa bài tiếp theo ở sidebar
      const res = await lmsApiFetch(`/courses/${selectedCourse._id || selectedCourse.id}/lessons`);
      if (res.success) {
        setLessons(res.data);
      }
    } catch (e) {}
  }, [currentLesson, selectedCourse]);

  // Video kết thúc (được component con tính toán 2/3 và gọi)
  const handleVideoEnded = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse || completing) return;
    
    const requiredSeconds = Math.ceil((totalDur || 0) * 2 / 3);
    // Tránh việc hiển thị Alert gây khó chịu, nếu người dùng tua video tới cuối mà chưa đủ % học
    // thì video sẽ kết thúc nhưng không gửi API mở khóa, chờ hệ thống tính toán tiến độ thực tế (actualWatched)
    if (actualWatched < requiredSeconds) {
      return;
    }

    setCompleting(true);
    try {
      const token = localStorage.getItem('teacher_user') ? JSON.parse(localStorage.getItem('teacher_user')).token : '';
      await fetch('/api/training/complete-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessonId: currentLesson._id,
          courseId: selectedCourse._id,
          watchedSeconds: actualWatched, // Lưu luôn giây thực tế lúc complete
        }),
      });
      // Reload để mở khóa bài tiếp theo
      const res = await lmsApiFetch(`/courses/${selectedCourse._id}/lessons`);
      if (res.success) {
        const updatedLessons = res.data;
        setLessons(updatedLessons);
        // Tự động chuyển sang bài tiếp theo nếu có
        const currentIdx = updatedLessons.findIndex(l => String(l._id) === String(currentLesson._id));
        const next = updatedLessons[currentIdx + 1];
        if (next?.isUnlocked) {
          setTimeout(() => setCurrentLesson(next), 800);
        }
      }
    } catch (e) { console.error(e); }
    setCompleting(false);
  }, [currentLesson, selectedCourse, completing]);

  // Handle lưu progress tạm thời
  const handleSaveProgress = useCallback((lessonId, watchedSeconds) => {
    if (!selectedCourse) return;
    const token = localStorage.getItem('teacher_access_token') ||
                  (localStorage.getItem('teacher_user') ? JSON.parse(localStorage.getItem('teacher_user')).token : '') ||
                  localStorage.getItem('admin_access_token');
                  
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    fetch(`${API_BASE}/training-lms/save-watch-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lessonId: lessonId,
        courseId: selectedCourse._id || selectedCourse.id,
        watchedSeconds: watchedSeconds,
      }),
    }).catch(e => console.error("Could not auto-save progress:", e));
  }, [selectedCourse]);

  const overallProgress = lessons.length > 0
    ? Math.round((lessons.filter(l => l.isCompleted).length / lessons.length) * 100)
    : 0;

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
      <div className="p-6 md:p-10 animate-in fade-in duration-500 min-h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none">
              Trung tâm Đào tạo Nội bộ
            </h1>
            <p className="text-slate-400 font-medium mt-2 text-sm">
              Hoàn thành chương trình để được chứng nhận đủ điều kiện nhận lớp
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${showAdminPanel ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
              >
                <BarChart2 size={16} /> Xem tiến độ
              </button>
            )}
          </div>
        </div>

        {/* Admin Progress Panel */}
        {isAdmin && showAdminPanel && courses.length > 0 && (
          <div className="mb-10">
            <AdminProgressPanel courseId={courses[0]?._id} />
          </div>
        )}

        {/* TOP TABS FOR TEACHER */}
        <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100 w-fit mb-8">
          {[
            { key: 'courses', icon: Video, label: 'Khóa học', count: courses.length },
            { key: 'guides', icon: FileText, label: 'Quy trình', count: trainingData?.guides?.length || 0 },
            { key: 'files', icon: Download, label: 'Tài liệu', count: trainingData?.files?.length || 0 },
          ].map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                mainTab === t.key
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}>
              <t.icon size={16} /> {t.label} 
              <span className={`text-[10px] ml-1 bg-white/20 px-2 py-0.5 rounded-full ${mainTab === t.key ? 'text-white' : 'bg-slate-200 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {mainTab === 'courses' && (
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-gray-100 animate-pulse rounded-[32px] h-64" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white rounded-3xl border border-dashed border-slate-200">
               <BookOpen size={48} className="mx-auto mb-4 text-slate-200" />
               <p className="font-bold">Chưa có khóa học nào</p>
               <p className="text-xs mt-1">Hệ thống chưa có khóa học nào được xuất bản.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course, idx) => {
                 const gradients = [
                    "from-blue-600 via-indigo-600 to-purple-600",
                    "from-emerald-500 via-teal-500 to-emerald-700",
                    "from-rose-500 via-red-500 to-rose-700",
                    "from-cyan-500 via-blue-500 to-indigo-600"
                 ];
                 const bgClass = gradients[idx % gradients.length];
                 return (
                 <div onClick={() => { 
                    setSelectedCourse(course);
                    setCourseTab('video');
                    fetchLessons(course.id || course._id);
                 }} key={course.id || course._id} className="bg-white rounded-[24px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group flex flex-col relative overflow-hidden">
                    
                    {/* KHU VỰC THUMBNAIL (BANNER) */}
                    <div className={`h-36 bg-gradient-to-tr ${bgClass} relative overflow-hidden flex items-center justify-center`}>
                       {/* Hiệu ứng ánh sáng nền */}
                       <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors pointer-events-none" />
                       <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-xl pointer-events-none" />
                       
                       {/* Trạng thái Category */}
                       <div className="absolute top-4 right-4">
                          <span className="bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm text-[9px] font-black px-2.5 py-1 rounded-lg tracking-wider uppercase">
                             {course.category || 'MẶC ĐỊNH'}
                          </span>
                       </div>
                    </div>

                    {/* Vòng tròn tiến độ nổi ngoài viền - KHÔNG THỂ BỊ CẮT VÌ ĐẶT BÊN NGOÀI */}
                    <div className="absolute top-[116px] left-6 z-10 bg-white p-1 rounded-full shadow-md border-2 border-slate-200 transition-transform duration-300 group-hover:scale-110 pointer-events-none">
                       <CircularProgress size={56} progress={courseProgressMap[course.id || course._id] || course.overallProgress || course.progress || 0} />
                    </div>

                    {/* KHU VỰC THÔNG TIN */}
                    <div className="pt-10 pb-5 px-6 flex-1 flex flex-col">
                       <h3 className="font-extrabold text-slate-800 text-lg group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-2">
                          {course.title}
                       </h3>
                       <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4 flex-1">
                          {course.description || course.desc || 'Hoàn thành khóa học nội bộ này để nâng cao kỹ năng sư phạm và chuyên môn giảng dạy.'}
                       </p>
                       
                       {/* Footer Thông tin số lượng & Nút Học tiếp */}
                       <div className="flex items-center justify-between pt-4 border-t border-dashed border-slate-100">
                          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                             <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
                               <Video size={12} className="text-blue-500" />
                             </div>
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {(course.lessons || course.videos || [1]).length} BÀI HỌC
                             </span>
                          </div>
                          
                          <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-blue-600 group-hover:text-indigo-600">
                             <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                                VÀO HỌC
                             </span>
                             <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                          </div>
                       </div>
                    </div>
                 </div>
              );})}
            </div>
          )
        )}

        {/* GUIDES TAB */}
        {mainTab === 'guides' && (
           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
             <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
               <FileText className="text-blue-600" /> Quy trình & Hướng dẫn
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {trainingData?.guides?.map((guide, idx) => (
                 <div key={idx} className="p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer flex gap-4 items-start">
                   <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl shrink-0">{guide.icon || '📄'}</div>
                   <div>
                     <h3 className="font-bold text-slate-800">{guide.title}</h3>
                     <p className="text-xs text-slate-500 mt-1 line-clamp-2">{(guide.desc?.replace(/<[^>]*>/g, '') || '')}</p>
                   </div>
                 </div>
               ))}
               {(!trainingData?.guides || trainingData.guides.length === 0) && (
                 <p className="text-slate-400 text-sm">Chưa có quy trình nào.</p>
               )}
             </div>
           </div>
        )}

        {/* FILES TAB */}
        {mainTab === 'files' && (
           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
             <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
               <Download className="text-green-600" /> Tài liệu Đào tạo
             </h2>
             <div className="space-y-3">
               {trainingData?.files?.map((file, idx) => (
                 <div key={idx} className="p-4 rounded-xl border border-slate-100 hover:bg-green-50 hover:border-green-200 transition-all flex justify-between items-center group cursor-pointer">
                   <div className="flex items-center gap-4">
                     <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black text-white ${file.fileType === 'PDF' ? 'bg-red-500' : 'bg-green-500'}`}>{file.fileType || 'FILE'}</div>
                     <div>
                       <h3 className="font-bold text-slate-800">{file.title}</h3>
                       <p className="text-xs text-slate-400">{file.fileSize || 'N/A'}</p>
                     </div>
                   </div>
                   <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 group-hover:bg-green-500 group-hover:text-white group-hover:border-green-500 transition-all">Tải xuống</button>
                 </div>
               ))}
               {(!trainingData?.files || trainingData.files.length === 0) && (
                 <p className="text-slate-400 text-sm">Chưa có tài liệu nào.</p>
               )}
             </div>
           </div>
        )}

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
            className={`h-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-400' : 'bg-blue-500'}`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        <div className="h-13 px-5 flex items-center justify-between" style={{ height: '52px' }}>
          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => { setSelectedCourse(null); setLessons([]); setCurrentLesson(null); }}
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all text-slate-400 hover:text-white flex-shrink-0"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="w-px h-5 bg-white/10 flex-shrink-0" />
            <div className="min-w-0 flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1 bg-blue-500/15 text-blue-400 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border border-blue-500/20">
                KHÓA HỌC
              </span>
              <h2 className="font-bold text-[13px] text-slate-100 truncate leading-none">{selectedCourse.title}</h2>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {completing && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold animate-pulse uppercase tracking-widest">
                <RefreshCw size={11} className="animate-spin" /> Đang lưu...
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-slate-500 font-semibold hidden sm:block">
                Tiến độ hoàn thành
                <strong className={`ml-1.5 ${overallProgress === 100 ? 'text-emerald-400' : 'text-white'}`}>{overallProgress}%</strong>
              </p>
              {overallProgress === 100 && <Award size={16} className="text-emerald-400" />}
            </div>
          </div>
        </div>
      </div>

      {/* ─── BODY: 70 / 30 ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ══ LEFT COLUMN ══ */}
        <div className="flex flex-col flex-1 min-w-0 lg:flex-[7] overflow-hidden">

          {/* VIDEO WRAPPER — 3:4 aspect ratio, max 75vh, centered */}
          <div className="flex-shrink-0 px-5 pt-4 pb-3 flex justify-center">
            <div
              className="relative overflow-hidden shadow-2xl shadow-black/60 w-full"
              style={{
                borderRadius: '16px',
                aspectRatio: '16 / 9',
                maxHeight: '65vh',
                margin: '0 auto',
              }}
            >
              <YouTubePlayerSecure
                key={currentLesson?._id}
                videoId={currentLesson?.videoUrl}
                lessonId={currentLesson?._id}
                courseId={selectedCourse?._id}
                duration={currentLesson?.duration}
                initialWatchedSeconds={currentLesson?.watchedSeconds || 0}
                onVideoEnded={handleVideoEnded}
                onSaveProgress={handleSaveProgress}
                onEligibilityReached={handleEligibilityReached}
                isLocked={!currentLesson?.isUnlocked}
              />
            </div>
          </div>

          {/* INFO PANEL BELOW VIDEO */}
          <div className="flex flex-col flex-1 min-h-0">

            {/* TAB BAR */}
            <div className="flex px-5 flex-shrink-0 border-b border-white/[0.06]" style={{ background: '#0d1117' }}>
              {[
                { key: 'video', label: 'Bài giảng' },
                { key: 'data',  label: 'Tài liệu'  },
                { key: 'notice',label: 'Thông báo'  },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setCourseTab(t.key)}
                  className={`px-5 py-3.5 text-[11px] font-bold tracking-wide border-b-2 transition-all ${
                    courseTab === t.key
                      ? 'text-white border-blue-500'
                      : 'text-slate-500 border-transparent hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar-dark" style={{ background: '#0d1117' }}>

              {courseTab === 'video' && currentLesson && (
                <div className="max-w-3xl space-y-5">
                  {/* Chapter label + Title */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-block text-[9px] font-black text-blue-400/80 uppercase tracking-[0.15em] mb-2">
                        {currentLesson.chapterTitle || 'Mục lục'}
                      </span>
                      <h1 className="text-xl font-bold text-white leading-snug">
                        {currentLesson.title}
                      </h1>
                      {currentLesson.duration && (
                        <span className="inline-flex items-center gap-1.5 mt-2 text-slate-500 text-[11px] font-semibold">
                          <Clock size={12} />
                          {Math.floor(currentLesson.duration / 60)} phút {String(currentLesson.duration % 60).padStart(2,'0')}s
                        </span>
                      )}
                    </div>
                    {currentLesson.isCompleted && (
                      <div className="flex-shrink-0 flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-emerald-500/20">
                        <CheckCircle size={13} /> Đã hoàn thành
                      </div>
                    )}
                  </div>

                  {/* Anti-cheat notice */}
                  <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                    <AlertCircle size={14} className="text-amber-400/80 flex-shrink-0" />
                    <p className="text-amber-200/60 text-[11px] leading-relaxed">
                      <strong className="text-amber-400/80">Lưu ý:</strong> Hệ thống chống tua video đã bật.
                      Bạn phải xem hết thời lượng video để được ghi nhận tiến độ hoàn thành.
                    </p>
                  </div>

                  {/* Description */}
                  <div className="pt-4 border-t border-white/[0.06] space-y-2">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Mô tả bài giảng</p>
                    <p className="text-slate-400 leading-relaxed text-[13px]">
                      {currentLesson.description || 'Vui lòng theo dõi video để nắm vững kiến thức. Hệ thống sẽ tự động ghi nhận tiến độ học tập khi bạn xem hết thời lượng yêu cầu của bài giảng này.'}
                    </p>
                  </div>
                </div>
              )}

              {courseTab === 'data' && (
                <div className="max-w-3xl space-y-3">
                  {!selectedCourse.files || selectedCourse.files.length === 0 ? (
                    <div className="text-center py-10 text-slate-600 text-sm">Khóa học này chưa có tài liệu đính kèm.</div>
                  ) : selectedCourse.files.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${
                          file.type === 'PDF' ? 'bg-rose-500/80' : file.type === 'DOCX' ? 'bg-blue-600/80' : 'bg-emerald-600/80'
                        }`}>{file.type}</div>
                        <div>
                          <h4 className="font-semibold text-slate-200 text-sm">{file.title}</h4>
                          <p className="text-[10px] text-slate-600 mt-0.5">{file.size}</p>
                        </div>
                      </div>
                      <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <Download size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {courseTab === 'notice' && (
                <div className="max-w-3xl space-y-3">
                  {!selectedCourse.notices || selectedCourse.notices.length === 0 ? (
                    <div className="text-center py-10 text-slate-600 text-sm">Không có thông báo mới nào từ ban quản trị.</div>
                  ) : selectedCourse.notices.map((n, idx) => (
                    <div key={idx} className="bg-white/[0.04] p-4 rounded-xl border border-white/[0.06]">
                      <p className="text-[13px] text-slate-300 leading-relaxed">{n}</p>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ══ RIGHT SIDEBAR ══ */}
        <div className="hidden lg:flex flex-col lg:flex-[3] border-l" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0b1018' }}>

          {/* Sidebar Header */}
          <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">Nội dung khóa học</h3>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                  overallProgress === 100
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/20'
                }`}
              >
                {lessons.filter(l => l.isCompleted).length}/{lessons.length} BÀI
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  overallProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'
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

                  {isExpanded && chapterLessons.map((lesson) => {
                    const globalIdx = lessons.findIndex(l => String(l._id) === String(lesson._id));
                    const isCurrent = currentLesson?._id === lesson._id;
                    return (
                      <div
                        key={lesson._id}
                        onClick={() => lesson.isUnlocked && setCurrentLesson(lesson)}
                        className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all relative ${
                          !lesson.isUnlocked ? 'opacity-40 pointer-events-none' : ''
                        } ${
                          isCurrent
                            ? 'bg-blue-600/10 border-l-2 border-blue-500'
                            : 'border-l-2 border-transparent hover:bg-white/[0.04]'
                        }`}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      >
                        {/* Status icon */}
                        <div className="mt-0.5 flex-shrink-0">
                          {lesson.isCompleted ? (
                            <div className="w-[18px] h-[18px] rounded-full bg-blue-500/20 flex items-center justify-center">
                              <CheckCircle size={12} className="text-blue-400" />
                            </div>
                          ) : !lesson.isUnlocked ? (
                            <Lock size={14} className="text-slate-600" />
                          ) : isCurrent ? (
                            <div className="w-[18px] h-[18px] rounded-full border-2 border-blue-500 flex items-center justify-center">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            </div>
                          ) : (
                            <PlayCircle size={16} className="text-slate-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-wider mb-0.5">Bài {globalIdx + 1}</p>
                          <h4 className={`text-[12px] leading-snug truncate ${
                            isCurrent ? 'text-blue-400 font-bold' : lesson.isCompleted ? 'text-slate-500 font-semibold' : 'text-slate-300 font-semibold'
                          }`}>
                            {lesson.title}
                          </h4>
                          {lesson.duration ? (
                            <span className="text-[10px] text-slate-600 flex items-center gap-1 mt-1">
                              <Clock size={9} />
                              {Math.floor(lesson.duration / 60)}:{String(lesson.duration % 60).padStart(2,'0')}
                            </span>
                          ) : null}
                        </div>

                        {lesson.isCompleted && (
                          <div className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5">
                            <CheckCircle size={9} className="text-emerald-500" />
                          </div>
                        )}
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

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar-dark::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />
    </div>
  );
};

export default TeacherTrainingLMS;
