import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { buildConversationId, normalizeChatRole } from '../utils/chatConversationId';
import { messagesAPI } from '../services/api';
import {
  resolveMessagingDeepLink,
  existingPeerIdsFromConversations,
} from '../utils/messagingDeepLink';

const FloatingMessengerContext = createContext(null);

/** Số chat-head tối đa (kiểu Messenger) */
const MAX_OPEN_CHATS = 6;
const STORAGE_KEY = 'cms_floating_messenger_v2';

function ensureExclusiveExpand(tabs, activeId) {
  const list = Array.isArray(tabs) ? tabs.slice(0, MAX_OPEN_CHATS) : [];
  if (!list.length) return list;
  const openId = activeId && list.some((t) => t.id === activeId)
    ? activeId
    : list.find((t) => !t.minimized)?.id || null;
  return list.map((t) => ({
    ...t,
    minimized: !openId || t.id !== openId,
  }));
}

function loadPersisted(currentUserId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      || localStorage.getItem('cms_floating_messenger_v1');
    if (!raw) return { supportOpen: false, tabs: [], activeTabId: null };
    const parsed = JSON.parse(raw);
    // Clear tabs khi đổi tài khoản (userId khác) để tránh tích lũy chat-heads cũ
    if (currentUserId && parsed.savedUserId && parsed.savedUserId !== String(currentUserId)) {
      return { supportOpen: false, tabs: [], activeTabId: null };
    }
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.slice(0, MAX_OPEN_CHATS) : [];
    const activeTabId = parsed.activeTabId
      || tabs.find((t) => !t.minimized)?.id
      || null;
    return {
      // Mặc định đóng panel hỗ trợ — chat heads độc lập
      supportOpen: parsed.supportOpen === true,
      tabs: ensureExclusiveExpand(tabs, activeTabId),
      activeTabId,
    };
  } catch {
    return { supportOpen: false, tabs: [], activeTabId: null };
  }
}

