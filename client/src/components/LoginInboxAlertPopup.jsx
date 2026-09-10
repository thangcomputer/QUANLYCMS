import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, MessageSquare } from 'lucide-react';
import { useData } from '../context/DataContext';
import api from '../services/api';
import {
  formatLocalDateKey,
  getScheduleDisplayKind,
  normalizeScheduleDate,
} from '../utils/scheduleTime';
import { LOGIN_OVERLAY_EVENT, getActiveLoginOverlayIds } from '../utils/loginOverlayGate';
import { isAiSupportConversationId, AI_SUPPORT_PEER } from '../utils/aiSupport';
import { LMS_PLAYER_OPEN_EVENT, isLmsPlayerOpen } from '../utils/lmsPlayerOverlay';
import { useSocket } from '../context/SocketContext';

export const LOGIN_ALERT_STORAGE_PREFIX = 'cms_login_alert';

function storageKey(userId) {
  return `${LOGIN_ALERT_STORAGE_PREFIX}_v2_${userId}`;
}

/** Logout dùng localStorage.clear() — giữ lại cờ đã xem popup. */
export function snapshotLoginAlertStorage() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOGIN_ALERT_STORAGE_PREFIX)) out[k] = localStorage.getItem(k);
    }
  } catch { /* ignore */ }
  return out;
}

export function restoreLoginAlertStorage(snap) {
  try {
    Object.entries(snap || {}).forEach(([k, v]) => {
      if (v != null) localStorage.setItem(k, v);
    });
  } catch { /* ignore */ }
}

function inboxPath(role) {
  if (role === 'student') return '/student/inbox';
  if (role === 'teacher') return '/teacher/inbox';
  return '/admin/inbox';
}

function isQuietPath(pathname) {
  const p = String(pathname || '');
  return p.includes('/exam') || p.includes('/test') || p.includes('/inbox');
}

function scheduleId(s) {
  const id = String(s?._id || s.id || '').trim();
  if (id) return id;
  const date = normalizeScheduleDate(s?.date);
  const time = String(s?.startTime || '').trim();
  return date && time ? `${date}|${time}` : '';
}

function readAck(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { unread: null, scheduleIds: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const ids = Array.isArray(parsed.scheduleIds)
      ? parsed.scheduleIds.map(String).filter(Boolean)
      : [];
    return {
      unread: typeof parsed.unread === 'number' ? parsed.unread : null,
      scheduleIds: ids,
    };
  } catch {
    return { unread: null, scheduleIds: [] };
  }
}

function writeAck(userId, unread, scheduleIds) {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({
      unread: Number(unread) || 0,
      scheduleIds: [...new Set((scheduleIds || []).map(String).filter(Boolean))],
    }));
  } catch { /* ignore */ }
}

/** Badge hộp thư: bỏ tin chào/idle của Trợ lý AI — chưa phải người nhắn. */
function isAiSupportConv(c) {
  return isAiSupportConversationId(c?.id) || String(c?.user?.id || '') === AI_SUPPORT_PEER.id;
}

function inboxUnreadCount(convs) {
  return (convs || []).reduce((sum, c) => {
    if (isAiSupportConv(c)) return sum;
    return sum + (Number(c?.unread) || 0);
  }, 0);
}

function pickUpcomingClasses(list) {
  const upcoming = (list || []).filter((s) => {
    const status = String(s.status || 'scheduled');
    if (status === 'cancelled' || status === 'completed' || status === 'no_show') return false;
    const kind = getScheduleDisplayKind(s);
    return kind === 'upcoming' || kind === 'ongoing';
  });
  upcoming.sort((a, b) => {
    const ka = `${normalizeScheduleDate(a.date)}-${a.startTime || ''}`;
    const kb = `${normalizeScheduleDate(b.date)}-${b.startTime || ''}`;
    return ka.localeCompare(kb);
  });
  return upcoming;
}

function formatClassLine(s) {
  const time = [s.startTime, s.endTime].filter(Boolean).join('–');
  const course = s.course || s.courseName || s.title || s.subject || '';
  const today = formatLocalDateKey(new Date());
  const dateKey = normalizeScheduleDate(s.date);
  const dateLabel = dateKey && dateKey !== today
    ? new Date(`${dateKey}T12:00:00`).toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    })
    : '';
  return [dateLabel, time, course].filter(Boolean).join(' · ') || 'Buổi học';
}

/**
 * Popup lúc vào trang: tin người thật chưa đọc; lịch kèm theo.
 * Khi đang học LMS (player full-screen): cho hiện lại nếu có tin mới hoặc lịch mới chưa ack.
 */
