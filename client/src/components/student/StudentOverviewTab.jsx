import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle, Clock, CheckCircle, MessageSquare, Download,
  BookOpen, Star, TrendingUp, Zap, Calendar, Video,
  ClipboardList, ChevronRight, XCircle, Trophy, Award,
} from 'lucide-react';
import { CourseSwitcher, StatCard } from './StudentShared';
import { getGradeTextClasses, getGradePillClasses, getGradeLabel } from '../../utils/gradeColors';
import api, { downloadMediaFile, resolveMediaUrl } from '../../services/api';
import { isScheduleOngoingNow, getScheduleDisplayKind, normalizeScheduleDate } from '../../utils/scheduleTime';

function formatSessionDayLabel(date) {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return { weekday: '', dateLabel: '' };
  return {
    weekday: d.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }),
    dateLabel: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
  };
}

export default function StudentOverviewTab({
  studentData,
  enrollments,
  activeCourseName,
  setActiveCourseName,
  viewStudent,
  progressPct,
  teacherRatingData,
  isNew,
  myAssignments,
  mySchedules = [],
  upcomingScheduleCount,
  myUnreadMsgs,
  studyLogs,
  studentTrainingForLms,
}) {
  const navigate = useNavigate();
  const pendingHw = myAssignments ? myAssignments.filter((a) => !a.mySubmission).length : 0;
  const docs = (studentTrainingForLms?.files || []).slice(0, 3);
  const [pendingQuizCount, setPendingQuizCount] = useState(0);
  const [banners, setBanners] = useState([]);
  const [bannerSpeed, setBannerSpeed] = useState(5);
  /** Tick so banner flips to "Đang học" when the session window opens */
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ongoingSchedule = useMemo(() => {
    void nowTick;
    return (mySchedules || []).find((s) => s.status === 'scheduled' && isScheduleOngoingNow(s));
  }, [mySchedules, nowTick]);

  const featuredSchedule = useMemo(() => {
    void nowTick;
    if (ongoingSchedule) return ongoingSchedule;
    const list = (mySchedules || []).filter((s) => {
      if (String(s?.status || '') !== 'scheduled') return false;
      return getScheduleDisplayKind(s) === 'upcoming';
    });
    list.sort((a, b) => {
      const ka = `${normalizeScheduleDate(a.date)}-${a.startTime || ''}`;
      const kb = `${normalizeScheduleDate(b.date)}-${b.startTime || ''}`;
      return ka.localeCompare(kb);
    });
    return list[0] || null;
  }, [mySchedules, ongoingSchedule, nowTick]);

  const isLive = Boolean(ongoingSchedule);
  // Ưu tiên link trên lịch; fallback link hồ sơ HV (GV cập nhật ở tab Link học)
  const joinUrl = (
    ongoingSchedule?.linkHoc
    || featuredSchedule?.linkHoc
    || viewStudent?.joinClassUrl
    || viewStudent?.linkHoc
    || viewStudent?.online_meeting_url
    || ''
  ).trim();
  const courseLabel = ongoingSchedule?.course || featuredSchedule?.course || viewStudent.course;
  const sessionTimeRange = featuredSchedule
    ? `${featuredSchedule.startTime || ''}${featuredSchedule.endTime ? ` - ${featuredSchedule.endTime}` : ''}`.trim()
    : '';
  // Không fallback nextClassTime — dễ stale sau GV hủy/đổi lịch (chờ student profile refresh).
  const sessionDay = featuredSchedule
    ? formatSessionDayLabel(featuredSchedule.date)
    : { weekday: '', dateLabel: '' };
  const hasUpcomingClass = Boolean(ongoingSchedule || featuredSchedule);
  const sessionWhenLabel = [
    sessionTimeRange ? `Ca ${sessionTimeRange}` : '',
    sessionDay.weekday,
    sessionDay.dateLabel,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.quizzes.getStudentQuizzes();
        if (!res?.success || cancelled) return;
        const nowMs = Date.now();
        const n = (res.data || []).filter((q) => {
          if (q.mySubmission) return false;
          if (q.deadline) {
            const diffMs = new Date(q.deadline).getTime() - nowMs;
            if (diffMs <= 0) return false;
          }
          return true;
        }).length;
        setPendingQuizCount(n);
      } catch {
        if (!cancelled) setPendingQuizCount(0);
      }
    })();

    // Fetch Banners
    api.settings.getWeb()
      .then((res) => {
        if (res?.success && !cancelled) {
          setBanners(res.data.studentBanners || []);
          setBannerSpeed(res.data.studentBannerSpeed || 5);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const [bannerIdx, setBannerIdx] = useState(0);
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, bannerSpeed * 1000);
    return () => clearInterval(t);
  }, [banners, bannerSpeed]);

  const todoItems = [
    {
      key: 'quiz',
      onClick: () => navigate('/student/exam'),
      tone: pendingQuizCount > 0
        ? 'bg-red-50 border-red-200 text-red-600 ring-2 ring-red-200/80 shadow-sm shadow-red-100'
        : 'bg-red-50/80 border-red-100 text-red-600',
      icon: Trophy,
      iconTone: 'from-rose-500 via-red-500 to-red-700 shadow-red-200/70',
      title: 'Trắc nghiệm buổi học',
      meta: pendingQuizCount > 0
        ? `${pendingQuizCount} bài chưa làm`
        : 'Không có bài chờ',
      metaClass: pendingQuizCount > 0 ? 'text-red-600 font-bold' : 'text-slate-500 font-semibold',
      cta: 'Làm ngay',
      badge: pendingQuizCount > 0 ? pendingQuizCount : null,
    },
    {
      key: 'hw',
      onClick: () => {
        navigate('/student#materials-assignments');
      },
      tone: pendingHw > 0
        ? 'bg-orange-50 border-orange-200 text-orange-600 ring-1 ring-orange-100'
        : 'bg-orange-50/70 border-orange-100 text-orange-600',
      icon: ClipboardList,
      iconTone: 'from-orange-400 via-orange-500 to-red-600 shadow-orange-200/70',
      title: 'Bài tập về nhà',
      meta: `${pendingHw} bài cần nộp`,
      metaClass: 'text-orange-600 font-bold',
      cta: pendingHw > 0 ? 'Nộp ngay' : 'Xem ngay',
      badge: pendingHw > 0 ? pendingHw : null,
    },
    {
      key: 'schedule',
      onClick: () => navigate('/student#schedule'),
      tone: 'bg-blue-50/70 border-blue-100 text-blue-600',
      icon: Calendar,
      iconTone: 'from-sky-400 via-blue-500 to-indigo-700 shadow-blue-200/70',
      title: 'Lịch học sắp tới',
      meta: `${upcomingScheduleCount} buổi sắp tới`,
      metaClass: 'text-blue-600 font-bold',
      cta: 'Xem lịch',
      badge: null,
    },
    {
      key: 'messages',
      onClick: () => navigate('/student/inbox'),
      tone: myUnreadMsgs > 0
        ? 'bg-purple-50 border-purple-200 text-purple-600 ring-1 ring-purple-100'
        : 'bg-purple-50/70 border-purple-100 text-purple-600',
      icon: MessageSquare,
      iconTone: 'from-violet-400 via-purple-500 to-fuchsia-700 shadow-purple-200/70',
      title: 'Tin nhắn & Phản hồi',
      meta: `${myUnreadMsgs} tin nhắn mới`,
      metaClass: 'text-purple-600 font-bold',
      cta: 'Xem ngay',
      badge: myUnreadMsgs > 0 ? myUnreadMsgs : null,
    },
  ];

  return (
    <div className="cms-sd cms-sd-stack min-w-0 lg:!gap-3 lg:-mb-4">
      <header className="cms-sd-page !py-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 sm:w-1/3 shrink-0">
          <h2 className="cms-sd-h1 truncate">
            Chào mừng,{' '}
            <span className="text-[0.82em] font-extrabold tracking-tight">{studentData.name}</span>
            ! 👋
          </h2>
          <p className="cms-sd-caption italic mt-1.5 mb-1 text-gray-500">
            &quot;Học hôm nay, thành công mai sau.&quot;
          </p>
          <p className="cms-sd-caption font-bold text-red-600 uppercase tracking-wide">
            Trung tâm Thắng Tin Học
          </p>
        </div>
        
        {banners.length > 0 && (
          <div 
            className="relative w-full sm:w-2/3 max-w-[800px] aspect-[5/1] bg-gray-50 rounded-xl overflow-hidden shrink-0 shadow-sm border border-gray-200 cursor-pointer group"
            onClick={() => banners[bannerIdx]?.linkUrl && window.open(banners[bannerIdx].linkUrl, '_blank')}
          >
            {banners.map((b, i) => (
              <img 
                key={i}
                src={resolveMediaUrl(b.imageUrl)} 
                alt="Banner" 
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${i === bannerIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
              />
            ))}
            {banners.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
                {banners.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === bannerIdx ? 'bg-white shadow-sm' : 'bg-white/40'}`} />
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="cms-sd-page !pt-0 cms-sd-stack lg:!gap-3">
        <CourseSwitcher
          courses={enrollments}
          activeCourseName={activeCourseName || viewStudent.course}
          onChange={setActiveCourseName}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
          <div className="lg:col-span-8 cms-sd-stack min-w-0 lg:!gap-3">
            {/* Upcoming / live class — live style mirrors TeacherOverviewTab */}
            <section
              className={`rounded-[16px] sm:rounded-2xl p-4 text-white relative overflow-hidden border ${
                isLive
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-indigo-700 shadow-xl shadow-red-500/20 border-red-400/30 animate-pulse'
                  : hasUpcomingClass
                    ? 'bg-gradient-to-br from-red-600 to-red-700 shadow-[0_6px_20px_rgba(0,0,0,0.06)] border-transparent'
                    : 'bg-gradient-to-br from-slate-500 to-slate-600 shadow-[0_6px_20px_rgba(0,0,0,0.06)] border-transparent'
              }`}
            >
              <div className="relative z-10 space-y-3">
                <p className="cms-sd-caption font-bold uppercase tracking-wide text-red-100 flex items-center gap-1.5">
                  {isLive ? (
                    <>
                      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                      </span>
                      Buổi học đang diễn ra
                    </>
                  ) : hasUpcomingClass ? (
                    <>
                      <Zap size={14} className="shrink-0" aria-hidden="true" />
                      Lớp học sắp diễn ra
                    </>
                  ) : (
                    <>
                      <Calendar size={14} className="shrink-0" aria-hidden="true" />
                      Chưa có lịch sắp tới
                    </>
                  )}
                </p>
                <h2 className="cms-sd-card-title sm:text-lg md:text-xl font-extrabold uppercase tracking-tight leading-snug line-clamp-2 text-white">
                  {courseLabel}
                </h2>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="flex-1 min-w-0 space-y-2">
                    {sessionWhenLabel ? (
                      <p className="cms-sd-body text-white flex items-center gap-2 min-w-0">
                        <Clock size={16} className="shrink-0 text-yellow-200" aria-hidden="true" />
                        <span className="font-extrabold tabular-nums capitalize tracking-tight">
                          {sessionWhenLabel}
                        </span>
                      </p>
                    ) : (
                      <p className="cms-sd-body text-white/80">
                        {hasUpcomingClass ? 'Đang cập nhật thời gian…' : 'Khi GV xếp lịch mới, buổi học sẽ hiện tại đây.'}
                      </p>
                    )}
                    <p className="cms-sd-body text-white/90 flex items-center gap-2 min-w-0">
                      <Calendar size={16} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        GV: {viewStudent.teacher}
                        {!isNew && teacherRatingData.count > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 bg-yellow-400 text-red-700 px-1.5 py-0.5 rounded-md text-[11px] font-extrabold">
                            <Star size={10} className="fill-red-700" aria-hidden="true" /> {teacherRatingData.avg}
                          </span>
                        )}
                      </span>
                    </p>
                  </div>
                  {hasUpcomingClass && joinUrl ? (
                    <a
                      href={joinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`cms-sd-btn w-full md:w-auto ${
                        isLive
                          ? 'bg-white text-red-600 hover:bg-red-50 shadow-lg'
                          : 'bg-white text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <Video size={20} aria-hidden="true" />
                      VÀO LỚP NGAY
                    </a>
                  ) : hasUpcomingClass ? (
                    <span className="cms-sd-btn w-full md:w-auto bg-white/20 text-white cursor-default">
                      <Video size={20} aria-hidden="true" />
                      Chưa có link học
                    </span>
                  ) : null}
                </div>
              </div>
              <PlayCircle size={140} className="absolute -right-8 -bottom-8 text-white opacity-10 hidden md:block pointer-events-none" aria-hidden="true" />
            </section>

            <div className="cms-sd-stat-grid">
              <StatCard icon={BookOpen} label="Đã học" value={viewStudent.completedSessions} sub={`/ ${viewStudent.totalSessions}`} color="from-red-500 to-red-600" />
              <StatCard icon={Clock} label="Còn lại" value={viewStudent.remainingSessions} sub="buổi" color="from-[#1E3A8A] to-[#203DB5]" />
              <StatCard icon={Star} label="Điểm TB" value={viewStudent.avgGrade} sub="/ 10" color="from-orange-400 to-orange-500" />
              <StatCard icon={TrendingUp} label="Tiến độ" value={`${progressPct}%`} sub="hoàn thành" color="from-emerald-400 to-emerald-500" />
            </div>

            {/* To-do */}
            <section className="cms-sd-card relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-2xl rounded-full pointer-events-none" aria-hidden="true" />
              <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-200/70 ring-1 ring-white">
                    <Zap size={21} className="fill-current" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="cms-sd-section-title">Việc cần làm hôm nay</h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Các hoạt động đang chờ bạn</p>
                  </div>
                </div>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:inline-flex">
                  Tổng quan
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                {todoItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className={`${item.tone} group relative overflow-hidden border p-4 rounded-[18px] flex flex-col gap-4 text-left min-h-[150px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 active:scale-[0.985]`}
                  >
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/50 blur-2xl transition-transform duration-500 group-hover:scale-125" aria-hidden="true" />
                    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 w-full min-w-0 relative z-10">
                      <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${item.iconTone} text-white shadow-lg ring-2 ring-white/80 transition-all duration-300 group-hover:scale-105 group-hover:-rotate-2`}>
                        <span className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-white/50 blur-md transition-transform duration-500 group-hover:translate-x-1 group-hover:translate-y-1" aria-hidden="true" />
                        <span className="absolute bottom-1 left-2 h-1.5 w-5 rounded-full bg-white/40 blur-[2px]" aria-hidden="true" />
                        <item.icon size={25} strokeWidth={2.4} className="relative drop-shadow-md" aria-hidden="true" />
                        {item.badge != null && (
                          <span className="absolute -right-2 -top-2 min-w-[20px] h-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center leading-none shadow-sm ring-2 ring-white">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-[15px] font-bold text-slate-900 leading-snug">{item.title}</h4>
                        <p className={`text-xs lg:text-sm font-bold mt-1 ${item.metaClass}`}>{item.meta}</p>
                        <span className="relative z-10 mt-3 inline-flex items-center justify-center min-h-[36px] px-3.5 rounded-xl bg-white/95 border border-white text-xs font-extrabold text-slate-800 shadow-sm transition-all group-hover:bg-red-600 group-hover:border-red-600 group-hover:text-white group-hover:shadow-red-300/50">
                          {item.cta}
                          <ChevronRight size={14} className="ml-0.5 opacity-70" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:col-span-4 cms-sd-stack min-w-0 lg:!gap-3">
            {/* Tài liệu */}
            <section className="rounded-[16px] p-4 text-white shadow-[0_6px_20px_rgba(0,0,0,0.06)] bg-slate-700">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-300 flex items-center gap-2 mb-3">
                <Download size={16} aria-hidden="true" /> Tài liệu
              </h3>
              <div className="space-y-2">
                {docs.length === 0 ? (
                  <div className="cms-sd-empty !py-5 !gap-1.5">
                    <p className="text-xs text-slate-300 font-medium">Chưa có tài liệu.</p>
                  </div>
                ) : (
                  docs.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => m.fileUrl && downloadMediaFile(m.fileUrl, m.title)}
                      className="flex justify-between items-center bg-slate-600/45 p-3 rounded-[12px] hover:bg-slate-600 transition-colors duration-200 cursor-pointer min-h-[44px]"
                      title={m.title}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-xs font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                            m.fileType === 'PDF' ? 'bg-red-500' : (m.fileType === 'XLSX' || m.fileType === 'XLS') ? 'bg-green-500' : 'bg-orange-500'
                          }`}
                        >
                          {m.fileType || 'DOC'}
                        </span>
                        <span className="text-sm font-semibold text-white truncate">{m.title}</span>
                      </div>
                      <Download size={16} className="text-sky-300 shrink-0 ml-2" aria-hidden="true" />
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate('/student#materials-files');
                }}
                className="cms-sd-btn w-full mt-3 bg-slate-600/50 text-sky-200 hover:bg-slate-600 hover:text-white"
              >
                Xem tất cả <ChevronRight size={16} aria-hidden="true" />
              </button>
            </section>

            {/* Nhật ký học tập & Điểm số — dưới Tài liệu (bài nộp / TN / điểm / đánh giá) */}
            <section className="cms-sd-card !p-0 overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 min-w-0">
                <h3 className="cms-sd-section-title flex items-center gap-2 min-w-0">
                  <ClipboardList size={18} className="text-emerald-500 shrink-0" aria-hidden="true" />
                  Nhật ký học tập &amp; Điểm số
                </h3>
                <span className="text-xs font-bold text-slate-500 shrink-0 tabular-nums">{studyLogs.length} lượt ghi nhận</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {studyLogs.map((item, idx) => {
                  const isCancelled = item.type === 'cancelled' || item.type === 'attendance_cancel' || item.type === 'schedule_cancel';
                  const isScheduled = item.type === 'scheduled';
                  const isPastPending = item.type === 'past_pending'
                    || item.type === 'pending_attendance'
                    || item.type === 'overdue_attendance';
                  const isOverdue = item.type === 'overdue_attendance' || item.displayKind === 'overdue_attendance';
                  const isHomework = item.type === 'homework';
                  const isQuiz = item.type === 'quiz';
                  const isPassed = isQuiz ? (item.isPassed ?? item.meta?.isPassed) : undefined;
                  const isAttendance = item.type === 'attendance';
                  const isGradeUpdate = item.type === 'grade_update';
                  const isEvaluation = item.type === 'evaluation';
                  const isCourseComplete = item.type === 'course_complete';

                  return (
                    <div
                      key={idx}
                      className={`px-3.5 py-3 flex flex-col justify-between gap-1.5 ${
                        isCancelled ? 'bg-red-50/30' : isOverdue ? 'bg-red-50/40' : isPastPending ? 'bg-orange-50/50' : isScheduled ? 'bg-blue-50/30' : isQuiz ? 'bg-amber-50/20' : 'hover:bg-slate-50'
                      } transition-colors duration-200`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 ${
                            isCancelled
                              ? 'bg-red-100 text-red-600'
                              : isOverdue
                              ? 'bg-red-100 text-red-600'
                              : isPastPending
                              ? 'bg-orange-100 text-orange-700'
                              : isScheduled
                              ? 'bg-blue-100 text-blue-600'
                              : isHomework
                              ? 'bg-purple-100 text-purple-600'
                              : isQuiz
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {isCancelled ? (
                            <XCircle size={15} aria-hidden="true" />
                          ) : isPastPending || isScheduled ? (
                            <Calendar size={15} aria-hidden="true" />
                          ) : isHomework ? (
                            <ClipboardList size={15} aria-hidden="true" />
                          ) : isQuiz ? (
                            <Award size={15} aria-hidden="true" />
                          ) : (
                            <CheckCircle size={15} aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-xs font-bold truncate ${isCancelled || isOverdue ? 'text-red-700' : isPastPending ? 'text-orange-800' : isScheduled ? 'text-blue-900' : 'text-slate-800'}`}>
                              {item.index ? `Buổi ${item.index} — ` : ''}{item.date}{item.time ? ` (${item.time})` : ''}
                            </p>
                            {isScheduled && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide shrink-0">
                                {item.displayKind === 'ongoing' ? 'ĐANG DIỄN RA' : 'SẮP TỚI'}
                              </span>
                            )}
                            {isPastPending && (
                              <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
                                isOverdue ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-800'
                              }`}>
                                {isOverdue ? 'QUÁ HẠN ĐIỂM DANH' : 'CHƯA ĐIỂM DANH'}
                              </span>
                            )}
                            {isCancelled && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-red-100 text-red-700 uppercase tracking-wide shrink-0">
                                HỦY
                              </span>
                            )}
                            {isGradeUpdate && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide shrink-0">
                                Cập nhật điểm
                              </span>
                            )}
                            {isEvaluation && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 uppercase tracking-wide shrink-0">
                                Đánh giá
                              </span>
                            )}
                            {isCourseComplete && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide shrink-0">
                                Hoàn thành
                              </span>
                            )}
                            {isHomework && !isGradeUpdate && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wide shrink-0">
                                Bài nộp
                              </span>
                            )}
                            {isQuiz && (
                              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide shrink-0">
                                Trắc nghiệm
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] lg:text-sm text-slate-500 font-medium truncate mt-0.5">{item.note}</p>
                        </div>
                      </div>

                      {!isCancelled && item.grade != null && (
                        <div className="flex items-center justify-end gap-1.5 shrink-0 pl-10">
                          {isQuiz ? (
                            /* Quiz: hiện % điểm hoặc correctCount/totalQuestions từ note nếu có */
                            <span className={`text-xs font-extrabold tabular-nums ${
                              isPassed ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {item.rawScore != null ? `${Math.round(item.rawScore)}%` : `${item.grade} / 10`}
                            </span>
                          ) : (
                            <span className={`text-xs font-extrabold tabular-nums ${getGradeTextClasses(item.grade)}`}>
                              {item.grade} / 10
                            </span>
                          )}
                          <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            isQuiz
                              ? (isPassed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200')
                              : getGradePillClasses(item.grade)
                          }`}>
                            {isQuiz ? (isPassed ? 'ĐẠT' : 'CHƯA ĐẠT') : (getGradeLabel(item.grade) || 'TB')}
                          </span>
                        </div>
                      )}
                      {!isCancelled && item.grade == null && isAttendance && (
                        <div className="flex items-center justify-end pl-10">
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-wide shrink-0">
                            Đã hoàn thành
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {studyLogs.length === 0 && (
                  <div className="cms-sd-empty !py-6">
                    <div className="cms-sd-empty__icon">
                      <ClipboardList size={20} aria-hidden="true" />
                    </div>
                    <p className="text-xs font-bold text-slate-600">Chưa có dữ liệu điểm số.</p>
                    <p className="text-[11px] lg:text-sm text-slate-400 mt-1">Bài nộp, trắc nghiệm và điểm sẽ hiện tại đây.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
