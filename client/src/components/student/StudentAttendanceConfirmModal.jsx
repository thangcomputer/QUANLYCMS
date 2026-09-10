import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Clock } from 'lucide-react';

const RESOLVED_STATUSES = new Set([
  'accepted',
  'admin_approved',
  'admin_rejected',
]);

function isWaitingPayload(payload) {
  if (!payload) return false;
  if (payload.waiting === true) return true;
  const st = String(payload.studentConfirmStatus || '').toLowerCase();
  return st === 'disputed';
}

function isResolvedPayload(payload) {
  if (!payload) return false;
  if (payload.waiting === true) return false;
  if (payload.resolved === true) return true;
  const st = String(payload.studentConfirmStatus || '').toLowerCase();
  if (st === 'disputed') return false;
  if (RESOLVED_STATUSES.has(st)) return true;
  const kind = String(payload.kind || '');
  return kind === 'attendance_admin_approved'
    || kind === 'attendance_rejected'
    || kind === 'attendance_confirmed'
    || kind === 'attendance_taken';
}

/**
 * Modal HV xác nhận điểm danh.
 * - pending: Đồng ý / Không đồng ý (chặn, không đóng nền).
 * - disputed: Đang chờ Admin + nút X.
 * - đã giải quyết: «Đã giải quyết» + nút X.
 */
export default function StudentAttendanceConfirmModal({
  open,
  payload,
  busy = false,
  onAccept,
  onDispute,
  onDismiss,
}) {
  const [submitting, setSubmitting] = useState(false);
  if (!open || !payload) return null;

  const waiting = isWaitingPayload(payload);
  const resolved = !waiting && isResolvedPayload(payload);
  const canDismiss = waiting || resolved;
  const rejected = String(payload.studentConfirmStatus || '').toLowerCase() === 'admin_rejected'
    || String(payload.kind || '') === 'attendance_rejected'
    || payload.resolveOutcome === 'rejected';

  const sessionNo = [payload.sessionNumber, payload.sessionOrdinalPreview, payload.completedSessions]
    .map((v) => Number(v))
    .find((n) => Number.isFinite(n) && n > 0);
  const displaySession = sessionNo != null ? sessionNo : '?';
  const totalRaw = Number(payload.totalSessions || payload.sessionTotalPreview);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : null;
  const teacherName = payload.teacherName || 'Giảng viên';
  const weekday = payload.weekday || '';
  const timeRange = payload.timeRange
    || [payload.startTime, payload.endTime].filter(Boolean).join(' - ');
  const dateLabel = payload.dateLabel || '';
  const course = payload.course || '';

  const run = async (fn) => {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      await fn?.();
    } finally {
      setSubmitting(false);
    }
  };

  const dismiss = () => {
    if (submitting || busy) return;
    onDismiss?.();
  };

  let headerTone = 'bg-gradient-to-br from-red-700 via-red-600 to-rose-700';
  let eyebrowTone = 'text-red-100/90';
  let titleTone = 'text-red-50';
  let fractionTone = 'text-red-100/90';
  let courseTone = 'text-red-50/95';
  let eyebrow = 'Xác nhận điểm danh';
  if (waiting) {
    headerTone = 'bg-gradient-to-br from-amber-700 via-amber-600 to-orange-700';
    eyebrowTone = 'text-amber-100/90';
    titleTone = 'text-amber-50';
    fractionTone = 'text-amber-100/90';
    courseTone = 'text-amber-50/95';
    eyebrow = 'Đang chờ giải quyết';
  } else if (resolved) {
    if (rejected) {
      headerTone = 'bg-gradient-to-br from-slate-700 via-slate-600 to-slate-800';
      eyebrowTone = 'text-slate-200/90';
      titleTone = 'text-slate-100';
      fractionTone = 'text-slate-200/90';
      courseTone = 'text-slate-100/95';
      eyebrow = 'Buổi không được tính';
    } else {
      headerTone = 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700';
      eyebrowTone = 'text-emerald-100/90';
      titleTone = 'text-emerald-50';
      fractionTone = 'text-emerald-100/90';
      courseTone = 'text-emerald-50/95';
      eyebrow = 'Đã giải quyết';
    }
  }

  const node = (
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-confirm-title"
    >
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_25px_80px_-12px_rgba(0,0,0,0.55)]">
        <div className={`relative px-6 pt-8 pb-8 text-center text-white ${headerTone}`}>
          {canDismiss && (
            <button
              type="button"
              onClick={dismiss}
              disabled={submitting || busy}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition disabled:opacity-50"
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
          <p className={`text-[11px] font-bold uppercase tracking-[0.25em] ${eyebrowTone}`}>
            {eyebrow}
          </p>
          <p id="attendance-confirm-title" className={`mt-3 text-sm font-semibold ${titleTone}`}>
            Buổi học
          </p>
          <p className="mt-1 text-5xl sm:text-6xl font-black tabular-nums tracking-tight drop-shadow">
            {displaySession}
            {total ? (
              <span className={`text-2xl sm:text-3xl font-bold ${fractionTone}`}>
                /{total}
              </span>
            ) : null}
          </p>
          {course ? (
            <p className={`mt-2 text-sm font-medium ${courseTone}`}>
              {course}
            </p>
          ) : null}
        </div>

        <div className="px-6 py-6 space-y-4 text-center">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Giảng viên hướng dẫn</p>
            <p className="text-base font-bold text-slate-900">{teacherName}</p>
            <p className="text-sm text-slate-600">
              {[weekday, dateLabel].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="text-sm font-semibold text-slate-800">
              Ca {timeRange || '—'}
            </p>
          </div>

          {waiting ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              Bạn đã gửi Không đồng ý — Admin đang xử lý. Buổi chưa được tính vào tiến độ.
            </p>
          ) : resolved ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              {rejected
                ? 'Admin đã xử lý tranh chấp — buổi học này không được tính vào tiến độ.'
                : 'Buổi điểm danh đã được giải quyết. Bạn có thể đóng cửa sổ này.'}
            </p>
          ) : (
            <p className="text-sm text-slate-500 leading-relaxed">
              Vui lòng xác nhận buổi học này. Bạn cần chọn một trong hai nút bên dưới để tiếp tục sử dụng hệ thống.
            </p>
          )}

          {waiting ? (
            <button
              type="button"
              disabled={submitting || busy}
              onClick={dismiss}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-slate-800/20 transition"
            >
              <Clock size={18} aria-hidden="true" />
              Đóng
            </button>
          ) : resolved ? (
            <button
              type="button"
              disabled={submitting || busy}
              onClick={dismiss}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-slate-800/20 transition"
            >
              <Check size={18} aria-hidden="true" />
              Đã giải quyết
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={submitting || busy}
                onClick={() => run(onAccept)}
                className="min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-emerald-600/20 transition"
              >
                <Check size={18} aria-hidden="true" />
                Đồng ý
              </button>
              <button
                type="button"
                disabled={submitting || busy}
                onClick={() => run(onDispute)}
                className="min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-slate-800/20 transition"
              >
                <X size={18} aria-hidden="true" />
                Không đồng ý
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
