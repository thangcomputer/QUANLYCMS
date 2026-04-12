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
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]+)/);
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
  const [expandedChapters, setExpandedChapters] = useState({});
  const [courseTab, setCourseTab] = useState('video'); // video | data | notice
  const [mainTab, setMainTab] = useState('courses'); // courses | guides | files

  // Sync with trainingData from Admin (via DataContext)
  useEffect(() => {
    if (trainingData && trainingData.videos) {
      setCourses(trainingData.videos);
      setLoading(false);
    }
  }, [trainingData]);

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
      const token = localStorage.getItem('teacher_user') ? JSON.parse(localStorage.getItem('teacher_user')).token : '';
      await fetch('/api/training/mark-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
              {courses.map(course => (
                 <div onClick={() => { 
                    setSelectedCourse(course);
                    let mockLessons = course.lessons || course.videos || [];
                    if (mockLessons.length === 0 && course.videoUrl) {
                        mockLessons = [{ _id: `v-${course.id}`, title: course.title, videoUrl: course.videoUrl, duration: 0, isUnlocked: true }];
                    } else if (mockLessons.length === 0) {
                        mockLessons = [{ _id: 'default-1', title: 'Giới thiệu', videoUrl: 'https://youtube.com/embed/dQw4w9WgXcQ', duration: 0, isUnlocked: true }];
                    }
                    
                    const builtLessons = mockLessons.map((v, i) => ({
                      _id: v._id || `ls-${i}`,
                      title: v.title || 'Bài học',
                      videoUrl: v.videoUrl || v.url || 'https://youtube.com/embed/dQw4w9WgXcQ',
                      duration: v.duration || 0,
                      isUnlocked: true,
                      isCompleted: false
                    }));
                    setLessons(builtLessons);
                    setCurrentLesson(builtLessons[0]);
                    setCourseTab('video');
                 }} key={course.id || course._id} className="bg-white rounded-[24px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer group flex flex-col relative overflow-hidden">
                    
                    {/* KHU VỰC THUMBNAIL (BANNER) */}
                    <div className="h-36 bg-gradient-to-tr from-blue-700 via-indigo-600 to-purple-600 relative overflow-hidden flex items-center justify-center">
                       {/* Hiệu ứng ánh sáng nền */}
                       <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors pointer-events-none" />
                       <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-xl pointer-events-none" />
                       
                       {/* Trạng thái Category */}
                       <div className="absolute top-4 right-4">
                          <span className="bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm text-[9px] font-black px-2.5 py-1 rounded-lg tracking-wider uppercase">
                             {course.category || 'MẶC ĐỊNH'}
                          </span>
                       </div>

                       {/* Vòng tròn tiến độ nằm nổi giữa viền banner */}
                       <div className="absolute -bottom-8 left-6 bg-white p-1 rounded-full shadow-lg border border-slate-50">
                          <CircularProgress size={64} progress={course.overallProgress || course.progress || 0} />
                       </div>
                    </div>

                    {/* KHU VỰC THÔNG TIN */}
                    <div className="pt-12 pb-5 px-6 flex-1 flex flex-col">
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
              ))}
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
    <div className="flex flex-col" style={{ height: '100dvh', maxHeight: '100dvh', background: '#0f172a', color: 'white', overflow: 'hidden' }}>
      {/* ─── HEADER (Top bar tiến độ thanh mảnh) ─────────────────────────────────── */}
      <div className="relative border-b flex-shrink-0 bg-blue-900 border-blue-800 z-50">
        {/* Thanh tiến độ thật mỏng ở trên cùng */}
        <div className="absolute top-0 left-0 h-1 bg-black/20 w-full">
           <div className={`h-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-400' : 'bg-red-500'}`} style={{ width: `${overallProgress}%` }} />
        </div>
        
        <div className="h-14 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => { setSelectedCourse(null); setLessons([]); setCurrentLesson(null); }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-white tracking-tight truncate leading-none">{selectedCourse.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {completing && (
              <div className="flex items-center gap-2 text-emerald-300 text-[10px] font-bold animate-pulse uppercase">
                <RefreshCw size={12} className="animate-spin" /> Đang lưu tiến độ...
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-blue-200 font-semibold hidden sm:block">Tiến độ hoàn thành: <strong className="text-white">{overallProgress}%</strong></p>
              {overallProgress === 100 && <Award size={18} className="text-emerald-400 ml-2" />}
            </div>
          </div>
        </div>
      </div>

      {/* ─── BODY: 7:3 LAYOUT ──────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: VIDEO + INFO (70%) */}
        <div className="flex flex-col overflow-y-auto" style={{ width: '70%' }}>
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

          {/* ── TabsMenu ── */}
          <div className="flex px-6 border-b border-white/5 bg-[#1e293b]">
             <button onClick={() => setCourseTab('video')} className={`px-6 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'video' ? 'text-blue-400 border-blue-400' : 'text-slate-400 border-transparent hover:text-slate-300'}`}>
               <Video size={14} className="inline mr-2" /> THÔNG TIN BÀI GIẢNG
             </button>
             <button onClick={() => setCourseTab('data')} className={`px-6 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'data' ? 'text-green-400 border-green-400' : 'text-slate-400 border-transparent hover:text-slate-300'}`}>
               <FileBox size={14} className="inline mr-2" /> TÀI LIỆU KHÓA HỌC
             </button>
             <button onClick={() => setCourseTab('notice')} className={`px-6 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${courseTab === 'notice' ? 'text-amber-400 border-amber-400' : 'text-slate-400 border-transparent hover:text-slate-300'}`}>
               <AlertCircle size={14} className="inline mr-2" /> THÔNG BÁO TỪ ADMIN
             </button>
          </div>

          {/* ── Tab Content ── */}
          <div className="p-8">
            {courseTab === 'video' && currentLesson && (
              <div className="space-y-6">
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
                  <span className="flex items-center gap-2 text-rose-400/80">
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
                    {currentLesson.description || 'Vui lòng theo dõi video để nắm vững kiến thức. Hệ thống sẽ ghi nhận tiến độ học tập dựa trên thời lượng bạn xem.'}
                  </p>
                </div>

                {/* Anti-cheat notice */}
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                  <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
                  <p className="text-amber-300/80 text-xs font-bold">
                    <strong className="text-amber-400">Lưu ý:</strong> Hệ thống chống tua video đã bật. 
                    Bạn phải xem hết thời lượng video để được ghi nhận tiến độ hoàn thành.
                  </p>
                </div>
              </div>
            )}

            {courseTab === 'data' && (
               <div className="space-y-4">
                  {!selectedCourse.files ? (
                    <div className="text-center py-12 text-slate-500 font-bold bg-white/5 rounded-2xl border border-dashed border-white/10">Khóa học này chưa có tài liệu đính kèm.</div>
                  ) : (
                    selectedCourse.files.map((file, idx) => (
                      <div key={idx} className="bg-[#1e293b] rounded-2xl p-5 border border-white/5 flex items-center justify-between hover:border-green-500/30 transition-colors">
                         <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-sm ${file.type === 'PDF' ? 'bg-rose-500' : file.type === 'DOCX' ? 'bg-blue-500' : 'bg-emerald-500'}`}>{file.type}</div>
                            <div>
                              <h4 className="font-bold text-slate-200">{file.title}</h4>
                              <p className="text-xs text-slate-500 mt-1 font-semibold">{file.size}</p>
                            </div>
                         </div>
                         <button className="px-5 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors">
                           <Download size={14} /> Tải file
                         </button>
                      </div>
                    ))
                  )}
               </div>
            )}

            {courseTab === 'notice' && (
               <div className="space-y-4">
                  {!selectedCourse.notices ? (
                    <div className="text-center py-12 text-slate-500 font-bold bg-white/5 rounded-2xl border border-dashed border-white/10">Chưa có thông báo nào.</div>
                  ) : (
                    selectedCourse.notices.map((n, idx) => (
                      <div key={idx} className="bg-amber-500/10 border-l-4 border-amber-500 p-5 rounded-r-2xl">
                        <p className="text-sm font-semibold text-amber-100 leading-relaxed">{n}</p>
                      </div>
                    ))
                  )}
               </div>
            )}
          </div>
        </div>

        {/* RIGHT: PLAYLIST SIDEBAR (30%) */}
        <div className="flex flex-col border-l border-slate-200 overflow-hidden flex-shrink-0" style={{ width: '30%', background: '#ffffff', color: '#1e293b' }}>
          {/* Sidebar Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0 bg-slate-50">
            <h3 className="font-black uppercase tracking-widest text-slate-800 text-xs">
              Nội dung học tập
            </h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-1">
              Đã hoàn thành <strong className="text-blue-600">{lessons.filter(l => l.isCompleted).length}</strong>/{lessons.length} bài
            </p>
          </div>

          {/* Lesson List */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
            {Object.entries(groupedLessons).map(([chapter, chapterLessons]) => {
              const isExpanded = expandedChapters[chapter] !== false;
              const chapterCompleted = chapterLessons.filter(l => l.isCompleted).length;
              return (
                <div key={chapter}>
                  {/* Chapter Header */}
                  <button
                    onClick={() => setExpandedChapters(prev => ({ ...prev, [chapter]: !prev[chapter] }))}
                    className="w-full px-5 py-3.5 bg-slate-100 border-b border-slate-200 border-t flex items-center justify-between text-left hover:bg-slate-200 transition-colors"
                  >
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">{chapter}</p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{chapterCompleted}/{chapterLessons.length} hoàn thành</p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-600" /> : <ChevronDown size={14} className="text-slate-600" />}
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
