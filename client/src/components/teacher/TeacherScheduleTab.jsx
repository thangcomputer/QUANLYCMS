import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, Clock, Ban } from 'lucide-react';
import TeacherMonthlyCalendar from './TeacherMonthlyCalendar';
import TeacherWeeklySlotGrid from './TeacherWeeklySlotGrid';
import TeacherTeachingLog from './TeacherTeachingLog';
import AttendanceMakeupRequestModal from './AttendanceMakeupRequestModal';
import { getScheduleDisplayKind, isScheduleDateBeforeToday } from '../../utils/scheduleTime';
import { TEACHER_WEEKLY_SLOT_GRID_EXPERIMENT, SHOW_TEACHER_MONTHLY_CALENDAR } from '../../utils/weeklySlotGrid';
import { useToast } from '../../utils/toast';

function resolveStudentId(sch) {
  return String(
    sch?.studentId?._id
    || sch?.studentId?.id
    || sch?.studentId
    || sch?.student?._id
    || sch?.student?.id
    || sch?.student
    || '',
  ).trim();
}

export default function TeacherScheduleTab({
  setEditingSchedule,
  setShowScheduleModal,
  mySchedules = [],
  startEditSchedule,
  cancelSchedule,
  students = [],
  teacherId,
  addSchedule,
  updateSchedule,
  allSchedules,
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const today = new Date();
  const currentMonth = today.getMonth();
  const [makeupTarget, setMakeupTarget] = useState(null);

  const teacherSession = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('teacher_user') || '{}') || {};
    } catch {
      return {};
    }
  }, []);

  const completedCount = useMemo(() => {
    return (mySchedules || []).filter(s => s.status === 'completed' && new Date(s.date).getMonth() === currentMonth).length;
  }, [mySchedules, currentMonth]);

  const upcomingCount = useMemo(() => {
    return (mySchedules || []).filter(s => s.status === 'scheduled' && new Date(s.date).getMonth() === currentMonth).length;
  }, [mySchedules, currentMonth]);

  const cancelledCount = useMemo(() => {
    return (mySchedules || []).filter(s => s.status === 'cancelled' && new Date(s.date).getMonth() === currentMonth).length;
  }, [mySchedules, currentMonth]);

  const openStudentProfile = useCallback((sch) => {
    const sid = resolveStudentId(sch);
    if (!sid) {
      toast.error('Không tìm thấy học viên của ca này.');
      return;
    }
    const course = String(sch.course || sch.courseName || '').trim();
    const q = new URLSearchParams();
    q.set('studentId', sid);
    if (course) q.set('course', course);
    navigate(`/teacher#students?${q.toString()}`);
  }, [navigate, toast]);

  /** Nhật ký: quá hạn → popup điểm danh bù; còn lại → hồ sơ HV (điểm danh thường). */
  const handleOpenAttendance = useCallback((sch) => {
    const kind = getScheduleDisplayKind(sch);
    if (kind !== 'overdue_attendance') {
      openStudentProfile(sch);
      return;
    }
    const sid = resolveStudentId(sch);
    if (!sid) {
      toast.error('Không tìm thấy học viên của ca này.');
      return;
    }
    const found = (students || []).find(
      (s) => String(s._id || s.id) === sid,
    );
    const student = found || {
      _id: sid,
      id: sid,
      name: sch.studentName || 'Học viên',
      course: sch.course || sch.courseName || '',
      completedSessions: sch.completedSessions,
      remainingSessions: sch.remainingSessions,
      totalSessions: sch.totalSessions,
    };
    setMakeupTarget({ schedule: sch, student });
  }, [openStudentProfile, students, toast]);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 py-3 sm:py-6 animate-in fade-in duration-500">
      {/* Top Banner Toolbar & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex w-11 h-11 sm:w-12 sm:h-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 via-rose-500 to-red-700 text-white shadow-lg shadow-red-200/70 ring-2 ring-white">
            <span className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-white/45 blur-md" aria-hidden="true" />
            <Calendar size={24} strokeWidth={2.3} className="relative drop-shadow-md" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Quản lý Lịch dạy &amp; Điểm danh
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Xếp lịch theo tuần và xem nhật ký giảng dạy
            </p>
          </div>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
          <div className="relative flex w-10 h-10 sm:w-11 sm:h-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 text-white shadow-lg shadow-emerald-200/70 ring-1 ring-white">
            <span className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-white/45 blur-md" aria-hidden="true" />
            <CheckCircle size={22} strokeWidth={2.3} className="relative drop-shadow-md" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">Đã dạy tháng này</p>
            <p className="text-base sm:text-xl font-black text-emerald-600 leading-tight">
              {completedCount} <span className="text-xs font-semibold text-slate-400">buổi</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
          <div className="relative flex w-10 h-10 sm:w-11 sm:h-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-300 via-orange-400 to-orange-600 text-white shadow-lg shadow-orange-200/70 ring-1 ring-white">
            <span className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-white/45 blur-md" aria-hidden="true" />
            <Clock size={22} strokeWidth={2.3} className="relative drop-shadow-md" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">Buổi sắp tới</p>
            <p className="text-base sm:text-xl font-black text-slate-800 leading-tight">
              {upcomingCount} <span className="text-xs font-semibold text-slate-400">buổi</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
          <div className="relative flex w-10 h-10 sm:w-11 sm:h-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-400 via-pink-500 to-red-700 text-white shadow-lg shadow-rose-200/70 ring-1 ring-white">
            <span className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-white/45 blur-md" aria-hidden="true" />
            <Ban size={22} strokeWidth={2.3} className="relative drop-shadow-md" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wide">Đã hủy</p>
            <p className="text-base sm:text-xl font-black text-rose-600 leading-tight">
              {cancelledCount} <span className="text-xs font-semibold text-slate-400">buổi</span>
            </p>
          </div>
        </div>
      </div>

      {SHOW_TEACHER_MONTHLY_CALENDAR && (
        <TeacherMonthlyCalendar
          schedules={mySchedules}
          onEditSchedule={startEditSchedule}
          onAddSchedule={(date) => {
            if (isScheduleDateBeforeToday(date)) {
              return;
            }
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            setEditingSchedule({ date: `${yyyy}-${mm}-${dd}`, fromCalendar: true });
            setShowScheduleModal(true);
          }}
          onCancelSchedule={(scheduleId, reason) => {
            cancelSchedule(scheduleId, reason);
          }}
        />
      )}

      {TEACHER_WEEKLY_SLOT_GRID_EXPERIMENT && (
        <TeacherWeeklySlotGrid
          students={students}
          teacherId={teacherId}
          mySchedules={mySchedules}
          allSchedules={allSchedules}
          addSchedule={addSchedule}
          updateSchedule={updateSchedule}
          cancelSchedule={cancelSchedule}
        />
      )}

      <TeacherTeachingLog
        schedules={mySchedules}
        onOpenAttendance={handleOpenAttendance}
      />

      <AttendanceMakeupRequestModal
        open={Boolean(makeupTarget)}
        onClose={() => setMakeupTarget(null)}
        student={makeupTarget?.student}
        schedule={makeupTarget?.schedule}
        teacherName={teacherSession.name || 'Giảng viên'}
        teacherId={String(teacherId || teacherSession.id || teacherSession._id || '')}
      />
    </div>
  );
}
