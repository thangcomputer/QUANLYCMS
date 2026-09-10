import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, StickyNote, Table2 } from 'lucide-react';
import {
  formatLocalDateKey,
  getScheduleDisplayKind,
  normalizeScheduleDate,
} from '../../utils/scheduleTime';
import {
  WEEKDAY_LABELS,
  startOfWeekMonday,
  addDays,
  weekDateKeys,
  formatWeekRangeLabel,
} from '../../utils/weeklySlotGrid';

const KIND_CELL = {
  completed: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-50 border-slate-100 text-slate-500',
  ongoing: 'bg-green-50 border-green-100 text-green-700',
  upcoming: 'bg-amber-50 border-amber-200 text-amber-800',
  pending_attendance: 'bg-orange-50 border-orange-100 text-orange-700',
  overdue_attendance: 'bg-red-50 border-red-100 text-red-700',
  past_pending: 'bg-orange-50 border-orange-100 text-orange-700',
};

function courseKeyOf(name) {
  return String(name || '').trim() || 'Khóa học';
}

function slotLabel(sch) {
  if (!sch) return '—';
  if (sch.startTime && sch.endTime) return `${sch.startTime} – ${sch.endTime}`;
  return sch.startTime || '—';
}

export default function StudentWeeklyScheduleGrid({
  schedules = [],
  student,
  onOpenSession,
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const todayKey = formatLocalDateKey(new Date());
  const dateKeys = useMemo(() => weekDateKeys(weekStart), [weekStart]);

  const rows = useMemo(() => {
    const names = [];
    const seen = new Set();
    (schedules || []).forEach((sch) => {
      const name = courseKeyOf(sch.course || student?.course);
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    if (!names.length) names.push(courseKeyOf(student?.course));
    return names;
  }, [schedules, student?.course]);

  const byCourseDay = useMemo(() => {
    const map = {};
    (schedules || []).forEach((sch) => {
      const course = courseKeyOf(sch.course || student?.course);
      const day = normalizeScheduleDate(sch.date);
      const key = `${course.toLowerCase()}|${day}`;
      const prev = map[key];
      if (!prev) {
        map[key] = sch;
        return;
      }
      if (String(prev.status) === 'cancelled' && String(sch.status) !== 'cancelled') {
        map[key] = sch;
      }
    });
    return map;
  }, [schedules, student?.course]);

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
            <Table2 size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              Lịch học theo tuần
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Chỉ xem ca đã xếp. Bấm ca sắp tới để ghi chú hoặc vào lớp.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-start sm:justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(startOfWeekMonday(d), -7))}
            className="w-9 h-9 rounded-xl border-2 border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center"
            aria-label="Tuần trước"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeekMonday(new Date()))}
            className="px-3 h-9 rounded-xl border-2 border-red-600 text-xs font-bold text-red-600 hover:bg-red-50 min-w-[9.5rem]"
          >
            {formatWeekRangeLabel(weekStart)}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((d) => addDays(startOfWeekMonday(d), 7))}
            className="w-9 h-9 rounded-xl border-2 border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center"
            aria-label="Tuần sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-500 w-40 min-w-[9rem] border-b border-slate-100">
                Khóa học
              </th>
              {dateKeys.map((key, i) => {
                const isToday = key === todayKey;
                return (
                  <th
                    key={key}
                    className={`px-2 py-2.5 text-center border-b border-slate-100 min-w-[7rem] ${
                      isToday ? 'bg-red-50/80' : ''
                    }`}
                  >
                    <div className={`text-[11px] font-black ${isToday ? 'text-red-700' : 'text-slate-600'}`}>
                      {WEEKDAY_LABELS[i]}
                    </div>
                    <div className={`text-[10px] font-semibold ${isToday ? 'text-red-500' : 'text-slate-400'}`}>
                      {key.slice(8, 10)}/{key.slice(5, 7)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((course) => (
              <tr key={course} className="border-b border-slate-100 last:border-b-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 align-middle">
                  <p className="text-xs font-bold text-slate-900 truncate" title={course}>{course}</p>
                </td>
                {dateKeys.map((dateKey) => {
                  const sch = byCourseDay[`${course.toLowerCase()}|${dateKey}`];
                  const isToday = dateKey === todayKey;
                  if (!sch) {
                    return (
                      <td key={dateKey} className={`px-1.5 py-1.5 ${isToday ? 'bg-red-50/40' : ''}`}>
                        <div className="w-full min-h-9 px-1.5 py-1.5 rounded-lg text-[10px] font-bold text-center text-slate-300">
                          —
                        </div>
                      </td>
                    );
                  }
                  const kind = getScheduleDisplayKind(sch);
                  const tone = KIND_CELL[kind] || KIND_CELL.upcoming;
                  const clickable = String(sch.status) === 'scheduled' && typeof onOpenSession === 'function';
                  const hasNote = Boolean(String(sch.studentNote || '').trim());
                  const hoverHint = hasNote ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú';
                  const teacherHint = sch.teacherName ? `GV: ${sch.teacherName}` : '';
                  return (
                    <td key={dateKey} className={`px-1.5 py-1.5 ${isToday ? 'bg-red-50/40' : ''}`}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => onOpenSession?.(sch)}
                        title={clickable ? [hoverHint, teacherHint].filter(Boolean).join(' · ') : teacherHint || undefined}
                        className={`group relative w-full min-h-9 px-1.5 py-1.5 rounded-lg border text-[10px] font-bold text-center ${tone} ${
                          clickable ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        {hasNote ? (
                          <span
                            className="absolute -top-1.5 -right-1.5 z-[1] w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm pointer-events-none"
                            aria-hidden="true"
                          >
                            <StickyNote size={9} strokeWidth={2.5} />
                          </span>
                        ) : null}
                        <span className={clickable ? 'group-hover:invisible' : ''}>{slotLabel(sch)}</span>
                        {clickable ? (
                          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center rounded-lg px-0.5 leading-tight text-[10px] font-black">
                            {hoverHint}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
