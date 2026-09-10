import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock, X, Ban,
  CheckCircle, Video, MessageSquare, Edit3, Trash2, User, Sparkles
} from 'lucide-react';
import { csrfFetch } from '../../services/api';
import { isScheduleOngoingNow, getScheduleDisplayKind, isScheduleUpcomingDisplay } from '../../utils/scheduleTime';
import { showGlossyAlert } from './TeacherShared';

const STATUS_COLORS = {
  completed: {
    cell: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    label: '✓ Hoàn thành',
  },
  scheduled: {
    cell: 'bg-amber-50 border-amber-200 text-amber-700',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-400',
    label: '● Sắp tới',
  },
  upcoming: {
    cell: 'bg-amber-50 border-amber-200 text-amber-700',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-400',
    label: '● Sắp tới',
  },
  ongoing: {
    cell: 'bg-green-50 border-green-200 text-green-700',
    badge: 'bg-green-100 text-green-700 border-green-300',
    dot: 'bg-green-500',
    label: '● Đang diễn ra',
  },
  past_pending: {
    cell: 'bg-orange-50 border-orange-200 text-orange-700',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    label: '● Chưa điểm danh',
  },
  pending_attendance: {
    cell: 'bg-orange-50 border-orange-200 text-orange-700',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    label: '● Chưa điểm danh',
  },
  overdue_attendance: {
    cell: 'bg-red-50 border-red-200 text-red-700',
    badge: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
    label: '● Quá hạn điểm danh',
  },
  cancelled: {
    cell: 'bg-red-50 border-red-200 text-red-400',
    badge: 'bg-red-100 text-red-500 border-red-200',
    dot: 'bg-red-400',
    label: '✗ Đã hủy',
  },
};

