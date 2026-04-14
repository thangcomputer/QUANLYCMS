import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageCircle, Send, X, Search, ChevronLeft,
  User, Circle, Image, Paperclip, Smile, Download,
  CheckCheck, Clock as ClockIcon, CheckCircle2, Users, Plus, Trash2, RotateCcw, MoreHorizontal, EyeOff, AlertCircle
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useData } from '../context/DataContext';
import { useLocation } from 'react-router-dom';
import { useToast } from '../utils/toast';
import { messagesAPI, SOCKET_BASE } from '../services/api';


// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatTime = (date) => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Vừa xong';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} phút`;
  if (diffMs < 86400000) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const roleBadge = (role) => {
  if (role === 'admin') return { text: 'ADMIN', color: 'bg-red-100 text-red-700' };
  if (role === 'teacher') return { text: 'GV', color: 'bg-blue-100 text-blue-700' };
  return { text: 'HV', color: 'bg-green-100 text-green-700' };
};

// ─── Reaction Picker (floating) ────────────────────────────────────────────────
const ReactionPicker = ({ msgId, isMine, onReact, myReactions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Đóng khi click ngoài
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
          className={`absolute bottom-full mb-2 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 bg-white rounded-full px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 z-[9999] animate-in zoom-in-75 duration-150`}
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

// ─── MAIN INBOX ──────────────────────────────────────────────────────────────
const Inbox = ({ currentUserId = 'admin', currentUserName = 'Admin', currentUserRole = 'admin', onNavigate }) => {
  const location = useLocation();
  const toast = useToast();
  const socketCtx = useSocket();
  const { sendMessage: socketSend, onlineUsers, joinGroupChat, onMessageReceive, onReactionReceive, onRecallReceive, onContactListUpdated } = socketCtx;
  const {
    getConversations, getMessages: ctxGetMessages, sendMessage: ctxSendMessage,
    markMessagesRead, syncMessages, recallMessage: ctxRecallMessage, createChatGroup, deleteChatGroup, groups,
    teachers, students, toggleMessageReaction: ctxToggleReaction,
    softDeleteMessage: ctxDeleteMessage
  } = useData();

  const dataContextConvs = getConversations(currentUserId);
  const [contacts, setContacts] = useState([]);
  const [hiddenList, setHiddenList] = useState([]);
  const [contactTab, setContactTab] = useState('all'); // 'all', 'student', 'teacher', 'admin', 'group'

  useEffect(() => {
    (async () => {
      try {
        const [res, hiddenRes] = await Promise.all([
          messagesAPI.getContacts(),
          messagesAPI.getHiddenConversations()
        ]);
        if (res?.success) setContacts(res.data);
        if (hiddenRes?.success) setHiddenList(hiddenRes.data);
      } catch (err) {}
    })();
  }, []);

  const refreshHiddenList = useCallback(async () => {
    try {
      const hiddenRes = await messagesAPI.getHiddenConversations();
      if (hiddenRes?.success) setHiddenList(hiddenRes.data);
    } catch (err) {}
  }, []);

  // 📡 Re-fetch danh bạ khi server thông báo CONTACT_LIST_UPDATED (sau xếp lớp)
  const refreshContacts = useCallback(async () => {
    try {
      const res = await messagesAPI.getContacts();
      if (res?.success) setContacts(res.data);
    } catch (err) {}
  }, []);

  useEffect(() => {
    if (!onContactListUpdated) return;
    const unsub = onContactListUpdated((payload) => {
      refreshContacts();
    });
    return unsub;
  }, [onContactListUpdated, refreshContacts]);

  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');

  const conversations = useMemo(() => {
    const list = [];
    contacts.forEach(c => {
      if (c.id === currentUserId) return;
      const existingConv = dataContextConvs.find(dc => !dc.isGroup && String(dc.user.id) === String(c.id));
      const convId = existingConv ? existingConv.id : [ `${currentUserRole}_${currentUserId}`, `${c.role}_${c.id}` ].sort().join('__');
      
      list.push({
        id: convId,
        isGroup: false,
        isHidden: hiddenList.includes(convId),
        user: { id: c.id, name: c.name, role: c.role, avatar: c.avatar, phone: c.phone || '', online: onlineUsers ? onlineUsers.some(u => u.userId === c.id) : false },
        lastMessage: existingConv?.lastMessage || 'Bắt đầu cuộc trò chuyện',
        lastTime: existingConv?.lastTime || new Date('2000-01-01'),
        unread: existingConv?.unread || 0,
      });
    });
    const groupConvs = dataContextConvs.filter(dc => dc.isGroup).map(dc => ({
      ...dc,
      isHidden: hiddenList.includes(dc.id)
    }));
    list.push(...groupConvs);

    return list.sort((a, b) => {
      // 1. Nếu đang chọn (Tin nhắn đang active), Ưu tiên đẩy lên đầu để dễ nhìn
      if (activeConv && a.id === activeConv.id) return -1;
      if (activeConv && b.id === activeConv.id) return 1;

      // 2. Sắp xếp thuần túy bằng thời gian tin nhắn gần nhất
      const timeA = new Date(a.lastTime).getTime();
      const timeB = new Date(b.lastTime).getTime();
      return timeB - timeA;
    });
  }, [contacts, dataContextConvs, hiddenList, currentUserRole, currentUserId, onlineUsers, activeConv]);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [groupToDelete, setGroupToDelete] = useState(null); // ID của nhóm cần xóa
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  // Trạng thái recall đang xử lý
  const [recallingId, setRecallingId] = useState(null);

  const EMOJIS = ['😊', '👍', '❤️', '👏', '🔥', '✅', '🆘', '📚', '💻', '💡'];

  // ─── Join groups ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeConv && activeConv.isGroup) {
      joinGroupChat(activeConv.user.id);
    }
  }, [activeConv, joinGroupChat]);

  useEffect(() => {
    if (groups && groups.length > 0) {
      groups.forEach(g => joinGroupChat(g._id));
    }
  }, [groups, joinGroupChat]);

  // ─── Sync messages khi mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentUserId && syncMessages) {
      syncMessages(currentUserId);
    }
  }, [currentUserId, syncMessages]);

  // ─── Load messages khi chọn conversation ─────────────────────────────────────
  useEffect(() => {
    if (activeConv) {
      const msgs = ctxGetMessages(activeConv.id);
      setMessages(msgs.map(m => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        senderRole: m.senderRole || (m.senderId === 'admin' ? 'admin' : activeConv.user.role),
        content: m.content,
        time: m.time,
        isRead: m.read,
        isRecalled: m.isRecalled || false,
        messageType: m.messageType || 'text',
        fileName: m.fileName,
        fileUrl: m.fileUrl,
        reactions: m.reactions || [],
      })));
      markMessagesRead(activeConv.id, currentUserId);
    }
  }, [activeConv, ctxGetMessages, markMessagesRead, currentUserId]);

  // ─── Socket real-time listeners ──────────────────────────────────────────────
  useEffect(() => {
    let unsubRecall, unsubReaction;


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
      
      if (unsubRecall) unsubRecall();
      if (unsubReaction) unsubReaction();
    };
  }, [activeConv, onMessageReceive, onRecallReceive, onReactionReceive]);

  // ─── Thu hồi tin nhắn ────────────────────────────────────────────────────────
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
  
  const handleDeleteHistory = useCallback(async (msgId) => {
    // Không cần window.confirm liên tục cho phiền, chỉ cần ẩn đi
    setShowMessageOptions(null);
    try {
      await ctxDeleteMessage(msgId);
      // DataContext setMessages will naturally pop it from UI
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
    setActiveConv(conv);
  };

  const handleSend = async () => {
    if (!newMsg.trim() || !activeConv) return;
    const msgData = {
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
      receiverId: activeConv.user.id,
      receiverName: activeConv.user.name,
      receiverRole: activeConv.user.role,
      content: newMsg.trim(),
      isGroup: activeConv.isGroup || false,
      groupId: activeConv.isGroup ? activeConv.user.id : null
    };
    await ctxSendMessage(msgData);
    setNewMsg('');
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

      const msgData = {
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        receiverId: activeConv.user.id,
        receiverName: activeConv.user.name,
        receiverRole: activeConv.user.role,
        content: isImage ? '[Hình ảnh]' : `Đã gửi tệp: ${file.name}`,
        messageType: isImage ? 'image' : 'file',
        fileUrl: uploadRes.url,
        fileName: file.name,
        isGroup: activeConv.isGroup || false,
        groupId: activeConv.isGroup ? activeConv.user.id : null
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleHideConversation = async (e, convId) => {
    e.stopPropagation();
    try {
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
    const isSearching = search.trim().length > 0;
    if (!isSearching && c.isHidden) return false;

    if (isSearching) {
      const searchStr = search.toLowerCase();
      const matchesName = c.user.name.toLowerCase().includes(searchStr);
      const phoneStr = (c.user.phone || '').replace(/\s+/g, '');
      const matchesPhone = phoneStr.includes(searchStr.replace(/\s+/g, ''));
      if (!matchesName && !matchesPhone) return false;
    }

    if (contactTab === 'all') return true;
    if (contactTab === 'group') return c.isGroup;
    return c.user.role === contactTab;
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  // Auto-select conversation từ navigation state
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    const selectId = location.state?.selectUserId;
    if (selectId && conversations.length > 0 && !hasAutoSelected.current) {
      const found = conversations.find(c => String(c.user.id) === String(selectId));
      if (found) {
        hasAutoSelected.current = true;
        selectConversation(found);
      }
    }
  }, [location.state?.selectUserId, conversations.length]);

  return (
    <div className="h-[calc(100vh-130px)] flex flex-col bg-gray-50 rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="pt-2"></div>

      {/* ═══════ MAIN AREA ═══════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Sidebar: Conversations ── */}
        <div className={`
          w-full md:w-[340px] lg:w-[380px] bg-white border-r border-gray-100 flex flex-col flex-shrink-0
          ${activeConv ? 'hidden md:flex' : 'flex'}
        `}>
          {/* Search & Add Group */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm kiếm danh bạ..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-bold text-slate-800"
                />
              </div>
              {currentUserRole !== 'student' && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="w-10 h-10 flex flex-shrink-0 items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors shadow-sm"
                  title="Tạo nhóm chat"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>

            {/* Hàng Tabs (Pills) Phân loại danh bạ */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'student', label: 'Học viên' },
                { id: 'teacher', label: 'Giảng viên' },
                { id: 'admin', label: 'Admin' },
                { id: 'group', label: 'Nhóm' }
              ].filter(tab => !(currentUserRole === 'student' && tab.id === 'student')).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setContactTab(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center
                    ${contactTab === tab.id 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-slate-100'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 py-3 bg-white space-y-1">
            {filteredConvs.map(conv => {
              const isGroup = !!(groups || []).find(g => g._id === conv.user.id);
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
                  className={`group w-full flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer ${
                    activeConv?.id === conv.id ? 'bg-[#F0F7FF] shadow-sm' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md relative z-10 ${
                      isGroup ? 'bg-indigo-500' : conv.user.role === 'admin' ? 'bg-red-500' : conv.user.role === 'teacher' ? 'bg-blue-600' : 'bg-green-600'
                    }`}>
                      {isGroup ? <Users size={18} /> : (conv.user.avatar || conv.user.name[0])}
                    </div>
                    {!isGroup && conv.user.online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white z-20" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0 pr-1">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <div className="flex items-center gap-1 min-w-0 pr-2">
                        <h4 className="font-extrabold text-[#1E293B] text-[13px] truncate">{conv.user.name}</h4>
                        {conv.user.phone && (
                          <a 
                            href={`https://zalo.me/${conv.user.phone.replace(/\s+/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:scale-110 transition-transform cursor-pointer flex-shrink-0"
                            title="Chat Zalo"
                          >
                            <span className="bg-[#0068FF] text-white text-[9px] font-black px-1.5 py-0.5 rounded-sm tracking-wide shadow-sm">Zalo</span>
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button 
                          onClick={(e) => handleHideConversation(e, conv.id)}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                          title="Ẩn cuộc trò chuyện"
                        >
                          <EyeOff size={14} />
                        </button>
                        <span className="text-[10px] text-gray-400 font-bold ml-1">{formatTime(conv.lastTime)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <p className={`text-[11px] truncate flex-1 font-bold ${conv.unread > 0 ? 'text-blue-600 border-l-[3px] border-blue-600 pl-1.5' : 'text-gray-400'}`}>
                        {conv.lastMessage || 'Bắt đầu trò chuyện...'}
                      </p>
                      {conv.unread > 0 && (
                        <div className="flex gap-1 items-center flex-shrink-0">
                          <span className="px-1.5 py-0.5 bg-red-500 rounded text-white text-[9px] font-black tracking-widest uppercase animate-pulse shadow-sm">
                            Mới
                          </span>
                          <span className="w-4 h-4 bg-blue-600 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                            {conv.unread}
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
                <div className="mt-8 flex gap-3 justify-center">
                   <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Kênh Admin</span>
                   <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Giảng viên</span>
                   <span className="px-3 py-1.5 bg-white rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 shadow-sm">Học viên</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="bg-white px-4 md:px-6 py-2.5 border-b border-gray-100 flex items-center justify-between shadow-sm flex-shrink-0">
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => setActiveConv(null)}
                    className="md:hidden p-1 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="relative">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      activeConv.isGroup ? 'bg-indigo-500' :
                      activeConv.user.role === 'admin' ? 'bg-red-500' : activeConv.user.role === 'teacher' ? 'bg-blue-500' : 'bg-green-500'
                    }`}>
                      {activeConv.isGroup ? <Users size={16} /> : (activeConv.user.avatar || activeConv.user.name[0])}
                    </div>
                    {!activeConv.isGroup && activeConv.user.online && (
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-800 text-xs md:text-sm">{activeConv.user.name}</p>
                      {activeConv.user.phone && (
                        <a 
                          href={`https://zalo.me/${activeConv.user.phone.replace(/\s+/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:scale-110 transition-transform cursor-pointer"
                          title="Chat Zalo"
                        >
                          <span className="bg-[#0068FF] text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm tracking-wide">Zalo</span>
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                      {activeConv.isGroup ? 'Nhóm trò chuyện' : activeConv.user.online ? (
                        <span className="text-green-600 font-black">● Online</span>
                      ) : 'Offline'}
                    </p>
                  </div>
                </div>
                {activeConv.isGroup && currentUserRole !== 'student' && (
                  <button
                    onClick={() => setGroupToDelete(activeConv.id.replace('group_', ''))}
                    className="flex shrink-0 items-center justify-center w-8 h-8 md:w-9 md:h-9 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                    title="Xóa nhóm vĩnh viễn"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 md:px-6 pt-6 pb-4 space-y-4 min-h-0 bg-[#F0F2F5]">
                {messages.map(msg => {
                  const isMine = msg.senderId === currentUserId;
                  const role = msg.senderRole;

                  let bubbleBg = isMine ? 'bg-[#0084FF] text-white' : 'bg-white text-gray-800';
                  if (!isMine) {
                    if (role === 'admin') bubbleBg = 'bg-[#FFF0F0] text-red-900 border border-red-100';
                    else if (role === 'teacher') bubbleBg = 'bg-[#F0F7FF] text-blue-900 border border-blue-100';
                    else if (role === 'student') bubbleBg = 'bg-[#F0FFF4] text-emerald-900 border border-emerald-100';
                  }

                  const heartCount = (msg.reactions || []).filter(r => r.type === 'heart').length;
                  const likeCount = (msg.reactions || []).filter(r => r.type === 'like').length;
                  const myReactions = (msg.reactions || []).filter(r => r.userId === currentUserId).map(r => r.type);

                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} group/msg relative`}>
                      <div className={`max-w-[85%] md:max-w-[70%] relative ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMine && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                             <p className="text-[10px] text-gray-500 font-black uppercase tracking-tight">{msg.senderName}</p>
                             <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase ${
                               role === 'admin' ? 'bg-red-500 text-white' :
                               role === 'teacher' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                             }`}>
                               {role === 'admin' ? 'Admin' : role === 'teacher' ? 'Giảng viên' : 'Học viên'}
                             </span>
                          </div>
                        )}

                        {/* Bubble + action buttons */}
                        <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>

                          {/* Thu hồi button — chỉ hiện khi là tin của mình và chưa thu hồi */}
                          {isMine && !msg.isRecalled && (
                            <button
                              onClick={() => handleRecall(msg.id)}
                              disabled={recallingId === msg.id}
                              className="opacity-0 group-hover/msg:opacity-100 w-7 h-7 flex items-center justify-center bg-white rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm border border-slate-100 active:scale-90 disabled:opacity-30"
                              title="Thu hồi tin nhắn"
                            >
                              {recallingId === msg.id
                                ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-500 rounded-full inline-block animate-spin" />
                                : <RotateCcw size={12} />
                              }
                            </button>
                          )}

                          {/* Reaction picker button */}
                          {!msg.isRecalled && (
                            <ReactionPicker
                              msgId={msg.id}
                              isMine={isMine}
                              onReact={handleReaction}
                              myReactions={myReactions}
                            />
                          )}
                          
                          {/* Options/Menu button for Soft Delete */}
                          <div className="relative">
                            <button
                              onClick={() => setShowMessageOptions(showMessageOptions === msg.id ? null : msg.id)}
                              className="opacity-0 group-hover/msg:opacity-100 w-7 h-7 flex items-center justify-center bg-white rounded-full text-gray-400 hover:text-slate-600 hover:bg-slate-100 transition-all shadow-sm border border-slate-100 active:scale-90"
                              title="Tùy chọn"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {showMessageOptions === msg.id && (
                              <div className="absolute bottom-full right-0 mb-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  onClick={() => handleDeleteHistory(msg.id)}
                                  className="flex items-center gap-2 whitespace-nowrap bg-white px-3 py-2 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-slate-100 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={12} /> Xóa lịch sử
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Message bubble */}
                          <div className={`relative px-4 py-2.5 rounded-[22px] text-[14px] leading-relaxed shadow-sm transition-all ${bubbleBg} ${
                            isMine ? 'rounded-tr-none' : 'rounded-tl-none'
                          }`}>
                            {msg.isRecalled ? (
                               <p className="italic text-gray-400 flex items-center gap-1.5 text-xs">
                                 <RotateCcw size={12} /> Tin nhắn đã được thu hồi
                               </p>
                            ) : (
                              <>
                                {msg.messageType === 'image' && msg.fileUrl ? (
                                  <img src={msg.fileUrl.startsWith('http') ? msg.fileUrl : `${SOCKET_BASE}${msg.fileUrl}`} alt={msg.fileName || 'Image'} className="max-w-full h-auto rounded-xl max-h-64 object-cover mb-1 border border-black/5" />
                                ) : msg.messageType === 'file' ? (
                                  <a href={msg.fileUrl.startsWith('http') ? msg.fileUrl : `${SOCKET_BASE}${msg.fileUrl}`} download={msg.fileName} className={`flex items-center gap-3 py-2 px-3 rounded-xl transition hover:opacity-80 ${isMine ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                    <div className={`p-2 rounded-lg ${isMine ? 'bg-white/20' : 'bg-blue-500 text-white'}`}>
                                      <Paperclip size={18} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-bold text-xs truncate max-w-[150px]">{msg.fileName}</span>
                                      <span className="text-[9px] uppercase font-black opacity-50">Tài liệu đính kèm</span>
                                    </div>
                                  </a>
                                ) : msg.content}
                              </>
                            )}

                            {/* Reaction badge */}
                            {!msg.isRecalled && (heartCount > 0 || likeCount > 0) && (
                              <div className={`absolute -bottom-3 ${isMine ? 'right-2' : 'left-2'} flex gap-0.5 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100`}>
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
                        </div>

                        {/* Time & read status */}
                        <div className={`flex items-center gap-1.5 mt-1.5 ${isMine ? 'justify-end' : ''}`}>
                          <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{formatTime(msg.time)}</span>
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
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="bg-white px-3 md:px-6 py-4 border-t border-gray-200 flex-shrink-0 relative z-10">
                {uploadError && (
                  <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{uploadError}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 relative max-w-4xl mx-auto">
                  <input type="file" ref={fileInputRef}  className="hidden" onChange={handleFileUpload} />
                  <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

                  <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Gửi ảnh (tối đa 5MB)"
                      >
                        {isUploading ? <span className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full inline-block animate-spin" /> : <Image size={20} />}
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Đính kèm tài liệu (tối đa 10MB)"
                      >
                        <Paperclip size={20} />
                      </button>
                  </div>

                  <div className="flex-1 relative">
                    {showEmojis && (
                      <div className="absolute bottom-full left-0 mb-3 bg-white p-2 rounded-2xl shadow-2xl border border-gray-100 flex gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
                        {EMOJIS.map(e => (
                          <button key={e} onClick={() => addEmoji(e)} className="text-xl hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                    <input
                      ref={inputRef}
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={handleKeyPress}
                      className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all pr-8"
                      placeholder="Nhập tin nhắn..."
                    />
                    <button
                      onClick={() => setShowEmojis(!showEmojis)}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 transition-colors ${showEmojis ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <Smile size={16} />
                    </button>
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!newMsg.trim()}
                    className="p-3.5 bg-gradient-to-br from-[#203DB5] to-[#1E3A8A] hover:bg-blue-800 text-white rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-900/20 active:scale-95"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-500">
              <div className="px-8 py-6 bg-gradient-to-br from-[#1E3A8A] to-[#1E293B] text-white flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <Users className="text-blue-300" />
                   <h3 className="font-extrabold text-xl tracking-tight uppercase">Tạo nhóm chat mới</h3>
                 </div>
                 <button onClick={() => setShowCreateGroup(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tên nhóm</label>
                   <input
                     type="text"
                     value={groupName}
                     onChange={e => setGroupName(e.target.value)}
                     placeholder="Ví dụ: Nhóm học Tiếng Anh Giao Tiếp..."
                     className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-800"
                   />
                </div>

                 <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Chọn thành viên</label>
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Tìm tên giáo viên hoặc học viên..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-300 focus:bg-white transition-all font-bold text-slate-700"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                     {contacts
                       .filter(u => u.id !== currentUserId && u.id !== 'admin')
                       .filter(u => !memberSearch || u.name.toLowerCase().includes(memberSearch.toLowerCase()))
                       .map(u => {
                         const isSelected = selectedParticipants.some(p => p.userId === u.id);
                         return (
                          <label key={u.id} className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer border transition-all group ${isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                             <div className="relative">
                               <input
                                 type="checkbox"
                                 className="w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                 checked={isSelected}
                                 onChange={(e) => {
                                   if (e.target.checked) setSelectedParticipants([...selectedParticipants, { userId: u.id, name: u.name, role: u.role }]);
                                   else setSelectedParticipants(selectedParticipants.filter(p => p.userId !== u.id));
                                 }}
                               />
                             </div>
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-sm ${
                               u.role === 'admin' ? 'bg-red-500' :
                               u.role === 'teacher' ? 'bg-blue-600' : 'bg-emerald-600'
                             }`}>
                               {u.name[0].toUpperCase()}
                             </div>
                             <div className="flex-1">
                                <p className="font-bold text-slate-800 text-sm leading-tight">{u.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{
                                  u.role === 'admin' ? 'Nhân viên / Admin' :
                                  u.role === 'teacher' ? 'Giảng viên' : 'Học viên'
                                }</p>
                             </div>
                          </label>
                         );
                       })}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setShowCreateGroup(false)}
                    className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button
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
                    className="flex-[2] py-4 px-6 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
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
    </div>
  );
};

export default Inbox;
