/**
 * Chat nổi kiểu Messenger:
 * - Panel "Hỗ trợ online" (danh bạ) tách khỏi cửa sổ chat
 * - Mỗi người = 1 chat-head tròn; bấm head → mở cửa sổ, người trước thu thành head
 * - Gửi text / link / ảnh (không thay Inbox)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones, MessageCircle, MessageSquare, Minus, Send, X, Circle,
  ImagePlus, Link2, Loader2, MoreVertical, Edit3, RotateCcw, Bot, UserRound, Check,
  Copy, Scaling, Calendar,
  Smile,
} from 'lucide-react';
import ScheduleMessagePreviewModal, {
  resolveScheduleMessagePayload,
} from './ScheduleMessagePreviewModal';
import { useLocation } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useData } from '../context/DataContext';
import { useFloatingMessenger } from '../context/FloatingMessengerContext';
import { isRealAvatar, resolveAvatarUrl } from '../utils/defaultAvatars';
import { normalizeChatRole } from '../utils/chatConversationId';
import { getMessagingRole } from '../lib/messagingRoles';
import { messagesAPI, aiSupportAPI, resolveMediaUrl } from '../services/api';
import { useToast } from '../utils/toast';
import {
  isSuperAdminViewer,
  isElevatedPresenceDirectoryViewer,
  buildSupportDirectory,
} from '../utils/supportPresence';
import {
  AI_SUPPORT_PEER,
  isAiSupportPeer,
  canOfferHumanEscalation,
  lastMeaningfulAiReplyId,
  isAiSupportConversationId,
  buildAiSupportConversationId,
  AI_SUPPORT_STATUS,
  isHumanSupportSender,
  isAiWelcomeReply,
  isAiFaqChipLabel,
  TEACHER_WELCOME_CHIPS,
  STUDENT_WELCOME_CHIPS,
} from '../utils/aiSupport';
import SupportMascot from './SupportMascot';
import { MessageRichText, copyableTextFromMessage } from '../utils/messageRichText';
import ScreenCaptureButton from './ScreenCaptureButton';

const ROLE_LABEL = {
  admin: 'Quản trị viên',
  staff: 'Giáo vụ / Hỗ trợ',
  teacher: 'GV',
  student: 'HV',
  SUPER_ADMIN: 'Super Admin',
  HIGH_ADMIN: 'Admin cấp cao',
  ADMIN_STAFF: 'Giáo vụ',
  SUPPORT: 'Hỗ trợ',
  LEGACY_ROOT: 'Super Admin',
};
const CHAT_ROLE_LABEL = {
  admin: 'Quản trị viên',
  staff: 'Hỗ trợ trực tiếp',
  teacher: 'Giảng viên',
  student: 'Học viên',
};
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FM_SIZE_KEY = 'cms_fm_win_size';
const FM_SIZE_DEFAULT = { w: 400, h: 480 };

function readFmSize() {
  try {
    const raw = localStorage.getItem(FM_SIZE_KEY);
    if (!raw) return { ...FM_SIZE_DEFAULT };
    const parsed = JSON.parse(raw);
    const w = Number(parsed.w);
    const h = Number(parsed.h);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return { ...FM_SIZE_DEFAULT };
    return clampFmSize(w, h);
  } catch {
    return { ...FM_SIZE_DEFAULT };
  }
}

function clampFmSize(w, h) {
  const maxW = Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 24);
  const maxH = Math.max(360, (typeof window !== 'undefined' ? window.innerHeight : 800) - 72);
  return {
    w: Math.min(Math.max(320, Math.round(w)), Math.min(760, maxW)),
    h: Math.min(Math.max(380, Math.round(h)), Math.min(860, maxH)),
  };
}

function persistFmSize(size) {
  try { localStorage.setItem(FM_SIZE_KEY, JSON.stringify(size)); } catch { /* ignore */ }
}

async function copyMessageToClipboard(text) {
  const plain = copyableTextFromMessage(text);
  if (!plain) return false;
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}

function CopyHoverButton({ text }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!String(text || '').trim() || text === '[Hình ảnh]') return null;
  return (
    <button
      type="button"
      className="cms-fm-copy shrink-0"
      title="Sao chép"
      aria-label="Sao chép tin nhắn"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyMessageToClipboard(text);
        if (!ok) {
          toast.error('Không sao chép được');
          return;
        }
        setCopied(true);
        toast.success('Đã sao chép');
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  );
}

function TypingIndicator({ label = 'Đang gõ' }) {
  return (
    <div className="cms-fm-typing justify-start">
      <span className="text-[11px] text-slate-500 font-medium">{label}</span>
      <span className="cms-fm-typing__dots" aria-hidden="true">
        <span /><span /><span />
      </span>
    </div>
  );
}

function isImageMessage(m) {
  if (!m || m.isRecalled) return false;
  if (m.messageType === 'image') return true;
  if (m.messageType === 'file' && m.fileUrl && IMAGE_EXT_RE.test(`${m.fileName || ''} ${m.fileUrl || ''}`)) {
    return true;
  }
  return false;
}

function isAssistantSender(m) {
  const sid = String(m?.senderId || '');
  if (sid === AI_SUPPORT_PEER.id || sid === 'system') return true;
  return String(m?.senderRole || '').toLowerCase() === 'system';
}

function isOutgoingMessengerMessage(m, meId) {
  const sid = String(m?.senderId || '');
  const me = String(meId || '');
  if (!sid || !me || isAssistantSender(m)) return false;
  return sid === me;
}

