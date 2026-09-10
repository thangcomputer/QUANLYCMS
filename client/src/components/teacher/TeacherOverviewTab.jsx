import React, { useMemo, useState, useEffect } from 'react';
import {
  Calendar, ChevronRight, Award, Star, Zap, UserCheck, Clipboard,
  MessageSquare, GraduationCap, Users, Video, UserPlus, Wallet, Clock, ExternalLink,
} from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/defaultAvatars';
import api, { resolveMediaUrl } from '../../services/api';
import TeacherRatingDisplay from './TeacherRatingDisplay';
import {
  isScheduleOngoingNow,
  getScheduleDisplayKind,
  normalizeScheduleDate,
  formatLocalDateKey,
} from '../../utils/scheduleTime';
import { getClientEnrollments } from '../../utils/enrollments';
import { STAR_BONUS_MIN_STUDENTS, STAR_BONUS_MIN_STARS } from '../../utils/teacherCommission';
import { starsFromRating } from '../../context/useDataRatings';

function scheduleStudentId(sch) {
  return String(sch?.studentId?._id || sch?.studentId?.id || sch?.studentId || '');
}

function formatSessionDayLabel(date) {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return { weekday: '', dateLabel: '' };
  return {
    weekday: d.toLocaleDateString('vi-VN', { weekday: 'long', timeZone: 'Asia/Ho_Chi_Minh' }),
    dateLabel: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
  };
}

function getNextScheduleForStudent(schedules, student, now = new Date()) {
  const sid = String(student?._id || student?.id || '');
  if (!sid) return null;
  const todayKey = formatLocalDateKey(now);
  const course = String(student?.course || '').trim().toLowerCase();
  const list = (schedules || []).filter((s) => {
    if (String(s?.status || '') !== 'scheduled') return false;
    if (scheduleStudentId(s) !== sid) return false;
    if (normalizeScheduleDate(s.date) !== todayKey) return false;
    if (course) {
      const sc = String(s.course || '').trim().toLowerCase();
      if (sc && sc !== course) return false;
    }
    const kind = getScheduleDisplayKind(s, now);
    return kind === 'upcoming' || kind === 'ongoing';
  });
  list.sort((a, b) => {
    const ka = `${normalizeScheduleDate(a.date)}-${a.startTime || ''}`;
    const kb = `${normalizeScheduleDate(b.date)}-${b.startTime || ''}`;
    return ka.localeCompare(kb);
  });
  return list[0] || null;
}

