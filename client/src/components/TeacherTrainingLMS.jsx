import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, CheckCircle, Lock, ChevronRight, Clock, Award, BookOpen,
  ArrowLeft, Shield, Users, BarChart2, RefreshCw, GraduationCap,
  PlayCircle, ChevronDown, ChevronUp, Star, AlertCircle
} from 'lucide-react';

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

  const res = await fetch(`/api/training-lms${endpoint}`, {
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
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : url.trim();
};

// ─── YOUTUBE PLAYER COMPONENT ────────────────────────────────────────────────
// Tuân thủ đầy đủ yêu cầu: vô hiệu hoá seek, chặn tua, chỉ ghi nhận khi ENDED
const YouTubePlayerSecure = ({ videoId, lessonId, onVideoEnded, isLocked }) => {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const watchedDurationRef = useRef(0);  // Tổng giây đã xem (không tua)
  const lastPositionRef = useRef(0);     // Vị trí cuối cùng hợp lệ
  const intervalRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // Khởi tạo YouTube Iframe API
  useEffect(() => {
    if (!videoId || isLocked) return;

    const initPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        watchedDurationRef.current = 0;
        lastPositionRef.current = 0;
      }
      setIsReady(false);
      setHasEnded(false);

      playerRef.current = new window.YT.Player(`yt-player-${lessonId}`, {
        videoId: extractYouTubeId(videoId),
        playerVars: {
          controls: 0,           // Tắt bộ điều khiển gốc
          disablekb: 1,          // Vô hiệu phím tắt bàn phím
          rel: 0,                // Không hiện video gợi ý
          modestbranding: 1,     // Ẩn logo YouTube
          iv_load_policy: 3,     // Ẩn chú thích
          fs: 0,                 // Tắt fullscreen mặc định
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => setIsReady(true),
          onStateChange: handleStateChange,
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      // Load script nếu chưa có
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
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId, lessonId, isLocked]);

  // ── CHỐNG TUA: Polling mỗi 500ms ────────────────────────────────────────────
  // Nếu video tua tới, kéo nó về vị trí hợp lệ cuối cùng
  useEffect(() => {
    if (!isReady) return;

    intervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      if (player.getPlayerState() !== window.YT.PlayerState.PLAYING) return;

      const currentTime = player.getCurrentTime();
      const tolerance = 2; // giây

      // Nếu vị trí hiện tại vượt quá thời gian đã xem hợp lệ → tua lại
      if (currentTime > watchedDurationRef.current + tolerance) {
        player.seekTo(lastPositionRef.current, true);
        return;
      }

      // Cập nhật tiến độ hợp lệ
      lastPositionRef.current = currentTime;
      if (currentTime > watchedDurationRef.current) {
        watchedDurationRef.current = currentTime;
      }
    }, 500);

    return () => clearInterval(intervalRef.current);
  }, [isReady]);

  const handleStateChange = useCallback((event) => {
    // ENDED = 0 → ghi nhận hoàn thành
    if (event.data === window.YT.PlayerState.ENDED) {
      setHasEnded(true);
      clearInterval(intervalRef.current);
      if (onVideoEnded) onVideoEnded();
    }
  }, [onVideoEnded]);

  if (isLocked) {
    return (
      <div className="aspect-video bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center">
          <Lock size={36} className="text-slate-500" />
        </div>
        <p className="text-slate-400 font-bold text-sm">Hoàn thành bài trước để mở khóa</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative aspect-video bg-black group">
      {/* YouTube Player Container */}
      <div id={`yt-player-${lessonId}`} className="w-full h-full" />

      {/* 🛡️ LỚP CHẶN CHUỘT PHẢI & TƯƠNG TÁC */}
      <div
        className="absolute inset-0 z-10"
        style={{ cursor: 'default', userSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
        onClick={e => e.stopPropagation()}
      />

      {/* Loading Overlay */}
      {!isReady && (
        <div className="absolute inset-0 z-20 bg-slate-900 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 font-bold text-sm animate-pulse">Đang tải video...</p>
          </div>
        </div>
      )}

      {/* Seen badge */}
      {hasEnded && (
        <div className="absolute top-4 right-4 z-20 bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg animate-in zoom-in duration-300">
          <CheckCircle size={14} /> Đã xem xong
        </div>
      )}

      {/* Anti-seek notice */}
      <div className="absolute bottom-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="bg-black/70 text-slate-400 text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <Shield size={10} /> Không thể tua video
        </span>
      </div>
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
      className={`flex items-start gap-3 px-5 py-4 border-b border-white/5 transition-all relative
        ${!lesson.isUnlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}
        ${isCurrent ? 'bg-blue-600/15 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}
      `}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {lesson.isCompleted ? (
          <CheckCircle size={18} className="text-emerald-400" />
        ) : !lesson.isUnlocked ? (
          <Lock size={16} className="text-slate-500" />
        ) : isCurrent ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-blue-400 flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
          </div>
        ) : (
          <PlayCircle size={18} className="text-slate-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">
          Bài {index + 1}
        </p>
        <h4 className={`text-sm font-bold leading-snug truncate ${isCurrent ? 'text-blue-300' : lesson.isCompleted ? 'text-slate-300' : 'text-slate-400'}`}>
          {lesson.title}
        </h4>
        {lesson.duration ? (
          <span className="text-[10px] text-slate-600 flex items-center gap-1 mt-1">
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
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState({});

  // Tải danh sách khóa học
  useEffect(() => {
    fetchCourses();
    // Preload YouTube API
    if (!document.getElementById('yt-api-script') && !window.YT) {
      const tag = document.createElement('script');
      tag.id = 'yt-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await lmsApiFetch('/courses');
      if (res.success) setCourses(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchLessons = async (courseId) => {
    setLoading(true);
    try {
      const res = await lmsApiFetch(`/courses/${courseId}/lessons`);
      if (res.success) {
        setLessons(res.data);
        const firstActive = res.data.find(l => l.isUnlocked && !l.isCompleted) || res.data[0];
        setCurrentLesson(firstActive);
        // Expand all chapters by default
        const chapters = {};
        res.data.forEach(l => { chapters[l.chapterTitle || 'Chương 1'] = true; });
        setExpandedChapters(chapters);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Video kết thúc → ghi nhận và refresh danh sách
  const handleVideoEnded = useCallback(async () => {
    if (!currentLesson || !selectedCourse || completing) return;
    setCompleting(true);
    try {
      await lmsApiFetch('/complete-lesson', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: currentLesson._id,
          courseId: selectedCourse._id,
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
            {onBack && (
              <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-sm transition-colors px-4 py-2.5 rounded-xl hover:bg-blue-50">
                <ArrowLeft size={18} /> Quay lại
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

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 animate-pulse rounded-[32px] h-64" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-24 text-slate-300">
            <GraduationCap size={64} className="mx-auto mb-4 opacity-30" />
            <p className="font-bold text-lg">Chưa có chương trình đào tạo</p>
            <p className="text-sm mt-1">Admin cần tạo khóa học trong hệ thống</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => (
              <div
                key={course._id}
                onClick={() => { setSelectedCourse(course); fetchLessons(course._id); }}
                className="bg-white rounded-[32px] border border-gray-100 overflow-hidden hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all cursor-pointer group"
              >
                <div className="aspect-video bg-gradient-to-br from-blue-600 to-indigo-800 relative overflow-hidden">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <GraduationCap size={48} className="text-white/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-blue-900/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-xl">
                      <Play fill="currentColor" size={24} />
                    </div>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wider">
                      {course.category}
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-black text-slate-800 mb-2 leading-tight">{course.title}</h3>
                  <p className="text-sm text-slate-400 font-medium line-clamp-2 mb-5">{course.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <BookOpen size={13} /> {course.totalLessons || 0} bài học
                    </span>
                    <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform text-blue-500 group-hover:text-blue-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── PLAYER VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: '100dvh', maxHeight: '100dvh', background: '#0f172a', color: 'white', overflow: 'hidden' }}>
      {/* ─── HEADER ─────────────────────────────────── */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between flex-shrink-0 bg-[#1e293b]">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => { setSelectedCourse(null); setLessons([]); setCurrentLesson(null); }}
            className="p-2 hover:bg-white/10 rounded-xl transition-all flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="font-black text-base uppercase tracking-tight truncate leading-none">{selectedCourse.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-36 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-400' : 'bg-blue-500'}`}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <span className={`text-[11px] font-black ${overallProgress === 100 ? 'text-emerald-400' : 'text-blue-400'}`}>
                {overallProgress}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {completing && (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold animate-pulse">
              <RefreshCw size={12} className="animate-spin" /> Đang lưu...
            </div>
          )}
          <div className="flex items-center gap-2">
            <Award size={24} className={overallProgress === 100 ? 'text-yellow-400' : 'text-slate-600'} />
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-black text-slate-500 uppercase">Chứng chỉ</p>
              <p className={`text-[11px] font-black ${overallProgress === 100 ? 'text-yellow-400' : 'text-slate-500'}`}>
                {overallProgress === 100 ? 'ĐỦ ĐIỀU KIỆN ✓' : 'CHƯA ĐỦ'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BODY: 7:3 LAYOUT ──────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: VIDEO + INFO (70%) */}
        <div className="flex flex-col overflow-y-auto scrollbar-hide" style={{ width: '70%' }}>
          {/* Video Player */}
          <div className="flex-shrink-0">
            <YouTubePlayerSecure
              key={currentLesson?._id}
              videoId={currentLesson?.videoUrl}
              lessonId={currentLesson?._id}
              onVideoEnded={handleVideoEnded}
              isLocked={!currentLesson?.isUnlocked}
            />
          </div>

          {/* Lesson Info */}
          {currentLesson && (
            <div className="p-8 space-y-6">
              {/* Title + Status */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">
                    {currentLesson.chapterTitle || 'Chương 1'}
                  </p>
                  <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                    {currentLesson.title}
                  </h1>
                </div>
                {currentLesson.isCompleted && (
                  <div className="flex-shrink-0 p-2 bg-emerald-500/20 rounded-2xl">
                    <CheckCircle size={24} className="text-emerald-400" />
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-6 text-slate-400 text-sm font-bold">
                {currentLesson.duration && (
                  <span className="flex items-center gap-2">
                    <Clock size={14} />
                    {Math.floor(currentLesson.duration / 60)} phút {currentLesson.duration % 60}s
                  </span>
                )}
                <span className="flex items-center gap-2 text-amber-400/80">
                  <Shield size={14} />
                  Không được phép tua video
                </span>
              </div>

              {/* Description */}
              <div className="bg-white/5 rounded-[28px] p-7 border border-white/5">
                <h3 className="text-base font-black mb-3 flex items-center gap-3 text-white">
                  <div className="w-1 h-5 bg-blue-500 rounded-full" />
                  Mô tả bài học
                </h3>
                <p className="text-slate-400 leading-relaxed font-medium text-sm">
                  {currentLesson.description || 'Vui lòng theo dõi video để nắm vững kiến thức. Hệ thống sẽ tự động ghi nhận khi bạn xem xong.'}
                </p>
              </div>

              {/* Anti-cheat notice */}
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
                <p className="text-amber-300/80 text-xs font-bold">
                  <strong className="text-amber-400">Lưu ý:</strong> Hệ thống chống gian lận đang hoạt động. 
                  Chỉ khi xem hết video, tiến độ mới được ghi nhận. Không được tua hoặc bỏ qua.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: PLAYLIST SIDEBAR (30%) */}
        <div className="flex flex-col border-l border-white/5 overflow-hidden flex-shrink-0" style={{ width: '30%', background: '#1e293b' }}>
          {/* Sidebar Header */}
          <div className="px-5 py-4 border-b border-white/5 flex-shrink-0">
            <h3 className="font-black uppercase tracking-widest text-slate-400 text-[11px]">
              Nội dung học tập
            </h3>
            <p className="text-[10px] text-slate-600 mt-1">
              {lessons.filter(l => l.isCompleted).length}/{lessons.length} bài đã hoàn thành
            </p>
          </div>

          {/* Lesson List */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {Object.entries(groupedLessons).map(([chapter, chapterLessons]) => {
              const isExpanded = expandedChapters[chapter] !== false;
              const chapterCompleted = chapterLessons.filter(l => l.isCompleted).length;
              return (
                <div key={chapter}>
                  {/* Chapter Header */}
                  <button
                    onClick={() => setExpandedChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }))}
                    className="w-full px-5 py-3 bg-white/5 flex items-center justify-between text-left hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <p className="text-[11px] font-black text-slate-300 uppercase tracking-wider">{chapter}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{chapterCompleted}/{chapterLessons.length} hoàn thành</p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </button>

                  {/* Lessons in Chapter */}
                  {isExpanded && chapterLessons.map((lesson, localIdx) => {
                    const globalIdx = lessons.findIndex(l => String(l._id) === String(lesson._id));
                    return (
                      <LessonItem
                        key={lesson._id}
                        lesson={lesson}
                        index={globalIdx}
                        isCurrent={currentLesson?._id === lesson._id}
                        onClick={setCurrentLesson}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Completion Card */}
            {overallProgress === 100 && (
              <div className="m-4 p-5 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl text-center animate-in zoom-in duration-500">
                <Award size={28} className="text-yellow-400 mx-auto mb-2" />
                <p className="font-black text-emerald-300 text-sm">Hoàn thành 100%</p>
                <p className="text-emerald-400/70 text-[10px] mt-1">Bạn đủ điều kiện nhận lớp dạy</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherTrainingLMS;
