import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Award, Clock, HelpCircle, User, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import {
  hasBlockingLoginOverlay,
  setLoginOverlay,
  subscribeLoginOverlays,
} from '../../utils/loginOverlayGate';

const DISMISS_KEY = 'quiz_invite_dismissed';
/** sessionStorage key — StudentQuizList opens this quiz on mount */
export const PENDING_QUIZ_START_KEY = 'pending_quiz_start';
const ASSIGN_DELAY_MS = 10_000;

function readDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function markDismissed(quizId) {
  const set = readDismissed();
  set.add(String(quizId));
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
}

function toInvitePayload(data) {
  if (!data) return null;
  const quizId = String(data.quizId || data._id || '');
  if (!quizId) return null;
  return {
    quizId,
    title: data.title || 'Bài trắc nghiệm',
    courseName: data.courseName || '',
    teacherName: data.teacherName || 'Giảng viên',
    timeLimitMinutes: data.timeLimitMinutes || 15,
    questionsCount: data.questionsCount ?? (Array.isArray(data.questions) ? data.questions.length : 0),
    createdAt: data.createdAt,
    startTime: data.startTime || null,
    deadline: data.deadline || null,
  };
}

/**
 * Center popup when teacher assigns a quiz.
 * - Realtime: socket event quiz:assigned (emitted ~10s after create)
 * - Login / already online: poll pending quizzes; honor 10s-after-create delay
 */
export default function StudentQuizInviteHost() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [queue, setQueue] = useState([]);
  const [gateMessage, setGateMessage] = useState('');
  const [blocked, setBlocked] = useState(() => hasBlockingLoginOverlay(['student-quiz-invite']));

  useEffect(() => {
    const syncBlocked = () => {
      setBlocked(hasBlockingLoginOverlay(['student-quiz-invite']));
    };
    syncBlocked();
    return subscribeLoginOverlays(syncBlocked);
  }, []);

  useEffect(() => {
    const open = Boolean(invite) && !blocked;
    setLoginOverlay('student-quiz-invite', open);
    return () => setLoginOverlay('student-quiz-invite', false);
  }, [invite, blocked]);

  const enqueueOrShow = useCallback((raw) => {
    const payload = toInvitePayload(raw);
    if (!payload) return;
    if (readDismissed().has(payload.quizId)) return;

    setInvite((current) => {
      if (current && String(current.quizId) === payload.quizId) return current;
      if (current) {
        setQueue((q) => {
          if (q.some((x) => String(x.quizId) === payload.quizId)) return q;
          return [...q, payload];
        });
        return current;
      }
      return payload;
    });
  }, []);

  // Login / remount: pending unsubmitted quizzes
  useEffect(() => {
    let cancelled = false;
    const timers = [];

    (async () => {
      try {
        const res = await api.quizzes.getStudentQuizzes();
        if (!res?.success || cancelled) return;
        const dismissed = readDismissed();
        const pending = (res.data || []).filter((q) => !q.mySubmission && !dismissed.has(String(q._id)));

        for (const q of pending) {
          const createdMs = q.createdAt ? new Date(q.createdAt).getTime() : 0;
          const wait = createdMs ? Math.max(0, createdMs + ASSIGN_DELAY_MS - Date.now()) : 0;
          const payload = toInvitePayload({
            quizId: q._id,
            title: q.title,
            courseName: q.courseName,
            teacherName: q.teacherName,
            timeLimitMinutes: q.timeLimitMinutes,
            questionsCount: q.questionsCount,
            createdAt: q.createdAt,
            startTime: q.startTime,
            deadline: q.deadline,
          });
          if (!payload) continue;
          if (wait === 0) {
            enqueueOrShow(payload);
          } else {
            timers.push(
              setTimeout(() => {
                if (!cancelled) enqueueOrShow(payload);
              }, wait)
            );
          }
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [enqueueOrShow]);

  useEffect(() => {
    if (!socket) return undefined;
    const onAssigned = (data) => enqueueOrShow(data);
    socket.on('quiz:assigned', onAssigned);
    return () => {
      socket.off('quiz:assigned', onAssigned);
    };
  }, [socket, enqueueOrShow]);

  const advanceQueue = useCallback(() => {
    setQueue((q) => {
      const [next, ...rest] = q;
      if (next) {
        queueMicrotask(() => setInvite(next));
      }
      return rest;
    });
  }, []);

  const handleCancel = () => {
    if (invite) markDismissed(invite.quizId);
    setGateMessage('');
    setInvite(null);
    advanceQueue();
  };

  const handleStart = () => {
    if (!invite) return;
    const startMs = invite.startTime ? new Date(invite.startTime).getTime() : 0;
    if (startMs && Number.isFinite(startMs) && Date.now() < startMs) {
      setGateMessage('Chưa đến giờ làm bài. Vui lòng đợi đến giờ mở đề trong Phòng thi.');
      return;
    }
    markDismissed(invite.quizId);
    sessionStorage.setItem(PENDING_QUIZ_START_KEY, invite.quizId);
    setGateMessage('');
    setInvite(null);
    setQueue([]);
    navigate('/student/exam');
  };

  if (!invite || blocked) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99998] flex items-center justify-center p-4 bg-slate-900/55"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-invite-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-[fadeIn_0.25s_ease-out]">
        <div className="bg-gradient-to-br from-red-600 to-red-700 px-5 py-4 text-white relative">
          <button
            type="button"
            onClick={handleCancel}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-100 flex items-center gap-1.5">
            <Award size={14} aria-hidden="true" /> Bài trắc nghiệm mới
          </p>
          <h2 id="quiz-invite-title" className="text-lg font-extrabold mt-1 leading-snug pr-8">
            {invite.title}
          </h2>
          {invite.courseName ? (
            <p className="text-xs text-red-100/90 mt-1 font-medium truncate">{invite.courseName}</p>
          ) : null}
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
              <Clock size={14} className="text-red-600" aria-hidden="true" />
              {invite.timeLimitMinutes} phút
            </span>
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
              <HelpCircle size={14} className="text-red-600" aria-hidden="true" />
              {invite.questionsCount} câu hỏi
            </span>
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
              <User size={14} className="text-red-600" aria-hidden="true" />
              GV: {invite.teacherName}
            </span>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Giảng viên vừa giao bài trắc nghiệm. Bạn có thể làm ngay hoặc hủy để làm sau trong Phòng thi.
          </p>
          {gateMessage ? (
            <p className="text-sm font-semibold text-red-600 leading-relaxed">{gateMessage}</p>
          ) : null}
        </div>

        <div className="px-5 pb-5 flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-200 transition"
          >
            Làm bài ngay
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