export default function TeacherOverviewTab({
  navigate, totalMonthlyIncome, completed, totalDone, teacherName, currentTeacher,
  teacherRating, students, totalSess, avgGrade, mySchedules = [], myNotifs, RATING_CRITERIA,
  teacherId,
}) {
  const [banners, setBanners] = useState([]);
  const [bannerSpeed, setBannerSpeed] = useState(5);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [pendingGradeCount, setPendingGradeCount] = useState(0);

  const meId = String(teacherId || currentTeacher?.id || currentTeacher?._id || '');
  const todayKey = formatLocalDateKey(new Date());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Đếm bài tập đã nộp chờ chấm — không dùng lastGrade (HV mới luôn bị báo sai)
  useEffect(() => {
    let cancelled = false;
    const courses = [...new Set((students || []).map((s) => s.course).filter(Boolean))];
    if (!courses.length) {
      setPendingGradeCount(0);
      return undefined;
    }
    Promise.all(courses.map((c) => api.assignments.getByCourse(c).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const studentIds = new Set();
        for (const res of results) {
          if (!res?.success || !Array.isArray(res.data)) continue;
          for (const a of res.data) {
            for (const sub of (a.submissions || [])) {
              if (String(sub.status || '') !== 'submitted') continue;
              const sid = String(sub.studentId?._id || sub.studentId?.id || sub.studentId || '');
              if (sid) studentIds.add(sid);
            }
          }
        }
        setPendingGradeCount(studentIds.size);
      })
      .catch(() => {
        if (!cancelled) setPendingGradeCount(0);
      });
    return () => { cancelled = true; };
  }, [students]);

  // Fetch Banners
  useEffect(() => {
    let unmounted = false;
    api.settings.getWeb()
      .then((res) => {
        if (res?.success && !unmounted) {
          setBanners(res.data.teacherBanners || []);
          setBannerSpeed(res.data.teacherBannerSpeed || 5);
        }
      })
      .catch(() => {});
    return () => { unmounted = true; };
  }, []);

  const [bannerIdx, setBannerIdx] = useState(0);
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, bannerSpeed * 1000);
    return () => clearInterval(t);
  }, [banners, bannerSpeed]);

  // Check if there is a live schedule right now
  const ongoingSchedule = useMemo(() => {
    void nowTick;
    return (mySchedules || []).find((s) => s.status === 'scheduled' && isScheduleOngoingNow(s));
  }, [mySchedules, nowTick]);

  const nextSessions = useMemo(() => {
    void nowTick;
    const now = new Date();
    return (students || [])
      .map((student) => {
        const sch = getNextScheduleForStudent(mySchedules, student, now);
        if (!sch) return null;
        const live = isScheduleOngoingNow(sch, now);
        const { weekday, dateLabel } = formatSessionDayLabel(sch.date);
        const joinUrl = sch.linkHoc || student.linkHoc || '';
        return { student, sch, live, weekday, dateLabel, joinUrl };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        const ka = `${normalizeScheduleDate(a.sch.date)}-${a.sch.startTime || ''}`;
        const kb = `${normalizeScheduleDate(b.sch.date)}-${b.sch.startTime || ''}`;
        return ka.localeCompare(kb);
      });
  }, [students, mySchedules, nowTick]);

  const upcomingThisMonth = useMemo(() => {
    void nowTick;
    const now = new Date();
    const monthKey = formatLocalDateKey(now).slice(0, 7);
    return (mySchedules || [])
      .filter((s) => {
        if (String(s?.status || '') !== 'scheduled') return false;
        if (normalizeScheduleDate(s.date).slice(0, 7) !== monthKey) return false;
        const kind = getScheduleDisplayKind(s, now);
        return kind === 'upcoming' || kind === 'ongoing';
      })
      .sort((a, b) => {
        const ka = `${normalizeScheduleDate(a.date)}-${a.startTime || ''}`;
        const kb = `${normalizeScheduleDate(b.date)}-${b.startTime || ''}`;
        return ka.localeCompare(kb);
      });
  }, [mySchedules, nowTick]);

  /** HV mới gắn với GV trong 30 ngày (theo registeredAt enrollment / createdAt). */
  const newStudents30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const tid = String(teacherId || meId || '');
    const seen = new Set();
    let count = 0;
    for (const s of students || []) {
      const studentKey = String(s._id || s.id || '');
      if (!studentKey || seen.has(studentKey)) continue;

      const enrs = getClientEnrollments(s).filter((e) => {
        if (!tid) return true;
        return String(e.teacherId || '') === tid;
      });
      const times = enrs
        .map((e) => new Date(e.registeredAt || 0).getTime())
        .filter((t) => Number.isFinite(t) && t > 0);
      const fallback = new Date(s.registeredAt || s.createdAt || 0).getTime();
      if (Number.isFinite(fallback) && fallback > 0) times.push(fallback);
      const newest = times.length ? Math.max(...times) : 0;
      if (newest >= cutoff) {
        seen.add(studentKey);
        count += 1;
      }
    }
    return count;
  }, [students, teacherId, meId]);

  /** HV đạt ≥5★ trong tháng hiện tại; Đạt khi đủ ngưỡng thưởng sao (≥5 HV/tháng). */
  const fiveStarStats = useMemo(() => {
    const ratings = Array.isArray(teacherRating?.ratings) ? teacherRating.ratings : [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const seen = new Set();
    for (const r of ratings) {
      if (starsFromRating(r) < STAR_BONUS_MIN_STARS) continue;
      const t = new Date(r.createdAt || r.updatedAt || 0).getTime();
      if (!Number.isFinite(t) || t < monthStart || t >= monthEnd) continue;
      const sid = String(r.studentId?._id || r.studentId || r._id || r.id || '');
      if (!sid) continue;
      seen.add(sid);
    }
    const need = STAR_BONUS_MIN_STUDENTS;
    const count = seen.size;
    return {
      count,
      need,
      achieved: count >= need,
    };
  }, [teacherRating]);

  return (
    <div className="py-3 sm:py-5 md:py-6 space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700 w-full min-w-0 max-w-full overflow-x-hidden pb-4">
      
      {/* ── HEADER (gọn) + BANNER ── */}
      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between mb-1 min-w-0">
        <div className="min-w-0 w-full lg:max-w-[40%] lg:shrink-0">
          <h2 className="text-lg sm:text-xl md:text-2xl font-black text-slate-800 break-words">
            Chào mừng, {teacherName || 'Giảng viên'}!
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Ưu tiên điểm danh, lịch dạy và học viên được phân công.
          </p>
        </div>
        
        {banners.length > 0 && (
          <div 
            className="relative w-full lg:flex-1 lg:max-w-[800px] h-24 sm:h-28 md:aspect-[5/1] md:h-auto bg-gray-50 rounded-xl overflow-hidden shrink-0 shadow-sm border border-gray-200 cursor-pointer group"
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

      {/* ── LIVE ONGOING SCHEDULE BANNER (Hiển thị nổi bật khi có lớp đang diễn ra) ── */}
      {ongoingSchedule && (
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-indigo-700 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xl shadow-red-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 border border-red-400/30 animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Video size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-red-100">CA DẠY ĐANG DIỄN RA</span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                👤 {ongoingSchedule.studentName || 'Học viên'} &bull; <span className="text-yellow-300">{ongoingSchedule.course}</span>
              </h4>
              <p className="text-xs text-red-100 font-medium">
                Thời gian: {ongoingSchedule.startTime} - {ongoingSchedule.endTime}
              </p>
            </div>
          </div>

          {ongoingSchedule.linkHoc && (
            <a
              href={ongoingSchedule.linkHoc}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-5 py-2.5 bg-white text-red-600 hover:bg-red-50 rounded-xl text-xs sm:text-sm font-black shadow-lg transition active:scale-95 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Video size={16} /> VÀO LỚP NGAY
            </a>
          )}
        </div>
      )}

      {/* ── Quick actions (ưu tiên hành động) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
          <Zap size={16} className="text-amber-500 shrink-0" aria-hidden="true" />
          <h3 className="font-bold text-sm lg:text-base text-slate-800">Công việc cần xử lý ngay</h3>
        </div>
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          {[
            {
              icon: UserCheck,
              label: 'Điểm danh',
              sub: `${mySchedules.filter((s) => s.status === 'scheduled' && normalizeScheduleDate(s.date) === todayKey).length} buổi hôm nay`,
              tint: 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-100 text-emerald-900',
              iconClass: 'text-emerald-600',
              action: () => {
                const todaySchedules = mySchedules.filter((s) => s.status === 'scheduled' && normalizeScheduleDate(s.date) === todayKey);
                if (todaySchedules.length > 0) {
                  const oldest = todaySchedules.sort((a, b) => {
                    const timeA = a.startTime ? a.startTime.replace(':', '') : '0000';
                    const timeB = b.startTime ? b.startTime.replace(':', '') : '0000';
                    return Number(timeA) - Number(timeB);
                  })[0];
                  const stId = oldest.studentId?._id || oldest.studentId?.id || oldest.studentId;
                  if (stId) {
                    navigate(`/teacher#students?studentId=${stId}&course=${encodeURIComponent(oldest.course || oldest.courseName || '')}`);
                    return;
                  }
                }
                navigate('/teacher#students');
              },
            },
            {
              icon: Clipboard,
              label: 'Chấm điểm',
              sub: pendingGradeCount > 0
                ? `${pendingGradeCount} HV chờ chấm điểm`
                : 'Không có bài chờ chấm',
              tint: 'bg-amber-50 hover:bg-amber-100/80 border-amber-100 text-amber-900',
              iconClass: 'text-amber-600',
              action: () => navigate('/teacher#assignments'),
            },
            {
              icon: MessageSquare,
              label: 'Tin nhắn',
              sub: myNotifs > 0 ? `${myNotifs} chưa đọc` : 'Không có tin mới',
              tint: 'bg-violet-50 hover:bg-violet-100/80 border-violet-100 text-violet-900',
              iconClass: 'text-violet-600',
              action: () => navigate('/teacher/inbox'),
            },
            {
              icon: Calendar,
              label: 'Xếp lịch',
              sub: 'Thêm buổi dạy mới',
              tint: 'bg-sky-50 hover:bg-sky-100/80 border-sky-100 text-sky-900',
              iconClass: 'text-sky-600',
              action: () => { navigate('/teacher#schedule'); },
            },
          ].map(({ icon: Icon, label, sub, tint, iconClass, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className={`group ${tint} border rounded-xl p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] min-h-[4rem] cursor-pointer min-w-0`}
            >
              <div className="flex items-center gap-2 mb-1 min-w-0">
                <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-110 ${iconClass}`}>
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white/80 blur-[3px]" aria-hidden="true" />
                  <Icon size={17} strokeWidth={2.4} className="relative drop-shadow-sm" aria-hidden="true" />
                </span>
                <p className="font-bold text-xs sm:text-sm lg:text-base truncate">{label}</p>
              </div>
              <p className="text-[11px] sm:text-xs lg:text-sm text-slate-500 leading-snug break-words">{sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {[
          {
            icon: Wallet,
            label: `Thu nhập tháng ${new Date().getMonth() + 1}`,
            value: `${(Number(totalMonthlyIncome) || 0).toLocaleString('vi-VN')}đ`,
            sub: (
              <span className="inline-flex items-center gap-0.5">
                Chi tiết thu nhập
                <ChevronRight size={12} aria-hidden="true" />
              </span>
            ),
            color: 'from-sky-500 to-cyan-600',
            bg: 'bg-sky-50',
            onClick: () => navigate('/teacher/finance'),
          },
          {
            icon: Users,
            label: 'Đang dạy',
            value: students.length,
            sub: 'học viên',
            color: 'from-indigo-500 to-indigo-600',
            bg: 'bg-indigo-50',
            onClick: () => navigate('/teacher#students'),
          },
          {
            icon: UserPlus,
            label: 'HV mới',
            value: newStudents30d,
            sub: 'trong 30 ngày',
            color: 'from-violet-500 to-purple-600',
            bg: 'bg-violet-50',
            onClick: () => navigate('/teacher#students'),
          },
          {
            icon: Award,
            label: '5 sao',
            value: `${fiveStarStats.count}/${fiveStarStats.need}`,
            sub: fiveStarStats.achieved ? 'Đạt (tháng này)' : 'Chưa đạt (tháng này)',
            subClass: fiveStarStats.achieved ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold',
            color: 'from-amber-500 to-orange-500',
            bg: 'bg-orange-50',
            onClick: () => navigate('/teacher#students'),
          },
          {
            icon: Star,
            label: 'Uy tín',
            value: teacherRating.avg || '—',
            sub: `${teacherRating.count || 0} đánh giá`,
            color: 'from-emerald-500 to-teal-500',
            bg: 'bg-emerald-50',
          },
        ].map(({ icon: Icon, label, value, sub, subClass, color, bg, onClick }) => (
          <div
            key={label}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
            className={`bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all group overflow-hidden relative min-w-0 ${onClick ? 'cursor-pointer' : ''}`}
          >
            <div className={`absolute -right-3 -bottom-3 w-14 h-14 sm:w-20 sm:h-20 ${bg} rounded-full opacity-40 group-hover:scale-125 transition-transform duration-500 pointer-events-none`} aria-hidden="true" />
            <div className={`relative w-9 h-9 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-2.5 sm:mb-3.5 shadow-lg ring-2 ring-white/80 group-hover:scale-105 transition-transform z-10`}>
              <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white/60 blur-[4px]" aria-hidden="true" />
              <Icon size={17} strokeWidth={2.4} className="text-white sm:hidden relative drop-shadow-md" aria-hidden="true" />
              <Icon size={22} strokeWidth={2.4} className="text-white hidden sm:block relative drop-shadow-md" aria-hidden="true" />
            </div>
            <p className="text-xs sm:text-sm lg:text-base font-bold text-slate-600 uppercase tracking-wide mb-0.5 relative z-10 truncate">{label}</p>
            <p className="text-lg sm:text-2xl md:text-3xl font-black text-slate-800 relative z-10 truncate tabular-nums">{value}</p>
            <p className={`text-xs lg:text-sm font-medium mt-1 relative z-10 ${subClass || 'text-slate-500'}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── 3 cột: HV / Lịch / Đánh giá ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 items-start">

        {/* Cột 1: Học viên được phân công — hiện ~5, scroll thêm */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 p-4 sm:p-5 shadow-sm space-y-3 flex flex-col min-w-0 w-full">
          <div className="flex items-center justify-between gap-2 min-w-0 pb-2 border-b border-slate-100 shrink-0">
            <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 flex items-center gap-2 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200 shrink-0">
                <GraduationCap size={17} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="truncate">Học viên được phân công ({students.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => navigate('/teacher#students')}
              className="text-[11px] font-bold text-indigo-600 hover:underline shrink-0 cursor-pointer inline-flex items-center gap-0.5"
            >
              Xem chi tiết
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[25rem] overflow-y-auto overscroll-contain pr-1 min-h-0">
            {students.map((s) => {
              const done = s.completedSessions != null
                ? Math.max(0, Number(s.completedSessions) || 0)
                : Math.max(0, (Number(s.totalSessions) || 12) - (Number(s.remainingSessions) || 0));
              const total = Number(s.totalSessions) > 0 ? Number(s.totalSessions) : 12;
              const pct = total > 0 ? Math.round((done / total) * 100) || 0 : 0;
              const studentId = s._id || s.id;
              const enrollmentKey = s._enrollmentKey || studentId;
              const openStudent = () => {
                const q = new URLSearchParams();
                if (studentId) q.set('studentId', String(studentId));
                if (enrollmentKey) q.set('enrollmentKey', String(enrollmentKey));
                if (s.course) q.set('course', String(s.course));
                navigate(`/teacher#students?${q.toString()}`);
              };
              return (
                <button
                  type="button"
                  key={enrollmentKey}
                  onClick={openStudent}
                  className="w-full text-left bg-slate-50/80 rounded-xl p-3 border border-slate-100 flex items-center gap-3 hover:bg-indigo-50/60 hover:border-indigo-200 transition group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white shadow-sm border border-slate-200">
                    <img src={resolveAvatarUrl({ avatar: s.avatar, role: 'student', gender: s.gender })} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm lg:text-base font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{s.name}</p>
                    <p className="text-[11px] sm:text-xs lg:text-sm text-slate-400 truncate">{s.course}</p>
                    <div className="h-1.5 bg-slate-200/60 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm lg:text-base font-black text-slate-800 tabular-nums">{pct}%</p>
                    <p className="text-[11px] lg:text-sm text-slate-400 tabular-nums">{done}/{total} buổi</p>
                  </div>
                  <ChevronRight size={15} className="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition shrink-0" />
                </button>
              );
            })}

            {students.length === 0 && (
              <div className="py-6 text-center text-slate-400 text-xs font-medium">Chưa được phân công học viên nào.</div>
            )}
          </div>
        </div>

        {/* Cột 2: Ca tiếp theo — giờ, thứ/ngày, link hướng dẫn, nhấp nháy khi đến ca */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 p-4 sm:p-5 shadow-sm space-y-3 flex flex-col min-w-0 w-full">
          <div className="flex items-center justify-between gap-2 min-w-0 pb-2 border-b border-slate-100 shrink-0">
            <h3 className="text-sm sm:text-base lg:text-lg font-bold text-slate-800 flex items-center gap-2 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-200 shrink-0">
                <Clock size={17} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="truncate">Ca tiếp theo ({nextSessions.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => navigate('/teacher#schedule')}
              className="text-[11px] font-bold text-red-600 hover:underline shrink-0 cursor-pointer inline-flex items-center gap-0.5"
            >
              Lịch dạy
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[25rem] overflow-y-auto overscroll-contain pr-1 min-h-0">
            {nextSessions.map(({ student, sch, live, weekday, dateLabel, joinUrl }) => {
              const enrollmentKey = student._enrollmentKey || student._id || student.id;
              const timeRange = sch.endTime ? `${sch.startTime} - ${sch.endTime}` : (sch.startTime || '—');
              return (
                <div
                  key={`${enrollmentKey}-${sch._id || sch.id}`}
                  className={`rounded-xl p-3 border transition ${
                    live
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white border-red-400/40 shadow-md shadow-red-500/20 animate-pulse'
                      : 'bg-slate-50/80 border-slate-100 hover:border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      {live && (
                        <p className="text-[11px] font-black uppercase tracking-wider text-red-100 flex items-center gap-1.5 mb-1">
                          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                          </span>
                          Đang diễn ra
                        </p>
                      )}
                      <p className={`text-xs sm:text-sm lg:text-base font-bold truncate ${live ? 'text-white' : 'text-slate-800'}`}>
                        {student.name || sch.studentName || 'Học viên'}
                      </p>
                      <p className={`text-[11px] sm:text-xs lg:text-sm truncate ${live ? 'text-red-100' : 'text-slate-400'}`}>
                        {student.course || sch.course || ''}
                      </p>
                      <p className={`text-xs font-black tabular-nums mt-1 ${live ? 'text-yellow-200' : 'text-red-600'}`}>
                        {timeRange}
                      </p>
                      <p className={`text-[11px] font-semibold capitalize ${live ? 'text-red-100' : 'text-slate-500'}`}>
                        {[weekday, dateLabel].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    {joinUrl ? (
                      <a
                        href={joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide ${
                          live
                            ? 'bg-white text-red-600 hover:bg-red-50 shadow'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        <ExternalLink size={11} aria-hidden="true" />
                        Vào lớp
                      </a>
                    ) : (
                      <span className={`shrink-0 text-[11px] font-semibold ${live ? 'text-red-100' : 'text-slate-400'}`}>
                        Chưa có link
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {nextSessions.length === 0 && (
              <div className="py-6 text-center text-slate-400 text-xs font-medium">
                Chưa có ca dạy sắp tới.
              </div>
            )}
          </div>
        </div>

        {/* Cột 3: Lịch dạy sắp tới trong tháng */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-w-0 w-full">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
            <h4 className="font-bold text-slate-700 text-xs sm:text-sm flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm shadow-indigo-200 shrink-0">
                <Calendar size={14} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="truncate">Lịch dạy sắp tới trong tháng</span>
            </h4>
            <button
              type="button"
              onClick={() => navigate('/teacher#schedule')}
              className="text-[11px] sm:text-xs text-indigo-600 font-bold hover:underline shrink-0 cursor-pointer inline-flex items-center gap-0.5"
            >
              Xem tất cả
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="divide-y divide-slate-50 max-h-[25.5rem] overflow-y-auto overscroll-contain pr-1 min-h-0">
            {upcomingThisMonth.length === 0 && (
              <p className="px-4 sm:px-5 py-4 text-xs text-slate-400 text-center">Chưa có lịch dạy sắp tới trong tháng.</p>
            )}
            {upcomingThisMonth.map((s) => {
              const day = normalizeScheduleDate(s.date);
              const [, monthStr, dayStr] = day.split('-');
              return (
              <div key={s._id || s.id} className="px-4 sm:px-5 py-2.5 flex items-center gap-3 hover:bg-indigo-50/30 transition">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 flex flex-col items-center justify-center text-indigo-600 flex-shrink-0">
                  <span className="text-xs font-black tabular-nums">{Number(dayStr) || new Date(s.date).getDate()}</span>
                  <span className="text-[7px] font-bold opacity-60">T{Number(monthStr) || (new Date(s.date).getMonth() + 1)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 truncate">{s.studentName || s.course}</p>
                  <p className="text-[11px] text-slate-400 truncate">{s.startTime} · {s.course}</p>
                </div>
                <span className="text-[11px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-lg flex-shrink-0">
                  {s.startTime}
                </span>
              </div>
              );
            })}
          </div>
        </div>

        {/* Cột 3: Đánh giá từ học viên — list hiện ~3, scroll thêm */}
        <div className="min-w-0 w-full md:col-span-2 xl:col-span-1">
          <TeacherRatingDisplay rating={teacherRating} RATING_CRITERIA={RATING_CRITERIA} students={students} reviewsScrollLimit={3} />
        </div>
      </div>
    </div>
  );
}
