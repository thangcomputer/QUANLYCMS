import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, CheckCircle, Lock, ChevronRight, Clock, Award, BookOpen,
  ArrowLeft, Shield, Users, BarChart2, RefreshCw, GraduationCap,
  PlayCircle, ChevronDown, ChevronUp, Star, AlertCircle, CheckCircle2,
  FileBox, Video, Download, FileText, Timer, FileUp, UploadCloud, Link as LinkIcon
} from 'lucide-react';

import { useData } from '../context/DataContext';
import StudentExamRoom from './StudentExamRoom';
import api from '../services/api';
import { useToast } from '../utils/toast';

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
// ─── PLAYER LINH HOẠT CHO HỌC VIÊN ─────────────────────────────────────────────


const StudentVideoPlayer = ({ videoId, lessonId }) => {
  const yId = extractYouTubeId(videoId);

  if (!yId) {
    return (
      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center rounded-2xl relative overflow-hidden group">
        <AlertCircle size={40} className="text-slate-600 mb-4" />
        <p className="text-slate-400 font-bold">Chưa có link video</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="relative flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl">
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${yId}?rel=0&controls=1&modestbranding=1&playsinline=1`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
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
        ${isCurrent ? 'bg-green-50 border-l-4 border-l-blue-600' : lesson.isCompleted ? 'bg-slate-50 border-l-4 border-l-transparent' : 'bg-white hover:bg-slate-50 border-l-4 border-l-transparent'}
      `}
    >
      {/* Status Icon */}
      <div className="mt-0.5 flex-shrink-0">
        {lesson.isCompleted ? (
          <CheckCircle size={18} className="text-green-600" />
        ) : !lesson.isUnlocked ? (
          <Lock size={16} className="text-slate-400" />
        ) : isCurrent ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-green-600 flex items-center justify-center">
            <div className="w-2 h-2 bg-green-600 rounded-full animate-ping" />
          </div>
        ) : (
          <PlayCircle size={18} className="text-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">
          Bài {index + 1}
        </p>
        <h4 className={`text-sm leading-snug truncate ${isCurrent ? 'text-green-700 font-black' : lesson.isCompleted ? 'text-slate-500 font-semibold' : 'text-slate-700 font-bold'}`}>
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
const StudentTrainingLMS = ({ trainingDataProp, onBack }) => {
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
  const [courseTab, setCourseTab] = useState('video'); // video | data | notice
  const [mainTab, setMainTab] = useState('courses'); // courses | guides | files
  const [localSubmissions, setLocalSubmissions] = useState({});
  const [uploadingAssignId, setUploadingAssignId] = useState(null);

  const handleFileChange = async (assignmentObj, idx, file) => {
    if (!file) return;
    setUploadingAssignId(idx);
    try {
      const res = await api.assignments.uploadFile(file);
      if (res.success) {
        const fileUrl = res.fileUrl;
        const submitRes = await api.assignments.submit(assignmentObj._id, {
           studentId: student?.id || session?.id,
           teacherId: assignmentObj.teacherId || 'current',
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

  const { students } = useData();
  const session = (() => { try { return JSON.parse(localStorage.getItem('student_user') || '{}'); } catch { return {}; } })();
  const student = (students || []).find(s => s.id === session.id) || {};

  // Lấy tiến độ các khóa học của Học viên từ LocalStorage tính toán động
  useEffect(() => {
    if (isAdmin) return;
    if (courses && courses.length > 0) {
      const progressMap = {};
      courses.forEach(c => {
        let total = 0;
        let completed = 0;
        (c.chapters || [{ lessons: c.lessons || c.videos || [] }]).forEach(chap => {
          (chap.lessons || []).forEach(l => {
            total++;
            const lId = l.id || l._id;
            if (lId && localStorage.getItem(`student_lms_completed_${lId}`) === 'true') {
              completed++;
            }
          });
        });
        progressMap[c.id || c._id] = total > 0 ? Math.round((completed / total) * 100) : 0;
      });
      setCourseProgressMap(progressMap);
    }
  }, [isAdmin, mainTab, selectedCourse, courses]);

  // Sync with trainingData from props
  useEffect(() => {
    if (trainingData && trainingData.videos) {
      setCourses(trainingData.videos);
      setLoading(false);
    }
  }, [trainingData]);

  // Load lessons khi chọn khoá học
  useEffect(() => {
    if (selectedCourse) {
      let list = [];
      (selectedCourse.chapters || [{ title: 'Danh mục', lessons: selectedCourse.lessons || selectedCourse.videos || [] }]).forEach((chap) => {
        (chap.lessons || []).forEach(l => {
          const lId = l.id || l._id || Date.now() + Math.random().toString();
          const isDone = localStorage.getItem(`student_lms_completed_${lId}`) === 'true';
          list.push({ ...l, chapterTitle: chap.title, isUnlocked: true, isCompleted: isDone, _id: lId });
        });
      });
      setLessons(list);
      const chapters = {};
      list.forEach(l => { chapters[l.chapterTitle || 'Danh mục'] = true; });
      setExpandedChapters(chapters);
      setCurrentLesson(list[0]);
    }
  }, [selectedCourse]);

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
    // Disabled fetching from backend for student view since lessons are set from props.
    setLoading(true);
    try {
      const res = { success: false };
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
    } catch (e) { void 0 }
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
      const res = { success: false };
      if (res.success) {
        setLessons(res.data);
      }
    } catch (e) { }
  }, [currentLesson, selectedCourse]);

  // Video kết thúc (được component con tính toán 2/3 và gọi)
  const handleVideoEnded = useCallback(async (actualWatched, totalDur) => {
    if (!currentLesson || !selectedCourse || completing) return;

    const requiredSeconds = Math.ceil((totalDur || 0) * 2 / 3);
    // Tránh việc hiển thị Alert gây khó chịu, nếu người dùng tua video tới cuối mà chưa đủ % học
    // thì video sẽ kết thúc nhưng không gửi API mở khóa, chờ hệ thống tính toán tiến độ thực tế (actualWatched)
    if (false) {
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
      const res = { success: false };
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
    } catch (e) { void 0 }
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
    }).catch(e => void 0);
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
          <div className="flex gap-4">
            {onBack && (
              <button onClick={onBack} className="w-12 h-12 flex flex-shrink-0 items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm mt-1">
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-none mt-2">
                Trung tâm Đào tạo Nội bộ</h1>
              <p className="text-slate-400 font-medium mt-2 text-sm">
                Hoàn thành chương trình để được chứng nhận đủ điều kiện nhận lớp
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${showAdminPanel ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
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
        <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-2 shadow-sm border border-gray-100 w-fit mb-8 relative z-10">
          {[
            { key: 'courses', icon: PlayCircle, label: 'Video học tập', count: courses.length },
            { key: 'files', icon: FileBox, label: 'Tài liệu', count: trainingData?.files?.length || 0 },
            { key: 'assignments', icon: BookOpen, label: 'Bài tập về nhà', count: trainingData?.assignments?.length || 0 },
            { key: 'exams', icon: Award, label: 'Điểm thi', count: trainingData?.exams?.length || 0 },
          ].map(t => (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold tracking-wide transition-all ${mainTab === t.key
                ? 'bg-green-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}>
              <t.icon size={16} /> {t.label}
              <span className={`text-[10px] ml-1 px-2 py-0.5 rounded-full font-black ${mainTab === t.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
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
                  "from-green-600 via-indigo-600 to-purple-600",
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
                      <h3 className="font-extrabold text-slate-800 text-lg group-hover:text-green-600 transition-colors line-clamp-2 leading-snug mb-2">
                        {course.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium line-clamp-2 mb-4 flex-1">
                        {course.description || course.desc || 'Hoàn thành khóa học nội bộ này để nâng cao kỹ năng sư phạm và chuyên môn giảng dạy.'}
                      </p>

                      {/* Footer Thông tin số lượng & Nút Học tiếp */}
                      <div className="flex items-center justify-between pt-4 border-t border-dashed border-slate-100">
                        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          <div className="w-6 h-6 rounded-md bg-green-50 flex items-center justify-center">
                            <Video size={12} className="text-green-500" />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {course.chapters ? course.chapters.reduce((acc, ch) => acc + (ch.lessons ? ch.lessons.length : 0), 0) : ((course.lessons || course.videos || [1]).length)} BÀI HỌC
                          </span>
                        </div>

                        <div className="flex items-center text-[18px] font-black tracking-wider text-green-500 group-hover:text-green-600 transition-colors">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* FILES TAB */}
        {mainTab === 'files' && (
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <Download className="text-green-600" /> Tài liệu Khóa học
            </h2>
            <div className="space-y-3">
              {trainingData?.files?.map((file, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-100 hover:bg-green-50/50 hover:border-green-200 transition-all flex flex-col md:flex-row justify-between md:items-center gap-4 group cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm ${file.fileType === 'PDF' ? 'bg-rose-500' : 'bg-green-500'}`}>
                      {file.fileType || 'FILE'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base leading-tight group-hover:text-green-700 transition-colors">{file.title}</h3>
                      <p className="text-[12px] text-slate-500 mt-1 mb-1 line-clamp-1">{file.desc || 'Tài liệu đính kèm từ Admin'}</p>
                      <p className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 w-fit rounded">{file.fileSize || 'N/A'}</p>
                    </div>
                  </div>
                  <button className="w-full md:w-auto px-5 py-2.5 bg-green-50 text-green-700 border border-transparent rounded-[10px] text-sm font-bold group-hover:bg-green-600 group-hover:text-white group-hover:shadow-md transition-all shrink-0 flex items-center justify-center gap-2">
                    <Download size={16} /> Tải về
                  </button>
                </div>
              ))}
              {(!trainingData?.files || trainingData.files.length === 0) && (
                <div className="text-center py-12 text-slate-400">
                  <FileBox size={32} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">Chưa có tài liệu nào được cung cấp.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ASSIGNMENTS TAB */}
        {mainTab === 'assignments' && (
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <BookOpen className="text-green-600" /> Bài tập từ Giảng viên
            </h2>
            <div className="space-y-4">
              {trainingData?.assignments?.map((a, idx) => {
                let targetDate = null;
                let isLate = false;
                if (a.deadline) {
                  const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
                  targetDate = new Date(new Date(a.deadline).toLocaleString("en-US", {timeZone: "Asia/Ho_Chi_Minh"}));
                  targetDate.setHours(23, 59, 59, 999);
                  isLate = now.getTime() > targetDate.getTime();
                }
                return (
                  <div key={idx} className="p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-all flex flex-col md:flex-row gap-5 items-start bg-slate-50/50">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-100 to-indigo-100 flex items-center justify-center text-green-600 shrink-0 border border-green-200 shadow-inner">
                      <FileUp size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                        <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{a.title}</h3>
                        {!a.isSubmitted && a.deadline && (
                          <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap w-fit ${isLate ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                            <Timer size={14} className={isLate ? '' : 'animate-pulse'} />
                            <CountdownTimer deadline={a.deadline} />
                          </div>
                        )}
                      </div>
                      <p className="text-[13px] text-slate-600 mb-4">{a.description || 'Hoàn thành và nộp file bài tập theo đúng định dạng được yêu cầu (.zip, .rar, .pdf).'}</p>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <a href={a.fileUrl || '#'} target="_blank" className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:border-slate-300 hover:bg-slate-50 font-bold text-sm transition-all shadow-sm">
                          <LinkIcon size={16} /> Tải đề bài
                        </a>
                        {(() => {
                          const submission = a.mySubmission || localSubmissions[idx];
                          if (!submission) {
                            return (
                              <label className={`flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] ${uploadingAssignId === idx ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                                {uploadingAssignId === idx ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UploadCloud size={18} />}
                                {uploadingAssignId === idx ? 'Đang tải...' : 'Nộp bài tập'}
                                <input type="file" className="hidden" accept=".zip,.rar,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFileChange(a, idx, e.target.files[0])} disabled={uploadingAssignId === idx} />
                              </label>
                            );
                          }
                          const isGraded = submission.status === 'graded';
                          return (
                            <>
                              {isGraded ? (
                                <div className="flex items-center justify-center gap-2 px-5 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl font-bold text-sm shadow-sm opacity-100">
                                  <CheckCircle2 size={18} className="text-green-500" />
                                  Điểm: {submission.grade}/10
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl font-bold text-sm cursor-not-allowed shadow-inner opacity-80">
                                  <CheckCircle2 size={18} />
                                  Đã nộp bài
                                </div>
                              )}
                              <label className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${isGraded ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60' : uploadingAssignId === idx ? 'bg-orange-50 border border-orange-200 text-orange-600 cursor-not-allowed opacity-50' : 'bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 cursor-pointer shadow-sm'}`}>
                                {uploadingAssignId === idx ? <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={18} />}
                                {uploadingAssignId === idx ? 'Đang tải...' : 'Nộp lại'}
                                <input type="file" className="hidden" accept=".zip,.rar,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFileChange(a, idx, e.target.files[0])} disabled={uploadingAssignId === idx || isGraded} />
                              </label>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )
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
          const SUBJECT_MAP = [
            { id: 'coban', label: 'Máy vi tính (Cơ bản)' },
            { id: 'word', label: 'Microsoft Word' },
            { id: 'excel', label: 'Microsoft Excel' },
            { id: 'powerpoint', label: 'Microsoft PowerPoint' },
          ];

          const examSubjects = SUBJECT_MAP.map(def => {
            const prog = (student.examProgress || []).find(p => p.id === def.id) || {};
            return { ...def, ...prog };
          });

          return (
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                  <Award className="text-green-600" /> Bảng Điểm Tổng Hợp
                </h2>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-[13px] whitespace-nowrap">
                  <thead className="bg-[#f8fafc] border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 font-black text-slate-500 w-16 text-center uppercase tracking-wider">STT</th>
                      <th className="px-6 py-4 font-black text-slate-500 uppercase tracking-wider">Tên môn thi</th>
                      <th className="px-6 py-4 font-black text-slate-500 text-center uppercase tracking-wider">Trắc nghiệm</th>
                      <th className="px-6 py-4 font-black text-slate-500 text-center uppercase tracking-wider">Tự luận / Thực hành</th>
                      <th className="px-6 py-4 font-black text-slate-500 text-center uppercase tracking-wider">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {examSubjects.map((sub, idx) => {
                      const trScore = sub.tracNghiem ? `${sub.tracNghiem.score}/${sub.tracNghiem.total}` : '-';

                      let thText = <span className="text-gray-400 font-medium">Chưa làm</span>;
                      if (sub.thucHanh === 'da_nop') thText = <span className="text-green-600 font-bold bg-green-50 px-2.5 py-1 rounded-md">Chờ chấm</span>;
                      else if (sub.thucHanh === 'cham_diem' || sub.datThucHanh !== undefined) {
                        if (sub.datThucHanh === true) thText = <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md">Đạt</span>;
                        else if (sub.datThucHanh === false) thText = <span className="text-red-700 font-bold bg-red-50 border border-red-100 px-2.5 py-1 rounded-md">Chưa đạt</span>;
                        else thText = <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-md">Đã chấm</span>;
                      }
                      else if (sub.thucHanh === 'chua_nop') thText = <span className="text-gray-400 font-medium">Chưa làm</span>;
                      else if (sub.thucHanh) thText = <span className="text-gray-600 font-medium">{sub.thucHanh}</span>;

                      let resText = <span className="text-gray-400 font-bold">CHƯA THI</span>;
                      if (sub.status === 'dat') resText = <span className="text-emerald-600 font-black">ĐẠT</span>;
                      else if (sub.status === 'khong_dat') resText = <span className="text-red-600 font-black">KHÔNG ĐẠT</span>;
                      else if (sub.status === 'dang_khoa') resText = <span className="text-orange-500 font-bold">ĐANG KHÓA</span>;

                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-400 text-center">{String(idx + 1).padStart(2, '0')}</td>
                          <td className="px-6 py-4 font-bold text-slate-800 text-sm">{sub.label}</td>
                          <td className="px-6 py-4 font-bold text-center text-slate-600 text-sm">{trScore}</td>
                          <td className="px-6 py-4 text-center">{thText}</td>
                          <td className="px-6 py-4 text-center">{resText}</td>
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
            className={`h-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-400' : 'bg-green-500'}`}
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
              <span className="hidden md:inline-flex items-center gap-1 bg-green-500/15 text-green-400 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border border-green-500/20">
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
              <StudentVideoPlayer
                key={currentLesson?._id}
                videoId={currentLesson?.videoUrl}
                lessonId={currentLesson?._id}
              />
            </div>
          </div>

          {/* INFO PANEL BELOW VIDEO */}
          <div className="flex flex-col flex-1 min-h-0">

            {/* TAB BAR */}
            <div className="flex px-5 flex-shrink-0 border-b border-white/[0.06]" style={{ background: '#0d1117' }}>
              {[
                { key: 'video', label: 'Bài giảng' },
                { key: 'data', label: 'Tài liệu' },
                { key: 'notice', label: 'Thông báo' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setCourseTab(t.key)}
                  className={`px-5 py-3.5 text-[11px] font-bold tracking-wide border-b-2 transition-all ${courseTab === t.key
                    ? 'text-white border-green-500'
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
                      <span className="inline-block text-[9px] font-black text-green-400/80 uppercase tracking-[0.15em] mb-2">
                        {currentLesson.chapterTitle || 'Mục lục'}
                      </span>
                      <h1 className="text-xl font-bold text-white leading-snug">
                        {currentLesson.title}
                      </h1>
                      {currentLesson.duration && (
                        <span className="inline-flex items-center gap-1.5 mt-2 text-slate-500 text-[11px] font-semibold">
                          <Clock size={12} />
                          {Math.floor(currentLesson.duration / 60)} phút {String(currentLesson.duration % 60).padStart(2, '0')}s
                        </span>
                      )}
                    </div>
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
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${file.type === 'PDF' ? 'bg-rose-500/80' : file.type === 'DOCX' ? 'bg-green-600/80' : 'bg-emerald-600/80'
                          }`}>{file.type}</div>
                        <div>
                          <h4 className="font-semibold text-slate-200 text-sm">{file.title}</h4>
                          <p className="text-[10px] text-slate-600 mt-0.5">{file.size}</p>
                        </div>
                      </div>
                      <button className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-green-600 group-hover:text-white transition-all">
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
                className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${overallProgress === 100
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                  : 'bg-green-500/15 text-green-400 border-green-500/20'
                  }`}
              >
                {lessons.filter(l => l.isCompleted).length}/{lessons.length} BÀI
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${overallProgress === 100 ? 'bg-emerald-500' : 'bg-green-500'
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
                        onClick={() => {
                          if (!lesson.isUnlocked) return;
                          setCurrentLesson(lesson);
                          if (!lesson.isCompleted) {
                            localStorage.setItem(`student_lms_completed_${lesson._id}`, 'true');
                            setLessons(prev => prev.map(l => l._id === lesson._id ? { ...l, isCompleted: true } : l));
                          }
                        }}
                        className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all relative ${!lesson.isUnlocked ? 'opacity-40 pointer-events-none' : ''
                          } ${isCurrent
                            ? 'bg-green-600/10 border-l-2 border-green-500'
                            : 'border-l-2 border-transparent hover:bg-white/[0.04]'
                          }`}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      >
                        {/* Status icon */}
                        <div className="mt-0.5 flex-shrink-0">
                          {lesson.isCompleted ? (
                            <div className="w-[18px] h-[18px] rounded-full bg-green-500/20 flex items-center justify-center">
                              <CheckCircle size={12} className="text-green-400" />
                            </div>
                          ) : !lesson.isUnlocked ? (
                            <Lock size={14} className="text-slate-600" />
                          ) : isCurrent ? (
                            <div className="w-[18px] h-[18px] rounded-full border-2 border-green-500 flex items-center justify-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            </div>
                          ) : (
                            <PlayCircle size={16} className="text-slate-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black text-slate-600 uppercase tracking-wider mb-0.5">Bài {globalIdx + 1}</p>
                          <h4 className={`text-[12px] leading-snug truncate ${isCurrent ? 'text-green-400 font-bold' : lesson.isCompleted ? 'text-slate-500 font-semibold' : 'text-slate-300 font-semibold'
                            }`}>
                            {lesson.title}
                          </h4>
                          {lesson.duration ? (
                            <span className="text-[10px] text-slate-600 flex items-center gap-1 mt-1">
                              <Clock size={9} />
                              {Math.floor(lesson.duration / 60)}:{String(lesson.duration % 60).padStart(2, '0')}
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






