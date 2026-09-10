import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { playMessageSound, playNotifySound } from '../utils/sound';
import { getMessagingRole, isMessageFromSelf } from '../lib/messagingRoles';
import { API_BASE, SOCKET_BASE, apiFetch } from '../services/api';
import { isRetractedStudentScheduleNote } from '../components/teacher/TeacherStudentNoteModal';

const SocketContext = createContext(null);
const SOCKET_URL = SOCKET_BASE;

/** Refresh events owned by SocketProvider (must off by same reference). */
const DATA_REFRESH_EVENTS = [
  'schedule:new', 'schedule:updated', 'schedule:completed', 'schedule:cancelled',
  'assignment:new', 'assignment:graded', 'assignment:submitted', 'assignment:updated', 'assignment:deleted',
  'teacher:updated', 'exam:unlocked',
  'student:new', 'student:assigned', 'student:history_reset',
  'submission:new', 'submission:graded',
  'transactions:new', 'teacher:financeUpdated', 'tuition:paid', 'revenue:updated',
  'teacher:scored', 'teacher:approved', 'teacher:practical_submitted', 'teacher:rejected', 'teacher:new',
  'evaluation:admin_feedback', 'evaluation:teacher_rating',
];

export const SocketProvider = ({ userId, role, name, token, adminRole, children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [lastSeenUsers, setLastSeenUsers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);
  const messageCallbacksRef = useRef(new Set());
  const messageSentCallbacksRef = useRef(new Set());
  const reactionCallbacksRef = useRef(new Set());
  const recallCallbacksRef = useRef(new Set());
  const pinnedCallbacksRef = useRef(new Set());
  const groupNewCallbackRef = useRef(null);
  const groupDeleteCallbacksRef = useRef(new Set());
  const dataRefreshCallbacksRef = useRef(new Set());
  const contactListUpdatedCallbackRef = useRef(null);
  const readAckCallbackRef = useRef(new Set());
  const typingCallbacksRef = useRef(new Set());

  const onTypingChange = useCallback((callback) => {
    typingCallbacksRef.current.add(callback);
    return () => typingCallbacksRef.current.delete(callback);
  }, []);

  const emitTypingStart = useCallback((conversationId, userName) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:start', { conversationId, userName });
    }
  }, []);

  const emitTypingStop = useCallback((conversationId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:stop', { conversationId });
    }
  }, []);

  const emitMessageRead = useCallback((conversationId) => {
    if (socketRef.current?.connected && conversationId) {
      socketRef.current.emit('message:read', { conversationId });
    }
  }, []);

  const onMessageReceive = useCallback((callback) => {
    messageCallbacksRef.current.add(callback);
    return () => messageCallbacksRef.current.delete(callback);
  }, []);

  const onMessageSent = useCallback((callback) => {
    messageSentCallbacksRef.current.add(callback);
    return () => messageSentCallbacksRef.current.delete(callback);
  }, []);

  const onReactionReceive = useCallback((callback) => {
    reactionCallbacksRef.current.add(callback);
    return () => reactionCallbacksRef.current.delete(callback);
  }, []);

  const onRecallReceive = useCallback((callback) => {
    recallCallbacksRef.current.add(callback);
    return () => recallCallbacksRef.current.delete(callback);
  }, []);

  const onMessagePinned = useCallback((callback) => {
    pinnedCallbacksRef.current.add(callback);
    return () => pinnedCallbacksRef.current.delete(callback);
  }, []);

  const onGroupNew = useCallback((callback) => {
    groupNewCallbackRef.current = callback;
    return () => {
      if (groupNewCallbackRef.current === callback) groupNewCallbackRef.current = null;
    };
  }, []);

  const onGroupDelete = useCallback((callback) => {
    groupDeleteCallbacksRef.current.add(callback);
    return () => groupDeleteCallbacksRef.current.delete(callback);
  }, []);

  const onDataRefresh = useCallback((callback) => {
    dataRefreshCallbacksRef.current.add(callback);
    return () => dataRefreshCallbacksRef.current.delete(callback);
  }, []);

  const onContactListUpdated = useCallback((callback) => {
    contactListUpdatedCallbackRef.current = callback;
    return () => {
      if (contactListUpdatedCallbackRef.current === callback) {
        contactListUpdatedCallbackRef.current = null;
      }
    };
  }, []);

  const onReadAck = useCallback((callback) => {
    readAckCallbackRef.current.add(callback);
    return () => readAckCallbackRef.current.delete(callback);
  }, []);

  useEffect(() => {
    const resolveToken = () => {
      if (token) return token;
      for (const r of ['staff', 'admin', 'teacher', 'student']) {
        const direct = localStorage.getItem(`${r}_access_token`);
        if (direct) return direct;
        try {
          const u = JSON.parse(localStorage.getItem(`${r}_user`) || 'null');
          if (u?.accessToken || u?.token) return u.accessToken || u.token;
        } catch { /* noop */ }
      }
      return null;
    };

    const effectiveToken = resolveToken();
    const sessionUser = { id: userId, role, adminRole };

    const newSocket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.4,
      timeout: 20000,
      auth: { token: effectiveToken },
    });

    let refreshDebounceTimer = null;
    const triggerRefresh = (data) => {
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = setTimeout(() => {
        refreshDebounceTimer = null;
        dataRefreshCallbacksRef.current.forEach((cb) => cb(data));
      }, 320);
    };

    const pauseReconnectIfOffline = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        try { newSocket.io.opts.reconnection = false; } catch { /* ignore */ }
      }
    };
    const resumeReconnectIfOnline = () => {
      try {
        newSocket.io.opts.reconnection = true;
        if (!newSocket.connected) newSocket.connect();
      } catch { /* ignore */ }
    };

    const onBrowserOffline = () => {
      setIsConnected(false);
      pauseReconnectIfOffline();
      try {
        if (newSocket.connected) newSocket.disconnect();
      } catch { /* ignore */ }
    };
    const onBrowserOnline = () => {
      resumeReconnectIfOnline();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', onBrowserOffline);
      window.addEventListener('online', onBrowserOnline);
    }
    pauseReconnectIfOffline();

    const onConnect = () => {
      setIsConnected(true);
      if (userId) {
        const uRole = getMessagingRole(sessionUser);
        const resolvedId = String(userId);
        // Server presence chỉ nhận 'register' (không có handler 'user:join')
        newSocket.emit('register', {
          branchId: sessionUser?.branchId || null,
          branchCode: sessionUser?.branchCode || '',
        });
        // Giữ emit cũ phòng consumer khác (no-op trên server hiện tại)
        newSocket.emit('user:join', {
          userId: resolvedId,
          role: uRole,
          name: name || uRole,
          adminRole: adminRole || undefined,
        });
      }
    };

    const onConnectError = () => {
      setIsConnected(false);
      pauseReconnectIfOffline();
    };

    const onDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        newSocket.connect();
      }
    };

    const onUsersOnline = (users) => {
      const list = Array.isArray(users)
        ? users
        : (Array.isArray(users?.data) ? users.data : []);
      setOnlineUsers(list);
    };

    const onUsersLastSeen = (data) => {
      if (data && typeof data === 'object') {
        setLastSeenUsers((prev) => ({ ...prev, ...data }));
      }
    };

    const onMessageReceive = (message) => {
      if (isMessageFromSelf(message, sessionUser)) return;
      playMessageSound();
      messageCallbacksRef.current.forEach((cb) => cb(message));
    };

    const onMessageSentEvt = (message) => {
      messageSentCallbacksRef.current.forEach((cb) => cb(message));
    };

    const onMessageReaction = (data) => {
      reactionCallbacksRef.current.forEach((cb) => cb(data));
    };

    const onMessageRecall = (data) => {
      recallCallbacksRef.current.forEach((cb) => cb(data));
    };

    const onMessagePinnedEvt = (data) => {
      pinnedCallbacksRef.current.forEach((cb) => cb(data));
    };

    const onMessageReadAck = (data) => {
      readAckCallbackRef.current.forEach((cb) => cb(data));
    };

    const onTypingShow = (data) => {
      typingCallbacksRef.current.forEach((cb) => cb({ ...data, show: true }));
    };
    const onTypingHide = (data) => {
      typingCallbacksRef.current.forEach((cb) => cb({ ...data, show: false }));
    };

    const onGroupNewEvt = (data) => {
      if (groupNewCallbackRef.current) groupNewCallbackRef.current(data);
    };

    const onGroupDeleteEvt = (data) => {
      groupDeleteCallbacksRef.current.forEach((cb) => cb(data));
    };

    const ignoredAnyEvents = new Set([
      'connect',
      'disconnect',
      'users:online',
      'users:lastSeen',
      'message:read_ack',
      'message:receive',
      'message:sent',
      'message:reaction',
      'message:recall',
      'message:pinned',
      'group:deleted',
      'notification:removed',
    ]);
    const onAnyEvent = (eventName, payload) => {
      if (ignoredAnyEvents.has(eventName)) return;
      if (String(eventName || '').startsWith('message:')) return;
      triggerRefresh({ type: 'socket:any', eventName, payload });
    };

    const normalizeNotification = (data) => {
      const id = data?._id || data?.id || Date.now();
      return {
        ...data,
        id,
        read: Boolean(data?.read),
        message: data?.content || data?.message || '',
        time: data?.createdAt || data?.time || new Date(),
      };
    };

    const mergeNotifications = (current, incoming) => {
      const merged = new Map();
      [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]
        .filter(Boolean)
        .forEach((item) => {
          const normalized = normalizeNotification(item);
          const key = String(normalized.id || normalized._id || '');
          if (!key) return;
          merged.set(key, { ...(merged.get(key) || {}), ...normalized });
        });
      return [...merged.values()].sort(
        (a, b) => new Date(b.time || 0) - new Date(a.time || 0),
      );
    };

    const onReceiveNotification = (data) => {
      if (!data || typeof data !== 'object') return;
      playNotifySound();
      setNotifications((prev) => {
        return mergeNotifications(prev, [{ ...data, read: false }]);
      });
    };

    const onNewNotification = (notif) => {
      if (notif && typeof notif === 'object' && (notif._id || notif.id || notif.message || notif.content)) {
        playNotifySound();
        setNotifications((prev) => mergeNotifications(prev, [{ ...notif, read: false }]));
      } else if (userId) {
        apiFetch('/notifications/unread')
          .then((res) => res.json())
          .then((data) => {
            if (data?.success && Array.isArray(data.data)) {
              const incoming = data.data.filter(Boolean).map((n) => ({
                ...n,
                read: Array.isArray(n.read_by) && n.read_by.includes(String(userId)),
              }));
              setNotifications((prev) => mergeNotifications(prev, incoming));
            }
          })
          .catch((error) => {
            console.warn('[Socket] Cannot refresh notifications:', error);
          });
      }
    };

    const onNotificationRemoved = (data) => {
      setNotifications((prev) => (
        (Array.isArray(prev) ? prev.filter(Boolean) : []).filter((n) => !isRetractedStudentScheduleNote(n, data))
      ));
    };

    const onClassReminder = (reminder) => {
      if (!reminder || typeof reminder !== 'object') return;
      playNotifySound();
      setNotifications((prev) => [{
        id: Date.now(),
        type: 'reminder',
        title: reminder.title || 'Nhắc nhở lịch học',
        message: reminder.message || reminder.content || '',
        time: new Date(),
        read: false,
        priority: 'high',
      }, ...(Array.isArray(prev) ? prev.filter(Boolean) : [])]);
    };

    const onSystemReset = (data) => {
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('admin_user');
        localStorage.removeItem('teacher_user');
        localStorage.removeItem('student_user');
        sessionStorage.clear();
      } catch (e) {
        console.error('Lỗi khi xóa storage:', e);
      }
      alert(data?.message || 'Hệ thống đã được thiết lập lại từ Admin. Vui lòng đăng nhập lại!');
      window.location.href = '/login';
    };

    const onContactListUpdated = () => {
      if (contactListUpdatedCallbackRef.current) {
        contactListUpdatedCallbackRef.current();
      }
    };

    const onPaymentConfirmed = (data) => {
      triggerRefresh({ type: 'payment:confirmed', ...data });
    };

    newSocket.on('connect', onConnect);
    newSocket.on('connect_error', onConnectError);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('users:online', onUsersOnline);
    newSocket.on('users:lastSeen', onUsersLastSeen);
    newSocket.on('message:receive', onMessageReceive);
    newSocket.on('message:sent', onMessageSentEvt);
    newSocket.on('message:reaction', onMessageReaction);
    newSocket.on('message:recall', onMessageRecall);
    newSocket.on('message:pinned', onMessagePinnedEvt);
    newSocket.on('message:read_ack', onMessageReadAck);
    newSocket.on('typing:show', onTypingShow);
    newSocket.on('typing:hide', onTypingHide);
    newSocket.on('group:new', onGroupNewEvt);
    newSocket.on('group:deleted', onGroupDeleteEvt);
    newSocket.on('data:refresh', triggerRefresh);
    newSocket.on('student:updated', triggerRefresh);
    DATA_REFRESH_EVENTS.forEach((ev) => newSocket.on(ev, triggerRefresh));
    newSocket.onAny(onAnyEvent);
    newSocket.on('RECEIVE_NOTIFICATION', onReceiveNotification);
    newSocket.on('new-notification', onNewNotification);
    newSocket.on('notification:removed', onNotificationRemoved);
    newSocket.on('class:reminder', onClassReminder);
    newSocket.on('SYSTEM_RESET', onSystemReset);
    newSocket.on('CONTACT_LIST_UPDATED', onContactListUpdated);
    newSocket.on('payment:confirmed', onPaymentConfirmed);

    if (userId) {
      apiFetch('/notifications/unread')
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && Array.isArray(data.data)) {
            setNotifications(data.data.filter(Boolean).map((n) => ({
              ...n,
              id: n._id || n.id || Date.now(),
              read: Array.isArray(n.read_by) && n.read_by.includes(String(userId)),
              message: n.content || n.message || '',
              time: n.createdAt || n.time || new Date(),
            })));
          }
        })
        .catch(() => {});
    }

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', onBrowserOffline);
        window.removeEventListener('online', onBrowserOnline);
      }

      // Remove ONLY listeners owned by this effect (same function references).
      newSocket.off('connect', onConnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('users:online', onUsersOnline);
      newSocket.off('users:lastSeen', onUsersLastSeen);
      newSocket.off('message:receive', onMessageReceive);
      newSocket.off('message:sent', onMessageSentEvt);
      newSocket.off('message:reaction', onMessageReaction);
      newSocket.off('message:recall', onMessageRecall);
      newSocket.off('message:pinned', onMessagePinnedEvt);
      newSocket.off('message:read_ack', onMessageReadAck);
      newSocket.off('typing:show', onTypingShow);
      newSocket.off('typing:hide', onTypingHide);
      newSocket.off('group:new', onGroupNewEvt);
      newSocket.off('group:deleted', onGroupDeleteEvt);
      newSocket.off('data:refresh', triggerRefresh);
      newSocket.off('student:updated', triggerRefresh);
      DATA_REFRESH_EVENTS.forEach((ev) => newSocket.off(ev, triggerRefresh));
      newSocket.offAny(onAnyEvent);
      newSocket.off('RECEIVE_NOTIFICATION', onReceiveNotification);
      newSocket.off('new-notification', onNewNotification);
      newSocket.off('notification:removed', onNotificationRemoved);
      newSocket.off('class:reminder', onClassReminder);
      newSocket.off('SYSTEM_RESET', onSystemReset);
      newSocket.off('CONTACT_LIST_UPDATED', onContactListUpdated);
      newSocket.off('payment:confirmed', onPaymentConfirmed);

      if (socketRef.current === newSocket) socketRef.current = null;
      try { newSocket.io.opts.reconnection = false; } catch { /* ignore */ }
      try { newSocket.disconnect(); } catch { /* ignore */ }
    };
  }, [userId, role, name, token, adminRole]);

  const sendMessage = useCallback((messageData) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:send', messageData);
    }
  }, []);

  const markRead = useCallback((notificationId) => {
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
    if (userId) {
      apiFetch(`/notifications/${notificationId}/read`, { method: 'PUT' }).catch(() => {});
    }
  }, [userId]);

  const clearNotification = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  const joinGroupChat = useCallback((groupId) => {
    if (socketRef.current?.connected && groupId) {
      socketRef.current.emit('group:join', { groupId });
    }
  }, []);

  const value = {
    socket,
    isConnected,
    onlineUsers,
    lastSeenUsers,
    notifications,
    sendMessage,
    markRead,
    clearNotification,
    setNotifications,
    onMessageReceive,
    onMessageSent,
    onReactionReceive,
    onRecallReceive,
    onMessagePinned,
    onGroupNew,
    onGroupDelete,
    onDataRefresh,
    onContactListUpdated,
    onReadAck,
    onTypingChange,
    emitTypingStart,
    emitTypingStop,
    emitMessageRead,
    joinGroupChat,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    return {
      socket: null,
      isConnected: false,
      onlineUsers: [],
      notifications: [],
      sendMessage: () => {},
      markRead: () => {},
      clearNotification: () => {},
      setNotifications: () => {},
      onMessageReceive: () => () => {},
      onMessageSent: () => () => {},
      onReactionReceive: () => () => {},
      onRecallReceive: () => () => {},
      onMessagePinned: () => () => {},
      onGroupNew: () => () => {},
      onGroupDelete: () => () => {},
      onDataRefresh: () => () => {},
      emitMessageRead: () => {},
    };
  }
  return ctx;
};

export default SocketContext;
