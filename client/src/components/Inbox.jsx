import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle, Send, X, Search, ChevronLeft,
  User, Circle, Image, Paperclip, Smile, Download,
  CheckCheck, Clock as ClockIcon, CheckCircle2, Users, Plus, Trash2, RotateCcw, MoreHorizontal, EyeOff, AlertCircle, ZoomIn, ChevronDown, Edit3, Copy, LogOut, UserPlus, Calendar, Pin, PinOff
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useData, buildConversationId } from '../context/DataContext';
import { useLocation } from 'react-router-dom';
import { useToast } from '../utils/toast';
import { messagesAPI, aiSupportAPI, resolveMediaUrl } from '../services/api';
import TeacherStudentWeekSlotSheet from './teacher/TeacherStudentWeekSlotSheet';
import { displayFileName } from '../utils/validators';
import { resolveAvatarUrl } from '../utils/defaultAvatars';
import { Megaphone, Loader2 } from 'lucide-react';
import { resolveMessagingActor, displayRoleLabel, DISPLAY_ROLE, isAliveMessagingPeer, isSpecialMessagingPeerId } from '../lib/messagingIdentity';
import { mergeConversationsById } from '../lib/conversationList';
import { getMessagingRole } from '../lib/messagingRoles';
import {
  resolveMessagingDeepLink,
  existingPeerIdsFromConversations,
} from '../utils/messagingDeepLink';
import { matchesPersonSearch } from '../utils/personSearch';
import { MessageRichText } from '../utils/messageRichText';
import ScheduleMessagePreviewModal, {
  resolveScheduleMessagePayload,
} from './ScheduleMessagePreviewModal';
import SupportAiHandoffPanel from './support/SupportAiHandoffPanel';
import ScreenCaptureButton from './ScreenCaptureButton';
import {
  isAiSupportConversationId,
  AI_ESCALATE_MARKER,
  AI_SUPPORT_PEER,
  isAiWelcomeReply,
  isAiIdlePing,
  isAiIdleEnd,
  isAiIdleStill,
} from '../utils/aiSupport';
// ─── Helpers ──────────────────────────────────────────────────────────────────
const showFileName = (name) => displayFileName(name);

/** Hiển thị tên: chữ cái đầu mỗi từ in hoa, còn lại thường (VD: SUPPORT TIN HỌC → Support Tin Học). */
const formatDisplayName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw
    .toLocaleLowerCase('vi-VN')
    .split(/(\s+)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase('vi-VN') + part.slice(1);
    })
    .join('');
};

/** Bỏ epoch / ngày rác (tránh hiện "01/01" khi chưa có tin nhắn). */
const MIN_ACTIVITY_MS = Date.UTC(2000, 0, 1);