export function FloatingMessengerProvider({ children, currentUserId, currentUserRole, getConversations }) {
  const initial = loadPersisted(currentUserId);
  const [supportOpen, setSupportOpen] = useState(initial.supportOpen);
  const [tabs, setTabs] = useState(initial.tabs);
  const [activeTabId, setActiveTabId] = useState(initial.activeTabId);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        supportOpen,
        activeTabId,
        savedUserId: currentUserId || null, // Lưu userId để detect đổi tài khoản
        tabs: tabs.map((t) => ({
          id: t.id,
          user: t.user,
          minimized: !!t.minimized,
        })),
      }));
    } catch { /* ignore */ }
  }, [supportOpen, tabs, activeTabId, currentUserId]);

  /**
   * @param {object} person
   * @param {{ expand?: boolean }} [opts] expand=false → chỉ tạo/cập nhật chat-head (tin đến)
   */
  const openChat = useCallback((person, opts = {}) => {
    if (!person?.id || !currentUserId) return null;
    const expand = opts.expand !== false;
    const isGroup = Boolean(person.isGroup || person.groupId || person.conversationId?.startsWith('group_'));
    const role = normalizeChatRole(person.role || 'admin');
    const myRole = normalizeChatRole(currentUserRole || 'student');
    const convId = isGroup
      ? String(person.conversationId || `group_${person.groupId || person.id}`)
      : buildConversationId(myRole, currentUserId, role, person.id);
    const user = {
      id: String(person.id),
      name: person.name || (role === 'admin' ? 'Admin' : 'Giảng viên'),
      role: isGroup ? 'group' : role,
      isGroup,
      groupId: isGroup ? String(person.groupId || person.id) : null,
      participants: isGroup
        ? (person.participants || person.user?.participants || [])
        : undefined,
      adminRole: person.adminRole || person.user?.adminRole || null,
      gender: person.gender || person.user?.gender || '',
      avatar: person.avatar || person.user?.avatar || '',
    };

    setTabs((prev) => {
      const existing = prev.find((t) => t.id === convId);
      if (existing) {
        if (!expand) {
          // Giữ nguyên cửa sổ đang mở; chỉ cập nhật avatar/tên
          return prev.map((t) => (t.id === convId ? { ...t, user } : t));
        }
        // Mở hội thoại này → mọi người khác thu thành head tròn
        return prev.map((t) => (
          t.id === convId
            ? { ...t, minimized: false, user }
            : { ...t, minimized: true }
        ));
      }
      const head = { id: convId, user, minimized: !expand };
      const rest = expand
        ? prev.map((t) => ({ ...t, minimized: true }))
        : prev;
      return [head, ...rest].slice(0, MAX_OPEN_CHATS);
    });

    if (expand) {
      setActiveTabId(convId);
      setSupportOpen(false); // tách panel hỗ trợ khỏi cửa sổ chat
    }
    return convId;
  }, [currentUserId, currentUserRole]);

  const closeChat = useCallback((convId) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== convId);
      setActiveTabId((cur) => {
        if (cur !== convId) return cur;
        const open = next.find((t) => !t.minimized);
        return open?.id || null;
      });
      return next;
    });
  }, []);

  /** Thu cửa sổ đang mở thành chat-head */
  const minimizeChat = useCallback((convId) => {
    setTabs((prev) => prev.map((t) => (
      t.id === convId ? { ...t, minimized: true } : t
    )));
    setActiveTabId((cur) => (cur === convId ? null : cur));
  }, []);

  /** Click head → mở cửa sổ; người trước đó trở lại head tròn */
  const focusChat = useCallback((convId) => {
    setActiveTabId(convId);
    setSupportOpen(false);
    setTabs((prev) => prev.map((t) => (
      t.id === convId
        ? { ...t, minimized: false }
        : { ...t, minimized: true }
    )));
  }, []);

  useEffect(() => {
    const onOpen = async (e) => {
      const d = e?.detail;
      if (!d?.id || !currentUserId) return;
      const peerId = String(d.id);

      // Reopen existing floating tab always OK
      if (tabsRef.current.some((t) => String(t.user?.id) === peerId)) {
        openChat(d, { expand: true });
        return;
      }

      // Existing conversation activity (Case A) — not discovery
      const convs = typeof getConversations === 'function'
        ? (getConversations(currentUserId) || [])
        : [];
      const existingPeerIds = existingPeerIdsFromConversations(convs);
      if (existingPeerIds.includes(peerId)) {
        openChat(d, { expand: true });
        return;
      }

      // Trusted deep-link from assigned-student UI (server still gates send)
      if (d.trusted) {
        openChat(d, { expand: true });
        return;
      }

      // New conversation UX requires server-authorized contact (Case B)
      try {
        const res = await messagesAPI.getContacts();
        const contacts = res?.success && Array.isArray(res.data) ? res.data : [];
        const gate = resolveMessagingDeepLink({ peerId, contacts, existingPeerIds });
        if (gate.allowed) openChat(d, { expand: true });
      } catch {
        /* blocked — empty contacts / network */
      }
    };
    window.addEventListener('cms:open-chat', onOpen);
    return () => window.removeEventListener('cms:open-chat', onOpen);
  }, [openChat, currentUserId, getConversations]);

  const value = useMemo(() => ({
    supportOpen,
    setSupportOpen,
    tabs,
    activeTabId,
    openChat,
    closeChat,
    minimizeChat,
    focusChat,
  }), [supportOpen, tabs, activeTabId, openChat, closeChat, minimizeChat, focusChat]);

  return (
    <FloatingMessengerContext.Provider value={value}>
      {children}
    </FloatingMessengerContext.Provider>
  );
}

export function useFloatingMessenger() {
  const ctx = useContext(FloatingMessengerContext);
  if (!ctx) {
    return {
      supportOpen: false,
      setSupportOpen: () => {},
      tabs: [],
      activeTabId: null,
      openChat: () => null,
      closeChat: () => {},
      minimizeChat: () => {},
      focusChat: () => {},
    };
  }
  return ctx;
}