function ReactionPicker({ msgId, isMine, onReact, myReactions = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div className="relative flex items-center shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="cms-fm-reaction-trigger w-9 h-9 flex items-center justify-center text-slate-400 hover:text-pink-500 transition rounded-full hover:bg-white hover:shadow-sm opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
        title="Thả cảm xúc"
        aria-label="Thả cảm xúc"
        aria-expanded={open}
      >
        <Smile size={14} />
      </button>
      {open ? (
        <div
          className={`absolute bottom-full mb-1 ${isMine ? 'right-0' : 'left-0'} z-[200] flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2 py-1.5 shadow-xl`}
          onClick={(event) => event.stopPropagation()}
        >
          {[
            { type: 'heart', label: 'Tim', icon: '❤️', active: 'bg-red-50' },
            { type: 'like', label: 'Thích', icon: '👍', active: 'bg-blue-50' },
          ].map((reaction) => (
            <button
              key={reaction.type}
              type="button"
              onClick={() => {
                onReact?.(msgId, reaction.type);
                setOpen(false);
              }}
              className={`cms-fm-reaction-option w-9 h-9 flex items-center justify-center rounded-full text-lg transition hover:scale-110 ${myReactions.includes(reaction.type) ? reaction.active : ''}`}
              title={reaction.label}
              aria-label={reaction.label}
            >
              {reaction.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MessageReactions({ m, mine, meId, onReact, enabled = true }) {
  if (!enabled) return null;
  if (!Array.isArray(m?.reactions) || m.reactions.length === 0) {
    return (
      <ReactionPicker
        msgId={m.id || m._id}
        isMine={mine}
        onReact={onReact}
        myReactions={[]}
      />
    );
  }
  const heartCount = m.reactions.filter((reaction) => reaction.type === 'heart').length;
  const likeCount = m.reactions.filter((reaction) => reaction.type === 'like').length;
  const myReactions = m.reactions
    .filter((reaction) => String(reaction.userId) === String(meId))
    .map((reaction) => reaction.type);
  return (
    <div className="flex items-end gap-1">
      {(heartCount > 0 || likeCount > 0) ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-1.5 py-0.5 text-[11px] shadow-sm">
          {heartCount > 0 ? <span>{`❤️${heartCount > 1 ? ` ${heartCount}` : ''}`}</span> : null}
          {likeCount > 0 ? <span>{`👍${likeCount > 1 ? ` ${likeCount}` : ''}`}</span> : null}
        </span>
      ) : null}
      <ReactionPicker
        msgId={m.id || m._id}
        isMine={mine}
        onReact={onReact}
        myReactions={myReactions}
      />
    </div>
  );
}

function MessageBubble({
  m,
  mine,
  meId,
  onReact,
  reactionsEnabled = true,
  showAiImageQuota = false,
  senderLabel = '',
  chips = null,
  onChip,
  onSchedulePreview,
}) {
  if (m.isRecalled) {
    return (
      <div className={`cms-fm-bubble ${mine ? 'is-mine' : 'is-theirs'} opacity-70 italic w-fit max-w-[88%]`}>
        Tin nhắn đã thu hồi
      </div>
    );
  }

  if (m.messageType === 'system') {
    const scheduleInfo = resolveScheduleMessagePayload(m);
    return (
      <div className="w-full flex justify-center">
        <span className="inline-flex items-center gap-1.5 max-w-[95%] text-[11px] text-center text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 font-semibold leading-snug">
          <span className="min-w-0">{m.content}</span>
          {scheduleInfo ? (
            <button
              type="button"
              onClick={() => onSchedulePreview?.(scheduleInfo)}
              className="shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 flex items-center justify-center transition"
              title="Xem chi tiết lịch"
              aria-label="Xem chi tiết lịch"
            >
              <Calendar size={12} />
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  const nameLabel = senderLabel || (!mine && isHumanSupportSender(m)
    ? (m.senderName || 'Nhân viên hỗ trợ')
    : null);
  const nameLabelClass = senderLabel
    ? 'text-[10px] font-bold text-violet-700 mb-0.5 px-1'
    : 'text-[10px] font-bold text-emerald-700 mb-0.5 px-1';

  if (isImageMessage(m) && m.fileUrl) {
    return (
      <div className="w-fit max-w-[88%]">
        {nameLabel ? <p className={nameLabelClass}>{nameLabel}</p> : null}
        <div className={`cms-fm-bubble cms-fm-bubble--media ${mine ? 'is-mine' : 'is-theirs'}`}>
          <a href={resolveMediaUrl(m.fileUrl)} target="_blank" rel="noreferrer" className="block">
            <img
              src={resolveMediaUrl(m.fileUrl)}
              alt={m.fileName || 'Hình ảnh'}
              className="cms-fm-img"
            />
          </a>
          {m.content && m.content !== '[Hình ảnh]' && (
            <div className="mt-1.5 whitespace-pre-wrap break-words px-0.5">
              <MessageRichText text={m.content} mine={mine} />
            </div>
          )}
        </div>
        {showAiImageQuota && m.aiImageRemaining != null && Number.isFinite(Number(m.aiImageRemaining)) ? (
          <p className={`mt-1 px-1 text-[10px] font-semibold ${
            Number(m.aiImageRemaining) <= 0 ? 'text-amber-700' : 'text-slate-500'
          }`}>
            {Number(m.aiImageRemaining) <= 0
              ? 'Đã hết lượt gửi ảnh hôm nay — ngày mai gửi tiếp nhé.'
              : `Còn ${Number(m.aiImageRemaining)} ảnh hôm nay`}
          </p>
        ) : null}
        <MessageReactions m={m} mine={mine} meId={meId} onReact={onReact} enabled={reactionsEnabled} />
      </div>
    );
  }

  if (m.messageType === 'file' && m.fileUrl) {
    return (
      <div className="w-fit max-w-[88%]">
        {nameLabel ? <p className={nameLabelClass}>{nameLabel}</p> : null}
        <div className={`cms-fm-bubble ${mine ? 'is-mine' : 'is-theirs'}`}>
          <a
            href={resolveMediaUrl(m.fileUrl)}
            target="_blank"
            rel="noreferrer"
            className={`cms-fm-file ${mine ? 'is-mine' : ''}`}
          >
            <span className="truncate">{m.fileName || 'Tệp đính kèm'}</span>
          </a>
        </div>
        <MessageReactions m={m} mine={mine} meId={meId} onReact={onReact} enabled={reactionsEnabled} />
      </div>
    );
  }

  let displayContent = String(m.content || '');
  let extractedChips = [...(chips || [])];

  if (!mine) {
    const suggestionRe = /\[GỢI Ý:\s*(.*?)\]/gi;
    let match;
    while ((match = suggestionRe.exec(displayContent)) !== null) {
      const suggestions = match[1].split('|').map((s) => s.trim()).filter(Boolean);
      suggestions.forEach((s, idx) => {
        extractedChips.push({ id: `sug-${match.index}-${idx}`, label: s });
      });
    }
    displayContent = displayContent.replace(/\[GỢI Ý:\s*(.*?)\]/gi, '').trim();
  }

  return (
    <div className="w-fit max-w-[88%]">
      {nameLabel ? <p className={nameLabelClass}>{nameLabel}</p> : null}
      <div className={`cms-fm-bubble ${mine ? 'is-mine' : 'is-theirs'}`}>
        <div className="whitespace-pre-wrap">
          <MessageRichText text={displayContent} mine={mine} />
        </div>
        {Array.isArray(extractedChips) && extractedChips.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {extractedChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChip?.(chip)}
                className="w-full text-left text-[12px] font-semibold leading-snug px-3 py-2 rounded-lg border border-emerald-200 bg-[#d4edda] text-emerald-900 hover:bg-emerald-100"
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <MessageReactions m={m} mine={mine} meId={meId} onReact={onReact} enabled={reactionsEnabled} />
    </div>
  );
}

function ChatHead({ tab, unread = 0, onOpen, onClose }) {
  return (
    <div className="cms-fm-head-wrap">
      <button
        type="button"
        onClick={() => onOpen(tab.id)}
        className="cms-fm-head"
        title={tab.user.name}
        aria-label={`Mở chat với ${tab.user.name}`}
      >
        <img
          src={resolveAvatarUrl(tab.user)}
          alt=""
          className={`cms-fm-head__avatar ${isRealAvatar(tab.user?.avatar) ? 'cms-fm-avatar--photo' : ''}`}
        />
        {unread > 0 ? (
          <span className="cms-fm-head__badge">{unread > 99 ? '99+' : unread}</span>
        ) : (
          <span className="cms-fm-head__online" />
        )}
      </button>
      <button
        type="button"
        className="cms-fm-head__close"
        onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
        aria-label={`Đóng chat ${tab.user.name}`}
        title="Đóng"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function ChatWindow({
  tab, meId, messages, onClose, onMinimize, onSend, onSendFile, onSendExistingImage, onSendLink, onRecall, onReact, onlineUsers = [], isSuper = false,
  peerTyping = false, isAiPeer = false, aiStatus = AI_SUPPORT_STATUS.AI_ACTIVE,
  canShowEscalate = false, feedbackPhase = '', supportOnline = false,
  onEscalate, onResetAi, onAgree, onDisagree, onMoreYes, onMoreNo,
  onDisagreeReason, onDisagree2, onFinalExplain, onFinalStaff,
  escalating = false, resettingAi = false,
  onTypingStart, onTypingStop,
  sending = false,
  imageQuota = { remaining: 5, limit: 5, used: 0 },
  questionQuota = { applies: false, remaining: null, limit: 15, used: 0 },
  viewerRole = 'student',
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const pendingUrlRef = useRef('');
  const [activeMsgOptions, setActiveMsgOptions] = useState(null);
  const [schedulePreview, setSchedulePreview] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const imageRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const [winSize, setWinSize] = useState(readFmSize);
  const resizeRef = useRef({ active: false, x: 0, y: 0, w: 0, h: 0 });

  const isOnline = useMemo(() => {
    if (!Array.isArray(onlineUsers)) return Boolean(tab.user.online);
    const peerId = String(tab.user.id || '');
    if (!peerId) return Boolean(tab.user.online);
    // Presence is the live source of truth; a stale false value on the tab
    // must not override a subsequent users:online event.
    return Boolean(tab.user.online) || onlineUsers.some(u => String(u.userId || u.id) === peerId);
  }, [onlineUsers, tab.user.id, tab.user.online]);

  const displayRoleLabel = useMemo(() => {
    const adminRole = String(tab.user.adminRole || '').toUpperCase();
    if (adminRole === 'SUPPORT' || adminRole === 'ADMIN_STAFF') return 'Hỗ trợ trực tiếp';
    return CHAT_ROLE_LABEL[normalizeChatRole(tab.user.role)]
      || ROLE_LABEL[tab.user.role]
      || tab.user.role
      || 'Hỗ trợ viên';
  }, [tab.user.adminRole, tab.user.role]);

  const displayName = useMemo(() => {
    if (isAiPeer && (
      aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT
      || aiStatus === AI_SUPPORT_STATUS.SUPPORT_ACTIVE
    )) {
      return 'Hỗ trợ trực tiếp';
    }
    return tab.user.name || 'Hỗ trợ viên';
  }, [tab.user.name, isAiPeer, aiStatus]);

  const lastWelcomeIdx = useMemo(() => {
    if (!isAiPeer) return -1;
    return messages.reduce((acc, x, i) => (isAiWelcomeReply(x.content) ? i : acc), -1);
  }, [isAiPeer, messages]);

  const welcomeChips = viewerRole === 'teacher'
    ? TEACHER_WELCOME_CHIPS
    : viewerRole === 'student'
      ? STUDENT_WELCOME_CHIPS
      : null;

  const showWelcomeChips = useMemo(() => {
    if (!welcomeChips || lastWelcomeIdx < 0) return false;
    if (aiStatus !== AI_SUPPORT_STATUS.AI_ACTIVE) return false;
    return !messages.slice(lastWelcomeIdx + 1).some((x) => (
      x.messageType !== 'system'
      && String(x.senderId || '') !== 'ai_support'
      && !x.isRecalled
    ));
  }, [welcomeChips, lastWelcomeIdx, aiStatus, messages]);

  const displayMessages = useMemo(() => {
    if (!isAiPeer || messages.some((message) => isAiWelcomeReply(message.content))) {
      return messages;
    }
    const audience = viewerRole === 'teacher' ? 'Thầy/Cô' : 'Bạn';
    return [{
      id: `ai-welcome-${tab.id}`,
      senderId: AI_SUPPORT_PEER.id,
      senderName: AI_SUPPORT_PEER.name,
      senderRole: AI_SUPPORT_PEER.role,
      content: `Xin chào ${audience}! Em là Trợ lý AI Tin Học của Thắng Tin Học. Em hỗ trợ Word, Excel, PowerPoint, MOS, LMS và giảng dạy. Thầy/Cô hỏi gì ạ?`,
      messageType: 'text',
      read: true,
      time: new Date(),
      isWelcomeFallback: true,
    }, ...messages];
  }, [isAiPeer, messages, tab.id, viewerRole]);

  const [statusFlash, setStatusFlash] = useState('');
  const prevAiStatusRef = useRef(aiStatus);

  useEffect(() => {
    if (!isAiPeer) return undefined;
    if (prevAiStatusRef.current === aiStatus) return undefined;
    prevAiStatusRef.current = aiStatus;
    let text = '';
    if (aiStatus === AI_SUPPORT_STATUS.SUPPORT_ACTIVE) {
      text = 'Đã kết nối nhân viên hỗ trợ';
    } else if (aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT) {
      text = supportOnline
        ? 'Đã gửi yêu cầu hỗ trợ — nhân viên sẽ tiếp nhận tại đây.'
        : 'Đã gửi yêu cầu. Chưa có nhân viên trực tuyến — bạn cứ nhắn tiếp.';
    }
    if (!text) {
      setStatusFlash('');
      return undefined;
    }
    setStatusFlash(text);
    const timer = setTimeout(() => setStatusFlash(''), 4500);
    return () => clearTimeout(timer);
  }, [aiStatus, isAiPeer, supportOnline]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, tab.id, peerTyping]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (typingActiveRef.current && onTypingStop) onTypingStop(tab.id);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [tab.id, onTypingStop]);

  useEffect(() => {
    setPendingImage(null);
    if (pendingUrlRef.current) {
      URL.revokeObjectURL(pendingUrlRef.current);
      pendingUrlRef.current = '';
    }
  }, [tab.id]);

  useEffect(() => () => {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setActiveMsgOptions(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleRecallMessage = async (msgId) => {
    try {
      if (onRecall) {
        await onRecall(msgId);
        toast.success('Đã thu hồi tin nhắn');
      }
    } catch {
      toast.error('Không thể thu hồi tin nhắn');
    }
  };

  const handleReaction = async (msgId, type) => {
    try {
      await onReact?.(msgId, type);
    } catch (error) {
      toast.error(error?.message || 'Không thể thả cảm xúc');
    }
  };

  const handleEditMessage = (msg) => {
    const raw = typeof msg === 'string' ? { content: msg } : (msg || {});
    const content = String(raw.content || '').trim();
    const caption = content && content !== '[Hình ảnh]' ? content : '';
    const hasImage = isImageMessage(raw) && Boolean(raw.fileUrl);

    if (!caption && !hasImage) return;

    if (pendingUrlRef.current) {
      URL.revokeObjectURL(pendingUrlRef.current);
      pendingUrlRef.current = '';
    }

    if (hasImage) {
      setPendingImage({
        file: null,
        url: resolveMediaUrl(raw.fileUrl),
        name: raw.fileName || 'ảnh',
        existingFileUrl: String(raw.fileUrl),
      });
    } else {
      setPendingImage(null);
    }

    setText(caption);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const talkingToHuman = isAiPeer && (
    aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT
    || aiStatus === AI_SUPPORT_STATUS.SUPPORT_ACTIVE
  );
  const aiImageLimited = Boolean(isAiPeer && !talkingToHuman);
  const aiImageLeft = Number(imageQuota?.remaining);
  const imageLimit = Number(imageQuota?.limit) || (viewerRole === 'teacher' ? 10 : 5);
  const imageBlocked = aiImageLimited && !(aiImageLeft > 0);
  const canAttachImage = !isAiPeer || talkingToHuman || (aiImageLimited && !imageBlocked);
  const questionLimited = Boolean(isAiPeer && !talkingToHuman && questionQuota?.applies);
  const questionLeft = Number(questionQuota?.remaining);
  const questionLimit = Number(questionQuota?.limit) || (viewerRole === 'teacher' ? 25 : 15);
  const questionBlocked = questionLimited && !(questionLeft > 0);

  const applyWinSize = useCallback((next) => {
    const clamped = clampFmSize(next.w, next.h);
    setWinSize(clamped);
    persistFmSize(clamped);
  }, []);

  const startResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      w: winSize.w,
      h: winSize.h,
    };
    const onMove = (ev) => {
      if (!resizeRef.current.active) return;
      const dw = resizeRef.current.x - ev.clientX;
      const dh = resizeRef.current.y - ev.clientY;
      applyWinSize({ w: resizeRef.current.w + dw, h: resizeRef.current.h + dh });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [winSize, applyWinSize]);

  const toggleWide = useCallback(() => {
    const wide = winSize.w >= 560;
    applyWinSize(wide ? FM_SIZE_DEFAULT : { w: 640, h: Math.max(winSize.h, 560) });
  }, [winSize, applyWinSize]);

  const clearPendingImage = () => {
    if (pendingUrlRef.current) {
      URL.revokeObjectURL(pendingUrlRef.current);
      pendingUrlRef.current = '';
    }
    setPendingImage(null);
  };

  const stageImage = (file) => {
    if (!file || uploading || imageBlocked) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ đính kèm ảnh.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Ảnh quá lớn (tối đa 5MB)');
      return;
    }
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current);
    const url = URL.createObjectURL(file);
    pendingUrlRef.current = url;
    setPendingImage({ file, url, name: file.name });
    inputRef.current?.focus();
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const body = text.trim();
    if (uploading || sending) return;
    if (questionBlocked) {
      toast.error(`Hết ${questionLimit} lượt hỏi AI hôm nay. Bấm Cần nhân viên hỗ trợ nếu vẫn cần giúp.`);
      return;
    }
    if (!body && !pendingImage) return;
    if (typingActiveRef.current && onTypingStop) {
      typingActiveRef.current = false;
      onTypingStop(tab.id);
    }
    if (pendingImage?.file) {
      setUploading(true);
      try {
        const ok = await onSendFile(tab, pendingImage.file, body);
        if (ok !== false) {
          setText('');
          clearPendingImage();
        }
      } catch (err) {
        toast?.error(err?.message || 'Gửi ảnh thất bại');
      } finally {
        setUploading(false);
      }
      return;
    }
    if (pendingImage?.existingFileUrl && onSendExistingImage) {
      setUploading(true);
      try {
        const ok = await onSendExistingImage(
          tab,
          pendingImage.existingFileUrl,
          body,
          pendingImage.name || '',
        );
        if (ok !== false) {
          setText('');
          clearPendingImage();
        }
      } catch (err) {
        toast?.error(err?.message || 'Gửi ảnh thất bại');
      } finally {
        setUploading(false);
      }
      return;
    }
    onSend(tab, body);
    setText('');
  };

  const handleInputChange = (e) => {
    setText(e.target.value);
    if (!onTypingStart) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      onTypingStart(tab.id);
    }
  };

  const handleInputFocus = () => {
    if (!onTypingStart || typingActiveRef.current) return;
    typingActiveRef.current = true;
    onTypingStart(tab.id);
  };

  const handleInputBlur = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (typingActiveRef.current && onTypingStop) {
      typingActiveRef.current = false;
      onTypingStop(tab.id);
    }
  };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stageImage(file);
  };

  const insertLink = () => {
    const url = window.prompt('Dán link (https://…)');
    if (!url?.trim()) return;
    let link = url.trim();
    if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
    onSendLink(tab, link);
  };

  const handlePaste = (e) => {
    if (isAiPeer && imageBlocked) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    let imageFile = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageFile = items[i].getAsFile();
        break;
      }
    }
    if (!imageFile || uploading) return;
    e.preventDefault();
    stageImage(imageFile);
  };

  return (
    <div
      className="cms-fm-window is-active"
      style={{ width: winSize.w, height: winSize.h, maxWidth: 'calc(100vw - 1rem)', maxHeight: 'calc(100dvh - 5rem)' }}
    >
      <button
        type="button"
        className="cms-fm-resize"
        title="Kéo góc để phóng to / thu nhỏ"
        aria-label="Kéo để đổi kích thước khung chat"
        onPointerDown={startResize}
        onDoubleClick={() => applyWinSize(FM_SIZE_DEFAULT)}
      >
        <Scaling size={14} />
      </button>
      <div className="cms-fm-window__head">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="relative shrink-0">
            <img
              src={resolveAvatarUrl({ ...tab.user, role: tab.user.role === 'admin' && !isSuper ? 'staff' : tab.user.role, name: displayName })}
              alt=""
              className={`w-9 h-9 rounded-full object-cover ring-1 ring-slate-200 ${isRealAvatar(tab.user?.avatar) ? 'cms-fm-avatar--photo' : ''}`}
            />
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-900 truncate leading-tight">{displayName}</p>
            <p className={`text-[10px] font-semibold ${isOnline || isAiPeer ? 'text-emerald-600' : 'text-slate-400'}`}>
              {isAiPeer
                ? (aiStatus === AI_SUPPORT_STATUS.SUPPORT_ACTIVE
                  ? 'Nhân viên hỗ trợ · Đã kết nối'
                  : aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT
                    ? 'Đang kết nối nhân viên hỗ trợ'
                    : aiStatus === AI_SUPPORT_STATUS.SUPPORT_RESOLVED
                      ? 'Đã xử lý'
                      : 'Trợ lý AI · Luôn sẵn sàng')
                : `${displayRoleLabel} · ${isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="cms-fm-icon-btn"
            onClick={toggleWide}
            title={winSize.w >= 560 ? 'Thu về kích thước mặc định' : 'Phóng rộng khung chat'}
            aria-label={winSize.w >= 560 ? 'Thu nhỏ khung' : 'Phóng rộng khung chat'}
          >
            <Scaling size={14} />
          </button>
          <button type="button" className="cms-fm-icon-btn" onClick={() => onMinimize(tab.id)} aria-label="Thu nhỏ thành biểu tượng">
            <Minus size={14} />
          </button>
          <button type="button" className="cms-fm-icon-btn" onClick={() => onClose(tab.id)} aria-label="Đóng chat">
            <X size={14} />
          </button>
        </div>
      </div>
      {isAiPeer && statusFlash ? (
        <p className={`shrink-0 px-3 py-1.5 text-[10px] font-semibold text-center leading-snug border-b animate-in fade-in duration-200 ${
          aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT
            ? 'border-amber-100 bg-amber-50 text-amber-800'
            : 'border-emerald-100 bg-emerald-50 text-emerald-800'
        }`}>
          {statusFlash}
        </p>
      ) : null}

      <div className="cms-fm-window__body">
        {displayMessages.length === 0 ? (
          <p className="text-center text-[12px] text-slate-400 py-8 px-3 font-medium">
            {isAiPeer
              ? 'Hỏi Trợ lý AI về tin học, Office, MOS, LMS…'
              : `Chat với ${tab.user.name}. Có thể gửi ảnh, dán ảnh màn hình hoặc dán link.`}
          </p>
        ) : (
          displayMessages.map((m, idx) => {
            const sentByMe = isOutgoingMessengerMessage(m, meId);
            const alignEnd = sentByMe && !(isAiPeer && isImageMessage(m));
            const msgId = m.id || m._id;
            const showOptions = activeMsgOptions === msgId;
            const isNearTop = idx < 3 || idx < messages.length / 2;
            const prev = idx > 0 ? messages[idx - 1] : null;
            if (
              m.messageType === 'system'
              && prev?.messageType === 'system'
              && String(prev.content || '').trim() === String(m.content || '').trim()
            ) {
              return null;
            }

            return (
              <div key={msgId} className={`group relative flex w-full items-center gap-1 ${m.messageType === 'system' ? 'justify-center' : (alignEnd ? 'justify-end' : 'justify-start')}`}>
                {sentByMe && !m.isRecalled && (
                  <div className="relative shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleEditMessage(m)}
                      className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      title="Chỉnh sửa / Hỏi lại"
                    >
                      <Edit3 size={13} />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMsgOptions(showOptions ? null : msgId);
                        }}
                        className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                        title="Tùy chọn tin nhắn"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {showOptions && (
                        <div
                          className={`absolute ${isNearTop ? 'top-full mt-1' : 'bottom-full mb-1'} left-0 z-[200] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 w-36 text-xs font-semibold animate-in fade-in zoom-in-95 duration-150 shadow-slate-900/20`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMsgOptions(null);
                              handleRecallMessage(msgId);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-left transition font-bold"
                          >
                            <RotateCcw size={14} className="shrink-0 text-red-600" />
                            <span className="whitespace-nowrap">Thu hồi tin nhắn</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <MessageBubble
                  m={m}
                  mine={alignEnd}
                  meId={meId}
                  onReact={handleReaction}
                  reactionsEnabled={!isAiPeer}
                  showAiImageQuota={sentByMe && isAiPeer && isImageMessage(m)}
                  senderLabel={isAiPeer && sentByMe && isImageMessage(m) && !alignEnd ? 'Bạn gửi' : ''}
                  chips={
                    isAiPeer
                      && (showWelcomeChips || m.isWelcomeFallback)
                      && (m.isWelcomeFallback || idx === lastWelcomeIdx)
                      ? welcomeChips
                      : null
                  }
                  onChip={(chip) => onSend(tab, chip.label)}
                  onSchedulePreview={setSchedulePreview}
                />
                {!m.isRecalled && m.messageType !== 'system' ? (
                  <CopyHoverButton text={m.content} />
                ) : null}
              </div>
            );
          })
        )}
        {peerTyping || sending ? (
          <TypingIndicator label={isAiPeer && aiStatus === AI_SUPPORT_STATUS.AI_ACTIVE ? 'Trợ lý AI đang trả lời' : 'Đang gửi'} />
        ) : null}
        <div ref={endRef} />
      </div>

      {/* ── Feedback panel: đặt NGOÀI body để không che nội dung chat ── */}
      {isAiPeer ? (
        <div className="cms-fm-feedback-panel">
          {aiStatus === AI_SUPPORT_STATUS.AI_ACTIVE && !peerTyping && (questionBlocked || imageBlocked) ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold leading-snug text-amber-900">
                {questionBlocked && imageBlocked
                  ? `Bạn đã hết ${questionLimit} lượt hỏi và ${imageLimit} lượt gửi ảnh hôm nay.`
                  : questionBlocked
                    ? `Bạn đã hết ${questionLimit} lượt hỏi AI hôm nay.`
                    : `Bạn đã hết ${imageLimit} lượt gửi ảnh hôm nay.`}
                <span className="block mt-0.5 font-medium text-amber-800">
                  Bạn có thể chuyển sang nhân viên hỗ trợ trực tiếp.
                </span>
              </div>
              <button
                type="button"
                disabled={escalating}
                onClick={() => onEscalate?.(tab)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-200 bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wide hover:bg-amber-200 disabled:opacity-50 transition-colors"
              >
                {escalating ? <Loader2 size={14} className="animate-spin" /> : <UserRound size={14} />}
                Chuyển sang hỗ trợ trực tiếp
              </button>
            </div>
          ) : null}

          {/* Reset AI khi đã escalate/resolved */}
          {(aiStatus === AI_SUPPORT_STATUS.SUPPORT_RESOLVED
            || aiStatus === AI_SUPPORT_STATUS.CLOSED
            || aiStatus === AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT) ? (
            <button
              type="button"
              disabled={resettingAi}
              onClick={() => onResetAi?.(tab)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 text-[10px] font-black uppercase tracking-wide hover:bg-violet-100 disabled:opacity-50 transition-colors"
            >
              {resettingAi ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              Hỏi Trợ lý AI
            </button>
          ) : null}

          {/* Luồng feedback chính */}
          {aiStatus === AI_SUPPORT_STATUS.AI_ACTIVE && !peerTyping && !questionBlocked ? (
            <div className="space-y-1.5">

              {/* Bước 0: Lần 1 — đồng ý / không — chỉ hiện khi có AI reply và canShowEscalate */}
              {(!feedbackPhase || feedbackPhase === 'agree') && canShowEscalate ? (
                <>
                  <p className="text-[11px] text-slate-500 text-center font-semibold">Bạn đồng ý câu trả lời này không?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onAgree?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-100 transition-colors">
                      <Check size={14} /> Có
                    </button>
                    <button type="button" onClick={() => onDisagree?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-wide hover:bg-slate-50 transition-colors">
                      <X size={14} /> Không
                    </button>
                  </div>
                </>
              ) : null}

              {/* Bước 1: Chọn lý do không đồng ý (lần 1) */}
              {feedbackPhase === 'disagree_reason' ? (
                <>
                  <p className="text-[11px] text-slate-600 text-center font-semibold">Bạn chưa hài lòng vì?</p>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { label: 'Tôi không hiểu chỗ này', value: 'unclear' },
                      { label: 'Câu trả lời chưa đúng trọng tâm', value: 'offtopic' },
                      { label: 'Nội dung còn ít quá', value: 'too_short' },
                    ].map((r) => (
                      <button key={r.value} type="button"
                        onClick={() => onDisagreeReason?.(tab, r.value)}
                        className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-[11px] font-semibold hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 transition-colors text-left">
                        <MessageSquare size={13} className="shrink-0 text-slate-400" />
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {/* Bước 2: Đang chờ AI giải thích lại */}
              {feedbackPhase === 're_explain' ? (
                <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-center font-semibold leading-snug">
                  Trợ lý AI đang giải thích thêm cho bạn…
                </p>
              ) : null}

              {/* Bước 3: Lần 2 — đồng ý kết quả tiếp theo không? */}
              {feedbackPhase === 'disagree2' ? (
                <>
                  <p className="text-[11px] text-slate-600 text-center font-semibold">Bạn có đồng ý với kết quả tiếp theo này không?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onAgree?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-100 transition-colors">
                      <Check size={14} /> Có
                    </button>
                    <button type="button" onClick={() => onDisagree2?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-wide hover:bg-slate-50 transition-colors">
                      <X size={14} /> Không
                    </button>
                  </div>
                </>
              ) : null}

              {/* Bước 4: Lựa chọn cuối — giải thích thêm hay gặp nhân viên */}
              {feedbackPhase === 'final_choice' ? (
                <>
                  <p className="text-[11px] text-slate-600 text-center font-semibold">Bạn muốn?</p>
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => onFinalExplain?.(tab)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-[10px] font-black uppercase tracking-wide hover:bg-blue-100 transition-colors">
                      <Bot size={14} /> Giải thích thêm 1 lần nữa
                    </button>
                    <button type="button"
                      disabled={escalating}
                      onClick={() => onFinalStaff?.(tab)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-wide hover:bg-amber-100 disabled:opacity-50 transition-colors">
                      {escalating ? <Loader2 size={14} className="animate-spin" /> : <UserRound size={14} />}
                      Gặp nhân viên trực tiếp
                    </button>
                  </div>
                </>
              ) : null}

              {/* Bước cuối: Đồng ý → hỏi thêm không */}
              {feedbackPhase === 'more' ? (
                <>
                  <p className="text-[11px] text-slate-600 text-center font-semibold">Bạn cần hỗ trợ thêm câu hỏi nào nữa không?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onMoreYes?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-[10px] font-black uppercase tracking-wide hover:bg-emerald-100 transition-colors">
                      <Check size={14} /> Có
                    </button>
                    <button type="button" onClick={() => onMoreNo?.(tab)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-wide hover:bg-slate-50 transition-colors">
                      <X size={14} /> Không
                    </button>
                  </div>
                </>
              ) : null}

              {feedbackPhase === 'invite' ? (
                <p className="text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 text-center font-semibold leading-snug">
                  Mời bạn đặt câu hỏi.
                </p>
              ) : null}
              {feedbackPhase === 'ended' ? (
                <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center font-semibold leading-snug">
                  Xin chào, hẹn gặp lại bạn.
                </p>
              ) : null}
              {feedbackPhase === 'staff' ? (
                <button type="button" disabled={escalating} onClick={() => onEscalate?.(tab)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-wide hover:bg-amber-100 disabled:opacity-50 transition-colors">
                  {escalating ? <Loader2 size={14} className="animate-spin" /> : <UserRound size={14} />}
                  Cần nhân viên hỗ trợ
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="cms-fm-window__foot" onSubmit={submit}>
        {pendingImage ? (
          <div className="cms-fm-pending">
            <img src={pendingImage.url} alt="" className="cms-fm-pending__thumb" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-slate-800 truncate">
                {pendingImage.existingFileUrl ? 'Ảnh kèm câu hỏi' : 'Ảnh đã chọn'}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{pendingImage.name || 'ảnh'}</p>
            </div>
            <button
              type="button"
              className="cms-fm-pending__remove"
              onClick={clearPendingImage}
              disabled={uploading}
              title="Bỏ ảnh"
              aria-label="Bỏ ảnh"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        <div className="cms-fm-window__compose">
          {(canAttachImage || imageBlocked) ? (
            <>
              <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
              <button
                type="button"
                className="cms-fm-attach"
                disabled={uploading || imageBlocked || questionBlocked}
                onClick={() => {
                  if (imageBlocked) return;
                  imageRef.current?.click();
                }}
                title={imageBlocked ? `Hết ${imageLimit} ảnh hôm nay — ngày mai gửi tiếp` : 'Đính kèm ảnh'}
                aria-label={imageBlocked ? 'Hết lượt gửi ảnh hôm nay' : 'Đính kèm ảnh'}
              >
                <ImagePlus size={16} />
              </button>
              <ScreenCaptureButton
                size={16}
                disabled={uploading || imageBlocked || questionBlocked}
                buttonClassName="cms-fm-attach"
                title={imageBlocked ? `Hết ${imageLimit} ảnh hôm nay — ngày mai gửi tiếp` : 'Chụp màn hình'}
                onCaptured={(file) => stageImage(file)}
                onError={(msg) => toast.error(msg)}
              />
              {!isAiPeer ? (
                <button
                  type="button"
                  className="cms-fm-attach"
                  disabled={uploading}
                  onClick={insertLink}
                  title="Gửi link"
                  aria-label="Gửi link"
                >
                  <Link2 size={16} />
                </button>
              ) : null}
            </>
          ) : null}
          <input
            ref={inputRef}
            value={text}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
            onPaste={canAttachImage ? handlePaste : undefined}
            placeholder={
              uploading
                ? 'Đang gửi ảnh…'
                : sending
                  ? (isAiPeer ? 'Trợ lý AI đang trả lời…' : 'Đang gửi…')
                : questionBlocked
                  ? `Hết ${questionLimit} lượt hỏi AI hôm nay`
                  : pendingImage
                    ? (isAiPeer ? 'Nhập câu hỏi rồi nhấn Gửi…' : 'Nhập lời nhắn rồi nhấn Gửi…')
                    : (isAiPeer ? 'Hỏi tin học, Office, MOS, LMS…' : 'Aa (Dán ảnh Ctrl+V)')
            }
            disabled={uploading || sending || questionBlocked}
            className="cms-fm-input"
          />
          <button type="submit" disabled={(!text.trim() && !pendingImage) || uploading || sending || questionBlocked} className="cms-fm-send" aria-label={sending ? 'Đang xử lý' : 'Gửi'}>
            {uploading || sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </form>

      <ScheduleMessagePreviewModal
        open={!!schedulePreview}
        data={schedulePreview}
        onClose={() => setSchedulePreview(null)}
      />
    </div>
  );
}

export default function FloatingMessenger({ session, role }) {
  const location = useLocation();
  const isInbox = location.pathname.includes('/inbox');
  const toast = useToast();
  const {
    onlineUsers, onMessageReceive, onContactListUpdated,
    onTypingChange, emitTypingStart, emitTypingStop, socket,
  } = useSocket() || {};
  const {
    sendMessage, getMessages, getConversations, markMessagesRead, recallMessage,
    syncMessages, toggleMessageReaction,
  } = useData();
  const {
    supportOpen, setSupportOpen, tabs, activeTabId,
    openChat, closeChat, minimizeChat, focusChat,
  } = useFloatingMessenger();

  const [aiSupportEnabled, setAiSupportEnabled] = useState(false);
  const [aiOpening, setAiOpening] = useState(false);
  const [escalatingId, setEscalatingId] = useState(null);
  const [resettingAiId, setResettingAiId] = useState(null);
  const [aiStatusMap, setAiStatusMap] = useState({});
  const [aiFeedback, setAiFeedback] = useState({});
  const [peerTypingMap, setPeerTypingMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});
  const [aiImageQuota, setAiImageQuota] = useState({ remaining: 5, limit: 5, used: 0 });
  const [aiQuestionQuota, setAiQuestionQuota] = useState({
    applies: false, remaining: 15, limit: 15, used: 0,
  });

  const meId = String(session?.id || session?._id || '');
  const meName = session?.name || 'Tôi';
  const meRole = normalizeChatRole(getMessagingRole(session) || role || session?.role || 'student');
  const canUseAiSupport = meRole === 'student' || meRole === 'teacher';

  // HV/GV: không tự mở cửa sổ chat ngay khi login.
  // Chỉ hiển thị khi người dùng đã bấm (FAB hoặc chat-head).
  const [userOpenedChat, setUserOpenedChat] = useState(false);

  useEffect(() => {
    const onOpenChat = () => setUserOpenedChat(true);
    window.addEventListener('cms:open-chat', onOpenChat);
    return () => window.removeEventListener('cms:open-chat', onOpenChat);
  }, []);
  // UI: staff/admin hide student quick-support chrome
  const isSuper = isSuperAdminViewer(session);
  const isTrueSuperAdmin = meId === 'admin' || session?.adminRole === 'SUPER_ADMIN';
  // Directory: only SUPER/HIGH may browse presence; others use GET /contacts
  const usePresenceDirectory = isElevatedPresenceDirectoryViewer(session);

  // Elevated + non-elevated: GET /contacts is the authorization source.
  // Presence only overlays online — never fall back to local staffs[] for WHO.
  const [fmContacts, setFmContacts] = useState([]);
  useEffect(() => {
    const fetchContacts = () => {
      messagesAPI.getContacts().then((res) => {
        const data = res?.success && Array.isArray(res.data) ? res.data : [];
        setFmContacts(data);
      }).catch(() => {
        setFmContacts([]);
      });
    };
    fetchContacts();
    if (onContactListUpdated) {
      const unsub = onContactListUpdated(() => fetchContacts());
      return unsub;
    }
    return undefined;
  }, [usePresenceDirectory, onContactListUpdated]);

  const conversations = useMemo(() => {
    const raw = meId ? (getConversations(meId) || []) : [];
    if (!isTrueSuperAdmin) return raw;
    // SUPER: chỉ HIGH_ADMIN từ contacts — không hiện group / HV / GV / staff activity
    const allowed = new Set((fmContacts || []).map((c) => String(c.id)));
    return raw.filter((c) => {
      if (!c || c.isGroup) return false;
      const pid = c.user?.id != null ? String(c.user.id) : '';
      if (allowed.size > 0) return allowed.has(pid);
      const ar = String(c.user?.adminRole || c.user?.productRole || '').toUpperCase();
      return ar === 'HIGH_ADMIN';
    });
  }, [getConversations, meId, isTrueSuperAdmin, fmContacts]);

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (Number(c.unread) || 0), 0),
    [conversations],
  );

  const unreadByPeer = useMemo(() => {
    const map = new Map();
    for (const c of conversations) {
      if (!c?.user?.id || !(c.unread > 0) || c.isGroup) continue;
      map.set(`${normalizeChatRole(c.user.role)}_${c.user.id}`, Number(c.unread) || 0);
    }
    return map;
  }, [conversations]);

  const effectiveStaffs = fmContacts;

  const directory = useMemo(
    () => {
      const base = buildSupportDirectory({
      session,
      onlineUsers,
      meId,
      staffs: effectiveStaffs,
      supportAgentsOnly: canUseAiSupport,
      });
      if (!canUseAiSupport) return base;
      return {
        ...base,
        groups: [
          {
            key: 'ai',
            label: 'Trợ lý AI',
            people: [{ ...AI_SUPPORT_PEER, online: true, displayRole: 'AI' }],
          },
          ...base.groups,
        ],
      };
    },
    [session, onlineUsers, meId, effectiveStaffs, canUseAiSupport],
  );

  /** HV/GV dùng AI-first: không mở danh bạ. Nhân viên nhắn tới thì hiện chat-head. */
  const showHumanSupportPanel = supportOpen;

  const unreadConversations = useMemo(() => {
    const list = conversations.filter((c) => (c.unread || 0) > 0 && !c.isGroup);
    if (usePresenceDirectory) return list.slice(0, 8);
    // Non-elevated: nhận tin từ chuyên viên SUPPORT hoặc HIGH_ADMIN / SUPER_ADMIN / STAFF
    return list.filter((c) => {
      const ar = String(c.user?.adminRole || c.user?.productRole || '').toUpperCase();
      if (canUseAiSupport) return ar === 'SUPPORT' || ar === 'HIGH_ADMIN' || ar === 'SUPER_ADMIN';
      const r = String(c.user?.role || '').toLowerCase();
      return r === 'staff' || r === 'admin' || ar === 'STAFF' || ar === 'SUPPORT' || ar === 'HIGH_ADMIN' || ar === 'SUPER_ADMIN';
    }).slice(0, 8);
  }, [conversations, usePresenceDirectory, canUseAiSupport]);

  const shouldForceMinimize = !userOpenedChat && (meRole === 'student' || meRole === 'teacher');
  const uiTabs = shouldForceMinimize
    ? (Array.isArray(tabs) ? tabs.map((t) => ({ ...t, minimized: true })) : [])
    : tabs;

  const openWindowRaw = uiTabs.find((t) => !t.minimized) || null;
  const openWindow = openWindowRaw && isAiSupportPeer(openWindowRaw.user)
    ? {
      ...openWindowRaw,
      id: buildAiSupportConversationId(meRole, meId),
      user: { ...AI_SUPPORT_PEER },
    }
    : openWindowRaw;
  // AI dùng mascot/FAB riêng; các chat cá nhân vẫn phải hiện chat-head
  // để không làm mất tin GV↔HV, Admin↔GV khi AI đang bật.
  const heads = uiTabs.filter((t) => t.minimized && !isAiSupportPeer(t.user));
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    if (!meId || isInbox) return;
    aiSupportAPI.status().then((res) => {
      if (res?.success) setAiSupportEnabled(!!res.data?.enabled);
    }).catch(() => setAiSupportEnabled(false));
  }, [meId, isInbox]);

  useEffect(() => {
    if (!canUseAiSupport || !meId || isInbox) return undefined;
    let tokenTail = '';
    try {
      tokenTail = String(
        localStorage.getItem('student_access_token')
        || localStorage.getItem('teacher_access_token')
        || '',
      ).slice(-16);
    } catch { /* ignore */ }
    const key = `cms_ai_hist_reset_${meId}_${tokenTail}`;
    try {
      if (sessionStorage.getItem(key) === '1') return undefined;
      sessionStorage.setItem(key, '1');
    } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        await aiSupportAPI.clearHistory();
        if (!cancelled) await syncMessages?.(meId);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [canUseAiSupport, meId, isInbox, syncMessages]);

  useEffect(() => {
    if (!onTypingChange) return undefined;
    return onTypingChange(({ conversationId, userId, show }) => {
      const cid = String(conversationId || '');
      if (!cid) return;
      if (String(userId) === String(meId)) return;
      setPeerTypingMap((prev) => {
        const next = { ...prev };
        if (show) next[cid] = true;
        else delete next[cid];
        return next;
      });
    });
  }, [onTypingChange, meId]);

  const handleTypingStart = useCallback((conversationId) => {
    emitTypingStart?.(conversationId, meName);
  }, [emitTypingStart, meName]);

  const handleTypingStop = useCallback((conversationId) => {
    emitTypingStop?.(conversationId);
  }, [emitTypingStop]);

  const handleOpenAiSupport = useCallback(async () => {
    if (!canUseAiSupport || aiOpening) return;
    setUserOpenedChat(true);
    openChat(AI_SUPPORT_PEER, { expand: true });
    setSupportOpen(false);
    setAiOpening(true);
    try {
      const res = await aiSupportAPI.open();
      if (!res?.success) throw new Error(res?.message || 'Không mở được Trợ lý AI');
      const convId = res.data?.conversationId;
      if (convId) {
        const status = res.data?.session?.status
          || (res.data?.session?.escalated ? AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT : AI_SUPPORT_STATUS.AI_ACTIVE);
        setAiStatusMap((prev) => ({ ...prev, [convId]: status }));
        const q = res.data?.session?.imageQuota;
        if (q) {
          setAiImageQuota({
            remaining: Number(q.remaining ?? 5),
            limit: Number(q.limit ?? 5),
            used: Number(q.used ?? 0),
          });
        }
        const qq = res.data?.session?.questionQuota;
        if (qq) {
          setAiQuestionQuota({
            applies: Boolean(qq.applies),
            remaining: qq.remaining == null ? null : Number(qq.remaining),
            limit: Number(qq.limit ?? 15),
            used: Number(qq.used ?? 0),
          });
        }
      }
      await syncMessages?.(meId);
    } catch (err) {
      toast.error(err.message || 'Trợ lý AI chưa sẵn sàng');
    } finally {
      setAiOpening(false);
    }
  }, [canUseAiSupport, aiOpening, syncMessages, meId, openChat, setSupportOpen, toast]);

  const handleSupportFabClick = useCallback(() => {
    setSupportOpen((v) => !v);
  }, [setSupportOpen]);

  const handleEscalate = useCallback(async (tab) => {
    if (!tab?.id || escalatingId) return;
    setEscalatingId(tab.id);
    try {
      const res = await aiSupportAPI.escalate(tab.id);
      if (!res?.success) throw new Error(res?.message || 'Không chuyển được');
      setAiStatusMap((prev) => ({
        ...prev,
        [tab.id]: res.data?.session?.status || AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT,
      }));
      setSendingMap((prev) => {
        if (!prev[tab.id]) return prev;
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
      setPeerTypingMap((prev) => {
        if (!prev[tab.id]) return prev;
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
      setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'idle' } }));
      if (!res.data?.alreadyEscalated) {
        await syncMessages?.(meId);
      }
      toast.success('Đã chuyển tới nhân viên hỗ trợ. Bạn cứ nhắn tiếp trong cuộc trò chuyện này.');
      setSupportOpen(false);
    } catch (err) {
      toast.error(err.message || 'Không chuyển được yêu cầu');
    } finally {
      setEscalatingId(null);
    }
  }, [escalatingId, syncMessages, meId, toast, setSupportOpen]);

  const handleResetAi = useCallback(async (tab) => {
    if (!tab?.id || resettingAiId) return;
    setResettingAiId(tab.id);
    try {
      const res = await aiSupportAPI.reset(tab.id);
      if (!res?.success) throw new Error(res?.message || 'Không bật lại được Trợ lý AI');
      setAiStatusMap((prev) => ({ ...prev, [tab.id]: AI_SUPPORT_STATUS.AI_ACTIVE }));
      setAiFeedback((prev) => ({ ...prev, [tab.id]: { phase: 'idle', replyId: prev[tab.id]?.replyId || '' } }));
      toast.success('Trợ lý AI đã sẵn sàng — bạn có thể hỏi tiếp');
    } catch (err) {
      toast.error(err.message || 'Không bật lại được Trợ lý AI');
    } finally {
      setResettingAiId(null);
    }
  }, [resettingAiId, toast]);

  useEffect(() => {
    const aiTab = tabs.find((t) => isAiSupportPeer(t.user));
    if (!aiTab?.id) return;
    aiSupportAPI.open().then((res) => {
      if (res?.success && res.data?.conversationId === aiTab.id) {
        const status = res.data?.session?.status
          || (res.data?.session?.escalated ? AI_SUPPORT_STATUS.WAITING_FOR_SUPPORT : AI_SUPPORT_STATUS.AI_ACTIVE);
        setAiStatusMap((prev) => ({ ...prev, [aiTab.id]: status }));
        const q = res.data?.session?.imageQuota;
        if (q) {
          setAiImageQuota({
            remaining: Number(q.remaining ?? 5),
            limit: Number(q.limit ?? 5),
            used: Number(q.used ?? 0),
          });
        }
        const qq = res.data?.session?.questionQuota;
        if (qq) {
          setAiQuestionQuota({
            applies: Boolean(qq.applies),
            remaining: qq.remaining == null ? null : Number(qq.remaining),
            limit: Number(qq.limit ?? 15),
            used: Number(qq.used ?? 0),
          });
        }
      }
    }).catch(() => {});
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = (payload) => {
      const cid = String(payload?.conversationId || '');
      if (!cid || !payload?.status) return;
      const resolvedBySupport = payload.status === AI_SUPPORT_STATUS.SUPPORT_RESOLVED;
      const nextStatus = resolvedBySupport
        ? AI_SUPPORT_STATUS.AI_ACTIVE
        : payload.status;
      setAiStatusMap((prev) => ({ ...prev, [cid]: nextStatus }));
      if (resolvedBySupport) {
        // Support đã đóng yêu cầu: chuyển người dùng về AI ngay, không cần
        // bấm thêm nút "Hỏi Trợ lý AI".
        aiSupportAPI.reset(cid).catch(() => {});
      }
      if (nextStatus !== AI_SUPPORT_STATUS.AI_ACTIVE) {
        setSendingMap((prev) => {
          if (!prev[cid]) return prev;
          const next = { ...prev };
          delete next[cid];
          return next;
        });
        setPeerTypingMap((prev) => {
          if (!prev[cid]) return prev;
          const next = { ...prev };
          delete next[cid];
          return next;
        });
      }
      if (payload.imageQuota) {
        setAiImageQuota({
          remaining: Number(payload.imageQuota.remaining ?? 5),
          limit: Number(payload.imageQuota.limit ?? 5),
          used: Number(payload.imageQuota.used ?? 0),
        });
      }
      if (payload.questionQuota) {
        setAiQuestionQuota({
          applies: Boolean(payload.questionQuota.applies),
          remaining: payload.questionQuota.remaining == null ? null : Number(payload.questionQuota.remaining),
          limit: Number(payload.questionQuota.limit ?? 15),
          used: Number(payload.questionQuota.used ?? 0),
        });
      }
    };
    socket.on('ai-support:status', onStatus);
    return () => socket.off('ai-support:status', onStatus);
  }, [socket]);

  useEffect(() => {
    if (!socket || canUseAiSupport) return undefined;
    const onEscalated = (payload) => {
      const peerId = String(payload?.userId || '');
      if (!peerId || peerId === meId || !payload?.conversationId) return;
      const peer = {
        id: peerId,
        name: payload.userName || 'Học viên',
        role: normalizeChatRole(payload.userRole || 'student'),
        avatar: payload.avatar || '',
        online: true,
      };
      setUserOpenedChat(true);
      openChat(peer, { expand: false });
    };
    socket.on('ai-support:escalate', onEscalated);
    return () => socket.off('ai-support:escalate', onEscalated);
  }, [socket, canUseAiSupport, meId, openChat, setUserOpenedChat]);

  // Tin đến → chat-head + badge (không cướp cửa sổ đang mở); tách khỏi Inbox
  useEffect(() => {
    if (!onMessageReceive || !meId) return undefined;
    return onMessageReceive((data) => {
      if (!data) return;
      if (String(data.senderId) === meId) return;
      const forMe = String(data.receiverId) === meId
        || (meRole === 'admin' && String(data.receiverId) === 'admin')
        || (meRole === 'support' && String(data.receiverId) === 'support');
      if (!forMe && !data.isGroup) return;

      const peer = String(data.senderId) === 'ai_support'
        ? { ...AI_SUPPORT_PEER }
        : {
          id: String(data.senderId),
          name: data.sender?.displayName || data.senderName || 'Người dùng',
          role: normalizeChatRole(data.senderRole || 'student'),
          adminRole: data.sender?.adminRole || null,
          avatar: data.sender?.avatar || data.senderAvatar || '',
        };

      if (String(data.senderId) === 'ai_support' && data.conversationId) {
        setPeerTypingMap((prev) => {
          const next = { ...prev };
          delete next[String(data.conversationId)];
          return next;
        });
      }

      if (isAiSupportConversationId(data.conversationId)) {
        const aiOpen = tabsRef.current.some((t) => !t.minimized && isAiSupportPeer(t.user));
        // HV/GV: chỉ mở chat-head + badge, không tự bung cửa sổ.
        if (!aiOpen) openChat(AI_SUPPORT_PEER, { expand: false });
        return;
      }

      const peerRole = String(peer.role || '').toLowerCase();
      const peerAdminRole = String(peer.adminRole || data.sender?.productRole || '').toUpperCase();
      const isHumanSupport = peerRole === 'staff'
        || peerAdminRole === 'SUPPORT'
        || peerAdminRole === 'STAFF';
      if (isHumanSupport) setSupportOpen(false);

      const current = tabsRef.current;
      const alreadyThis = current.some((t) => (
        !t.minimized
        && t.user.id === peer.id
        && normalizeChatRole(t.user.role) === peer.role
      ));
      openChat(peer, { expand: alreadyThis });
    });
  }, [onMessageReceive, meId, meRole, openChat, setSupportOpen]);

  useEffect(() => {
    if (!meId || !activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || tab.minimized) return;
    const unread = conversations.find((c) => c.id === activeTabId)?.unread || 0;
    if (unread > 0) markMessagesRead?.(activeTabId, meId);
  }, [activeTabId, tabs, conversations, meId, markMessagesRead]);

  const handleAgree = useCallback((tab) => {
    if (!tab?.id) return;
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'more' } }));
  }, []);

  const handleDisagree = useCallback((tab) => {
    if (!tab?.id) return;
    // Lần 1 nhấn Không → hiện 3 lý do
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'disagree_reason' } }));
  }, []);

  const handleMoreYes = useCallback((tab) => {
    if (!tab?.id) return;
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'invite' } }));
  }, []);

  const handleMoreNo = useCallback((tab) => {
    if (!tab?.id) return;
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'ended' } }));
  }, []);

  /** Gửi tin nhắn lên AI từ feedback flow (không cần handleSend) */
  const sendAiMessage = useCallback(async (tab, text) => {
    if (!tab?.id || !text) return;
    if (sendingMap[tab.id]) return;
    // KHÔNG reset phase ở đây — phase đã được set trước khi gọi hàm này
    // useEffect sẽ chuyển phase khi AI trả lời xong
    setSendingMap((prev) => ({ ...prev, [tab.id]: true }));
    try {
      const sent = await sendMessage({
        conversationId: buildAiSupportConversationId(meRole, meId),
        senderId: meId,
        senderName: meName,
        senderRole: meRole,
        receiverId: AI_SUPPORT_PEER.id,
        receiverName: AI_SUPPORT_PEER.name,
        receiverRole: AI_SUPPORT_PEER.role,
        content: text,
        messageType: 'text',
        isGroup: false,
      });
      if (sent?.failed) throw new Error(sent.failReason || 'Gửi tin nhắn thất bại');
    } catch (err) {
      setSendingMap((prev) => {
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
      toast.error(err?.message || 'Gửi tin nhắn thất bại');
    }
  }, [sendMessage, meRole, meId, meName, sendingMap, toast]);

  /** Người dùng chọn lý do không đồng ý → gửi yêu cầu AI giải thích thêm */
  const handleDisagreeReason = useCallback(async (tab, reason) => {
    if (!tab?.id) return;
    // Chuyển phase sang re_explain ngay để UI hiện thông báo
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 're_explain' } }));
    const reasonText = {
      unclear: 'Tôi không hiểu câu trả lời vừa rồi, bạn có thể giải thích rõ hơn không?',
      offtopic: 'Câu trả lời chưa đúng trọng tâm câu hỏi của tôi, bạn hãy trả lời lại đúng vào câu hỏi hơn.',
      too_short: 'Câu trả lời còn quá ngắn, bạn hãy giải thích đầy đủ và chi tiết hơn.',
    }[reason] || 'Bạn có thể giải thích thêm không?';
    try {
      await sendAiMessage(tab, reasonText);
    } catch { /* ignore */ }
  }, [sendAiMessage]);

  /** Người dùng nhấn Không lần 2 → hiện lựa chọn cuối */
  const handleDisagree2 = useCallback((tab) => {
    if (!tab?.id) return;
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 'final_choice' } }));
  }, []);

  /** Giải thích thêm 1 lần nữa → gửi tin AI, quay về re_explain */
  const handleFinalExplain = useCallback(async (tab) => {
    if (!tab?.id) return;
    setAiFeedback((prev) => ({ ...prev, [tab.id]: { ...(prev[tab.id] || {}), phase: 're_explain' } }));
    try {
      await sendAiMessage(tab, 'Bạn có thể giải thích thêm một lần nữa với nhiều ví dụ và chi tiết hơn không?');
    } catch { /* ignore */ }
  }, [sendAiMessage]);

  /** Gặp nhân viên trực tiếp → escalate */
  const handleFinalStaff = useCallback(async (tab) => {
    if (!tab?.id) return;
    await handleEscalate(tab);
  }, [handleEscalate]);

  const handleFocus = useCallback((convId) => {
    setUserOpenedChat(true);
    focusChat(convId);
    if (meId) markMessagesRead?.(convId, meId);
  }, [focusChat, meId, markMessagesRead]);

  const openWindowMessages = openWindow ? (getMessages(openWindow.id) || []) : [];
  const openWindowStatus = openWindow
    ? (aiStatusMap[openWindow.id] || AI_SUPPORT_STATUS.AI_ACTIVE)
    : AI_SUPPORT_STATUS.AI_ACTIVE;
  const openWindowId = openWindow?.id || '';
  const latestAiReplyId = (openWindow && isAiSupportPeer(openWindow.user))
    ? lastMeaningfulAiReplyId(openWindowMessages, meId)
    : '';

  const clearAiFeedbackPrompt = useCallback((tab) => {
    if (!tab?.id || !isAiSupportPeer(tab.user)) return;
    setAiFeedback((prev) => {
      const cur = prev[tab.id];
      if (!cur?.phase || cur.phase === 'idle') return prev;
      return { ...prev, [tab.id]: { ...cur, phase: 'idle' } };
    });
  }, []);

  useEffect(() => {
    if (!openWindowId || !latestAiReplyId) return;
    if (openWindowStatus !== AI_SUPPORT_STATUS.AI_ACTIVE) return;
    setAiFeedback((prev) => {
      const cur = prev[openWindowId];
      if (cur?.replyId === latestAiReplyId) return prev;
      // Nếu đang ở phase re_explain → AI vừa trả lời xong → chuyển sang disagree2
      const nextPhase = cur?.phase === 're_explain' ? 'disagree2' : 'agree';
      return { ...prev, [openWindowId]: { phase: nextPhase, replyId: latestAiReplyId } };
    });
  }, [openWindowId, openWindowStatus, latestAiReplyId]);

  useEffect(() => {
    if (!openWindowId || !latestAiReplyId || !isAiSupportConversationId(openWindowId)) return;
    setSendingMap((prev) => {
      if (!prev[openWindowId]) return prev;
      const next = { ...prev };
      delete next[openWindowId];
      return next;
    });
  }, [openWindowId, latestAiReplyId]);

  if (!meId) return null;

  const handleSend = async (tab, content) => {
    const body = String(content || '').trim();
    if (!body) return;

    const isAi = isAiSupportPeer(tab.user);
    const aiStatus = isAi
      ? (aiStatusMap[tab.id] || AI_SUPPORT_STATUS.AI_ACTIVE)
      : AI_SUPPORT_STATUS.SUPPORT_ACTIVE;
    const aiIsProcessing = isAi && aiStatus === AI_SUPPORT_STATUS.AI_ACTIVE;
    if (sendingMap[tab.id] && aiIsProcessing) return;
    if (isAi && !aiIsProcessing && sendingMap[tab.id]) {
      setSendingMap((prev) => {
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
    }
    if (isAi && aiQuestionQuota.applies && !(Number(aiQuestionQuota.remaining) > 0)) {
      if (aiIsProcessing && !isAiFaqChipLabel(body, meRole)) {
        const lim = Number(aiQuestionQuota.limit) || (meRole === 'teacher' ? 25 : 15);
        toast.error(`Hết ${lim} lượt hỏi AI hôm nay. Bấm Cần nhân viên hỗ trợ nếu vẫn cần giúp.`);
        return;
      }
    }
    if (isAi) {
      clearAiFeedbackPrompt(tab);
    }

    setSendingMap((prev) => ({ ...prev, [tab.id]: true }));
    try {
      const sent = await sendMessage({
        conversationId: isAi ? buildAiSupportConversationId(meRole, meId) : tab.id,
        senderId: meId,
        senderName: meName,
        senderRole: meRole,
        receiverId: isAi ? AI_SUPPORT_PEER.id : tab.user.id,
        receiverName: isAi ? AI_SUPPORT_PEER.name : tab.user.name,
        receiverRole: isAi ? AI_SUPPORT_PEER.role : tab.user.role,
        content: body,
        messageType: 'text',
        isGroup: false,
      });
      if (sent?.failed) {
        throw new Error(sent.failReason || 'Gửi tin nhắn thất bại');
      }
    } catch (err) {
      setSendingMap((prev) => {
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
      toast.error(err?.message || 'Gửi tin nhắn thất bại');
      return;
    }
    if (!isAi || !aiIsProcessing) {
      setSendingMap((prev) => {
        const next = { ...prev };
        delete next[tab.id];
        return next;
      });
    }
  };

  const handleSendLink = async (tab, link) => {
    await handleSend(tab, link);
  };

  const handleSendFile = async (tab, file, caption = '') => {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ gửi ảnh tại chat nổi. File khác dùng Inbox.');
      return false;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Ảnh quá lớn (tối đa 5MB)');
      return false;
    }
    const isAi = isAiSupportPeer(tab.user);
    const status = aiStatusMap[tab.id] || AI_SUPPORT_STATUS.AI_ACTIVE;
    const quotaApplies = isAi && status === AI_SUPPORT_STATUS.AI_ACTIVE;
    if (quotaApplies && aiQuestionQuota.applies && !(Number(aiQuestionQuota.remaining) > 0)) {
      const lim = Number(aiQuestionQuota.limit) || (meRole === 'teacher' ? 25 : 15);
      toast.error(`Hết ${lim} lượt hỏi AI hôm nay. Bấm Cần nhân viên hỗ trợ nếu vẫn cần giúp.`);
      return false;
    }
    if (quotaApplies && Number(aiImageQuota.remaining) <= 0) {
      toast.error('Bạn đã hết lượt gửi ảnh hôm nay. Ngày mai hãy gửi tiếp nhé.');
      return false;
    }
    const content = String(caption || '').trim() || '[Hình ảnh]';
    try {
      const uploadRes = await messagesAPI.uploadMessageFile(file);
      if (!uploadRes?.success) throw new Error(uploadRes?.message || 'Upload thất bại');
      if (isAi) clearAiFeedbackPrompt(tab);
      const sent = await sendMessage({
        conversationId: isAi ? buildAiSupportConversationId(meRole, meId) : tab.id,
        senderId: meId,
        senderName: meName,
        senderRole: meRole,
        receiverId: isAi ? AI_SUPPORT_PEER.id : tab.user.id,
        receiverName: isAi ? AI_SUPPORT_PEER.name : tab.user.name,
        receiverRole: isAi ? AI_SUPPORT_PEER.role : tab.user.role,
        content,
        messageType: 'image',
        fileUrl: uploadRes.url,
        fileName: file.name,
        isGroup: false,
      });
      if (sent?.failed) {
        const reason = String(sent.failReason || '');
        if (/ảnh hôm nay|AI_IMAGE_QUOTA/i.test(reason)) {
          setAiImageQuota((prev) => ({ ...prev, remaining: 0, used: prev.limit || imageLimit }));
        }
        toast.error(sent.failReason || 'Gửi ảnh thất bại');
        return false;
      }
      if (quotaApplies && Number.isFinite(Number(sent?.aiImageRemaining))) {
        const remaining = Math.max(0, Number(sent.aiImageRemaining));
        setAiImageQuota((prev) => ({
          ...prev,
          remaining,
          used: Math.max(0, Number(prev.limit || imageLimit) - remaining),
        }));
      }
      return true;
    } catch (err) {
      if (err?.code === 'AI_IMAGE_QUOTA' || err?.data?.code === 'AI_IMAGE_QUOTA') {
        setAiImageQuota((prev) => ({ ...prev, remaining: 0, used: prev.limit || 5 }));
      }
      toast.error(err.message || 'Gửi ảnh thất bại');
      return false;
    }
  };

  /** Gửi lại ảnh đã có (Hỏi lại) — không upload mới, không trừ thêm quota ảnh. */
  const handleSendExistingImage = async (tab, fileUrl, caption = '', fileName = '') => {
    const url = String(fileUrl || '').trim();
    if (!url) return false;
    const isAi = isAiSupportPeer(tab.user);
    const status = aiStatusMap[tab.id] || AI_SUPPORT_STATUS.AI_ACTIVE;
    const quotaApplies = isAi && status === AI_SUPPORT_STATUS.AI_ACTIVE;
    if (quotaApplies && aiQuestionQuota.applies && !(Number(aiQuestionQuota.remaining) > 0)) {
      const lim = Number(aiQuestionQuota.limit) || (meRole === 'teacher' ? 25 : 15);
      toast.error(`Hết ${lim} lượt hỏi AI hôm nay. Bấm Cần nhân viên hỗ trợ nếu vẫn cần giúp.`);
      return false;
    }
    const content = String(caption || '').trim() || '[Hình ảnh]';
    try {
      if (isAi) clearAiFeedbackPrompt(tab);
      const sent = await sendMessage({
        conversationId: isAi ? buildAiSupportConversationId(meRole, meId) : tab.id,
        senderId: meId,
        senderName: meName,
        senderRole: meRole,
        receiverId: isAi ? AI_SUPPORT_PEER.id : tab.user.id,
        receiverName: isAi ? AI_SUPPORT_PEER.name : tab.user.name,
        receiverRole: isAi ? AI_SUPPORT_PEER.role : tab.user.role,
        content,
        messageType: 'image',
        fileUrl: url,
        fileName: fileName || 'ảnh',
        isGroup: false,
      });
      if (sent?.failed) {
        toast.error(sent.failReason || 'Gửi ảnh thất bại');
        return false;
      }
      return true;
    } catch (err) {
      toast.error(err.message || 'Gửi ảnh thất bại');
      return false;
    }
  };

  const badgeCount = unreadTotal > 0 ? unreadTotal : 0;
  const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);

  const openWindowCanEscalate = Boolean(
    openWindow
    && isAiSupportPeer(openWindow.user)
    && openWindowStatus === AI_SUPPORT_STATUS.AI_ACTIVE
    && canOfferHumanEscalation(openWindowMessages, meId),
  );
  const openWindowFeedback = openWindow ? (aiFeedback[openWindow.id]?.phase || '') : '';

  const supportOnline = Array.isArray(onlineUsers) && onlineUsers.some((u) => {
    const ar = String(u.adminRole || u.productRole || '').toUpperCase();
    return ar === 'SUPPORT';
  });

  const [fabLabel, setFabLabel] = useState(canUseAiSupport ? '' : 'Hỗ trợ viên 24/7');
  useEffect(() => {
    if (!canUseAiSupport) {
      setFabLabel('Hỗ trợ viên 24/7');
      return undefined;
    }

    const labels = ['Trợ lý AI 24/7', 'Nhân viên trực tiếp'];
    let labelIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeoutId;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const target = labels[labelIndex];
      if (!deleting) {
        charIndex += 1;
        setFabLabel(target.slice(0, charIndex));
        if (charIndex === target.length) {
          deleting = true;
          timeoutId = window.setTimeout(tick, 1500);
          return;
        }
      } else {
        charIndex -= 1;
        setFabLabel(target.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          labelIndex = (labelIndex + 1) % labels.length;
        }
      }
      timeoutId = window.setTimeout(tick, deleting ? 55 : 90);
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canUseAiSupport]);
  const fabExpanded = canUseAiSupport ? showHumanSupportPanel : supportOpen;

  return (
    <div className="cms-fm-root" aria-live="polite">
      {/* Cửa sổ chat đang mở (tối đa 1) */}
      {openWindow && (
        <div className="cms-fm-stage">
          <ChatWindow
            key={openWindow.id}
            tab={openWindow}
            meId={meId}
            onlineUsers={onlineUsers}
            isSuper={isSuper}
            messages={openWindowMessages}
            onClose={closeChat}
            onMinimize={minimizeChat}
            onSend={handleSend}
            onSendFile={handleSendFile}
            onSendExistingImage={handleSendExistingImage}
            onSendLink={handleSendLink}
            onRecall={recallMessage}
            onReact={toggleMessageReaction}
            peerTyping={!!peerTypingMap[openWindow.id]}
            sending={Boolean(sendingMap[openWindow.id] && (
              !isAiSupportPeer(openWindow.user)
              || openWindowStatus === AI_SUPPORT_STATUS.AI_ACTIVE
            ))}
            isAiPeer={isAiSupportPeer(openWindow.user)}
            aiStatus={openWindowStatus}
            canShowEscalate={openWindowCanEscalate}
            feedbackPhase={openWindowFeedback}
            supportOnline={supportOnline}
            onEscalate={handleEscalate}
            onResetAi={handleResetAi}
            onAgree={handleAgree}
            onDisagree={handleDisagree}
            onMoreYes={handleMoreYes}
            onMoreNo={handleMoreNo}
            onDisagreeReason={handleDisagreeReason}
            onDisagree2={handleDisagree2}
            onFinalExplain={handleFinalExplain}
            onFinalStaff={handleFinalStaff}
            escalating={escalatingId === openWindow.id}
            resettingAi={resettingAiId === openWindow.id}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            imageQuota={aiImageQuota}
            questionQuota={aiQuestionQuota}
            viewerRole={meRole}
          />
        </div>
      )}

      <div className="cms-fm-dock">
        {/* Panel danh bạ nhân viên — HV/GV chỉ sau escalate AI */}
        {showHumanSupportPanel ? (
          <div className="cms-fm-support">
            <div className="cms-fm-support__head">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Headphones size={15} className="text-emerald-600 shrink-0" />
                  {usePresenceDirectory ? 'Đang hoạt động' : (canUseAiSupport ? 'Chuyên viên hỗ trợ' : 'Hỗ trợ viên')}
                  {unreadTotal > 0 && (
                    <span className="cms-fm-unread-pill">{badgeLabel} mới</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  {usePresenceDirectory
                    ? 'Học viên, giảng viên, admin chi nhánh đang online'
                    : (canUseAiSupport
                      ? 'Chọn chuyên viên hỗ trợ trực tiếp (sau khi Trợ lý AI chuyển tiếp)'
                      : 'Gửi tin nhắn trực tiếp tới bộ phận Hỗ trợ viên')}
                </p>
              </div>
              <button
                type="button"
                className="cms-fm-icon-btn"
                onClick={() => setSupportOpen(false)}
                aria-label="Đóng danh bạ hỗ trợ"
              >
                <X size={14} />
              </button>
            </div>
            <div className="cms-fm-support__body">
              {unreadConversations.length > 0 && (
                <div className="px-2 pb-2 mb-1 border-b border-slate-50">
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-500 px-1 mb-1">
                    Tin chưa đọc
                  </p>
                  <ul className="space-y-0.5">
                    {unreadConversations.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setUserOpenedChat(true);
                            openChat(c.user, { expand: true });
                            markMessagesRead?.(c.id, meId);
                          }}
                          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-red-50 text-left transition-colors"
                        >
                          <span className="relative shrink-0">
                            <img
                              src={resolveAvatarUrl(c.user)}
                              alt=""
                              className={`w-9 h-9 rounded-full object-cover ${isRealAvatar(c.user?.avatar) ? 'cms-fm-avatar--photo' : ''}`}
                            />
                            <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-red-600 text-[9px] font-black text-white flex items-center justify-center ring-2 ring-white">
                              {c.unread > 99 ? '99+' : c.unread}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-slate-800 truncate">{c.user.name}</span>
                            <span className="block text-[11px] text-slate-500 truncate">{c.lastMessage}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {directory.groups.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-slate-400 font-medium">
                  <Circle size={28} className="mx-auto mb-2 text-slate-200" />
                  {canUseAiSupport ? 'Chưa có chuyên viên hỗ trợ online' : 'Chưa có ai đang online'}
                </div>
              ) : (
                directory.groups.map((group) => (
                  <div key={group.key} className="px-1 pb-2 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 px-1.5 mb-1">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {group.people.map((p) => {
                        const peerUnread = unreadByPeer.get(`${normalizeChatRole(p.role)}_${p.id}`) || 0;
                        const online = p.online !== false;
                        return (
                          <li key={`${p.role}_${p.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                if (isAiSupportPeer(p)) {
                                  handleOpenAiSupport();
                                } else {
                                  setUserOpenedChat(true);
                                  openChat(p, { expand: true });
                                }
                              }}
                              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-50 text-left transition-colors group"
                            >
                              <span className="relative shrink-0">
                                <img
                                  src={resolveAvatarUrl({ ...p, role: p.displayRole || p.role })}
                                  alt=""
                                  className={`w-10 h-10 rounded-full object-cover ring-1 ring-slate-200 ${isRealAvatar(p.avatar) ? 'cms-fm-avatar--photo' : ''}`}
                                />
                                <span
                                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-bold text-slate-800 truncate group-hover:text-red-600">
                                  {p.name}
                                </span>
                                <span className="block text-[11px] text-slate-500 font-medium">
                                  {ROLE_LABEL[p.adminRole] || ROLE_LABEL[p.displayRole] || ROLE_LABEL[p.role] || p.role}
                                  {' · '}
                                  {online ? 'Trực tuyến' : 'Ngoại tuyến'}
                                </span>
                              </span>
                              {peerUnread > 0 ? (
                                <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-red-600 text-[10px] font-black text-white flex items-center justify-center">
                                  {peerUnread > 99 ? '99+' : peerUnread}
                                </span>
                              ) : (
                                <MessageCircle size={14} className="text-slate-300 group-hover:text-red-500 shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {/* Chat-heads: mỗi người 1 vòng tròn; AI được đại diện bởi FAB riêng */}
        {heads.length > 0 && (
          <div className="cms-fm-heads">
            {heads.map((tab) => {
              const peerKey = `${normalizeChatRole(tab.user.role)}_${tab.user.id}`;
              return (
                <ChatHead
                  key={tab.id}
                  tab={tab}
                  unread={unreadByPeer.get(peerKey) || 0}
                  onOpen={handleFocus}
                  onClose={closeChat}
                />
              );
            })}
          </div>
        )}

        {/* FAB — HV/GV: mở Trợ lý AI trước; sau escalate mới mở danh bạ SUPPORT */}
        {!isInbox && !isSuper && (meRole === 'student' || meRole === 'teacher' || meRole === 'staff') && (
          <div className="relative flex items-center gap-2 group">
            {!fabExpanded && (
              <div
                onClick={handleSupportFabClick}
                className="cms-fm-fab-label hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md shadow-xl shadow-slate-900/10 cursor-pointer hover:scale-105 transition-all duration-200"
              >
                <span className="cms-fm-fab-label__border" aria-hidden="true" />
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="relative z-10 min-w-[132px] text-sm font-black text-slate-800 tracking-tight" aria-live="polite">
                  {fabLabel}
                  <span className="ml-0.5 inline-block w-0.5 h-4 align-[-2px] bg-red-500 animate-pulse" aria-hidden="true" />
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSupportFabClick}
              className={`cms-fm-fab cms-fm-fab--mascot ${fabExpanded ? 'is-expanded' : ''}`}
              title={fabExpanded ? 'Đóng' : (canUseAiSupport ? 'Mở Trợ lý AI' : 'Liên hệ Hỗ trợ viên')}
              aria-label={fabExpanded ? 'Đóng' : (canUseAiSupport ? 'Mở Trợ lý AI' : 'Mở Hỗ trợ viên')}
              aria-expanded={fabExpanded}
            >
              {fabExpanded ? (
                <X size={24} className="text-white shrink-0" />
              ) : (
                <div className="relative flex items-center justify-center w-full h-full overflow-visible">
                  <SupportMascot size={60} waving={true} className="cms-support-mascot--fab" />
                </div>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper: mở chat từ bất kỳ đâu (không cần hook) */
export function openSiteChat(person) {
  window.dispatchEvent(new CustomEvent('cms:open-chat', { detail: person }));
}