function toValidActivityDate(date) {
  if (date == null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  const t = d.getTime();
  if (!Number.isFinite(t) || t < MIN_ACTIVITY_MS) return null;
  return d;
}

const formatTime = (date) => {
  const d = toValidActivityDate(date);
  if (!d) return '';
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 0) return '';
  if (diffMs < 60000) return 'Vừa xong';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} phút`;
  if (diffMs < 86400000) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (diffMs < 86400000 * 7) return d.toLocaleDateString('vi-VN', { weekday: 'short' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

function findCurrentAiSessionStartIndex(messages, escalateIdx) {
  const end = escalateIdx >= 0 ? escalateIdx : messages.length;
  let start = 0;
  for (let i = 0; i < end; i += 1) {
    if (isAiWelcomeReply(messages[i]?.content)) start = i;
  }
  return start;
}

function isHandoffMetaMessage(m) {
  const content = String(m?.content || '');
  if (isAiWelcomeReply(content)) return true;
  if (isAiIdlePing(content)) return true;
  if (isAiIdleEnd(content)) return true;
  if (isAiIdleStill(content)) return true;
  if (content.includes(AI_ESCALATE_MARKER)) return true;
  return false;
}

function splitHandoffSummary(text) {
  const raw = String(text || '');
  const marker = 'Hội thoại gần nhất:';
  const i = raw.indexOf(marker);
  if (i < 0) return { head: raw.trim(), transcript: '', footer: '' };
  const head = raw.slice(0, i).trim();
  const rest = raw.slice(i + marker.length).trim();
  const footerIdx = rest.search(/Cần Support xem lại/i);
  if (footerIdx >= 0) {
    return {
      head,
      transcript: rest.slice(0, footerIdx).trim(),
      footer: rest.slice(footerIdx).trim(),
    };
  }
  return { head, transcript: rest, footer: '' };
}

// Keep contact/messaging roles canonical — do NOT collapse staff→admin (splits threads).
const normalizeRole = (role) => (role === 'support' ? 'staff' : role);

const isAttachmentExpired = (msg) =>
  Boolean(msg?.fileExpired) ||
  ((msg?.messageType === 'image' || msg?.messageType === 'file') && !msg?.fileUrl && !msg?.isRecalled);

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|svg)(\?.*)?$/i;

const isImageMessage = (msg) => {
  if (!msg?.fileUrl || msg.isRecalled || isAttachmentExpired(msg)) return false;
  if (msg.messageType === 'image') return true;
  return IMAGE_EXT_RE.test(`${msg.fileName || ''} ${msg.fileUrl || ''}`);
};

function attachmentCaption(msg) {
  const t = String(msg?.content || '').trim();
  if (!t || t === '[Hình ảnh]') return '';
  if (msg?.messageType === 'file' && t.startsWith('Đã gửi tệp:')) return '';
  return t;
}

function ImageLightbox({ preview, onClose, onDownload }) {
  if (!preview || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-bold truncate min-w-0">{showFileName(preview.fileName)}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onDownload(preview.fileUrl, preview.fileName)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors"
          >
            <Download size={14} /> Tải ảnh
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <div
        className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={preview.src}
          alt={showFileName(preview.fileName)}
          className="max-w-full max-h-[calc(100dvh-5rem)] w-auto h-auto object-contain rounded-lg shadow-2xl select-none"
          draggable={false}
        />
      </div>
      <p className="text-center text-white/50 text-[11px] font-bold pb-4 shrink-0">Bấm nền tối hoặc ESC để đóng</p>
    </div>,
    document.body
  );
}

const messageIsFromMe = (msg, currentUserId, currentUserRole) => {
  if (String(msg.senderId) === String(currentUserId)) return true;
  const r = String(currentUserRole || '').toLowerCase();
  // Legacy: một số tin cũ có senderId='admin' (đã từng gom identity).
  // Chỉ "hardcoded admin" (id='admin') mới coi đây là tin của mình,
  // nếu không sẽ làm STAFF thấy tin của SUPER_ADMIN bị đảo chiều.
  if ((r === 'admin' || r === 'staff') && String(currentUserId) === 'admin' && String(msg.senderId) === 'admin') return true;
  return false;
};

/** Mở menu xuống dưới nếu không đủ chỗ trên (đụng header / mép vùng tin). */
function usePlaceChatMenuBelow(open, estimatedHeight = 48) {
  const wrapRef = useRef(null);
  const [placeBelow, setPlaceBelow] = useState(false);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const scroller = el.closest('.cms-chat-messages');
      const r = el.getBoundingClientRect();
      const clipTop = scroller ? scroller.getBoundingClientRect().top : 0;
      setPlaceBelow(r.top - clipTop < estimatedHeight + 8);
    };
    measure();
    const scroller = wrapRef.current?.closest('.cms-chat-messages');
    scroller?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      scroller?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [open, estimatedHeight]);

  return [wrapRef, placeBelow];
}

// ─── Reaction Picker (floating) ────────────────────────────────────────────────
const ReactionPicker = ({ msgId, isMine, onReact, myReactions }) => {
  const [open, setOpen] = useState(false);
  const [ref, placeBelow] = usePlaceChatMenuBelow(open, 48);

  // Đóng khi click ngoài
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, ref]);

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(v => !v)}
        className="opacity-0 group-hover/msg:opacity-100 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-pink-500 transition-all rounded-full hover:bg-white hover:shadow-sm text-base"
        title="Thả cảm xúc"
      >
        <Smile size={15} />
      </button>

      {open && (
        <div
          className={`absolute ${placeBelow ? 'top-full mt-2' : 'bottom-full mb-2'} ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 bg-white rounded-full px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 z-[9999] animate-in zoom-in-75 duration-150`}
          onMouseLeave={() => setOpen(false)}
        >
          {/* Heart */}
          <button
            onClick={(e) => { e.stopPropagation(); onReact(msgId, 'heart'); setOpen(false); }}
            className={`w-9 h-9 flex items-center justify-center text-xl rounded-full transition-all hover:scale-125 hover:bg-red-50 ${myReactions?.includes('heart') ? 'bg-red-50 scale-110' : ''}`}
            title="Tim"
          >
            ❤️
          </button>
          {/* Like */}
          <button
            onClick={(e) => { e.stopPropagation(); onReact(msgId, 'like'); setOpen(false); }}
            className={`w-9 h-9 flex items-center justify-center text-xl rounded-full transition-all hover:scale-125 hover:bg-blue-50 ${myReactions?.includes('like') ? 'bg-blue-50 scale-110' : ''}`}
            title="Thích"
          >
            👍
          </button>
        </div>
      )}
    </div>
  );
};

function ChatFlipWrap({ open, estimatedHeight = 160, className = 'relative', children }) {
  const [wrapRef, placeBelow] = usePlaceChatMenuBelow(open, estimatedHeight);
  return (
    <div className={className} ref={wrapRef}>
      {typeof children === 'function' ? children(placeBelow) : children}
    </div>
  );
}

// ─── MAIN INBOX ──────────────────────────────────────────────────────────────
const Inbox = ({ currentUserId = 'admin', currentUserName = 'Admin', currentUserRole = 'admin', onNavigate }) => {
  const location = useLocation();
  const toast = useToast();
  const socketCtx = useSocket();
  const { isConnected, sendMessage: socketSend, onlineUsers, lastSeenUsers, joinGroupChat, onMessageReceive, onReactionReceive, onRecallReceive, onMessagePinned, onGroupDelete, onContactListUpdated, socket, emitTypingStart, emitTypingStop, onTypingChange } = socketCtx;
  const {
    getConversations, getMessages: ctxGetMessages, sendMessage: ctxSendMessage,
    markMessagesRead, syncMessages, recallMessage: ctxRecallMessage, createChatGroup, deleteChatGroup, leaveChatGroup, addGroupMembers, groups,
    teachers, students, staffs, toggleMessageReaction: ctxToggleReaction,
    softDeleteMessage: ctxDeleteMessage, currentUser, messages: contextMessages,
    schedules, addSchedule, updateSchedule, cancelSchedule, getStudentsByTeacher,
  } = useData();
  const isHighAdmin = currentUser?.adminRole === 'HIGH_ADMIN';
  const isSuperAdmin = currentUser?.id === 'admin' || currentUser?.adminRole === 'SUPER_ADMIN';
  const isSupportAgent = currentUser?.adminRole === 'SUPPORT';
  const [aiHandoffSession, setAiHandoffSession] = useState(null);
  const [showPriorAiThread, setShowPriorAiThread] = useState(false);
  const [handoffQueue, setHandoffQueue] = useState([]);
  const handoffUserIds = useMemo(
    () => new Set((handoffQueue || []).map((item) => String(item.userId || '')).filter(Boolean)),
    [handoffQueue],
  );

  const dataContextConvs = useMemo(
    () => getConversations(currentUserId),
    [getConversations, currentUserId],
  );
  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [seedContact, setSeedContact] = useState(null); // navigation intent — gated by resolveMessagingDeepLink
  const [hiddenList, setHiddenList] = useState([]);
  const [contactTab, setContactTab] = useState('all'); // 'all', 'student', 'teacher', 'admin', 'group'

  const isUserOnline = useCallback((userId) => {
    if (!userId || !onlineUsers || !Array.isArray(onlineUsers)) return false;
    const targetStr = String(userId);
    return onlineUsers.some((u) => {
      const id = String(u?.userId || u?.id || '');
      return id && id === targetStr;
    });
  }, [onlineUsers]);

  const getUserStatusText = useCallback((userId, isOnline) => {
    if (isOnline) {
      return (
        <span className="text-emerald-600 font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Trực tuyến
        </span>
      );
    }
    if (!userId || !lastSeenUsers) return <span className="text-slate-400">Ngoại tuyến</span>;
    const lastSeenTime = lastSeenUsers[String(userId)];
    if (!lastSeenTime) return <span className="text-slate-400">Ngoại tuyến</span>;

    try {
      const diffMs = Date.now() - new Date(lastSeenTime).getTime();
      if (isNaN(diffMs) || diffMs < 0) return <span className="text-slate-400">Ngoại tuyến</span>;

      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return <span className="text-slate-500 font-medium">Hoạt động vừa xong</span>;
      if (diffMins < 60) return <span className="text-slate-500 font-medium">Hoạt động {diffMins} phút trước</span>;
      if (diffHours < 24) return <span className="text-slate-500 font-medium">Hoạt động {diffHours} giờ trước</span>;
      if (diffDays < 7) return <span className="text-slate-500 font-medium">Hoạt động {diffDays} ngày trước</span>;
      return <span className="text-slate-400">Ngoại tuyến</span>;
    } catch {
      return <span className="text-slate-400">Ngoại tuyến</span>;
    }
  }, [lastSeenUsers]);

  useEffect(() => {
    (async () => {
      try {
        const [res, hiddenRes] = await Promise.all([
          messagesAPI.getContacts(),
          messagesAPI.getHiddenConversations()
        ]);
        if (res?.success) setContacts(Array.isArray(res.data) ? res.data : []);
        else setContacts([]);
        if (hiddenRes?.success) setHiddenList(hiddenRes.data);
      } catch (err) {
        setContacts([]);
      } finally {
        setContactsLoaded(true);
      }
    })();
  }, []);

  const refreshHiddenList = useCallback(async () => {
    try {
      const hiddenRes = await messagesAPI.getHiddenConversations();
      if (hiddenRes?.success) setHiddenList(hiddenRes.data);
    } catch (err) { }
  }, []);

  // 📡 Re-fetch danh bạ khi server thông báo CONTACT_LIST_UPDATED (sau xếp lớp)
  const refreshContacts = useCallback(async () => {
    try {
      const res = await messagesAPI.getContacts();
      if (res?.success) setContacts(Array.isArray(res.data) ? res.data : []);
      else setContacts([]);
    } catch (err) {
      setContacts([]);
    } finally {
      setContactsLoaded(true);
    }
  }, []);

  // Dọn tin nhắn orphan trên server (user đã xóa) rồi sync lại hộp thư
  useEffect(() => {
    const elevated = currentUserRole === 'admin'
      || currentUser?.adminRole === 'SUPER_ADMIN'
      || currentUser?.adminRole === 'HIGH_ADMIN';
    if (!elevated || !currentUserId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await messagesAPI.purgeOrphans();
        if (cancelled) return;
        const deleted = Number(res?.data?.deletedMessages || 0);
        if (res?.success && deleted > 0) {
          await syncMessages?.(currentUserId);
          await refreshContacts();
          toast.info(`Đã dọn ${deleted} tin nhắn từ tài khoản đã xóa`);
        }
      } catch {
        /* ignore — client filter vẫn ẩn ghost */
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, currentUserRole, refreshContacts, syncMessages]);

  useEffect(() => {
    if (!onContactListUpdated) return;
    const unsub = onContactListUpdated((payload) => {
      refreshContacts();
    });
    return unsub;
  }, [onContactListUpdated, refreshContacts]);

  // Đồng bộ danh sách liên hệ khi dữ liệu hệ thống thay đổi (không chỉ CONTACT_LIST_UPDATED)
  useEffect(() => {
    if (!socket) return;
    let t = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        refreshContacts();
      }, 400);
    };
    ['data:refresh', 'student:new', 'student:assigned', 'teacher:new', 'student:updated'].forEach((ev) => socket.on(ev, bump));
    return () => {
      if (t) clearTimeout(t);
      ['data:refresh', 'student:new', 'student:assigned', 'teacher:new', 'student:updated'].forEach((ev) => socket.off(ev, bump));
    };
  }, [socket, refreshContacts]);

  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [pinnedMessageObj, setPinnedMessageObj] = useState(null);

  // Đóng hội thoại chỉ khi peer chắc chắn ghost (không dùng students/teachers/staffs local —
  // Admin/Staff thường students=[], GV chỉ có teachers=[self] → trước đây kill nhầm mọi chat).
  useEffect(() => {
    if (!activeConv || activeConv.isGroup || activeConv.isAiHandoff) return;
    if (!contactsLoaded) return;
    const peerId = activeConv.user?.id;
    if (!peerId || isSpecialMessagingPeerId(peerId)) return;

    const alive = isAliveMessagingPeer(peerId, {
      contacts,
      students,
      teachers,
      staffs,
    });
    if (alive) return;

    setActiveConv(null);
    setMessages([]);
  }, [activeConv, contactsLoaded, contacts, students, teachers, staffs]);
  const [pendingImage, setPendingImage] = useState(null);
  // Ghim chỉ lấy từ tin của hội thoại đang mở — tránh dính ghim sang người khác khi đổi chat.
  useEffect(() => {
    const convId = activeConv?.id ? String(activeConv.id) : '';
    if (!convId) {
      setPinnedMessageObj(null);
      return;
    }
    const localPinned = messages.find((m) => m.isPinned);
    setPinnedMessageObj(localPinned || null);
  }, [activeConv?.id, messages]);

  const resolveGroupSendFlags = (conv) => {
    const convId = String(conv?.id || '');
    const isGroup = Boolean(
      conv?.isGroup
      || convId.startsWith('group_')
      || String(conv?.user?.role || '').toLowerCase() === 'group'
    );
    const groupId = isGroup
      ? String(conv?.user?.id || conv?.groupId || (convId.startsWith('group_') ? convId.slice(6) : '') || '')
      : null;
    return { isGroup, groupId: groupId || null };
  };

  const handlePinMessage = async (msgId) => {
    if (!activeConv) return;
    try {
      const isCurrentlyPinned = activeConv?.metadata?.pinnedMessageId === String(msgId)
        || messages.some((m) => m.isPinned && String(m.id || m._id) === String(msgId));
      const targetMsg = messages.find((m) => String(m.id) === String(msgId));
      const isSchedulePin = Boolean(resolveScheduleMessagePayload(targetMsg));
      const res = await messagesAPI.pinMessage(activeConv.id, msgId);
      if (res?.success) {
        toast.success(res.message || 'Đã cập nhật ghim');
        const nextPinnedId = res.pinnedMessageId || null;
        setActiveConv(prev => ({
          ...prev,
          metadata: {
            ...prev.metadata,
            pinnedMessageId: nextPinnedId
          }
        }));
        setMessages((prev) => prev.map((m) => ({
          ...m,
          isPinned: nextPinnedId ? String(m.id || m._id) === String(nextPinnedId) : false,
        })));
        if (activeConv && activeConv.user && activeConv.user.id) {
          const { isGroup: sendIsGroup, groupId: sendGroupId } = resolveGroupSendFlags(activeConv);
          const pinLabel = isSchedulePin ? 'lịch học' : 'một tin nhắn';
          const properMsg = {
            conversationId: activeConv.id,
            senderId: currentUserId,
            senderName: currentUserName,
            senderRole: currentUserRole,
            receiverId: activeConv.user.id,
            receiverName: activeConv.user.name,
            receiverRole: sendIsGroup ? 'group' : activeConv.user.role,
            content: !isCurrentlyPinned 
              ? `${currentUserName || 'Người dùng'} đã ghim ${pinLabel}.` 
              : `${currentUserName || 'Người dùng'} đã bỏ ghim ${pinLabel}.`,
            messageType: 'system',
            isGroup: sendIsGroup,
            groupId: sendGroupId,
          };
          await ctxSendMessage(properMsg);
        }
      } else {
        toast.error(res?.message || 'Lỗi khi ghim tin nhắn');
      }
    } catch (err) {
      toast.error('Lỗi khi ghim tin nhắn');
    }
  };

  const notifyInboxScheduleEvent = async (formData, action = 'created') => {
    if (!activeConv?.id) return;
    let displayDate = formData.date;
    try {
      if (displayDate && displayDate.includes('-')) {
        const parts = displayDate.split('-');
        if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch (e) { /* ignore */ }

    let weekday = '';
    try {
      const rawDate = formData.date
        ? (String(formData.date).includes('-')
          ? new Date(`${String(formData.date).slice(0, 10)}T12:00:00`)
          : new Date(formData.date))
        : null;
      if (rawDate && !Number.isNaN(rawDate.getTime())) {
        weekday = rawDate.toLocaleDateString('vi-VN', {
          weekday: 'long',
          timeZone: 'Asia/Ho_Chi_Minh',
        });
      }
    } catch { /* ignore */ }

    const scheduleId = formData.scheduleId || null;
    const courseLabel = formData.course || activeConv.user?.course || '';
    const startTime = formData.startTime || '';
    const endTime = formData.endTime || '';
    const prevStart = formData.prevStartTime || '';
    const prevEnd = formData.prevEndTime || '';

    let content = `Đã xếp lịch học thành công cho học viên vào ngày ${displayDate} từ ${startTime} đến ${endTime}.`;
    let kind = 'schedule_created';
    if (action === 'changed') {
      kind = 'schedule_changed';
      const prevLabel = (prevStart && prevEnd)
        ? ` (trước đó: ${prevStart}–${prevEnd})`
        : (prevStart ? ` (trước đó: ${prevStart})` : '');
      content = `Đã đổi ca học của học viên sang ngày ${displayDate} từ ${startTime} đến ${endTime}${prevLabel}.`;
    } else if (action === 'cancelled') {
      kind = 'schedule_cancelled';
      content = `Đã hủy ca học của học viên ngày ${displayDate} từ ${startTime} đến ${endTime}.`;
    }

    await ctxSendMessage({
      conversationId: activeConv.id,
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
      receiverId: activeConv.user.id,
      receiverName: activeConv.user.name,
      receiverRole: activeConv.user.role,
      content,
      messageType: 'system',
      isGroup: false,
      groupId: null,
      payload: {
        kind,
        scheduleId: scheduleId ? String(scheduleId) : null,
        date: formData.date || null,
        dateLabel: displayDate,
        weekday,
        startTime,
        endTime,
        prevStartTime: prevStart || null,
        prevEndTime: prevEnd || null,
        course: courseLabel,
        studentName: formData.studentName || activeConv.user?.name || '',
        teacherName: currentUserName || '',
      },
    });
  };

  const conversations = useMemo(() => {
    const entries = [];

    // Dedupe contacts từ API (tránh duplicate key + không lọc bỏ High Admin)
    const seenContacts = new Set();
    const uniqueContacts = (contacts || []).filter((c) => {
      if (!c?.id) return false;
      const idStr = String(c.id);
      if (seenContacts.has(idStr)) return false;
      seenContacts.add(idStr);
      return true;
    });

    const activityById = new Map();
    const activityByPeer = new Map();
    (dataContextConvs || []).forEach((dc) => {
      if (!dc?.id || isAiSupportConversationId(dc.id)) return;
      const id = String(dc.id);
      activityById.set(id, dc);
      if (!dc.isGroup && dc.user?.id != null) {
        activityByPeer.set(String(dc.user.id), dc);
      }
    });

    const seenConvIds = new Set();
    const contactIdSet = new Set(uniqueContacts.map((c) => String(c.id)));
    // SUPER: chỉ peers trong GET /contacts (HIGH_ADMIN) — không leak activity từ students/teachers local.
    const isListedPeer = (peerId) => {
      const id = String(peerId || '');
      if (!id) return false;
      if (isSpecialMessagingPeerId(id) && !isSuperAdmin) return true;
      if (!contactsLoaded) return true;
      if (isSuperAdmin) return contactIdSet.has(id);
      return contactIdSet.has(id) || isAliveMessagingPeer(id, { contacts, students, teachers, staffs });
    };
    const pushEntry = (entry) => {
      const id = String(entry?.id || '');
      if (!id || seenConvIds.has(id)) return false;
      if (isSuperAdmin && entry?.isGroup) return false;
      if (!entry?.isGroup && entry?.user?.id && !isListedPeer(entry.user.id)) return false;
      seenConvIds.add(id);
      entries.push(entry);
      return true;
    };

    uniqueContacts.forEach((c) => {
      if (String(c.id) === String(currentUserId) || String(c.id) === 'ai_support') return;
      if (isHighAdmin && (c.productRole === 'STUDENT' || normalizeRole(c.role) === 'student')) return;
      if (isSupportAgent && handoffUserIds.has(String(c.id))) return;
      // Transport role for conversation IDs; product/adminRole for tab presentation (Phase 6).
      const role = c.transportRole || getMessagingRole({
        id: c.id,
        role: c.role,
        adminRole: c.adminRole,
      });
      const myRole = getMessagingRole({
        id: currentUserId,
        role: currentUserRole,
      }) || normalizeRole(currentUserRole);
      const builtId = String(buildConversationId(myRole, currentUserId, role, c.id));

      // Prefer exact conversationId; fallback peer id (role mismatch must not hide contact)
      const existingConv = activityById.get(builtId)
        || activityByPeer.get(String(c.id))
        || ((c.id === 'admin' || c.adminRole === 'SUPER_ADMIN') ? activityByPeer.get('admin') : null);
      const canonicalId = existingConv?.id && !isAiSupportConversationId(existingConv.id)
        ? String(existingConv.id)
        : builtId;
      if (isAiSupportConversationId(canonicalId)) return;
      if (seenConvIds.has(canonicalId)) return;

      pushEntry({
        id: canonicalId,
        isGroup: false,
        isHidden: hiddenList.includes(canonicalId),
        user: {
          id: c.id,
          name: c.name,
          role,
          adminRole: c.adminRole || existingConv?.user?.adminRole || null,
          productRole: c.productRole || null,
          avatar: c.avatar || existingConv?.user?.avatar,
          gender: c.gender,
          phone: c.phone || '',
          online: isUserOnline(c.id),
        },
        lastMessage: existingConv?.lastMessage || 'Bắt đầu cuộc trò chuyện',
        lastTime: toValidActivityDate(existingConv?.lastTime),
        unread: existingConv?.unread || 0,
      });
    });

    // Phase 7: deep-link seed if peer is in contacts/activity, or trusted teacher→HV nav.
    // Server still authorizes sends; this only seeds Inbox UX.
    if (seedContact?.id && String(seedContact.id) !== String(currentUserId)) {
      const activityPeerIds = existingPeerIdsFromConversations(dataContextConvs);
      const gate = resolveMessagingDeepLink({
        peerId: seedContact.id,
        contacts: uniqueContacts,
        existingPeerIds: activityPeerIds,
      });
      if (gate.allowed || seedContact.trusted) {
        const seedRole = normalizeRole(seedContact.role);
        if (isHighAdmin && seedRole === 'student' && seedContact.adminRole !== 'STAFF' && seedContact.adminRole !== 'SUPPORT') {
          /* High Admin không mở thread học viên */
        } else {
          const role = getMessagingRole({
            id: seedContact.id,
            role: seedContact.role,
            adminRole: seedContact.adminRole,
          }) || normalizeRole(seedContact.role);
          const myRole = getMessagingRole({ id: currentUserId, role: currentUserRole }) || normalizeRole(currentUserRole);
          const builtId = String(buildConversationId(myRole, currentUserId, role, seedContact.id));
          const existingConv = activityById.get(builtId) || activityByPeer.get(String(seedContact.id));
          const canonicalId = existingConv?.id && !isAiSupportConversationId(existingConv.id)
            ? String(existingConv.id)
            : builtId;
          if (
            isAiSupportConversationId(canonicalId)
            || (isSupportAgent && handoffUserIds.has(String(seedContact.id)))
            || seenConvIds.has(canonicalId)
          ) {
            /* skip AI handoff / queue peers */
          } else {
            // Prefer contact row metadata when peer is discoverable
            const fromContact = uniqueContacts.find((c) => String(c.id) === String(seedContact.id));
            pushEntry({
              id: canonicalId,
              isGroup: false,
              isHidden: false,
              user: {
                id: seedContact.id,
                name: fromContact?.name || seedContact.name,
                role: fromContact?.transportRole || role,
                adminRole: fromContact?.adminRole || seedContact.adminRole || null,
                productRole: fromContact?.productRole || null,
                avatar: fromContact?.avatar || seedContact.avatar,
                gender: fromContact?.gender || seedContact.gender,
                phone: fromContact?.phone || seedContact.phone || '',
                online: isUserOnline(seedContact.id),
              },
              lastMessage: existingConv?.lastMessage || 'Bắt đầu cuộc trò chuyện',
              lastTime: toValidActivityDate(existingConv?.lastTime)
                || (gate.mode === 'AUTHORIZED_CONTACT' || seedContact.trusted ? null : new Date()),
              unread: existingConv?.unread || 0,
            });
          }
        }
      }
    }

    // Phase 6: include message-activity DMs from dataContext (not discovery seeds).
    // Discovery contacts come only from GET /api/messages/contacts above.
    (dataContextConvs || []).forEach((dc) => {
      if (!dc?.id) return;
      const id = String(dc.id);
      if (isAiSupportConversationId(id) || seenConvIds.has(id)) return;
      if (isSuperAdmin && dc.isGroup) return;
      const peerRole = normalizeRole(dc.user?.role);
      if (isHighAdmin && peerRole === 'student' && dc.user?.adminRole !== 'STAFF' && dc.user?.adminRole !== 'SUPPORT') return;
      const peerId = dc.user?.id != null ? String(dc.user.id) : '';
      if (!dc.isGroup && peerId && !isListedPeer(peerId)) return;
      if (isSupportAgent && peerId && handoffUserIds.has(peerId)) return;
      const fromContact = peerId
        ? uniqueContacts.find((c) => String(c.id) === peerId)
        : null;
      pushEntry({
        ...dc,
        id,
        isHidden: hiddenList.includes(id),
        user: {
          ...(dc.user || {}),
          adminRole: fromContact?.adminRole || dc.user?.adminRole || null,
          productRole: fromContact?.productRole || dc.user?.productRole || null,
          gender: fromContact?.gender || dc.user?.gender,
          avatar: fromContact?.avatar || dc.user?.avatar,
          online: isUserOnline(dc.user?.id),
        },
      });
    });

    // Canonical id merge + newest lastTime first (immutable)
    return mergeConversationsById(entries);
  }, [contacts, contactsLoaded, dataContextConvs, hiddenList, currentUserRole, currentUserId, onlineUsers, seedContact, isHighAdmin, isSuperAdmin, isSupportAgent, handoffUserIds, students, teachers, staffs]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [groupToLeave, setGroupToLeave] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  // Trạng thái recall đang xử lý
  const [recallingId, setRecallingId] = useState(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingActiveRef = useRef(false);

  // Broadcast states
  const [broadcastConfig, setBroadcastConfig] = useState(null); // { targetRole: 'student', label: 'Học viên' }
  const [broadcastContent, setBroadcastContent] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [schedulePreview, setSchedulePreview] = useState(null);

  const EMOJIS = ['😊', '👍', '❤️', '👏', '🔥', '✅', '🆘', '📚', '💻', '💡'];

  useEffect(() => {
    if (!imagePreview) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [imagePreview]);

  const openImagePreview = useCallback((msg) => {
    if (!msg?.fileUrl) return;
    setImagePreview({
      src: resolveMediaUrl(msg.fileUrl),
      fileUrl: msg.fileUrl,
      fileName: msg.fileName || 'image',
    });
  }, []);

  // ─── Join groups ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeConv && activeConv.isGroup) {
      const gid = activeConv.user?.id || activeConv.groupId || (activeConv.id?.startsWith('group_') ? activeConv.id.slice(6) : null);
      if (gid) joinGroupChat(gid);
    }
  }, [activeConv, joinGroupChat]);

  useEffect(() => {
    if (groups && groups.length > 0) {
      groups.forEach(g => {
        const gid = g._id || g.id;
        if (gid) joinGroupChat(gid);
      });
    }
  }, [groups, joinGroupChat]);

  // ─── Sync messages khi mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentUserId && syncMessages) {
      syncMessages(currentUserId);
    }
  }, [currentUserId, syncMessages]);

  // ─── Helper tra cứu tên người gửi — resolve by senderId, never role==="admin" alone ──
  const resolveSenderName = useCallback((msg) => {
    if (!msg) return 'Người dùng';
    if (String(msg.senderId) === String(currentUserId)) return currentUserName || 'Người dùng';
    if (msg.sender?.displayName) return msg.sender.displayName;
    const actor = resolveMessagingActor(
      {
        id: msg.senderId,
        role: msg.senderRole,
        name: msg.senderName,
        avatar: msg.senderAvatar || msg.sender?.avatar,
        adminRole: msg.sender?.adminRole,
      },
      { teachers: teachers || [], students: students || [], staffs: staffs || [] },
    );
    return actor.displayName || 'Người dùng';
  }, [currentUserId, currentUserName, teachers, students, staffs]);

  const resolveSenderMeta = useCallback((msg) => {
    if (!msg) {
      return { displayName: 'Người dùng', displayRole: DISPLAY_ROLE.UNKNOWN, avatar: '', role: 'unknown', adminRole: null };
    }
    if (msg.sender?.displayName && msg.sender?.id) {
      return {
        displayName: msg.sender.displayName,
        displayRole: msg.sender.displayRole || DISPLAY_ROLE.UNKNOWN,
        avatar: msg.sender.avatar || '',
        role: msg.sender.role || msg.senderRole,
        adminRole: msg.sender.adminRole || null,
      };
    }
    return resolveMessagingActor(
      {
        id: msg.senderId,
        role: msg.senderRole,
        name: msg.senderName,
        avatar: msg.senderAvatar,
        adminRole: msg.sender?.adminRole,
      },
      { teachers: teachers || [], students: students || [], staffs: staffs || [] },
    );
  }, [teachers, students, staffs]);

  // ─── Load messages khi chọn conversation (tránh loop: không phụ thuộc identity ctxGetMessages) ──
  const activeConvId = activeConv?.id ? String(activeConv.id) : '';
  const activeConvMsgKey = useMemo(() => {
    if (!activeConvId || !Array.isArray(contextMessages)) return '';
    const gid = activeConvId.startsWith('group_') ? activeConvId.slice(6) : '';
    return contextMessages
      .filter((m) => m && (
        String(m.convId || '') === activeConvId
        || String(m.conversationId || '') === activeConvId
        || (m.isGroup && m.groupId && `group_${m.groupId}` === activeConvId)
        || (gid && String(m.groupId || '') === gid)
      ))
      .map((m) => `${m.id}:${m.read ? 1 : 0}:${m.isRecalled ? 1 : 0}:${(m.reactions || []).length}`)
      .join('|');
  }, [contextMessages, activeConvId]);

  const mapContextMsg = useCallback((m) => {
    const meta = resolveSenderMeta(m);
    return {
      id: m.id,
      senderId: m.senderId,
      senderName: String(m.senderId) === String(currentUserId)
        ? (currentUserName || meta.displayName)
        : meta.displayName,
      senderRole: m.senderRole || meta.role || (m.senderId === 'admin' ? 'admin' : activeConv?.user?.role),
      senderAdminRole: meta.adminRole,
      senderDisplayRole: meta.displayRole,
      senderAvatar: meta.avatar || m.senderAvatar || '',
      content: m.content,
      time: m.time,
      isRead: m.read,
      isRecalled: m.isRecalled || false,
      messageType: m.messageType || 'text',
      fileName: m.fileName,
      fileUrl: m.fileUrl,
      fileExpired: m.fileExpired || false,
      reactions: m.reactions || [],
        isPinned: m.isPinned || false,
      payload: m.payload && typeof m.payload === 'object' ? m.payload : null,
    };
  }, [resolveSenderMeta, currentUserId, currentUserName, activeConv?.user?.role]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    if (activeConv?.isAiHandoff) return;
    const msgs = ctxGetMessages(activeConvId);
    setMessages(msgs.map(mapContextMsg));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional fingerprint deps
  }, [activeConvId, activeConvMsgKey, activeConv?.isAiHandoff]);

  useEffect(() => {
    if (!activeConv?.isAiHandoff || !activeConvId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await aiSupportAPI.thread(activeConvId);
        if (cancelled || !res?.success) return;
        setAiHandoffSession(res.data?.session || null);
        const rows = (res.data?.messages || []).map((m) => ({
          id: String(m._id || m.id),
          senderId: m.senderId,
          senderName: m.senderName,
          senderRole: m.senderRole,
          content: m.content,
          time: m.createdAt || m.time,
          isRead: m.isRead,
          isRecalled: m.isRecalled || false,
          messageType: m.messageType || 'text',
          fileName: m.fileName,
          fileUrl: m.fileUrl,
        }));
        setMessages(rows);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [activeConv?.isAiHandoff, activeConvId]);

  useEffect(() => {
    setShowPriorAiThread(false);
  }, [activeConvId]);

  const handoffSummaryParts = useMemo(
    () => splitHandoffSummary(aiHandoffSession?.handoffSummary),
    [aiHandoffSession?.handoffSummary],
  );

  const aiHistorySplit = useMemo(() => {
    if (!activeConv?.isAiHandoff) {
      return { hiddenCount: 0, visible: messages, sessionStart: 0, escalateIdx: -1 };
    }
    const escalateIdx = messages.findIndex((m) => String(m.content || '').includes(AI_ESCALATE_MARKER));
    if (escalateIdx <= 0) {
      return { hiddenCount: 0, visible: messages, sessionStart: 0, escalateIdx };
    }
    const sessionStart = findCurrentAiSessionStartIndex(messages, escalateIdx);
    return {
      sessionStart,
      escalateIdx,
      hiddenCount: escalateIdx - sessionStart,
      visible: messages.slice(escalateIdx),
    };
  }, [activeConv?.isAiHandoff, messages]);

  const priorAiMessages = useMemo(() => {
    if (!activeConv?.isAiHandoff || aiHistorySplit.escalateIdx <= 0) return [];
    const { sessionStart, escalateIdx } = aiHistorySplit;
    return messages.slice(sessionStart, escalateIdx).filter((m) => {
      if (m.isRecalled) return false;
      if (String(m.messageType || 'text') === 'system') return false;
      if (isHandoffMetaMessage(m)) return false;
      return Boolean(String(m.content || '').trim());
    });
  }, [activeConv?.isAiHandoff, aiHistorySplit, messages]);

  const showHandoffSummaryPanel = Boolean(
    activeConv?.isAiHandoff && (aiHandoffSession?.handoffSummary || priorAiMessages.length > 0),
  );

  const messagesToRender = showHandoffSummaryPanel
    ? aiHistorySplit.visible
    : ((activeConv?.isAiHandoff && !showPriorAiThread)
      ? aiHistorySplit.visible
      : messages);

  const markedReadConvRef = useRef('');
  useEffect(() => {
    if (!activeConvId) {
      markedReadConvRef.current = '';
      return;
    }
    if (markedReadConvRef.current === activeConvId) return;
    markedReadConvRef.current = activeConvId;
    markMessagesRead(activeConvId, currentUserId, (currentUserRole === 'admin') ? ['admin'] : []);
  }, [activeConvId, markMessagesRead, currentUserId, currentUserRole]);

  // ─── Socket real-time listeners ──────────────────────────────────────────────
  useEffect(() => {
    let unsubRecall, unsubReaction, unsubMsg, unsubPinned, unsubGroupDelete;
      
    if (onMessagePinned) {
      unsubPinned = onMessagePinned((data) => {
        if (activeConv && String(data.conversationId) === String(activeConv.id)) {
          setActiveConv(prev => ({
            ...prev,
            metadata: { ...prev.metadata, pinnedMessageId: data.isPinned ? data.messageId : null }
          }));
          setMessages(prev => prev.map(m => {
            if (String(m.id) === String(data.messageId)) return { ...m, isPinned: data.isPinned };
            if (data.isPinned && m.isPinned) return { ...m, isPinned: false };
            return m;
          }));
        }
      });
    }

    if (onGroupDelete) {
      unsubGroupDelete = onGroupDelete((data) => {
        const deletedGroupId = String(data?.groupId || '');
        if (!deletedGroupId) return;

        // Tự động đóng khung chat nếu đang xem nhóm vừa bị xóa
        setActiveConv((prev) => {
          if (prev && (prev.isGroup || String(prev.id).startsWith('group_')) && (String(prev.id) === `group_${deletedGroupId}` || String(prev.user?.id) === deletedGroupId)) {
            toast.info(`Nhóm "${data.groupName || 'này'}" đã bị giải tán.`);
            return null;
          }
          return prev;
        });

        // Xóa nhóm khỏi danh sách hội thoại
        setConversations((prev) => (Array.isArray(prev) ? prev.filter((c) => String(c.id) !== `group_${deletedGroupId}`) : []));
      });
    }

    if (onMessageReceive) {
      unsubMsg = onMessageReceive((data) => {
        // Chỉ cập nhật nếu tin nhắn thuộc cuộc trò chuyện đang chọn
        if (activeConv && (String(data.conversationId) === String(activeConv.id))) {
          setMessages(prev => {
            if (prev.some(m => String(m.id) === String(data._id))) return prev;
            const mappedMsg = {
              id: data._id,
              senderId: data.senderId,
              senderName: resolveSenderName(data),
              senderRole: data.senderRole,
              senderAdminRole: data.sender?.adminRole || resolveSenderMeta(data).adminRole,
              senderDisplayRole: data.sender?.displayRole || resolveSenderMeta(data).displayRole,
              senderAvatar: data.sender?.avatar || data.senderAvatar || resolveSenderMeta(data).avatar || '',
              content: data.content,
              time: new Date(data.createdAt || Date.now()),
              isRead: data.isRead || false,
              isRecalled: data.isRecalled || false,
              messageType: data.messageType || 'text',
              fileName: data.fileName,
              fileUrl: data.fileUrl,
              fileExpired: data.fileExpired || false,
              reactions: data.reactions || [],
              isPinned: data.isPinned || false,
            };
            return [...prev, mappedMsg];
          });
          markMessagesRead(activeConv.id, currentUserId, (currentUserRole === 'admin') ? ['admin'] : []);
        }
      });
    }

    if (onRecallReceive) {
      unsubRecall = onRecallReceive((data) => {
        setMessages(prev => prev.map(m =>
          String(m.id) === String(data.messageId)
            ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' }
            : m
        ));
      });
    }

    if (onReactionReceive) {
      unsubReaction = onReactionReceive((data) => {
        setMessages(prev => prev.map(m =>
          String(m.id) === String(data.messageId) ? { ...m, reactions: data.reactions } : m
        ));
      });
    }

    return () => {
      if (unsubMsg) unsubMsg();
      if (unsubRecall) unsubRecall();
      if (unsubReaction) unsubReaction();
      if (unsubPinned) unsubPinned();
      if (unsubGroupDelete) unsubGroupDelete();
    };
  }, [activeConv, onMessageReceive, onRecallReceive, onReactionReceive, onMessagePinned, onGroupDelete, currentUserId, currentUserRole, markMessagesRead, resolveSenderName, resolveSenderMeta, toast]);

  useEffect(() => {
    if (!socket || !activeConv?.isAiHandoff) return undefined;
    const onUserMsg = (payload) => {
      if (String(payload?.conversationId) !== String(activeConv.id)) return;
      setMessages((prev) => {
        const key = `${payload.userId}:${payload.content}:${payload.conversationId}`;
        if (prev.some((m) => `${m.senderId}:${m.content}:${activeConv.id}` === key)) return prev;
        return [...prev, {
          id: `handoff_${Date.now()}`,
          senderId: payload.userId,
          senderName: payload.userName || 'Người dùng',
          senderRole: payload.userRole || 'student',
          content: payload.content,
          time: new Date(),
          messageType: 'text',
        }];
      });
    };
    socket.on('ai-support:user-message', onUserMsg);
    return () => socket.off('ai-support:user-message', onUserMsg);
  }, [socket, activeConv?.isAiHandoff, activeConv?.id]);

  // ─── Thu hồi tin nhắn ────────────────────────────────────────────────────────
  // ── Copy tin nhắn ──
  const handleCopyText = useCallback((text) => {
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text);
      toast.success('Đã sao chép tin nhắn');
    }
  }, [toast]);

  // ── Thu hồi tin nhắn ──
  const handleRecall = useCallback(async (msgId) => {
    if (recallingId) return; // Chống double click
    setRecallingId(msgId);

    // Optimistic update ngay lập tức
    setMessages(prev => prev.map(m =>
      String(m.id) === String(msgId)
        ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' }
        : m
    ));

    try {
      await ctxRecallMessage(msgId);
    } catch (err) {
      // Rollback nếu API thất bại
      setMessages(prev => prev.map(m =>
        String(m.id) === String(msgId) ? { ...m, isRecalled: false } : m
      ));
      toast?.error('Không thể thu hồi tin nhắn. Vui lòng thử lại.');
    } finally {
      setRecallingId(null);
    }
  }, [recallingId, ctxRecallMessage, toast]);

  // ─── Xóa mềm lịch sử cá nhân ───────────────────────────────────────────────
  const [showMessageOptions, setShowMessageOptions] = useState(null);
  const [showConvOptions, setShowConvOptions] = useState(null);

  const handleDeleteHistory = useCallback(async (msgId) => {
    setShowMessageOptions(null);
    try {
      await ctxDeleteMessage(msgId);
      setMessages(prev => prev.filter(m => String(m.id) !== String(msgId)));
    } catch (err) {
      toast?.error('Không thể xóa lịch sử lúc này.');
    }
  }, [ctxDeleteMessage, toast]);

  // ─── Toggle reaction ──────────────────────────────────────────────────────────
  const handleReaction = useCallback(async (messageId, type) => {
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (String(m.id) !== String(messageId)) return m;
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex(r => r.userId === currentUserId && r.type === type);
      if (idx > -1) {
        return { ...m, reactions: reactions.filter((_, i) => i !== idx) };
      } else {
        return { ...m, reactions: [...reactions, { userId: currentUserId, type, userName: currentUserName }] };
      }
    }));

    try {
      await ctxToggleReaction(messageId, type);
    } catch (err) {
    }
  }, [currentUserId, currentUserName, ctxToggleReaction]);

  // ─── Gửi tin nhắn ────────────────────────────────────────────────────────────
  const selectConversation = (conv) => {
    setPinnedMessageObj(null);
    setMessages([]);
    const { isGroup } = resolveGroupSendFlags(conv);
    // Never rebuild group threads as DM conversationIds
    if (isGroup) {
      const gid = String(conv?.user?.id || conv?.groupId || (String(conv?.id || '').startsWith('group_') ? String(conv.id).slice(6) : ''));
      setActiveConv({
        ...conv,
        isGroup: true,
        id: gid ? `group_${gid}` : conv.id,
        user: { ...(conv.user || {}), id: gid || conv?.user?.id, role: 'group' },
      });
      return;
    }
    // Nếu conv truyền vào là object từ danh bạ (chưa có id hoặc id kiểu r_i__r_i)
    if (conv.user && !conv.lastMessage) {
      const peerRole = getMessagingRole({
        id: conv.user.id,
        role: conv.user.role,
        adminRole: conv.user.adminRole,
      }) || normalizeRole(conv.user.role);
      const myRole = getMessagingRole({ id: currentUserId, role: currentUserRole }) || normalizeRole(currentUserRole);
      const properId = buildConversationId(myRole, currentUserId, peerRole, conv.user.id);

      // Kiểm tra xem đã có conv này trong dataContext chưa
      const existing = dataContextConvs.find(dc => dc.id === properId);
      if (existing) {
        setActiveConv(existing);
      } else {
        setActiveConv({ ...conv, id: properId });
      }
    } else {
      setActiveConv(conv);
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items || !activeConv) return;

    let imageFile = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageFile = items[i].getAsFile();
        break;
      }
    }

    if (!imageFile) return;

    e.preventDefault();

    const file = imageFile;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('Ảnh quá lớn. Giới hạn 5MB.');
      setTimeout(() => setUploadError(''), 4000);
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const uploadRes = await messagesAPI.uploadMessageFile(file);
      if (!uploadRes.success) throw new Error(uploadRes.message || 'Lỗi lưu trữ ảnh');

      setPendingImage({
        url: uploadRes.url,
        fileName: file.name || 'screenshot.png',
      });
      toast.success('Đã dán ảnh từ bộ nhớ tạm! Nhấn Enter hoặc nút Gửi để gửi.');
    } catch (err) {
      setUploadError('Tải ảnh thất bại: ' + (err.message || ''));
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setIsUploading(false);
    }
  };

  /** Chụp màn hình → pending (giống dán ảnh), Enter mới gửi. */
  const stageScreenshotForSend = useCallback(async (file) => {
    if (!file || !activeConv) return;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('Ảnh quá lớn. Giới hạn 5MB.');
      setTimeout(() => setUploadError(''), 4000);
      return;
    }
    setIsUploading(true);
    setUploadError('');
    try {
      const uploadRes = await messagesAPI.uploadMessageFile(file);
      if (!uploadRes.success) throw new Error(uploadRes.message || 'Lỗi lưu trữ ảnh');
      setPendingImage({
        url: uploadRes.url,
        fileName: file.name || 'screenshot.png',
      });
      toast.success('Đã gắn ảnh chụp màn hình. Nhấn Enter hoặc nút Gửi để gửi.');
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setUploadError('Tải ảnh thất bại: ' + (err.message || ''));
      setTimeout(() => setUploadError(''), 4000);
      toast.error(err.message || 'Không gắn được ảnh chụp');
    } finally {
      setIsUploading(false);
    }
  }, [activeConv, toast]);

  const startInboxTyping = () => {
    if (!activeConvId || !emitTypingStart || typingActiveRef.current) return;
    typingActiveRef.current = true;
    emitTypingStart(activeConvId, currentUserName);
  };

  const stopInboxTyping = () => {
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    if (activeConvId) emitTypingStop?.(activeConvId);
  };

  const appendHandoffMessage = (m) => {
    if (!m) return;
    const id = String(m._id || m.id || '');
    setMessages((prev) => {
      if (id && prev.some((x) => String(x.id) === id)) return prev;
      return [...prev, {
        id: id || String(Date.now()),
        senderId: m.senderId,
        senderName: m.senderName,
        senderRole: m.senderRole,
        content: m.content,
        time: m.createdAt || new Date(),
        messageType: m.messageType || 'text',
        fileUrl: m.fileUrl || '',
        fileName: m.fileName || '',
      }];
    });
  };

  const sendHandoffReply = async ({ content = '', fileUrl = '', fileName = '', messageType = 'text' }) => {
    const res = await aiSupportAPI.reply(activeConv.id, {
      content,
      fileUrl,
      fileName,
      messageType,
    });
    if (!res?.success) throw new Error(res?.message || 'Không gửi được');
    appendHandoffMessage(res.data?.message);
    if (res.data?.session) setAiHandoffSession(res.data.session);
  };

  const handleSend = async () => {
    if ((!newMsg.trim() && !pendingImage) || !activeConv) return;
    stopInboxTyping();
    const contentText = newMsg.trim();

    if (activeConv.isAiHandoff) {
      if (!contentText && !pendingImage) return;
      try {
        await sendHandoffReply({
          content: contentText,
          fileUrl: pendingImage?.url || '',
          fileName: pendingImage?.fileName || '',
          messageType: pendingImage ? 'image' : 'text',
        });
        setNewMsg('');
        setPendingImage(null);
      } catch (err) {
        toast.error(err.message || 'Không gửi được');
      }
      return;
    }

    if (pendingImage) {
      const { isGroup: sendIsGroup, groupId: sendGroupId } = resolveGroupSendFlags(activeConv);
      const msgData = {
        conversationId: activeConv.id,
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        receiverId: activeConv.user.id,
        receiverName: activeConv.user.name,
        receiverRole: sendIsGroup ? 'group' : activeConv.user.role,
        content: contentText || '[Hình ảnh]',
        messageType: 'image',
        fileUrl: pendingImage.url,
        fileName: pendingImage.fileName,
        isGroup: sendIsGroup,
        groupId: sendGroupId,
      };
      const sentImg = await ctxSendMessage(msgData);
      if (sentImg?.failed) {
        toast.error(sentImg.failReason || 'Không gửi được tin nhắn');
      }
      setPendingImage(null);
      setNewMsg('');
    } else if (contentText) {
      const { isGroup: sendIsGroup, groupId: sendGroupId } = resolveGroupSendFlags(activeConv);
      const msgData = {
        conversationId: activeConv.id,
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        receiverId: activeConv.user.id,
        receiverName: activeConv.user.name,
        receiverRole: sendIsGroup ? 'group' : activeConv.user.role,
        content: contentText,
        messageType: 'text',
        isGroup: sendIsGroup,
        groupId: sendGroupId,
      };
      const sent = await ctxSendMessage(msgData);
      if (sent?.failed) {
        toast.error(sent.failReason || 'Không gửi được tin nhắn');
      }
      setNewMsg('');
    }

    setShowEmojis(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeConv) return;

    const isImage = file.type.startsWith('image/');
    const maxSize = 5 * 1024 * 1024;
    const maxLabel = '5MB';

    if (file.size > maxSize) {
      setUploadError(`File quá lớn. Giới hạn ${maxLabel}.`);
      e.target.value = '';
      setTimeout(() => setUploadError(''), 4000);
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const uploadRes = await messagesAPI.uploadMessageFile(file);
      if (!uploadRes.success) throw new Error(uploadRes.message || 'Lỗi hệ thống lưu trữ');

      if (activeConv.isAiHandoff) {
        await sendHandoffReply({
          content: '',
          fileUrl: uploadRes.url,
          fileName: file.name,
          messageType: isImage ? 'image' : 'file',
        });
        return;
      }

      const { isGroup: sendIsGroup, groupId: sendGroupId } = resolveGroupSendFlags(activeConv);
      const msgData = {
        conversationId: activeConv.id,
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        receiverId: activeConv.user.id,
        receiverName: activeConv.user.name,
        receiverRole: sendIsGroup ? 'group' : activeConv.user.role,
        content: isImage ? '[Hình ảnh]' : `Đã gửi tệp: ${file.name}`,
        messageType: isImage ? 'image' : 'file',
        fileUrl: uploadRes.url,
        fileName: file.name,
        isGroup: sendIsGroup,
        groupId: sendGroupId,
      };

      await ctxSendMessage(msgData);
    } catch (err) {
      setUploadError('Tải tệp thất bại: ' + (err.message || ''));
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const addEmoji = (emoji) => {
    setNewMsg(prev => prev + emoji);
    setShowEmojis(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setPeerTyping(false);
    return () => {
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        emitTypingStop?.(activeConvId);
      }
    };
  }, [activeConvId, emitTypingStop]);

  useEffect(() => {
    if (!onTypingChange || !activeConvId) return undefined;
    return onTypingChange(({ conversationId, userId, show }) => {
      if (String(conversationId) !== String(activeConvId)) return;
      if (String(userId) === String(currentUserId)) return;
      setPeerTyping(!!show);
    });
  }, [onTypingChange, activeConvId, currentUserId]);

  const handleDownload = useCallback(async (url, fileName) => {
    const safeName = showFileName(fileName);
    const fullUrl = resolveMediaUrl(url);
    if (!fullUrl) return;
    try {
      const response = await fetch(fullUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const link = document.createElement('a');
      link.href = fullUrl;
      link.download = safeName || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setShowMessageOptions(null);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleHideConversation = async (e, convId) => {
    e.stopPropagation();
    try {
      // Ẩn + đánh dấu đã đọc để badge không còn báo tin chưa đọc
      await markMessagesRead(convId, currentUserId, (currentUserRole === 'admin') ? ['admin'] : []);
      const res = await messagesAPI.hideConversation(convId);
      if (res.success) {
        setHiddenList(prev => [...prev, convId]);
        if (activeConv?.id === convId) {
          setActiveConv(null);
        }
        toast.success('Đã ẩn cuộc trò chuyện');
      }
    } catch (err) {
      toast.error('Lỗi khi ẩn cuộc trò chuyện');
    }
  };

  const filteredConvs = conversations.filter(c => {
    if (isAiSupportConversationId(c.id)) return false;
    if (isSupportAgent && handoffUserIds.has(String(c.user?.id || ''))) return false;
    const isSearching = search.trim().length > 0;
    if (!isSearching && c.isHidden) return false;

    if (isSearching) {
      const hit = matchesPersonSearch(search, {
        name: c.user?.name || '',
        phone: c.user?.phone || '',
        zalo: c.user?.zalo || '',
      });
      if (!hit) return false;
    }

    if (contactTab === 'all') return true;
    if (contactTab === 'group') return c.isGroup;
    const r = normalizeRole(c.user?.role);
    const ar = String(c.user?.adminRole || '').toUpperCase();
    // Phase 8.24: Admin = SUPER/HIGH only; Staff vs Support tabs
    if (contactTab === 'admin') {
      return r === 'admin' && ar !== 'STAFF' && ar !== 'SUPPORT';
    }
    if (contactTab === 'staff') {
      return r === 'staff' && ar !== 'SUPPORT';
    }
    if (contactTab === 'support') {
      return ar === 'SUPPORT';
    }
    return r === contactTab;
  });

  const contactSearchSuggestions = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return conversations.filter((c) => {
      if (isAiSupportConversationId(c.id)) return false;
      if (isSupportAgent && handoffUserIds.has(String(c.user?.id || ''))) return false;
      return matchesPersonSearch(q, {
        name: c.user?.name || '',
        phone: c.user?.phone || '',
        zalo: c.user?.zalo || '',
      });
    }).slice(0, 8);
  }, [search, conversations, isSupportAgent, handoffUserIds]);

  // Online lên trên; offline / nhóm ở dưới — trong nhóm vẫn ưu tiên tin mới nhất
  const sortedConvs = [...filteredConvs].sort((a, b) => {
    const aOn = !a.isGroup && isUserOnline(a.user?.id) ? 1 : 0;
    const bOn = !b.isGroup && isUserOnline(b.user?.id) ? 1 : 0;
    if (aOn !== bOn) return bOn - aOn;
    return new Date(b.lastTime || 0) - new Date(a.lastTime || 0);
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  // Auto-select from navigation — Phase 7: never invent unauthorized peers
  const hasAutoSelected = useRef(false);
  const draftAppliedKey = useRef('');
  const lastDeepLinkId = useRef('');
  useEffect(() => {
    const selectId = location.state?.selectUserId;
    const selectUser = location.state?.selectUser;
    if (selectId && String(selectId) !== lastDeepLinkId.current) {
      lastDeepLinkId.current = String(selectId);
      hasAutoSelected.current = false;
      draftAppliedKey.current = '';
    }

    if (selectUser?.id) {
      const next = {
        id: String(selectUser.id),
        name: selectUser.name || 'Người dùng',
        role: normalizeRole(selectUser.role || 'admin'),
        adminRole: selectUser.adminRole || null,
        avatar: selectUser.avatar,
        phone: selectUser.phone || '',
        trusted: Boolean(selectUser.trusted),
      };
      setSeedContact((prev) => {
        if (
          prev
          && String(prev.id) === next.id
          && prev.name === next.name
          && String(prev.adminRole || '') === String(next.adminRole || '')
          && String(prev.role || '') === String(next.role || '')
          && Boolean(prev.trusted) === next.trusted
        ) {
          return prev;
        }
        return next;
      });
    } else if (selectId) {
      setSeedContact((prev) => {
        if (prev && String(prev.id) === String(selectId)) return prev;
        return {
          id: String(selectId),
          name: 'Người dùng',
          role: 'student',
        };
      });
    }

    if (!selectId || hasAutoSelected.current) return;
    // Wait for contacts so we can distinguish Case A (existing) vs Case B (unauthorized new)
    if (!contactsLoaded) return;

    const found = conversations.find((c) => String(c.user?.id) === String(selectId));
    if (found) {
      hasAutoSelected.current = true;
      selectConversation(found);
      return;
    }

    // Peer is an authorized contact — wait for seedContact merge into conversations
    const inContacts = (contacts || []).some((c) => String(c?.id) === String(selectId));
    if (inContacts) return;
    // Teacher→assigned-student deep link: wait for trusted seed merge
    if (selectUser?.trusted || (seedContact?.trusted && String(seedContact.id) === String(selectId))) return;

    // Not in merged list (contacts + activity) → do not create a synthetic conversation
    hasAutoSelected.current = true;
  }, [location.state?.selectUserId, location.state?.selectUser, location.state?.draftMessage, conversations, currentUserId, currentUserRole, contactsLoaded, contacts, seedContact]);

  // Apply draft when conversation becomes active after deep-link
  useEffect(() => {
    const selectId = location.state?.selectUserId;
    const draft = location.state?.draftMessage;
    if (!selectId || !draft || !activeConv) return;
    if (String(activeConv.user?.id) !== String(selectId)) return;
    const key = `${selectId}::${String(draft).slice(0, 48)}`;
    if (draftAppliedKey.current === key) return;
    draftAppliedKey.current = key;
    setNewMsg(String(draft));
  }, [location.state?.selectUserId, location.state?.draftMessage, activeConv?.id, activeConv?.user?.id]);

  return (
    <div className="cms-chat-shell">
      {/* ═══════ MAIN AREA ═══════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Sidebar: Conversations ── */}
        <div className={`
          w-full md:w-[min(42%,280px)] lg:w-[340px] xl:w-[380px] bg-white border-r border-gray-100 flex flex-col flex-shrink-0 min-w-0
          ${activeConv ? 'hidden md:flex' : 'flex'}
        `}>
          {/* Search & Add Group */}
          <div className="cms-chat-search-sticky">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => setSearchFocused(false), 180);
                  }}
                  placeholder="Tìm họ, tên, tên đệm, SĐT..."
                  className="cms-input pl-10 pr-3"
                  autoComplete="off"
                  aria-label="Tìm kiếm danh bạ"
                  aria-autocomplete="list"
                  aria-expanded={searchFocused && contactSearchSuggestions.length > 0}
                />
                {searchFocused && search.trim() && contactSearchSuggestions.length > 0 && (
                  <ul
                    className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
                    role="listbox"
                  >
                    {contactSearchSuggestions.map((c) => (
                      <li key={c.id} role="option">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-red-50 transition-colors"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selectConversation(c);
                            setSearchFocused(false);
                          }}
                        >
                          <span className="block text-sm font-medium text-slate-800 truncate">
                            {c.user?.name || 'Không rõ tên'}
                          </span>
                          {c.user?.phone ? (
                            <span className="block text-[11px] text-slate-400">{c.user.phone}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {currentUserRole !== 'student' && !isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(true)}
                  className="w-12 h-12 flex shrink-0 items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors shadow-sm"
                  title="Tạo nhóm chat"
                  aria-label="Tạo nhóm chat"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>

            {/* Hàng Tabs (Pills) Phân loại danh bạ */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'student', label: 'Học viên' },
                { id: 'teacher', label: 'Giảng viên' },
                { id: 'admin', label: 'Admin' },
                { id: 'staff', label: 'Tuyển sinh' },
                { id: 'support', label: 'Hỗ trợ' },
                { id: 'group', label: 'Nhóm' }
              ].filter(tab => {
                if (isSuperAdmin) return tab.id === 'all' || tab.id === 'admin';
                if (currentUserRole === 'student' && (tab.id === 'student' || tab.id === 'admin')) return false;
                if (currentUserRole === 'teacher' && tab.id === 'teacher') return false;
                if (isHighAdmin && tab.id === 'student') return false;
                if (currentUserRole === 'staff' && !isSupportAgent && tab.id === 'staff') return false;
                return true;
              }).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setContactTab(tab.id)}
                  className={contactTab === tab.id ? 'cms-chip cms-chip-active' : 'cms-chip'}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 bg-white space-y-1 overscroll-contain">
            {isSupportAgent ? (
              <SupportAiHandoffPanel
                onQueueChange={setHandoffQueue}
                onOpen={async (item) => {
                  setActiveConv({
                    id: item.conversationId,
                    isAiHandoff: true,
                    user: {
                      id: item.userId,
                      name: item.userName || 'Người dùng',
                      role: item.userRole || 'student',
                    },
                  });
                  setAiHandoffSession(item);
                  try {
                    const res = await aiSupportAPI.claim(item.conversationId);
                    if (res?.success && res.data?.session) setAiHandoffSession(res.data.session);
                  } catch {
                    /* queue still opens thread */
                  }
                }}
              />
            ) : null}
            {sortedConvs.map(conv => {
              const isGroup = Boolean(
                conv.isGroup
                || String(conv.id || '').startsWith('group_')
                || String(conv.user?.role || '').toLowerCase() === 'group'
                || (groups || []).some((g) => String(g._id || g.id) === String(conv.user?.id))
              );
              return (
                <div
                  key={conv.id}
                  onClick={() => selectConversation({ ...conv, isGroup })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectConversation({ ...conv, isGroup });
                    }
                  }}
                  className={`cms-chat-conv-row group ${activeConv?.id === conv.id ? 'cms-chat-conv-row-active' : 'hover:bg-gray-50'}`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-md relative z-10 overflow-hidden ${isGroup ? 'bg-red-500' : 'bg-white ring-2 ' + (
                        conv.user.role === 'teacher' ? 'ring-amber-400/80'
                          : conv.user.role === 'student' ? 'ring-sky-400/80'
                            : String(conv.user.adminRole || '').toUpperCase() === 'SUPPORT' ? 'ring-blue-400/80'
                              : conv.user.role === 'admin' ? 'ring-rose-400/80'
                                : 'ring-slate-300'
                      )
                      }`}>
                      {isGroup ? (
                        <Users size={20} />
                      ) : (
                        <img
                          src={resolveAvatarUrl(conv.user)}
                          alt={conv.user.name || ''}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.dataset.fallback === '1') return;
                            el.dataset.fallback = '1';
                            el.src = resolveAvatarUrl({ ...conv.user, avatar: '' });
                          }}
                        />
                      )}
                    </div>
                    {!isGroup && (
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 z-20 text-[8px] px-1 min-w-[18px] h-4 rounded-md font-black leading-none flex items-center justify-center shadow-sm border border-white ${conv.user.role === 'teacher' ? 'bg-amber-500 text-white'
                            : conv.user.role === 'student' ? 'bg-sky-500 text-white'
                              : String(conv.user.adminRole || '').toUpperCase() === 'SUPPORT' ? 'bg-blue-600 text-white'
                                : String(conv.user.adminRole || '').toUpperCase() === 'STAFF' || conv.user.role === 'staff' ? 'bg-slate-600 text-white'
                                  : conv.user.role === 'admin' ? 'bg-rose-600 text-white'
                                    : 'bg-slate-600 text-white'
                          }`}
                      >
                        {conv.user.role === 'teacher' ? 'GV' : conv.user.role === 'student' ? 'HV' : (
                          String(conv.user.adminRole || '').toUpperCase() === 'SUPPORT'
                            ? 'HT'
                            : String(conv.user.adminRole || '').toUpperCase() === 'STAFF' || conv.user.role === 'staff'
                              ? 'NV'
                              : 'AD'
                        )}
                      </span>
                    )}
                    {!isGroup && isUserOnline(conv.user.id) && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white z-30 shadow-sm"
                        title="Đang online"
                        aria-label="Đang online"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0 pr-1">
                    <div className="flex justify-between items-center gap-2 mb-0.5">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <h4 className="font-semibold text-[#1E293B] text-base truncate">{formatDisplayName(conv.user.name)}</h4>
                        {!isGroup && (
                          isUserOnline(conv.user.id) ? (
                            <span className="shrink-0 text-[9px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded">
                              online
                            </span>
                          ) : (
                            <span className="shrink-0 text-[9px] font-medium text-slate-400 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">
                              offline
                            </span>
                          )
                        )}
                        {conv.unread > 0 && (
                          <span className="ml-1 min-w-[16px] h-4 px-1 bg-red-600 rounded-full text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                            {conv.unread > 99 ? '99+' : conv.unread}
                          </span>
                        )}
                        {conv.user.branchCode && (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0">
                            {conv.user.branchCode}
                          </span>
                        )}
                        {currentUserRole === 'admin' && conv.user.phone && (
                          <a
                            href={`https://zalo.me/${conv.user.phone.replace(/\s+/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                            title="Chat Zalo"
                          >
                            <span className="bg-brand-zalo text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm tracking-wide shadow-sm">Zalo</span>
                          </a>
                        )}

                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowConvOptions(showConvOptions === conv.id ? null : conv.id);
                              }}
                              className="text-slate-400 hover:text-slate-700 bg-white shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-slate-50"
                              title="Tùy chọn"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {showConvOptions === conv.id && (
                              <div className="absolute right-0 top-full mt-1 z-[100] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                                <button
                                  onClick={(e) => {
                                    setShowConvOptions(null);
                                    handleHideConversation(e, conv.id);
                                  }}
                                  className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <EyeOff size={12} /> Ẩn trò chuyện
                                </button>
                              </div>
                            )}
                          </div>
                        <span className="text-xs text-slate-400 font-medium tabular-nums">
                          {formatTime(
                            toValidActivityDate(conv.lastTime)
                            || (!conv.isGroup && lastSeenUsers?.[String(conv.user?.id)])
                            || null,
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <p className={`text-[13px] truncate flex-1 font-medium ${conv.unread > 0 ? 'text-blue-600 border-l-[3px] border-blue-600 pl-1.5' : 'text-slate-500'}`}>
                        {conv.lastMessage || 'Bắt đầu trò chuyện...'}
                      </p>
                      {conv.unread > 0 && (
                        <div className="flex gap-1 items-center shrink-0">
                          <span className="px-1.5 py-0.5 bg-red-500 rounded-md text-white text-[10px] font-semibold animate-pulse shadow-sm">
                            Mới
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Chat Area ── */}
        <div className={`flex-1 flex flex-col bg-[#F8FAFC] min-w-0 ${!activeConv ? 'hidden md:flex' : 'flex'} relative`}>
          {!activeConv ? (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center p-8 bg-white/50 backdrop-blur-sm">
              <div className="text-center animate-in fade-in zoom-in duration-500">
                <div className="mb-6 relative inline-block">
                  <div className="absolute inset-0 bg-blue-100 rounded-full blur-2xl opacity-20 animate-pulse" />
                  <div className="relative w-24 h-24 bg-white rounded-[32px] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-100 flex items-center justify-center">
                    <MessageCircle size={40} className="text-blue-500" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg border-2 border-white rotate-12">
                    <CheckCircle2 size={20} />
                  </div>
                </div>
                <h3 className="text-slate-900 font-black text-xl mb-2">Trung tâm Tin học & Công nghệ</h3>
                <p className="text-slate-500 font-bold max-w-sm mx-auto text-[14px] leading-relaxed">
                  Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu thảo luận hoặc gửi tài liệu.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 justify-center">
                  {['admin', 'staff'].includes(currentUserRole) ? (
                    <>
                      <button
                        onClick={() => setBroadcastConfig({ targetRole: 'admin', label: 'Kênh Admin' })}
                        className="px-4 py-2 bg-white hover:bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100 shadow-sm transition-all active:scale-95"
                      >
                        📢 Gửi toàn bộ Admin
                      </button>
                      <button
                        onClick={() => setBroadcastConfig({ targetRole: 'teacher', label: 'Giảng viên' })}
                        className="px-4 py-2 bg-white hover:bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100 shadow-sm transition-all active:scale-95"
                      >
                        📢 Gửi toàn bộ Giảng viên
                      </button>
                      {!isHighAdmin ? (
                        <button
                          onClick={() => setBroadcastConfig({ targetRole: 'student', label: 'Học viên' })}
                          className="px-4 py-2 bg-white hover:bg-slate-50 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100 shadow-sm transition-all active:scale-95"
                        >
                          📢 Gửi toàn bộ Học viên
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Kênh Admin</span>
                      <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Giảng viên</span>
                      <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Học viên</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="cms-chat-header">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => setActiveConv(null)}
                    className="md:hidden shrink-0 w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl text-slate-700 transition-colors"
                    aria-label="Quay lại danh sách"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold overflow-hidden ring-2 ring-white shadow-sm ${activeConv.isGroup ? 'bg-red-500' : 'bg-white'
                      }`}>
                      {activeConv.isGroup ? (
                        <Users size={16} />
                      ) : (
                        <img
                          src={resolveAvatarUrl(activeConv.user)}
                          alt={activeConv.user.name || ''}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.dataset.fallback === '1') return;
                            el.dataset.fallback = '1';
                            el.src = resolveAvatarUrl({ ...activeConv.user, avatar: '' });
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-base truncate">{formatDisplayName(activeConv.user.name)}</p>
                      {activeConv.user.branchCode && (
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-sm">
                          Cơ sở: {activeConv.user.branchCode}
                        </span>
                      )}
                      {currentUserRole === 'admin' && activeConv.user.phone && (
                        <a
                          href={`https://zalo.me/${activeConv.user.phone.replace(/\s+/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:scale-110 transition-transform cursor-pointer"
                          title="Chat Zalo"
                        >
                          <span className="bg-brand-zalo text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm tracking-wide">Zalo</span>
                        </a>
                      )}

                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {activeConv.isGroup
                        ? 'Nhóm trò chuyện'
                        : getUserStatusText(activeConv.user.id, isUserOnline(activeConv.user.id))}
                    </p>
                  </div>
                </div>
                {(!activeConv.isGroup && currentUserRole === 'teacher' && activeConv?.user?.role === 'student') && (
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="shrink-0 ml-1 inline-flex items-center justify-center gap-1.5 min-h-10 px-2.5 sm:px-3 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-100 text-xs font-bold"
                    title="Xếp lịch tuần cho học viên này"
                  >
                    <Calendar size={16} />
                    <span>Xếp lịch</span>
                  </button>
                )}
                {activeConv.isGroup && (() => {
                  const groupIdStr = activeConv.id.replace('group_', '');
                  const groupObj = groups?.find(g => String(g._id) === groupIdStr || String(g.id) === groupIdStr);
                  const isCreator = groupObj && String(groupObj.createdBy?.userId) === String(currentUserId);
                  return (
                    <div className="flex items-center gap-1.5 ml-2">
                      {isCreator && (
                        <button
                          onClick={() => {
                            setSelectedParticipants([]);
                            setMemberSearch('');
                            setShowAddMemberModal(true);
                          }}
                          className="flex shrink-0 items-center justify-center w-8 h-8 md:w-9 md:h-9 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Thêm thành viên"
                        >
                          <UserPlus size={16} />
                        </button>
                      )}
                      {isCreator ? (
                        <button
                          onClick={() => setGroupToDelete(groupIdStr)}
                          className="flex shrink-0 items-center justify-center w-8 h-8 md:w-9 md:h-9 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Xóa nhóm vĩnh viễn"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setGroupToLeave(groupIdStr)}
                          className="flex shrink-0 items-center justify-center w-8 h-8 md:w-9 md:h-9 bg-orange-50 text-orange-500 hover:bg-orange-500 hover:text-white rounded-xl transition-all shadow-sm"
                          title="Rời nhóm"
                        >
                          <LogOut size={16} />
                        </button>
                      )}
                    </div>
                  );
                })()}
                {activeConv.isAiHandoff ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await aiSupportAPI.resolve(activeConv.id);
                        if (!res?.success) throw new Error(res?.message || 'Không đóng được');
                        setAiHandoffSession(res.data?.session || null);
                        toast.success('Đã đánh dấu xử lý xong');
                      } catch (err) {
                        toast.error(err.message || 'Không đóng được yêu cầu');
                      }
                    }}
                    className="flex shrink-0 items-center justify-center px-3 h-9 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-wide"
                    title="Đánh dấu đã xử lý"
                  >
                    Đã xử lý
                    </button>
                  ) : null}
                  
                  
                </div>

                {pinnedMessageObj && (() => {
                  const pinnedSchedule = resolveScheduleMessagePayload(pinnedMessageObj);
                  return (
                  <div 
                      onClick={() => {
                        const el = document.getElementById(`msg-${pinnedMessageObj.id || pinnedMessageObj._id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('animate-pulse', 'bg-blue-50/50');
                          setTimeout(() => el.classList.remove('animate-pulse', 'bg-blue-50/50'), 2000);
                        }
                      }}
                      className={`mx-3 mt-2 px-4 py-2.5 cursor-pointer transition-colors rounded-xl flex items-center justify-between gap-3 shadow-sm relative group overflow-hidden shrink-0 ${
                        pinnedSchedule
                          ? 'bg-violet-50/70 hover:bg-violet-50 border border-violet-100/80'
                          : 'bg-blue-50/50 hover:bg-blue-50 border border-blue-100/50'
                      }`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${pinnedSchedule ? 'bg-violet-500' : 'bg-blue-400'}`}></div>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        pinnedSchedule ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {pinnedSchedule ? <Calendar size={12} /> : <Pin size={12} className="rotate-45" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${
                          pinnedSchedule ? 'text-violet-800' : 'text-blue-800'
                        }`}>
                          {pinnedSchedule ? 'Lịch học đã ghim' : 'Tin nhắn đã ghim'}
                        </p>
                        <p className="text-xs text-slate-700 font-medium truncate">
                          {pinnedSchedule
                            ? [
                                [pinnedSchedule.weekday, pinnedSchedule.dateLabel].filter(Boolean).join(' · '),
                                pinnedSchedule.startTime && pinnedSchedule.endTime
                                  ? `${pinnedSchedule.startTime}–${pinnedSchedule.endTime}`
                                  : '',
                                pinnedSchedule.course,
                              ].filter(Boolean).join(' · ') || pinnedMessageObj.content
                            : (pinnedMessageObj.messageType === 'system' ? pinnedMessageObj.content
                              : (isImageMessage(pinnedMessageObj) ? '[Hình ảnh] ' + attachmentCaption(pinnedMessageObj)
                                : pinnedMessageObj.messageType === 'file' ? '[Tệp đính kèm]' : pinnedMessageObj.content))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {pinnedSchedule ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSchedulePreview(pinnedSchedule);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-violet-600 hover:bg-white transition-colors shadow-sm"
                          title="Xem chi tiết lịch"
                          aria-label="Xem chi tiết lịch"
                        >
                          <Calendar size={14} />
                        </button>
                      ) : null}
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePinMessage(pinnedMessageObj.id || pinnedMessageObj._id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-white transition-colors opacity-0 group-hover:opacity-100 shrink-0 shadow-sm"
                        title="Bỏ ghim"
                      >
                        <PinOff size={14} />
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {showHandoffSummaryPanel ? (
                <div className="mx-3 mt-2 mb-0 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-[11px] text-amber-950 leading-snug">
                  <p className="font-black uppercase tracking-wide text-amber-800 mb-1">Tóm tắt cho Support (nội bộ)</p>
                  {handoffSummaryParts.head ? (
                    <p className="whitespace-pre-wrap">{handoffSummaryParts.head}</p>
                  ) : null}
                  {priorAiMessages.length > 0 || handoffSummaryParts.transcript ? (
                    <button
                      type="button"
                      onClick={() => setShowPriorAiThread((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-800 hover:text-amber-950"
                    >
                      <ChevronDown size={14} className={`transition-transform ${showPriorAiThread ? 'rotate-180' : ''}`} />
                      {showPriorAiThread ? 'Thu gọn' : 'Xem lịch sử AI'}
                      {!showPriorAiThread && priorAiMessages.length > 0
                        ? ` (${priorAiMessages.length} tin với Trợ lý AI)`
                        : ''}
                    </button>
                  ) : null}
                  {showPriorAiThread && (priorAiMessages.length > 0 || handoffSummaryParts.transcript) ? (
                    <div className="cms-handoff-transcript mt-1.5 border-t border-amber-100 pt-1.5">
                      <p className="font-bold mb-1.5">Hội thoại với Trợ lý AI:</p>
                      {priorAiMessages.length > 0 ? (
                        <ul className="space-y-2">
                          {priorAiMessages.map((msg) => {
                            const isAi = String(msg.senderId) === AI_SUPPORT_PEER.id;
                            return (
                              <li key={msg.id} className="rounded-lg bg-white/60 border border-amber-100/80 px-2 py-1.5">
                                <p className="text-[10px] font-black uppercase tracking-wide text-amber-800 mb-0.5">
                                  {isAi ? 'Trợ lý AI' : (msg.senderName || 'Học viên / Giảng viên')}
                                </p>
                                <div className="whitespace-pre-wrap break-words text-[11px] leading-snug">
                                  <MessageRichText text={msg.content} mine={false} />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="whitespace-pre-wrap">{handoffSummaryParts.transcript}</p>
                      )}
                    </div>
                  ) : null}
                  {handoffSummaryParts.footer ? (
                    <p className="mt-1.5 text-amber-800/80 italic">{handoffSummaryParts.footer}</p>
                  ) : (
                    <p className="mt-1.5 text-amber-800/80 italic">
                      Cần Support xem lại lịch sử trên và tiếp tục hỗ trợ, không hỏi lại từ đầu.
                    </p>
                  )}
                </div>
              ) : null}

              {/* Messages */}
              <div className="cms-chat-messages">
                {activeConv.isAiHandoff && aiHistorySplit.hiddenCount > 0 && !showHandoffSummaryPanel ? (
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={() => setShowPriorAiThread((v) => !v)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
                    >
                      <ChevronDown size={14} className={`transition-transform ${showPriorAiThread ? 'rotate-180' : ''}`} />
                      {showPriorAiThread ? 'Thu gọn lịch sử AI' : `Hiển thị thêm ${aiHistorySplit.hiddenCount} tin nhắn với Trợ lý AI`}
                    </button>
                  </div>
                ) : null}
                {messagesToRender.map((msg) => {
                  const isMine = messageIsFromMe(msg, currentUserId, currentUserRole);
                  const role = normalizeRole(msg.senderRole);
                  const badgeLabel = msg.senderDisplayRole
                    ? displayRoleLabel(msg.senderDisplayRole)
                    : (String(msg.senderAdminRole || '').toUpperCase() === 'SUPPORT' ? 'Hỗ trợ'
                      : role === 'admin' ? 'Admin'
                        : role === 'staff' ? 'Giáo vụ'
                          : role === 'teacher' ? 'Giảng viên'
                            : 'Học viên');

                  const bubbleRoleClass =
                    !isMine && (role === 'admin' || String(msg.senderAdminRole || '').toUpperCase() === 'SUPPORT')
                      ? 'cms-bubble-other-admin'
                      : !isMine && role === 'staff'
                        ? 'cms-bubble-other-admin'
                        : !isMine && role === 'teacher'
                          ? 'cms-bubble-other-teacher'
                          : !isMine && role === 'student'
                            ? 'cms-bubble-other-student'
                            : '';

                  const heartCount = (msg.reactions || []).filter(r => r.type === 'heart').length;
                  const likeCount = (msg.reactions || []).filter(r => r.type === 'like').length;
                  const myReactions = (msg.reactions || []).filter(r => r.userId === currentUserId).map(r => r.type);

                  if (msg.messageType === 'system') {
                    const scheduleInfo = resolveScheduleMessagePayload(msg);
                    const isSchedulePinned = activeConv?.metadata?.pinnedMessageId === String(msg.id);
                    const canPinSchedule = scheduleInfo && !String(msg.id).startsWith('temp_');
                    return (
                      <div id={`msg-${msg.id}`} key={msg.id} className="flex justify-center my-3 group/sysmsg">
                        <span className={`inline-flex items-center gap-1.5 max-w-[92%] px-3 py-1.5 text-xs font-medium rounded-full shadow-sm ${
                          isSchedulePinned
                            ? 'bg-violet-50 text-violet-800 border border-violet-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {isSchedulePinned ? (
                            <Pin size={11} className="shrink-0 rotate-45 text-violet-600" aria-hidden="true" />
                          ) : null}
                          <span className="min-w-0 leading-snug">{msg.content}</span>
                          {scheduleInfo ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setSchedulePreview(scheduleInfo)}
                                className="shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 flex items-center justify-center transition"
                                title="Xem chi tiết lịch"
                                aria-label="Xem chi tiết lịch"
                              >
                                <Calendar size={14} />
                              </button>
                              {canPinSchedule ? (
                                <button
                                  type="button"
                                  onClick={() => handlePinMessage(msg.id)}
                                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition ${
                                    isSchedulePinned
                                      ? 'bg-violet-200 text-violet-800'
                                      : 'bg-white/80 text-slate-400 hover:bg-violet-100 hover:text-violet-700 opacity-100 sm:opacity-0 sm:group-hover/sysmsg:opacity-100'
                                  }`}
                                  title={isSchedulePinned ? 'Bỏ ghim lịch này' : 'Ghim lịch này'}
                                  aria-label={isSchedulePinned ? 'Bỏ ghim lịch này' : 'Ghim lịch này'}
                                >
                                  <Pin size={14} className={isSchedulePinned ? 'text-violet-700' : ''} />
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div id={`msg-${msg.id}`} key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} group/msg relative`}>
                      <div className={`max-w-[85%] md:max-w-[70%] relative ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMine && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                            <p className="text-xs text-gray-500 font-semibold">{msg.senderName}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${role === 'admin' ? 'bg-red-500 text-white' :
                                role === 'staff' ? 'bg-amber-600 text-white' :
                                  role === 'teacher' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                              }`}>
                              {badgeLabel}
                            </span>
                          </div>
                        )}

                        {/* Bubble + action buttons */}
                        <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>

                          {/* Message bubble */}
                          <div className={`relative text-[14px] leading-relaxed transition-all ${isImageMessage(msg) && !msg.isRecalled && !isAttachmentExpired(msg) ? '!p-0 !overflow-visible !bg-transparent !shadow-none !border-transparent' : 'px-4 py-2.5'} ${(heartCount > 0 || likeCount > 0) && !msg.isRecalled ? 'mb-4' : ''} ${isMine ? 'cms-bubble-mine' : 'cms-bubble-other'} ${bubbleRoleClass}`}>
                            {msg.isRecalled ? (
                              <p className="italic text-gray-400 flex items-center gap-1.5 text-xs">
                                <RotateCcw size={12} /> Tin nhắn đã được thu hồi
                              </p>
                            ) : isAttachmentExpired(msg) ? (
                              <p className="italic text-amber-600/90 flex items-start gap-1.5 text-xs leading-relaxed">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                <span>{msg.content || 'Tệp đính kèm đã hết hạn lưu trữ (10 ngày) và không còn được lưu trên hệ thống.'}</span>
                              </p>
                            ) : isImageMessage(msg) ? (
                              <div className="space-y-0">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openImagePreview(msg);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      openImagePreview(msg);
                                    }
                                  }}
                                  className="group/img relative block w-full max-w-[min(420px,100%)] cursor-zoom-in touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl overflow-hidden"
                                  title="Bấm để xem ảnh lớn"
                                >
                                  <img
                                    src={resolveMediaUrl(msg.fileUrl)}
                                    alt={showFileName(msg.fileName) || 'Hình ảnh'}
                                    className="w-full h-auto max-h-96 object-cover select-none"
                                    draggable={false}
                                  />
                                  <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] font-bold shadow-sm pointer-events-none">
                                    <ZoomIn size={12} /> Phóng to
                                  </span>
                                </div>
                                {attachmentCaption(msg) ? (
                                  <div className={`whitespace-pre-wrap break-words px-4 py-2.5 mt-1 rounded-xl ${isMine ? 'bg-[#dc2626] text-white' : 'bg-white border border-slate-100 text-slate-800'}`}>
                                    <MessageRichText text={attachmentCaption(msg)} mine={isMine} />
                                  </div>
                                ) : null}
                              </div>
                            ) : msg.messageType === 'file' ? (
                              <div className="space-y-1.5">
                                <a href={resolveMediaUrl(msg.fileUrl)} download={showFileName(msg.fileName)} className={`flex items-center gap-3 py-2 px-3 rounded-xl transition hover:opacity-80 ${isMine ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                  <div className={`p-2 rounded-lg ${isMine ? 'bg-white/20' : 'bg-red-500 text-white'}`}>
                                    <Paperclip size={18} />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-xs truncate max-w-[150px]">{showFileName(msg.fileName)}</span>
                                    <span className="text-[10px] font-medium opacity-50">Tài liệu đính kèm</span>
                                  </div>
                                </a>
                                {attachmentCaption(msg) ? (
                                  <div className="whitespace-pre-wrap break-words px-0.5">
                                    <MessageRichText text={attachmentCaption(msg)} mine={isMine} />
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap break-words">
                                <MessageRichText text={msg.content} mine={isMine} />
                              </div>
                            )}

                            {/* Reaction badge */}
                            {!msg.isRecalled && (heartCount > 0 || likeCount > 0) && (
                              <div className={`cms-bubble-reactions absolute -bottom-5 ${isMine ? 'right-2' : 'left-2'}`}>
                                {heartCount > 0 && (
                                  <span className="flex items-center gap-0.5 text-[11px]">
                                    <span>❤️</span>
                                    {heartCount > 1 && <span className="text-gray-500 font-bold">{heartCount}</span>}
                                  </span>
                                )}
                                {likeCount > 0 && (
                                  <span className="flex items-center gap-0.5 text-[11px]">
                                    <span>👍</span>
                                    {likeCount > 1 && <span className="text-gray-500 font-bold">{likeCount}</span>}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Reaction picker button */}
                          {!msg.isRecalled && (
                              <div className={`opacity-0 group-hover/msg:opacity-100 absolute flex items-center gap-1 ${isMine ? 'right-full mr-2' : 'left-full ml-2'} top-1/2 -translate-y-1/2`}>
                                <ReactionPicker
                                  msgId={msg.id}
                                  isMine={isMine}
                                  onReact={handleReaction}
                                  myReactions={myReactions}
                                />
                                <button
                                  onClick={() => handlePinMessage(msg.id)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-all rounded-full hover:bg-white hover:shadow-sm text-base"
                                  title={activeConv?.metadata?.pinnedMessageId === String(msg.id) ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn"}
                                >
                                  <Pin size={14} className={activeConv?.metadata?.pinnedMessageId === String(msg.id) ? "text-blue-500" : ""} />
                                </button>
                              </div>
                            )}

                          {/* Options/Menu button for Soft Delete */}
                          <ChatFlipWrap open={showMessageOptions === msg.id} estimatedHeight={180} className="relative">
                            {(placeBelow) => (
                            <>
                            <button
                              onClick={() => setShowMessageOptions(showMessageOptions === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover/msg:opacity-100 w-7 h-7 flex items-center justify-center bg-white rounded-full text-gray-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-sm border border-slate-100 active:scale-90"
                              title="Tùy chọn"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {showMessageOptions === msg.id && (
                              <div className={`absolute ${placeBelow ? 'top-full mt-1' : 'bottom-full mb-1'} z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1 ${isMine ? 'right-0' : 'left-0'}`}>
                                {msg.fileUrl && !msg.isRecalled && !isAttachmentExpired(msg) && (
                                  <button
                                    onClick={() => {
                                      handleDownload(msg.fileUrl, msg.fileName);
                                      setShowMessageOptions(null);
                                    }}
                                    className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors"
                                  >
                                    <Download size={12} /> Tải {msg.messageType === 'image' ? 'ảnh' : 'tệp'}
                                  </button>
                                )}
                                {!msg.isRecalled && msg.messageType !== 'image' && (
                                  <button
                                    onClick={() => {
                                      handleCopyText(msg.content);
                                      setShowMessageOptions(null);
                                    }}
                                    className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <Copy size={12} /> Sao chép
                                  </button>
                                )}
                                {!msg.isRecalled && msg.messageType !== 'image' && (
                                  <button
                                    onClick={() => {
                                      setNewMsg(msg.content);
                                      setTimeout(() => inputRef.current?.focus(), 100);
                                      setShowMessageOptions(null);
                                    }}
                                    className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-indigo-500 hover:bg-indigo-50 transition-colors"
                                  >
                                    <Edit3 size={12} /> Chỉnh sửa / Viết lại
                                  </button>
                                )}
                                {isMine && !msg.isRecalled && (() => {
                                  const now = new Date();
                                  const sentAt = new Date(msg.time);
                                  const diffHours = (now - sentAt) / (1000 * 60 * 60);
                                  return diffHours <= 24;
                                })() && (
                                  <button
                                    onClick={() => {
                                      handleRecall(msg.id);
                                      setShowMessageOptions(null);
                                    }}
                                    disabled={recallingId === msg.id}
                                    className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                  >
                                    {recallingId === msg.id
                                      ? <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-600 rounded-full inline-block animate-spin" />
                                      : <RotateCcw size={12} />
                                    } Thu hồi tin nhắn
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    handleDeleteHistory(msg.id);
                                    setShowMessageOptions(null);
                                  }}
                                  className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={12} /> Xóa lịch sử
                                </button>
                              </div>
                            )}
                            </>
                            )}
                          </ChatFlipWrap>
                        </div>

                        {/* Time & read status */}
                        <div className={`flex items-center gap-1.5 mt-1.5 ${isMine ? 'justify-end' : ''}`}>
                          {activeConv?.metadata?.pinnedMessageId === String(msg.id) && (
                              <span className="text-[10px] text-blue-500 font-bold flex items-center gap-0.5" title="Tin nhắn này đang được ghim">
                                <Pin size={10} className="rotate-45" />
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-medium tabular-nums">{formatTime(msg.time)}</span>
                          {isMine && !msg.isRecalled && String(msg.id).startsWith('temp_') ? (
                            <span title="Chưa gửi được (Kết nối yếu)">
                              <AlertCircle size={10} className="text-red-500 animate-pulse" />
                            </span>
                          ) : isMine && !msg.isRecalled && (
                            <span title={msg.isRead ? "Đã xem" : "Đã nhận"}>
                              {msg.isRead ? (
                                <CheckCheck size={12} className="text-blue-500" />
                              ) : (
                                <CheckCircle2 size={10} className="text-gray-300" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {peerTyping ? (
                  <div className="flex justify-start px-1 py-1">
                    <p className="text-[12px] text-slate-500 font-medium">Đang gõ •••</p>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="cms-chat-input-bar relative z-10">
                {uploadError && (
                  <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{uploadError}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 relative max-w-4xl mx-auto">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

                  <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Gửi ảnh (tối đa 5MB, lưu 10 ngày)"
                    >
                      {isUploading ? <span className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full inline-block animate-spin" /> : <Image size={20} />}
                    </button>
                    <ScreenCaptureButton
                      size={20}
                      disabled={isUploading || !activeConv}
                      buttonClassName="p-2 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Chụp màn hình"
                      onCaptured={stageScreenshotForSend}
                      onError={(msg) => toast.error(msg)}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Đính kèm tài liệu (tối đa 5MB, lưu 10 ngày)"
                    >
                      <Paperclip size={20} />
                    </button>
                  </div>

                  <div className="flex-1 relative flex flex-col justify-end">
                    {pendingImage && (
                      <div className="mb-2 p-2 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveMediaUrl(pendingImage.url)}
                            alt="Preview"
                            className="w-10 h-10 object-cover rounded-lg border border-blue-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">Ảnh từ bộ nhớ tạm (Clipboard)</p>
                            <p className="text-[11px] text-blue-600 font-semibold truncate">{pendingImage.fileName}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingImage(null)}
                          className="w-7 h-7 rounded-lg bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition shrink-0"
                          title="Bỏ chọn ảnh"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    {showEmojis && (
                      <div className="absolute bottom-full left-0 mb-3 bg-white p-2 rounded-2xl shadow-2xl border border-gray-100 flex gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
                        {EMOJIS.map(e => (
                          <button key={e} onClick={() => addEmoji(e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                    <div className="relative w-full">
                      <input
                        ref={inputRef}
                        value={newMsg}
                        onChange={e => {
                          setNewMsg(e.target.value);
                          startInboxTyping();
                        }}
                        onFocus={startInboxTyping}
                        onBlur={stopInboxTyping}
                        onKeyDown={handleKeyPress}
                        onPaste={handlePaste}
                        className="cms-input pl-4 pr-10 w-full"
                        placeholder={pendingImage ? "Nhập thêm Lời nhắn (nếu có) rồi nhấn Enter..." : "Nhập tin nhắn..."}
                      />
                      <button
                        onClick={() => setShowEmojis(!showEmojis)}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors ${showEmojis ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                      >
                        <Smile size={18} />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!newMsg.trim() && !pendingImage}
                    className="cms-btn cms-btn-primary cms-btn-icon"
                    title="Gửi tin nhắn"
                  >
                    <Send size={18} className="translate-x-[-1px] translate-y-[1px]" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Create Group Modal ── */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-[24px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-280 max-h-[min(92dvh,720px)] flex flex-col">
            <div className="px-5 py-4 bg-gradient-to-br from-red-700 to-red-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Users size={18} className="text-red-200 shrink-0" />
                <h3 className="font-semibold text-base tracking-tight truncate">Tạo nhóm chat mới</h3>
              </div>
              <button type="button" onClick={() => setShowCreateGroup(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto min-h-0 flex-1">
              <div>
                <label className="text-[13px] font-medium text-slate-600 mb-1.5 block">Tên nhóm</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="Ví dụ: Nhóm học Tiếng Anh Giao Tiếp..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/10 focus:bg-white transition-all font-medium text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-600 mb-1.5 block">Chọn thành viên</label>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Tìm họ, tên, SĐT..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-300 focus:bg-white transition-all font-medium text-slate-700"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {contacts
                    .filter(u => u.id !== currentUserId && u.id !== 'admin')
                    .filter((u) => !memberSearch || matchesPersonSearch(memberSearch, {
                      name: u.name,
                      phone: u.phone,
                      zalo: u.zalo,
                    }))
                    .slice()
                    .sort((a, b) => {
                      const aOn = isUserOnline(a.id) ? 1 : 0;
                      const bOn = isUserOnline(b.id) ? 1 : 0;
                      if (aOn !== bOn) return bOn - aOn;
                      return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
                    })
                    .map(u => {
                      const isSelected = selectedParticipants.some(p => p.userId === u.id);
                      return (
                        <label key={u.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all group ${isSelected ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                          <div className="relative">
                            <input
                              type="checkbox"
                              className="w-5 h-5 rounded-md border-2 border-slate-200 text-red-600 focus:ring-red-500 transition-all cursor-pointer"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedParticipants([...selectedParticipants, { userId: u.id, name: u.name, role: u.role }]);
                                else setSelectedParticipants(selectedParticipants.filter(p => p.userId !== u.id));
                              }}
                            />
                          </div>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm ${u.role === 'admin' ? 'bg-red-500' :
                              u.role === 'teacher' ? 'bg-amber-600' : 'bg-emerald-600'
                            }`}>
                            {(u.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{u.name}</p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {u.role === 'admin' ? 'Nhân viên / Admin' :
                                u.role === 'teacher' ? 'Giảng viên' : 'Học viên'}
                              {isUserOnline(u.id) ? ' · Online' : ''}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="flex-1 min-h-12 py-3 px-4 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={!groupName.trim() || selectedParticipants.length === 0}
                  onClick={async () => {
                    try {
                      const newGroup = await createChatGroup(groupName, selectedParticipants);
                      if (newGroup) {
                        setShowCreateGroup(false);
                        setGroupName('');
                        setSelectedParticipants([]);
                        toast?.success('Tạo nhóm thành công!');
                      } else {
                        toast?.error('Không thể tạo nhóm. Vui lòng thử lại.');
                      }
                    } catch (err) {
                      toast?.error('Lỗi kết nối máy chủ.');
                    }
                  }}
                  className="flex-[1.4] min-h-12 py-3 px-4 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Tạo nhóm ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Group Confirm Modal ── */}
      {groupToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-500 text-center p-8">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Trash2 size={32} className="text-red-500" />
            </div>
            <h3 className="font-black text-xl text-slate-800 mb-2">Xóa Nhóm Này?</h3>
            <p className="text-sm text-slate-500 font-bold mb-8 leading-relaxed">
              Toàn bộ tin nhắn và dữ liệu nhóm sẽ bị <span className="text-red-500">xóa vĩnh viễn</span> và không thể khôi phục. Bạn chắc chắn chứ?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setGroupToDelete(null)}
                className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                onClick={async () => {
                  const success = await deleteChatGroup(groupToDelete);
                  if (success) {
                    toast.success('Đã xóa nhóm vĩnh viễn');
                    setActiveConv(null);
                  } else {
                    toast.error('Có lỗi xảy ra khi xóa nhóm');
                  }
                  setGroupToDelete(null);
                }}
                className="flex-1 py-3.5 px-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase hover:bg-red-600 transition-all shadow-lg shadow-red-200"
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}
      <ImageLightbox
        preview={imagePreview}
        onClose={() => setImagePreview(null)}
        onDownload={handleDownload}
      />

      {/* ── Broadcast Message Modal ── */}
      {broadcastConfig && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom-8 duration-500">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg flex items-center gap-2">
                  <Megaphone size={20} /> Gửi tin nhắn hàng loạt
                </h3>
                <p className="text-blue-100 text-[11px] font-bold uppercase tracking-widest opacity-80 mt-1">
                  Đối tượng: <span className="text-white bg-white/20 px-2 py-0.5 rounded-lg ml-1">{broadcastConfig.label}</span>
                </p>
              </div>
              <button onClick={() => setBroadcastConfig(null)} className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"><X size={20} /></button>
            </div>

            <div className="p-8">
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex gap-3 items-start">
                <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-700 font-bold leading-relaxed">
                  Tin nhắn này sẽ được gửi <span className="underline decoration-2">riêng biệt</span> tới từng người dùng thuộc nhóm <span className="text-amber-800 font-black">{broadcastConfig.label}</span>.
                  {currentUserRole === 'staff' && ' Bạn chỉ có thể gửi cho người dùng thuộc cùng chi nhánh.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Nội dung thông báo</label>
                  <textarea
                    value={broadcastContent}
                    onChange={(e) => setBroadcastContent(e.target.value)}
                    placeholder="Nhập nội dung tin nhắn gửi đi..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[24px] px-6 py-5 text-[15px] font-medium outline-none focus:border-blue-500 focus:bg-white transition-all h-40 resize-none shadow-inner"
                    autoFocus
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    onClick={() => setBroadcastConfig(null)}
                    disabled={isBroadcasting}
                    className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={async () => {
                      if (!broadcastContent.trim()) return toast.error('Vui lòng nhập nội dung');
                      setIsBroadcasting(true);
                      try {
                        const res = await messagesAPI.broadcast(broadcastConfig.targetRole, broadcastContent);
                        if (res.success) {
                          toast.success(res.message || 'Đã gửi tin nhắn thành công');
                          setBroadcastConfig(null);
                          setBroadcastContent('');
                        } else {
                          toast.error(res.message || 'Lỗi khi gửi tin nhắn');
                        }
                      } catch (err) {
                        toast.error('Lỗi kết nối máy chủ');
                      } finally {
                        setIsBroadcasting(false);
                      }
                    }}
                    disabled={isBroadcasting || !broadcastContent.trim()}
                    className="flex-[2] py-4 px-6 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-xl hover:shadow-red-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                  >
                    {isBroadcasting ? (
                      <><Loader2 size={16} className="animate-spin" /> Đang gửi...</>
                    ) : (
                      <><Send size={16} /> Gửi ngay bây giờ</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 🔴 Leave Group Confirm Modal 🔴 */}
      {groupToLeave && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-500 text-center p-8">
            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <LogOut size={32} className="text-orange-500" />
            </div>
            <h3 className="font-black text-xl text-slate-800 mb-2">Rời khỏi nhóm?</h3>
            <p className="text-sm text-slate-500 font-bold mb-8 leading-relaxed">
              Bạn sẽ không còn nhận được tin nhắn và nhóm sẽ biến mất khỏi danh sách của bạn.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setGroupToLeave(null)}
                className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  const success = await leaveChatGroup(groupToLeave);
                  if (success) {
                    toast?.success('Đã rời khỏi nhóm');
                    setActiveConv(null);
                  } else {
                    toast?.error('Có lỗi xảy ra khi rời nhóm');
                  }
                  setGroupToLeave(null);
                }}
                className="flex-1 py-3.5 px-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
              >
                Xác nhận rời
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 Add Member Modal 🟢 */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-[500px] max-h-[85vh] rounded-[32px] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-500">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <UserPlus size={18} className="text-blue-500 shrink-0" />
                <h3 className="font-semibold text-base tracking-tight truncate">Thêm thành viên</h3>
              </div>
              <button type="button" onClick={() => setShowAddMemberModal(false)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-colors" aria-label="Đóng"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto min-h-0 flex-1">
              <div>
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Tìm họ, tên, SĐT..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-300 focus:bg-white transition-all font-medium text-slate-700"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {contacts
                    .filter(u => u.id !== currentUserId && u.id !== 'admin')
                    .filter((u) => !memberSearch || matchesPersonSearch(memberSearch, {
                      name: u.name,
                      phone: u.phone,
                      zalo: u.zalo,
                    }))
                    .slice()
                    .sort((a, b) => {
                      const aOn = isUserOnline(a.id) ? 1 : 0;
                      const bOn = isUserOnline(b.id) ? 1 : 0;
                      if (aOn !== bOn) return bOn - aOn;
                      return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
                    })
                    .map(u => {
                      const groupObj = groups?.find(g => String(g._id) === String(activeConv?.id?.replace('group_', '')));
                      const isAlreadyInGroup = groupObj?.participants?.some(p => String(p.userId) === String(u.id));

                      const roleLabel = u.role === 'admin' ? (u.adminRole === 'SUPER_ADMIN' ? 'Super Admin' : u.adminRole === 'HIGH_ADMIN' ? 'Admin cấp cao' : 'Quản trị viên')
                        : u.role === 'staff' ? (u.adminRole === 'SUPPORT' ? 'Support viên' : 'Admin Chi nhánh')
                          : u.role === 'teacher' ? 'Giảng viên'
                            : 'Học viên';
                      const roleColor = u.role === 'admin' ? 'bg-red-500 text-white' : u.role === 'staff' ? 'bg-amber-600 text-white' : u.role === 'teacher' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white';
                      const isSelected = selectedParticipants.some(p => p.userId === u.id);

                      return (
                        <div key={u.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isAlreadyInGroup ? 'bg-slate-50 border-transparent opacity-70' : isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-blue-200 cursor-pointer'}`}
                          onClick={() => {
                            if (isAlreadyInGroup) return;
                            if (isSelected) setSelectedParticipants(selectedParticipants.filter(p => p.userId !== u.id));
                            else setSelectedParticipants([...selectedParticipants, { userId: u.id, name: u.name, role: u.role }]);
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img src={resolveAvatarUrl(u)} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                            <div className="min-w-0 truncate">
                              <p className="text-[13px] font-bold text-slate-800 truncate leading-tight mb-1">{u.name}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${roleColor}`}>{roleLabel}</span>
                            </div>
                          </div>
                          {!isAlreadyInGroup ? (
                            <div className="shrink-0 ml-3">
                              <input
                                type="checkbox"
                                className="w-5 h-5 rounded-md border-2 border-slate-200 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer pointer-events-none"
                                checked={isSelected}
                                readOnly
                              />
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-1 rounded shrink-0">Đã tham gia</span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="flex-1 min-h-12 py-3 px-4 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={selectedParticipants.length === 0}
                  onClick={async () => {
                    try {
                      const groupIdStr = activeConv?.id?.replace('group_', '');
                      const success = await addGroupMembers(groupIdStr, selectedParticipants);
                      if (success) {
                        setShowAddMemberModal(false);
                        setSelectedParticipants([]);
                        setMemberSearch('');
                        toast?.success('Đã thêm thành viên!');
                      } else {
                        toast?.error('Không thể thêm thành viên.');
                      }
                    } catch (err) {
                      toast?.error('Lỗi kết nối máy chủ.');
                    }
                  }}
                  className="flex-[1.4] min-h-12 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Thêm ({selectedParticipants.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && activeConv && !activeConv.isGroup && activeConv.user && (
        (() => {
          const targetId = String(activeConv.user.id || activeConv.user._id || '');
          const convCourse = String(activeConv.user.course || '').trim().toLowerCase();
          const teacherRows = typeof getStudentsByTeacher === 'function'
            ? (getStudentsByTeacher(currentUserId) || []).filter(
              (s) => String(s.id || s._id) === targetId,
            )
            : [];
          const fromList = (students || []).filter((s) => String(s.id || s._id) === targetId);
          const enrollments = (teacherRows.length ? teacherRows : fromList).slice();
          const preferred = enrollments.find((s) => String(s.course || '').trim().toLowerCase() === convCourse)
            || enrollments[0]
            || {
              id: activeConv.user.id,
              _id: activeConv.user.id,
              name: activeConv.user.name || 'Học viên',
              course: activeConv.user.course || '',
              branchCode: activeConv.user.branchCode || '',
            };
          return (
            <TeacherStudentWeekSlotSheet
              student={preferred}
              enrollments={enrollments.length ? enrollments : [preferred]}
              teacherId={currentUserId}
              schedules={schedules || []}
              addSchedule={addSchedule}
              updateSchedule={updateSchedule}
              cancelSchedule={cancelSchedule}
              onClose={() => setShowScheduleModal(false)}
              onCreated={(payload) => {
                notifyInboxScheduleEvent(payload, 'created').catch(() => {});
              }}
              onUpdated={(payload) => {
                notifyInboxScheduleEvent(payload, 'changed').catch(() => {});
              }}
              onCancelled={(payload) => {
                notifyInboxScheduleEvent(payload, 'cancelled').catch(() => {});
              }}
            />
          );
        })()
      )}

      <ScheduleMessagePreviewModal
        open={!!schedulePreview}
        data={schedulePreview}
        onClose={() => setSchedulePreview(null)}
      />
    </div>
  );
};

export default Inbox;