export default function LoginInboxAlertPopup({ role, userId, blocked = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { getConversations, getSchedulesByStudent, syncMessages } = useData();
  const [payload, setPayload] = useState(null);
  const [extraBlock, setExtraBlock] = useState(false);
  const [lmsOpen, setLmsOpen] = useState(() => isLmsPlayerOpen());
  const [lmsNudge, setLmsNudge] = useState(0);
  const decidedRef = useRef(false);
  const extrasRef = useRef({});
  const convRef = useRef(getConversations);
  const schedFnRef = useRef(getSchedulesByStudent);
  const syncRef = useRef(syncMessages);
  const busy = blocked || extraBlock;
  const { onMessageReceive, socket } = useSocket() || {};

  useEffect(() => { convRef.current = getConversations; }, [getConversations]);
  useEffect(() => { schedFnRef.current = getSchedulesByStudent; }, [getSchedulesByStudent]);
  useEffect(() => { syncRef.current = syncMessages; }, [syncMessages]);

  useEffect(() => {
    const onLms = (e) => {
      const open = Boolean(e?.detail?.open);
      setLmsOpen(open);
      // Vào lại player: cho phép kiểm tra tin/lịch mới (ack vẫn chặn popup trùng).
      if (open) decidedRef.current = false;
    };
    setLmsOpen(isLmsPlayerOpen());
    window.addEventListener(LMS_PLAYER_OPEN_EVENT, onLms);
    return () => window.removeEventListener(LMS_PLAYER_OPEN_EVENT, onLms);
  }, []);

  // Đang học LMS: tin/lịch mới → nudge kiểm tra lại popup (không đụng flow ngoài LMS).
  useEffect(() => {
    if (!lmsOpen || !userId) return undefined;
    let lastBump = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastBump < 2500) return;
      lastBump = now;
      decidedRef.current = false;
      setLmsNudge((n) => n + 1);
    };
    const unsubMsg = typeof onMessageReceive === 'function'
      ? onMessageReceive((data) => {
        if (!data) return;
        if (String(data.senderId) === String(userId)) return;
        if (isAiSupportConversationId(data.conversationId) || String(data.senderId) === AI_SUPPORT_PEER.id) return;
        bump();
      })
      : null;
    const onSched = () => bump();
    if (socket?.on) {
      socket.on('schedule:updated', onSched);
      socket.on('schedule:new', onSched);
    }
    return () => {
      if (typeof unsubMsg === 'function') unsubMsg();
      if (socket?.off) {
        socket.off('schedule:updated', onSched);
        socket.off('schedule:new', onSched);
      }
    };
  }, [lmsOpen, userId, onMessageReceive, socket]);

  // Tin nhắn người thật đến khi đang ở dashboard phải hiện popup ngay,
  // không chỉ kiểm tra một lần lúc đăng nhập.
  useEffect(() => {
    if (role !== 'student' || !userId || typeof onMessageReceive !== 'function') return undefined;
    let timer = null;
    const unsubMsg = onMessageReceive((data) => {
      if (!data || String(data.senderId) === String(userId)) return;
      if (
        isAiSupportConversationId(data.conversationId)
        || String(data.senderId) === AI_SUPPORT_PEER.id
        || isQuietPath(location.pathname)
      ) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const convs = typeof convRef.current === 'function' ? (convRef.current(userId) || []) : [];
        const unread = Math.max(1, inboxUnreadCount(convs));
        setPayload({ unread, upcoming: [] });
      }, 350);
    });

    return () => {
      if (timer) clearTimeout(timer);
      if (typeof unsubMsg === 'function') unsubMsg();
    };
  }, [role, userId, onMessageReceive, location.pathname]);

  useEffect(() => {
    const syncFromGate = () => {
      const ids = getActiveLoginOverlayIds();
      const next = {};
      ids.forEach((id) => { next[id] = true; });
      extrasRef.current = next;
      setExtraBlock(ids.length > 0);
    };
    const onOverlay = (e) => {
      const id = String(e?.detail?.id || '');
      if (!id) return;
      extrasRef.current[id] = Boolean(e.detail?.open);
      if (!e.detail?.open) delete extrasRef.current[id];
      setExtraBlock(Object.values(extrasRef.current).some(Boolean));
    };
    syncFromGate();
    window.addEventListener(LOGIN_OVERLAY_EVENT, onOverlay);
    return () => window.removeEventListener(LOGIN_OVERLAY_EVENT, onOverlay);
  }, []);

  useEffect(() => {
    if (busy || !userId || decidedRef.current) return undefined;
    if (isQuietPath(location.pathname)) return undefined;
    if (payload) return undefined;

    let cancelled = false;

    const loadUpcoming = async () => {
      if (role !== 'student') return [];
      try {
        const res = await api.schedules.getByStudent(userId);
        if (res?.success && Array.isArray(res.data) && res.data.length) {
          const list = pickUpcomingClasses(res.data);
          if (list.length) return list;
        }
      } catch { /* ignore */ }
      const fn = schedFnRef.current;
      if (typeof fn === 'function') return pickUpcomingClasses(fn(userId));
      return [];
    };

    const readUnread = () => {
      const convs = typeof convRef.current === 'function' ? (convRef.current(userId) || []) : [];
      return inboxUnreadCount(convs);
    };

    const run = async () => {
      if (typeof syncRef.current === 'function') {
        try { await syncRef.current(userId); } catch { /* ignore */ }
      }
      // Đợi React cập nhật messages — tránh đếm nhầm lời chào AI.
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;
      let unread = readUnread();
      if (unread <= 0) {
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) return;
        unread = readUnread();
      }

      let upcoming = await loadUpcoming();
      if (role === 'student' && upcoming.length === 0) {
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;
        upcoming = await loadUpcoming();
      }

      if (cancelled || decidedRef.current) return;
      decidedRef.current = true;

      const ack = readAck(userId);
      const ackedUnread = ack.unread;
      const ackedIds = new Set(ack.scheduleIds || []);
      const currentIds = upcoming.map(scheduleId).filter(Boolean);
      const newIds = currentIds.filter((id) => !ackedIds.has(id));

      if (unread === 0 && ackedUnread != null && ackedUnread > 0) {
        writeAck(userId, 0, ack.scheduleIds);
      }

      // Ngoài LMS: chỉ hiện khi có tin mới. Trong LMS: tin mới hoặc lịch mới chưa ack.
      const showMsg = unread > 0 && (ackedUnread == null || unread > ackedUnread);
      const showSchedOnly = lmsOpen && role === 'student' && newIds.length > 0;
      if (!showMsg && !showSchedOnly) {
        writeAck(userId, unread, [...ackedIds, ...currentIds]);
        return;
      }

      const mergedIds = [...ackedIds, ...currentIds];
      writeAck(userId, Math.max(unread, Number(ackedUnread) || 0), mergedIds);

      setPayload({
        unread: showMsg ? unread : 0,
        upcoming: newIds.length > 0 ? upcoming.slice(0, 3) : (showMsg ? [] : upcoming.slice(0, 3)),
      });
    };

    const delayMs = lmsOpen ? 600 : (role === 'student' ? 2400 : 1000);
    const timer = setTimeout(run, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [busy, userId, role, location.pathname, lmsOpen, payload, lmsNudge]);

  const confirmView = (path) => {
    setPayload(null);
    navigate(path);
  };

  if (!payload || busy) return null;

  const { unread, upcoming } = payload;
  const hasMsg = unread > 0;
  const hasSched = upcoming.length > 0;
  const firstClass = upcoming[0];
  const extraClasses = Math.max(0, upcoming.length - 1);
  const todayKey = formatLocalDateKey(new Date());
  const isToday = firstClass && normalizeScheduleDate(firstClass.date) === todayKey;

  const node = (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-inbox-alert-title"
    >
      <div className="absolute inset-0 bg-slate-950/45" aria-hidden="true" />
      <div className="relative z-10 w-[min(100%,380px)] rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="px-5 pt-5 pb-4 space-y-4">
          {hasMsg ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <MessageSquare size={18} />
              </span>
              <div className="min-w-0">
                <h2 id="login-inbox-alert-title" className="text-[15px] font-bold text-slate-900 leading-tight">
                  Bạn có tin nhắn mới
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {unread} tin chưa đọc
                </p>
              </div>
            </div>
          ) : (
            <h2 id="login-inbox-alert-title" className="sr-only">Lịch học sắp tới</h2>
          )}

          {hasSched ? (
            <div className={`flex items-start gap-3 ${hasMsg ? 'pt-3 border-t border-slate-100' : ''}`}>
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Calendar size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 leading-tight">
                  {hasMsg
                    ? (isToday ? 'Lịch hôm nay' : 'Lịch sắp tới')
                    : (isToday ? 'Hôm nay bạn có lịch' : 'Bạn có lịch học')}
                </p>
                <p className="mt-1 text-sm text-slate-600 leading-snug">
                  {formatClassLine(firstClass)}
                  {extraClasses > 0 ? ` · +${extraClasses} buổi` : ''}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            {hasMsg && hasSched ? (
              <>
                <button
                  type="button"
                  onClick={() => confirmView(inboxPath(role))}
                  className="h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold"
                >
                  Xem tin nhắn
                </button>
                <button
                  type="button"
                  onClick={() => confirmView('/student#schedule')}
                  className="h-11 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50"
                >
                  Xem lịch
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => confirmView(hasMsg ? inboxPath(role) : '/student#schedule')}
                className="h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold"
              >
                Xem ngay
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