export const MonthlyCalendar = ({ schedules = [], onEditSchedule, onAddSchedule, onCancelSchedule }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [, setLiveTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setLiveTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const getDisplayStatus = (schedule) => getScheduleDisplayKind(schedule);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
    'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'
  ];

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();
  today.setHours(0, 0, 0, 0);

  const isPast = (day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };
  const isToday = (day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  // Group schedules by date
  const scheduleMap = useMemo(() => {
    const map = {};
    (schedules || []).forEach(s => {
      const d = new Date(s.date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(s);
      }
    });
    return map;
  }, [schedules, month, year]);

  const selectedSchedules = selectedDay ? (scheduleMap[selectedDay] || []) : [];

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  // Hủy lịch → gọi API cancel
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const API = import.meta.env.VITE_API_URL || "";
      const token = localStorage.getItem('teacher_access_token') || localStorage.getItem('admin_access_token');
      const res = await csrfFetch(`${API}/api/schedules/${cancelTarget._id || cancelTarget.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (data.success) {
        if (onCancelSchedule) onCancelSchedule(cancelTarget._id || cancelTarget.id, cancelReason);
      } else {
        showGlossyAlert(data.message || 'Lỗi khi hủy lịch');
      }
    } catch (e) {
      console.error(e);
    }
    setCancelling(false);
    setCancelTarget(null);
    setCancelReason('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch w-full min-w-0">
      {/* ─ LỊCH THÁNG (Cột Trái lg:col-span-7) ─ */}
      <div className="lg:col-span-7 bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-5 min-w-0 flex flex-col justify-between h-full">
        <div>
          {/* Header Nav */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Calendar size={18} />
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Lịch theo tháng</h3>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-white transition-colors flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm"
                title="Tháng trước"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs sm:text-sm font-extrabold text-slate-800 min-w-[6.5rem] text-center tabular-nums">
                {monthNames[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-white transition-colors flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-none hover:shadow-sm"
                title="Tháng sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 text-center border-b border-slate-100 pb-2.5 mb-2.5">
            {['CN','T2','T3','T4','T5','T6','T7'].map((d, i) => (
              <div key={d} className={`text-[11px] sm:text-xs font-black uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {days.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;

              const daySchs  = scheduleMap[day] || [];
              const past     = isPast(day);
              const todayDay = isToday(day);
              const selected = selectedDay === day;
              const hasData  = daySchs.length > 0;
              const canAddNew = !past && !hasData;

              const isSunday = (idx % 7 === 0);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    if (past && !hasData) return;
                    setSelectedDay(day === selectedDay ? null : day);
                    if (canAddNew && onAddSchedule) onAddSchedule(new Date(year, month, day));
                  }}
                  title={
                    hasData ? daySchs.map(s => `${s.startTime} - ${s.studentName || s.course}${(s.topic || s.note) ? ` (${s.topic || s.note})` : ''}`).join('\n') 
                    : past ? 'Ngày đã qua, không thể sắp lịch' 
                    : 'Click để sắp lịch hôm này'
                  }
                  className={`relative w-full h-8 sm:h-9 md:h-9.5 rounded-lg sm:rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all border
                    ${
                      selected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 z-10'
                      : todayDay && !hasData
                        ? 'bg-indigo-50/80 border-indigo-200 text-indigo-700 ring-2 ring-indigo-200/60 font-black'
                      : past && !hasData
                        ? 'opacity-40 cursor-not-allowed border-transparent text-slate-500'
                      : hasData 
                        ? 'bg-teal-50/80 border-teal-100/60 hover:bg-teal-100/80 text-slate-800'
                      : 'bg-white border-transparent text-slate-700 hover:bg-slate-50 hover:border-slate-100 cursor-pointer'
                    }
                  `}
                >
                  <span className={`leading-none ${
                    selected ? 'text-white font-extrabold' :
                    isSunday && !selected ? 'text-orange-600 font-semibold' :
                    (todayDay && !selected) ? 'text-blue-700 font-bold' :
                    'text-slate-800 font-medium'
                  }`}>
                    {day}
                  </span>

                  {/* Status dots */}
                  {hasData && (
                    <div className="flex gap-0.5 mt-0.5 justify-center px-0.5">
                      {daySchs.filter((s) => isScheduleUpcomingDisplay(s)).slice(0, 2).map((s) => (
                        <div key={'s-' + s._id} className={`w-1 h-1 rounded-full ${s.hasUnreadStudentNote ? 'bg-red-500 animate-[ping_1.5s_ease-in-out_infinite]' : isScheduleOngoingNow(s) ? 'bg-green-500' : selected ? 'bg-amber-200' : 'bg-amber-400'} shadow-sm`} />
                      ))}
                      {daySchs.filter((s) => getScheduleDisplayKind(s) === 'past_pending').slice(0, 2).map((s) => (
                        <div key={'p-' + s._id} className={`w-1 h-1 rounded-full ${s.hasUnreadStudentNote ? 'bg-red-500 animate-[ping_1.5s_ease-in-out_infinite]' : selected ? 'bg-slate-300' : 'bg-slate-400'} shadow-sm`} />
                      ))}
                      {daySchs.filter((s) => getScheduleDisplayKind(s) === 'completed').slice(0, 2).map((s) => (
                        <div key={'c-' + s._id} className={`w-1 h-1 rounded-full ${s.hasUnreadStudentNote ? 'bg-red-500 animate-[ping_1.5s_ease-in-out_infinite]' : selected ? 'bg-emerald-200' : 'bg-emerald-500'} shadow-sm`} />
                      ))}
                      {daySchs.filter((s) => getScheduleDisplayKind(s) === 'cancelled').slice(0, 2).map((s) => (
                        <div key={'x-' + s._id} className={`w-1 h-1 rounded-full ${s.hasUnreadStudentNote ? 'bg-red-500 animate-[ping_1.5s_ease-in-out_infinite]' : selected ? 'bg-rose-200' : 'bg-red-400'} shadow-sm`} />
                      ))}
                    </div>
                  )}
                  
                  {/* Quick-add hint on empty future day */}
                  {canAddNew && !selected && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-white/60 backdrop-blur-[1px] rounded-xl border border-dashed border-blue-300">
                      <Plus size={12} className="text-blue-600" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-2 pt-2.5 mt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs font-semibold text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" /> Đã dạy</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" /> Sắp tới</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" /> Đang diễn ra</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" /> Đã qua</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" /> Đã hủy</span>
        </div>
      </div>

      {/* ─ CỘT BÊN PHẢI (Cột Phải lg:col-span-5: 1. Chi tiết ngày chọn + 2. Buổi dạy sắp tới) ─ */}
      <div className="lg:col-span-5 flex flex-col gap-3.5 sm:gap-4 min-w-0 h-full justify-between">
        
        {/* 1. Chi tiết ca dạy ngày chọn (Dark Box Box) */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 rounded-2xl sm:rounded-3xl p-4 text-white shadow-xl shadow-slate-900/10 border border-slate-800/60 flex-1 min-h-[170px] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                <Calendar size={13} className="text-yellow-400" />
                {selectedDay
                  ? `Lịch dạy ngày ${selectedDay}/${month + 1}/${year}`
                  : 'Chọn ngày trên lịch'
                }
              </span>
              {selectedDay && (
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
                  title="Đóng chọn ngày"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {selectedDay ? (
              selectedSchedules.length > 0 ? (
                <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1">
                  {selectedSchedules.map(s => {
                    const past = isPast(selectedDay);
                    const displayStatus = getDisplayStatus(s);
                    const isCancellable = !past && s.status === 'scheduled' && displayStatus !== 'ongoing';
                    const cfg = STATUS_COLORS[displayStatus] || STATUS_COLORS.scheduled;

                    return (
                      <div key={s._id || s.id} className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 hover:bg-white/15 transition duration-200">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-1">
                            👤 {s.studentName || 'Học viên'}
                          </h4>
                          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded uppercase shrink-0 border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>

                        <p className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                          <Clock size={11} /> {s.startTime}{s.endTime ? ` - ${s.endTime}` : ''} &bull; <span className="text-slate-300">{s.course}</span>
                        </p>

                        {(s.topic || s.note) && (
                          <p className="text-[11px] text-slate-300 mt-1 bg-white/5 p-1.5 rounded-lg border border-white/5 truncate">
                            📖 <span className="font-semibold text-white">Ghi chú:</span> {s.topic || s.note}
                          </p>
                        )}

                        {s.studentNote && (
                          <div className="text-[11px] font-bold text-red-200 mt-1 line-clamp-2 border-l-2 border-red-500 pl-2 bg-red-500/10 p-1 rounded-r flex gap-1 items-start">
                            <MessageSquare size={11} className="mt-0.5 text-red-400 shrink-0" />
                            <div className="leading-tight flex-1">
                              Học viên nhắn: <span className="italic font-normal text-red-200">"{s.studentNote}"</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                          {s.status === 'scheduled' && !past && (
                            <button
                              onClick={() => onEditSchedule && onEditSchedule(s)}
                              className="px-2 py-1 rounded-lg bg-blue-600/40 hover:bg-blue-600 text-blue-200 text-[10px] font-bold transition flex items-center gap-1"
                            >
                              <Edit3 size={11} /> Sửa ca
                            </button>
                          )}
                          {isCancellable && (
                            <button
                              onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                              className="px-2 py-1 rounded-lg bg-red-600/40 hover:bg-red-600 text-red-200 text-[10px] font-bold transition flex items-center gap-1"
                            >
                              <Trash2 size={11} /> Hủy ca
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center space-y-1.5">
                  <div className="w-9 h-9 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center mx-auto text-blue-300">
                    <Calendar size={18} />
                  </div>
                  <p className="text-xs font-bold text-white">Không có lịch ngày này.</p>
                  {!isPast(selectedDay) && (
                    <button
                      type="button"
                      onClick={() => { setSelectedDay(null); if (onAddSchedule) onAddSchedule(new Date(year, month, selectedDay)); }}
                      className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold transition inline-flex items-center gap-1 mt-1"
                    >
                      <Plus size={12} /> Sắp lịch ngày này
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="py-4 text-center space-y-1.5">
                <div className="w-9 h-9 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center mx-auto text-blue-300">
                  <Sparkles size={18} />
                </div>
                <p className="text-xs font-bold text-white">Bấm chọn một ngày trên lịch</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Vui lòng bấm chọn ngày bất kỳ để xem danh sách ca dạy hoặc xếp lịch mới.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 mt-1 border-t border-white/10 text-center shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold">
              Cần hỗ trợ đổi buổi? Hãy dùng nút <strong>Ghi chú / Đổi lịch</strong> trên ca học.
            </span>
          </div>
        </div>

        {/* 2. Danh sách Buổi dạy sắp tới trong tháng (Khung cố định h-[250px] cho vừa 4 dòng, chưa đủ có khoảng trắng, quá 4 dòng có thanh cuộn) */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm p-3.5 sm:p-4 h-[250px] shrink-0 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Clock size={16} />
              </div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                📅 Lịch trong tháng
              </h4>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {schedules.filter((s) => isScheduleUpcomingDisplay(s) && new Date(s.date).getMonth() === month && new Date(s.date).getFullYear() === year).length} buổi
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 divide-y divide-slate-100 space-y-0.5">
            {schedules
              .filter((s) => isScheduleUpcomingDisplay(s) && new Date(s.date).getMonth() === month && new Date(s.date).getFullYear() === year)
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map(s => {
                const d = new Date(s.date);
                const displayStatus = getDisplayStatus(s);
                const cfg = STATUS_COLORS[displayStatus] || STATUS_COLORS.upcoming;

                return (
                  <div key={s._id || s.id} className={`py-2 px-1 flex items-center justify-between gap-2 transition group ${displayStatus === 'ongoing' ? 'bg-green-50/50 rounded-lg' : 'hover:bg-amber-50/30'}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 shadow-sm ${displayStatus === 'ongoing' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                        <span className="text-[8px] font-bold uppercase leading-none">{monthNames[d.getMonth()].replace('Tháng ', 'T')}</span>
                        <span className="text-xs font-black leading-none mt-0.5">{d.getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{s.studentName || s.course}</p>
                        <p className="text-[11px] text-slate-400 truncate">{s.startTime} – {s.endTime} &bull; {s.course}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${cfg.badge}`}>
                        {displayStatus === 'ongoing' ? 'Đang dạy' : s.startTime}
                      </span>
                      {new Date(s.date) >= today && displayStatus !== 'ongoing' && (
                        <button
                          onClick={() => { setCancelTarget(s); setCancelReason(''); }}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                          title="Hủy lịch"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

            {schedules.filter((s) => isScheduleUpcomingDisplay(s) && new Date(s.date).getMonth() === month && new Date(s.date).getFullYear() === year).length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 text-xs font-medium py-4">
                Không có buổi nào sắp tới.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ─ MODAL HỦY LỊCH ─ */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-600 p-5 text-white flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base">Hủy lịch dạy</h3>
                <p className="text-red-100 text-xs mt-0.5">{cancelTarget.studentName} • {cancelTarget.course}</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Hành động này sẽ <strong>hủy buổi học</strong> này và cập nhật hệ thống.
              </p>
              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Lý do hủy *</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Ví dụ: Học viên xin nghỉ, Giảng viên bận đột xuất..."
                  className="w-full border border-slate-200 focus:border-red-500 rounded-xl px-3 py-2 text-xs outline-none resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setCancelTarget(null); setCancelReason(''); }}
                  className="flex-1 py-2.5 text-slate-600 font-bold bg-slate-100 rounded-xl hover:bg-slate-200 text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleConfirmCancel}
                  disabled={!cancelReason.trim() || cancelling}
                  className="flex-[1.5] py-2.5 text-white font-bold bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-xs"
                >
                  {cancelling ? 'Đang hủy...' : 'Xác nhận Hủy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyCalendar;
