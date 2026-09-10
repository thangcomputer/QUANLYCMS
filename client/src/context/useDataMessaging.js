import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';
import { buildConversationId } from '../utils/chatConversationId';
import { useSocket } from './SocketContext';
import { loadState } from './dataStorage';
import { getMessagingRole } from '../lib/messagingRoles';
import { resolveMessagingActor, normalizeMessage } from '../lib/messagingIdentity';
import { sortConversationsByLastMessageAt } from '../lib/conversationList';
import { isAiSupportConversationId } from '../utils/aiSupport';

/** Tin người thật chưa đọc — bỏ hệ thống / AI / thu hồi (khớp badge “cần xử lý”). */
function countsAsHumanUnread(msg, viewerId) {
  if (!msg) return false;
  if (msg.read === true) return false;
  if (msg.isRecalled) return false;
  const sid = String(msg.senderId || '');
  if (!sid || sid === String(viewerId)) return false;
  if (sid === 'ai_support') return false;
  if (String(msg.messageType || 'text') === 'system') return false;
  const conv = String(msg.convId || msg.conversationId || '');
  if (isAiSupportConversationId(conv)) return false;
  return true;
}

/**
 * Messages / groups state, socket listeners, and messaging API for DataProvider.
 */
export function useDataMessaging({ currentUser, students, teachers, staffs, triggerBackgroundSync }) {
  const [messages, setMessages] = useState(() => loadState('thvp_messages', []));
  const [groups, setGroups] = useState(() => loadState('thvp_groups', []));

  const {
    onGroupNew, onGroupDelete, onRecallReceive, onReactionReceive, onMessageReceive, onMessageSent, onReadAck, onMessagePinned,
    emitMessageRead,
  } = useSocket();

  // Strip null entries that may exist in legacy localStorage caches
  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.filter(Boolean);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const upsertServerMessage = useCallback((data) => {
    if (!data?._id && !data?.id) return;
    const serverId = String(data._id || data.id);
    setMessages((prev) => {
      if (prev.some((m) => String(m.id) === serverId)) {
        // Already present (other tab / prior HTTP) — drop matching temp only
        return prev.filter((m) => !(String(m.id).startsWith('temp_')
          && String(m.convId) === String(data.conversationId)
          && String(m.content || '') === String(data.content || '')
          && String(m.messageType || 'text') === String(data.messageType || 'text')
          && String(m.fileUrl || '') === String(data.fileUrl || '')));
      }

      const n = normalizeMessage(data);
      const isGrp = Boolean(
        n.isGroup
        || data.isGroup
        || (n.conversationId && String(n.conversationId).startsWith('group_'))
        || n.groupId
        || data.groupId
      );
      const gId = isGrp
        ? String(n.groupId || data.groupId || (String(n.conversationId || '').startsWith('group_') ? String(n.conversationId).slice(6) : '') || '') || null
        : null;
      const convId = isGrp && gId ? `group_${gId}` : n.conversationId;
      const mappedMsg = {
        id: n.id,
        convId,
        conversationId: convId,
        senderId: n.senderId,
        senderName: n.senderName,
        senderRole: n.senderRole,
        senderAvatar: n.senderAvatar,
        sender: n.sender,
        receiverId: n.receiverId,
        receiverName: n.receiverName,
        receiverRole: n.receiverRole,
        receiverAvatar: n.receiverAvatar,
        receiver: n.receiver,
        content: n.content,
        time: n.time instanceof Date ? n.time : new Date(n.time || Date.now()),
        read: n.read,
        isGroup: isGrp,
        groupId: gId,
        isRecalled: n.isRecalled,
              isPinned: n.isPinned,
        messageType: n.messageType,
        fileName: n.fileName,
        fileUrl: n.fileUrl,
        fileExpired: n.fileExpired,
        aiImageRemaining: n.aiImageRemaining,
        reactions: n.reactions,
      };

      const tempIdx = prev.findIndex(
        (m) =>
          String(m.id).startsWith('temp_') &&
          String(m.convId) === String(data.conversationId) &&
          String(m.content || '') === String(data.content || '') &&
          String(m.messageType || 'text') === String(data.messageType || 'text') &&
          String(m.fileUrl || '') === String(data.fileUrl || '') &&
          String(m.fileName || '') === String(data.fileName || ''),
      );
      if (tempIdx !== -1) {
        const updated = [...prev];
        updated[tempIdx] = mappedMsg;
        return updated;
      }
      return [...prev, mappedMsg];
    });
  }, []);

  useEffect(() => {
    let unsubGroup, unsubRecall, unsubMsg, unsubSent;

    if (onGroupNew) {
      unsubGroup = onGroupNew((newGroup) => {
        setGroups((prev) => {
          if (prev.some((g) => g._id === newGroup._id)) return prev;
          return [newGroup, ...prev];
        });
      });
    }

    if (onRecallReceive) {
      unsubRecall = onRecallReceive((data) => {
        setMessages((prev) => prev.map((m) =>
          (String(m.id || m._id) === String(data.messageId) || String(m.id) === String(data.messageId))
            ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' } : m
        ));
      });
    }

    let unsubReaction;
    if (onReactionReceive) {
      unsubReaction = onReactionReceive((data) => {
        setMessages((prev) => prev.map((m) =>
          String(m.id) === String(data.messageId) ? { ...m, reactions: data.reactions } : m
        ));
      });
    }

    if (onMessageReceive) {
      unsubMsg = onMessageReceive((data) => upsertServerMessage(data));
    }
    if (onMessageSent) {
      // Multi-tab same sender: message:sent carries persisted _id
      unsubSent = onMessageSent((data) => upsertServerMessage(data));
    }

    let unsubRead;
    if (onReadAck) {
      unsubRead = onReadAck((data) => {
        const convId = data?.conversationId;
        if (!convId) return;
        setMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (String(m.convId) !== String(convId) || m.read === true) return m;
            changed = true;
            return { ...m, read: true };
          });
          return changed ? next : prev;
        });
      });
    }

    let unsubPinned;
    if (onMessagePinned) {
      unsubPinned = onMessagePinned((data) => {
        setMessages((prev) => prev.map((m) => {
          if (String(m.id || m._id) === String(data.messageId)) {
            return { ...m, isPinned: Boolean(data.isPinned) };
          }
          if (data.isPinned && String(m.convId) === String(data.conversationId) && m.isPinned) {
            return { ...m, isPinned: false };
          }
          return m;
        }));
      });
    }

    let unsubGroupDelete;
    if (onGroupDelete) {
      unsubGroupDelete = onGroupDelete((data) => {
        const deletedGroupId = String(data?.groupId || '');
        if (!deletedGroupId) return;
        setGroups((prev) => (Array.isArray(prev) ? prev.filter((g) => String(g._id || g.id) !== deletedGroupId) : []));
        setMessages((prev) => (Array.isArray(prev) ? prev.filter((m) => String(m.convId) !== `group_${deletedGroupId}`) : []));
        triggerBackgroundSync();
      });
    }

    return () => {
      if (unsubGroup) unsubGroup();
      if (unsubGroupDelete) unsubGroupDelete();
      if (unsubRecall) unsubRecall();
      if (unsubReaction) unsubReaction();
      if (unsubMsg) unsubMsg();
      if (unsubSent) unsubSent();
      if (unsubRead) unsubRead();
      if (unsubPinned) unsubPinned();
    };
  }, [onGroupNew, onGroupDelete, onRecallReceive, onMessageReceive, onMessageSent, onReactionReceive, onReadAck, onMessagePinned, upsertServerMessage, currentUser, triggerBackgroundSync]);

  useEffect(() => {
    try {
      const capped = messages.length > 2000 ? messages.slice(-2000) : messages;
      localStorage.setItem('thvp_messages', JSON.stringify(capped));
    } catch { /* localStorage quota exceeded — ignore */ }
  }, [messages]);
  useEffect(() => { localStorage.setItem('thvp_groups', JSON.stringify(groups)); }, [groups]);

  // Gửi tin nhắn qua API → lưu MongoDB → phát Socket.io
  const sendMessage = useCallback(async (msg) => {
    const tempId = `temp_${Date.now()}`;
    const inferredGroup = Boolean(
      msg.isGroup
      || msg.groupId
      || String(msg.conversationId || '').startsWith('group_')
      || String(msg.receiverRole || '').toLowerCase() === 'group'
    );
    const groupId = inferredGroup
      ? String(
        msg.groupId
        || (String(msg.conversationId || '').startsWith('group_') ? String(msg.conversationId).slice(6) : '')
        || msg.receiverId
        || ''
      ) || null
      : null;
    const convId = inferredGroup && groupId
      ? `group_${groupId}`
      : (msg.conversationId || buildConversationId(msg.senderRole, msg.senderId, msg.receiverRole, msg.receiverId));
    const newMsg = {
      id: tempId,
      convId,
      conversationId: convId,
      isGroup: inferredGroup,
      groupId: inferredGroup ? groupId : null,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      receiverId: msg.receiverId,
      receiverName: msg.receiverName,
      receiverRole: inferredGroup ? 'group' : msg.receiverRole,
      content: msg.content,
      messageType: msg.messageType || 'text',
      fileUrl: msg.fileUrl || '',
      fileName: msg.fileName || '',
      time: new Date(),
      read: false,
      isRecalled: false,
      reactions: [],
      payload: msg.payload && typeof msg.payload === 'object' ? msg.payload : null,
    };
    setMessages(prev => [...prev, newMsg]);

    // Gửi lên backend lưu vào MongoDB → thay tempId bằng _id thật
    try {
      const res = await api.messages.send({
        conversationId: convId,
        senderId: String(msg.senderId),
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        receiverId: String(inferredGroup && groupId ? groupId : msg.receiverId),
        receiverName: msg.receiverName,
        receiverRole: inferredGroup ? 'group' : msg.receiverRole,
        content: msg.content,
        messageType: msg.messageType || 'text',
        fileUrl: msg.fileUrl || '',
        fileName: msg.fileName || '',
        isGroup: inferredGroup,
        groupId: inferredGroup ? groupId : null,
        payload: msg.payload && typeof msg.payload === 'object' ? msg.payload : undefined,
      });
      if (res?.success && res?.data?._id) {
        const d = res.data;
        const n = normalizeMessage(d);
        const savedIsGroup = Boolean(
          n.isGroup || d.isGroup || (n.conversationId && String(n.conversationId).startsWith('group_')) || n.groupId || d.groupId
        );
        const savedGroupId = savedIsGroup
          ? String(n.groupId || d.groupId || (String(n.conversationId || '').startsWith('group_') ? String(n.conversationId).slice(6) : groupId) || '') || null
          : null;
        const savedConvId = savedIsGroup && savedGroupId
          ? `group_${savedGroupId}`
          : (n.conversationId || convId);
        setMessages((prev) => {
          // Primary dedupe key: server _id (HTTP + socket race)
          if (prev.some((m) => String(m.id) === String(d._id))) {
            return prev.filter((m) => m.id !== tempId);
          }
          const merged = prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: n.id,
                  convId: savedConvId,
                  conversationId: savedConvId,
                  isGroup: savedIsGroup,
                  groupId: savedIsGroup ? savedGroupId : null,
                  senderId: n.senderId,
                  senderName: n.senderName,
                  senderRole: n.senderRole,
                  senderAvatar: n.senderAvatar,
                  sender: n.sender,
                  receiverId: n.receiverId,
                  receiverName: n.receiverName,
                  receiverRole: n.receiverRole,
                  receiverAvatar: n.receiverAvatar,
                  receiver: n.receiver,
                  content: n.content,
                  messageType: n.messageType || m.messageType,
                  fileUrl: n.fileUrl || m.fileUrl,
                  fileName: n.fileName || m.fileName,
                  payload: n.payload != null ? n.payload : m.payload,
                  aiImageRemaining: n.aiImageRemaining ?? m.aiImageRemaining,
                  time: n.time instanceof Date ? n.time : new Date(n.time || m.time),
                  read: n.read ?? m.read,
                }
              : m
          );
          const seen = new Set();
          return merged.filter((m) => {
            const id = String(m.id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });
        return {
          ...newMsg,
          id: res.data._id,
          convId: savedConvId,
          isGroup: savedIsGroup,
          groupId: savedIsGroup ? savedGroupId : null,
          aiImageRemaining: n.aiImageRemaining,
        };
      }
    } catch (err) {
      const failMsg = err?.message || 'Gửi tin nhắn thất bại';
      setMessages((prev) => prev.map((m) => (
        m.id === tempId
          ? { ...m, failed: true, failReason: failMsg, code: err?.code || err?.data?.code }
          : m
      )));
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('cms:toast', {
            detail: { type: 'error', message: failMsg },
          }));
        } catch { /* ignore */ }
      }
      return { ...newMsg, failed: true, failReason: failMsg };
    }
    return newMsg;
  }, []);

  const syncMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const json = await api.messages.syncByUser(userId);
      if (json.success) {
        const syncedMsgs = (json.data || []).map((m) => {
          const n = normalizeMessage(m);
          const isGrp = Boolean(m.isGroup || n.isGroup || (m.conversationId && m.conversationId.startsWith('group_')) || m.groupId);
          const gId = m.groupId || n.groupId || (m.conversationId && m.conversationId.startsWith('group_') ? m.conversationId.slice(6) : null);
          const convId = isGrp && gId
            ? `group_${gId}`
            : (n.conversationId || m.conversationId);
          return {
            id: n.id,
            convId,
            conversationId: convId,
            groupId: gId,
            isGroup: isGrp,
            senderId: n.senderId,
            senderName: n.senderName,
            senderRole: n.senderRole,
            senderAvatar: n.senderAvatar,
            sender: n.sender,
            receiverId: n.receiverId,
            receiverName: n.receiverName,
            receiverRole: n.receiverRole,
            receiverAvatar: n.receiverAvatar,
            receiver: n.receiver,
            content: n.content,
            messageType: n.messageType,
            fileUrl: n.fileUrl,
            fileName: n.fileName,
            fileExpired: n.fileExpired,
            aiImageRemaining: n.aiImageRemaining,
            time: n.time instanceof Date ? n.time : new Date(m.createdAt || Date.now()),
            read: n.read,
            isRecalled: n.isRecalled,
            isPinned: n.isPinned,
            reactions: n.reactions,
          };
        });

        // Server là nguồn đúng (kể cả isRead). Chỉ giữ tin temp_* chưa lên server.
        setMessages(prev => {
          const localById = new Map(prev.map(m => [String(m.id), m]));
          const merged = syncedMsgs.map(sm => {
            const local = localById.get(String(sm.id));
            return {
              ...sm,
              // Đã đọc local (optimistic) hoặc server đều tính là đã đọc
              read: Boolean(sm.read) || Boolean(local?.read),
            };
          });
          const serverIds = new Set(syncedMsgs.map(m => String(m.id)));
          const temps = prev.filter(m => String(m.id).startsWith('temp_') && !serverIds.has(String(m.id)));
          return [...merged, ...temps].sort((a, b) => new Date(a.time) - new Date(b.time));
        });
      }
    } catch (err) {
      console.log('Sync messages failed', err);
    }
  }, []);

  // ── Soft Delete Message (Chỉ ẩn phía người dùng) ──
  const softDeleteMessage = useCallback(async (msgId) => {
    setMessages(prev => prev.filter(m => String(m.id) !== String(msgId)));
    try {
      await api.messages.softDelete(msgId);
    } catch (err) {
      console.log('Soft delete failed', err);
    }
  }, []);

  // ── Recall Message (Thu hồi tin nhắn 2 phía) ──
  const recallMessage = useCallback(async (msgId) => {
    // Optimistic update
    setMessages(prev => prev.map(m =>
      String(m.id) === String(msgId)
        ? { ...m, isRecalled: true, content: 'Tin nhắn đã được thu hồi' }
        : m
    ));

    const res = await api.messages.recall(msgId);
    if (!res.success) {
      throw new Error(res.message || 'Lỗi khi thu hồi tin nhắn');
    }
    return res;
  }, []);

  // ── Reaction (Thả cảm xúc) ──
  const toggleMessageReaction = useCallback(async (msgId, emoji) => {
    if (!msgId || String(msgId).startsWith('temp_')) {
      throw new Error('Tin nhắn chưa được đồng bộ, vui lòng thử lại sau giây lát');
    }
    const res = await api.messages.toggleReaction(msgId, emoji);
    if (!res?.success) {
      throw new Error(res?.message || 'Không thể thả cảm xúc');
    }
    if (res.data) {
      setMessages(prev => prev.map(m =>
        String(m.id) === String(msgId)
          ? { ...m, reactions: res.data }
          : m
      ));
    }
    return res;
  }, []);

  // ── Group Chat Actions ──
  const createChatGroup = useCallback(async (name, participants) => {
    const res = await api.messages.createGroup(name, participants);
    if (res.success && res.data) {
      setGroups(prev => [res.data, ...prev]);
    }
    return res;
  }, []);

  const deleteChatGroup = useCallback(async (groupId) => {
    const res = await api.messages.deleteGroup(groupId);
    if (res.success) {
      setGroups(prev => prev.filter(g => String(g._id || g.id) !== String(groupId)));
      setMessages(prev => prev.filter(m => String(m.groupId) !== String(groupId) && String(m.convId) !== `group_${groupId}`));
    }
    return res;
  }, []);

  const leaveChatGroup = useCallback(async (groupId) => {
    const res = await api.messages.leaveGroup(groupId);
    if (res.success) {
      setGroups(prev => prev.filter(g => String(g._id || g.id) !== String(groupId)));
      setMessages(prev => prev.filter(m => String(m.groupId) !== String(groupId) && String(m.convId) !== `group_${groupId}`));
    }
    return res;
  }, []);

  const addGroupMembers = useCallback(async (groupId, participants) => {
    const res = await api.messages.addGroupMembers(groupId, participants);
    if (res.success && res.data) {
      setGroups(prev => prev.map(g => (String(g._id || g.id) === String(groupId) ? res.data : g)));
    }
    return res;
  }, []);

  // ── Đánh dấu đã đọc hội thoại (trực tiếp + socket) ──
  const markMessagesRead = useCallback((convId, userId, extraUserIds = []) => {
    if (!convId || !userId) return;
    const uids = [String(userId), ...extraUserIds.map(String)];

    // 1. Optimistic update local messages
    setMessages(prev => prev.map(m => {
      if (m.convId === convId || m.conversationId === convId || (m.isGroup && `group_${m.groupId}` === convId)) {
        if (m.read !== true && !uids.includes(String(m.senderId))) {
          return { ...m, read: true };
        }
      }
      return m;
    }));

    // 2. Gọi API đánh dấu đã đọc trên server
    api.messages.markRead(convId, userId).catch(() => {});
    emitMessageRead?.(convId);
  }, [emitMessageRead]);

  // ── Biến đổi danh sách tin nhắn thành danh sách cuộc trò chuyện ──
  const getConversations = useCallback((userId) => {
    const sId = String(userId);
    const safeStudents = Array.isArray(students) ? students.filter(Boolean) : [];
    const safeTeachers = Array.isArray(teachers) ? teachers.filter(Boolean) : [];
    const safeStaffs = Array.isArray(staffs) ? staffs.filter(Boolean) : [];
    const safeMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
    const isSupportStaff = currentUser?.role === 'staff'
      || currentUser?.adminRole === 'STAFF'
      || currentUser?.adminRole === 'SUPPORT'
      || safeStaffs.some(st => String(st.id || st._id) === sId);
    const isSuperAdmin = sId === 'admin'
      || currentUser?.adminRole === 'SUPER_ADMIN';

    const userMsgs = safeMessages.filter(m => {
      const isDirect = String(m.senderId) === sId || String(m.receiverId) === sId;
      const isAdminMailbox = sId === 'admin' && (String(m.senderId) === 'admin' || String(m.receiverId) === 'admin');
      return isDirect || isAdminMailbox;
    });

    const convMap = {};

    // 1. Nhóm tin nhắn theo hội thoại (bỏ qua tin nhóm — xử lý riêng ở mục 3)
    userMsgs.forEach(m => {
      if (m.isGroup) return;
      const convId = m.convId;
      if (!convId) return;

      const mTime = new Date(m.time || 0).getTime();
      const existing = convMap[convId];
      const existingTime = existing ? new Date(existing.lastTime || 0).getTime() : 0;

      if (!existing || mTime > existingTime) {
        const isMeSender = String(m.senderId) === sId;
        const otherUserId = isMeSender ? m.receiverId : m.senderId;
        const otherRole = isMeSender ? m.receiverRole : m.senderRole;

        if (String(otherUserId) === String(sId) || String(otherUserId) === 'ai_support') return;

        const peerHintName = isMeSender ? m.receiverName : m.senderName;
        const actor = resolveMessagingActor(
          {
            id: otherUserId,
            role: otherRole,
            name: peerHintName,
            avatar: isMeSender
              ? (m.receiverAvatar || m.receiver?.avatar)
              : (m.senderAvatar || m.sender?.avatar),
            adminRole: isMeSender ? m.receiver?.adminRole : m.sender?.adminRole,
            displayRole: isMeSender ? m.receiver?.displayRole : m.sender?.displayRole,
            displayName: isMeSender
              ? (m.receiver?.displayName || m.receiverName)
              : (m.sender?.displayName || m.senderName),
          },
          { teachers: safeTeachers, students: safeStudents, staffs: safeStaffs },
        );

        convMap[convId] = {
          id: convId,
          isGroup: false,
          user: {
            id: otherUserId,
            name: actor.displayName,
            role: actor.role,
            displayRole: actor.displayRole,
            adminRole: actor.adminRole,
            avatar: actor.avatar,
            online: false,
          },
          lastMessage: m.isRecalled ? 'Tin nhắn đã được thu hồi' : (m.content || (m.fileUrl ? '[Tệp tin]' : '')),
          lastTime: m.time,
          unread: (() => {
            const seen = new Set();
            let n = 0;
            for (const x of userMsgs) {
              if (x.convId !== convId) continue;
              if (!countsAsHumanUnread(x, sId)) continue;
              const id = String(x.id);
              if (seen.has(id)) continue;
              seen.add(id);
              n += 1;
            }
            return n;
          })(),
        };
      }
    });

    // Phase 6: contact discovery is server-authoritative via GET /api/messages/contacts.
    // Do NOT seed unauthorized peers from local students/teachers/staffs arrays.
    // Conversation list here = message activity (+ groups below) only.

    // 3. Add Groups
    if (groups && Array.isArray(groups)) {
      const userTargetIds = new Set([
        sId,
        String(currentUser?.id || ''),
        String(currentUser?._id || ''),
        ...(isSuperAdmin ? ['admin'] : []),
      ].filter(Boolean));

      groups
        .filter(g => g && (g._id || g.id))
        .filter(g => {
          const isParticipant = g.participants?.some(p => userTargetIds.has(String(p.userId)));
          const isCreator = userTargetIds.has(String(g.createdBy?.userId));
          return isParticipant || isCreator || isSuperAdmin;
        })
        .forEach(g => {
          const gid = String(g._id || g.id);
          const groupMsgs = safeMessages.filter(m => String(m.groupId) === gid || String(m.convId) === `group_${gid}` || String(m.conversationId) === `group_${gid}`);
          const lastMsg = groupMsgs.reduce((best, m) => {
            if (!best) return m;
            return new Date(m.time).getTime() > new Date(best.time).getTime() ? m : best;
          }, null);
          const convId = `group_${gid}`;

          convMap[convId] = {
            id: convId,
            isGroup: true,
            user: { id: gid, name: g.name, role: 'group', avatar: 'GN', online: true },
            lastMessage: lastMsg ? lastMsg.content : 'Bắt đầu cuộc trò chuyện nhóm',
            lastTime: lastMsg ? lastMsg.time : (g.createdAt ? new Date(g.createdAt) : null),
            unread: (() => {
              const seen = new Set();
              let n = 0;
              for (const m of groupMsgs) {
                if (userTargetIds.has(String(m.senderId))) continue;
                if (!countsAsHumanUnread(m, sId)) continue;
                const id = String(m.id);
                if (seen.has(id)) continue;
                seen.add(id);
                n += 1;
              }
              return n;
            })(),
          };
        });
    }

    return sortConversationsByLastMessageAt(Object.values(convMap));
  }, [messages, students, teachers, staffs, groups, currentUser]);

  const getMessages = useCallback((convId) => {
    const id = String(convId || '');
    return messages
      .filter((m) => m && (
        String(m.convId || '') === id
        || String(m.conversationId || '') === id
        || (m.isGroup && m.groupId && `group_${m.groupId}` === id)
        || (id.startsWith('group_') && String(m.groupId) === id.slice(6))
      ))
      .sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
  }, [messages]);

  return {
    messages, setMessages, groups, setGroups,
    sendMessage, syncMessages, toggleMessageReaction, recallMessage,
    softDeleteMessage, createChatGroup, deleteChatGroup, leaveChatGroup, addGroupMembers,
    markMessagesRead, getConversations, getMessages,
  };
}
