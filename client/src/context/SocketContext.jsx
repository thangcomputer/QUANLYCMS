import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { playMessageSound, playNotifySound } from '../utils/sound';

const SocketContext = createContext(null);

import { API_BASE, SOCKET_BASE, apiFetch } from '../services/api';

const SOCKET_URL = SOCKET_BASE;

export const SocketProvider = ({ userId, role, name, children }) => {
  const [socket, setSocket]             = useState(null);
  const [isConnected, setIsConnected]   = useState(false);
  const [onlineUsers, setOnlineUsers]   = useState([]);
  const [lastSeenUsers, setLastSeenUsers] = useState({}); // { userId: ISOString }
  const [notifications, setNotifications] = useState([]);
  const socketRef = useRef(null);
  const messageCallbacksRef = useRef(new Set());
  const reactionCallbacksRef = useRef(new Set());
  const recallCallbacksRef = useRef(new Set());
  const groupNewCallbackRef = useRef(null);
  const dataRefreshCallbackRef = useRef(null);
  const contactListUpdatedCallbackRef = useRef(null); // CONTACT_LIST_UPDATED

  // Đăng ký callback nhận tin nhắn real-time
  const onMessageReceive = useCallback((callback) => {
    messageCallbacksRef.current.add(callback);
    return () => messageCallbacksRef.current.delete(callback);
  }, []);

  // Đăng ký callback nhận reaction
  const onReactionReceive = useCallback((callback) => {
    reactionCallbacksRef.current.add(callback);
    return () => reactionCallbacksRef.current.delete(callback);
  }, []);

  // Đăng ký callback nhận thu hồi tin nhắn
  const onRecallReceive = useCallback((callback) => {
    recallCallbacksRef.current.add(callback);
    return () => recallCallbacksRef.current.delete(callback);
  }, []);

  // Đăng ký callback khi có nhóm mới
  const onGroupNew = useCallback((callback) => {
    groupNewCallbackRef.current = callback;
  }, []);

  // Đăng ký callback khi cần refresh data (ví dụ assign teacher)
  const onDataRefresh = useCallback((callback) => {
    dataRefreshCallbackRef.current = callback;
  }, []);

  // Đăng ký callback khi danh bạ cần cập nhật (CONTACT_LIST_UPDATED)
  const onContactListUpdated = useCallback((callback) => {
    contactListUpdatedCallbackRef.current = callback;
    return () => { contactListUpdatedCallbackRef.current = null; };
  }, []);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);

      // Đăng ký user
      if (userId && role && name) {
        newSocket.emit('register', { userId, role, name });
      }
    });

    if (userId) {
      // API call to fetch existing unread notifications when initialized/refreshed
      apiFetch('/notifications/unread')
        .then(res => res.json())
        .then(data => {
           if (data.success && data.data) {
             setNotifications(data.data.map(n => ({ 
               ...n, 
               id: n._id, 
               read: Array.isArray(n.read_by) && n.read_by.includes(String(userId)),
               message: n.content || n.message,
               time: n.createdAt || n.time 
             })));
           }
        })
        .catch(err => void 0);
    }

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Danh sách online
    newSocket.on('users:online', (users) => {
      setOnlineUsers(users);
    });

    // Lịch sử lastSeen
    newSocket.on('users:lastSeen', (map) => {
      setLastSeenUsers(prev => ({ ...prev, ...map }));
    });

    // Nhận tin nhắn real-time từ người khác
    newSocket.on('message:receive', (data) => {
      playMessageSound();
      messageCallbacksRef.current.forEach(cb => cb(data));
    });

    // Nhận reaction real-time
    newSocket.on('message:reaction', (data) => {
      reactionCallbacksRef.current.forEach(cb => cb(data));
    });

    // Nhận sự kiện thu hồi tin nhắn
    newSocket.on('message:recall', (data) => {
      recallCallbacksRef.current.forEach(cb => cb(data));
    });

    // Nhận sự kiện nhóm mới
    newSocket.on('group:new', (data) => {
      if (groupNewCallbackRef.current) {
        groupNewCallbackRef.current(data);
      }
    });

    // Gọi refresh data khi có thay đổi từ server (phổ biến)
    newSocket.on('data:refresh', (data) => {
      if (dataRefreshCallbackRef.current) {
        dataRefreshCallbackRef.current(data);
      }
    });

    newSocket.on('student:updated', (data) => {
      if (dataRefreshCallbackRef.current) {
        dataRefreshCallbackRef.current(data);
      }
    });

    // Centralized Notification Event
    newSocket.on('RECEIVE_NOTIFICATION', (data) => {
      playNotifySound();
      setNotifications(prev => [{ ...data, id: data._id || Date.now(), read: false }, ...prev]);
    });

    // Nhắc lịch tự động
    newSocket.on('class:reminder', (data) => {
      playNotifySound();
      setNotifications(prev => [{
        id: Date.now(), read: false, type: 'reminder',
        ...data,
      }, ...prev]);
    });

    // Bắt event dọn dẹp hệ thống
    newSocket.on('SYSTEM_RESET', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login?msg=system_cleared';
    });

    // 📡 Danh bạ cần reload (sau khi xếp lớp real-time)
    newSocket.on('CONTACT_LIST_UPDATED', (data) => {
      if (contactListUpdatedCallbackRef.current) {
        contactListUpdatedCallbackRef.current(data);
      }
    });

    // Thông báo chuyển tiền
    newSocket.on('payment:confirmed', (data) => {
      playNotifySound();
      setNotifications(prev => [{
        id: Date.now(), read: false, type: 'payment',
        ...data,
      }, ...prev]);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [userId, role, name]);

  // Gửi tin nhắn
  const sendMessage = useCallback((data) => {
    if (socketRef.current) {
      socketRef.current.emit('message:send', data);
    }
  }, []);

  // Đánh dấu đã đọc
  const markRead = useCallback((conversationId) => {
    if (socketRef.current) {
      socketRef.current.emit('message:read', { conversationId, readerId: userId });
    }
  }, [userId]);

  // Xoá notification
  const clearNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Tham gia nhóm
  const joinGroupChat = useCallback((groupId) => {
    if (socketRef.current) {
      socketRef.current.emit('group:join', groupId);
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
    onReactionReceive,
    onRecallReceive,
    onGroupNew,
    onDataRefresh,
    onContactListUpdated,
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
    // Return safe defaults when not wrapped in provider
    return {
      socket: null,
      isConnected: false,
      onlineUsers: [],
      notifications: [],
      sendMessage: () => {},
      markRead: () => {},
      clearNotification: () => {},
      setNotifications: () => {},
      onMessageReceive: () => {},
      onReactionReceive: () => {},
      onDataRefresh: () => {},
    };
  }
  return ctx;
};

export default SocketContext;
