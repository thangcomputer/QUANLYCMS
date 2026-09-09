import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

function formatConfirmedAt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isRejectedPayload(payload) {
  if (!payload) return false;
  if (payload.rejected === true || payload.resolveOutcome === 'rejected') return true;
  const kind = String(payload.kind || '');
  return kind === 'attendance_rejected' || kind === 'admin_makeup_rejected';
}

/**
 * Popup GV:
 * - confirmed: học viên đã xác nhận điểm danh
 * - rejected: Admin không tính buổi (tranh chấp / điểm danh bù)
 */
export default function TeacherAttendanceConfirmedModal({ open, payload, onClose }) {
  if (!open || !payload) return null;

  const rejected = isRejectedPayload(payload);
  const sessionNo = [payload.sessionNumber, payload.sessionOrdinalPreview, payload.completedSessions]
    .map((v) => Number(v))
    .find((n) => Number.isFinite(n) && n > 0);
  const displaySession = sessionNo != null ? sessionNo : '?';
  const totalRaw = Number(payload.totalSessions || payload.sessionTotalPreview);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : null;
  const studentName = payload.studentName || 'Học viên';
  const weekday = payload.weekday || '';
  const dateLabel = payload.dateLabel || '';
  const timeRange = payload.timeRange
    || [payload.startTime, payload.endTime].filter(Boolean).join(' - ');
  const course = payload.course || '';
  const confirmedAt = payload.confirmedAt || payload.studentConfirmedAt || payload.resolvedAt;

  const headerTone = rejected
    ? 'bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800'
    : 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700';
  const eyebrowTone = rejected ? 'text-slate-200/90' : 'text-emerald-100/90';
  const titleTone = rejected ? 'text-slate-100' : 'text-emerald-50';
  const fractionTone = rejected ? 'text-slate-200/90' : 'text-emerald-100/90';
  const courseTone = rejected ? 'text-slate-100/95' : 'text-emerald-50/95';

  const node = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-attendance-confirmed-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_25px_80px_-12px_rgba(0,0,0,0.55)]">
        <div className={`relative px-6 pt-8 pb-8 text-center text-white ${headerTone}`}>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition"
            aria-label="Đóng"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <p className={`text-[11px] font-bold uppercase tracking-[0.25em] ${eyebrowTone}`}>
            {rejected ? 'Buổi không được tính' : 'Học viên đã xác nhận'}
          </p>
          <p id="teacher-attendance-confirmed-title" className={`mt-3 text-sm font-semibold ${titleTone}`}>
            Buổi học
          </p>
          <p className="mt-1 text-5xl sm:text-6xl font-black tabular-nums tracking-tight drop-shadow">
            {displaySession}
            {total ? (
              <span className={`text-2xl sm:text-3xl font-bold ${fractionTone}`}>/{total}</span>
            ) : null}
          </p>
          {course ? (
            <p className={`mt-2 text-sm font-medium ${courseTone}`}>{course}</p>
          ) : null}
        </div>

        <div className="px-6 py-6 space-y-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left space-y-2.5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Học viên</p>
              <p className="text-base font-bold text-slate-900">{studentName}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ca</p>
              <p className="text-sm font-semibold text-slate-800">
                {timeRange || '—'}
              </p>
              <p className="text-sm text-slate-600">
                {[weekday, dateLabel].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            {!rejected && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Xác nhận lúc</p>
                <p className="text-sm font-semibold text-slate-800">{formatConfirmedAt(confirmedAt)}</p>
              </div>
            )}
          </div>

          <p className="text-sm text-slate-500 leading-relaxed text-center">
            {rejected
              ? 'Admin không chấp thuận buổi này — không tính vào tiến độ và lương buổi. Bạn có thể xếp thêm ca cho học viên.'
              : 'Học viên đã đồng ý điểm danh — buổi này đã được tính vào tiến độ.'}
          </p>

          <button
            type="button"
            onClick={onClose}
            className={`w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl text-white text-sm font-bold shadow-lg transition ${
              rejected
                ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-800/20'
                : 'bg-slate-800 hover:bg-slate-900 shadow-slate-800/20'
            }`}
          >
            <Check size={18} aria-hidden="true" />
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
