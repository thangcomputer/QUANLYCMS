/**
 * Canonical direct/group message send — shared by HTTP + Socket.
 * LIVE messaging only. Does not touch Enterprise RBAC.
 * Phase 8.24: conversationId from DB-resolved peer transport role (ignore wrong client role).
 */
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Group = require('../models/Group');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const ConversationVisibility = require('../models/ConversationVisibility');
const { getMessagingRole } = require('../utils/messagingRoles');
const {
  resolveMessagingIdentity,
  enrichMessageIdentities,
} = require('./messagingIdentity');
const { buildCanonicalConversationId } = require('./messagingPairing');
const { assertCanDirectMessage } = require('./chatAccessService');
const { sanitizeMessageDoc } = require('../utils/messageFileRetention');
const {
  runWithMessagingCorrelation,
  logPolicyDecision,
  logPersisted,
  getCorrelation,
  newCorrelationId,
} = require('./messagingObservability');

const isStaffAccount = (u = {}) =>
  u.role === 'staff' || u.adminRole === 'STAFF' || u.adminRole === 'SUPPORT';
const isSuperAdminAccount = (u = {}) => u.id === 'admin' || u.adminRole === 'SUPER_ADMIN';
const isHighAdminAccount = (u = {}) => u.adminRole === 'HIGH_ADMIN';
const isAdminLevelAccount = (u = {}) => isSuperAdminAccount(u) || isHighAdminAccount(u);

function toClientMessage(doc) {
  const plain = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  return sanitizeMessageDoc(plain);
}

async function sendCanonicalMessage(args = {}) {
  const corr = getCorrelation();
  const meta = {
    correlationId: corr.correlationId || newCorrelationId('msg'),
    requestId: corr.requestId || null,
    channel: corr.channel || (args.io ? 'socket' : 'http'),
  };
  return runWithMessagingCorrelation(meta, () => sendCanonicalMessageInner(args));
}

/**
 * Persist + emit a private/group message.
 * Sender identity always from `sender` (JWT user), never from client body fields.
 *
 * @returns {Promise<{ ok: true, message, clientMessage, conversationId } | { ok: false, status: number, message: string, code?: string, policy?: string }>}
 */
async function sendCanonicalMessageInner({
  sender,
  receiverId,
  receiverName,
  receiverRole,
  content,
  messageType = 'text',
  fileUrl = '',
  fileName = '',
  isGroup = false,
  groupId = null,
  conversationId: clientConversationId = null,
  payload = null,
  notifyUser,
  io,
} = {}) {
  if (!sender) return { ok: false, status: 401, message: 'Chua xac thuc', code: 'MESSAGING_AUTH_REQUIRED' };

  const senderId = String(sender.id || sender._id || '');
  const senderIdentity = resolveMessagingIdentity(sender);
  const senderRole = senderIdentity.role;
  const senderName = senderIdentity.displayName || 'User';

  const ridHint = String(receiverId || '');
  const rRoleHint = String(receiverRole || '').toLowerCase();
  const clientConvId = String(clientConversationId || '');
  // Defense: client may forget isGroup but still target a group thread
  let resolvedGroupId = groupId ? String(groupId) : null;
  if (!resolvedGroupId && clientConvId.startsWith('group_')) {
    resolvedGroupId = clientConvId.slice('group_'.length);
  }
  if (!resolvedGroupId && rRoleHint === 'group' && mongoose.Types.ObjectId.isValid(ridHint)) {
    resolvedGroupId = ridHint;
  }
  let resolvedIsGroup = Boolean(isGroup) || Boolean(resolvedGroupId) || rRoleHint === 'group' || clientConvId.startsWith('group_');
  if (resolvedIsGroup && !resolvedGroupId && mongoose.Types.ObjectId.isValid(ridHint)) {
    resolvedGroupId = ridHint;
  }
  const isGroupFinal = Boolean(resolvedIsGroup && resolvedGroupId);
  const groupIdFinal = isGroupFinal ? resolvedGroupId : null;

  const isBroadcast =
    ridHint === 'ALL_USERS' || ridHint === 'ALL_STUDENTS' || ridHint === 'ALL_TEACHERS' || ridHint.startsWith('ALL_BRANCH_');

  if (isBroadcast) {
    return { ok: false, status: 400, message: 'Broadcast phai dung endpoint/socket broadcast rieng' };
  }

  let pair = null;
  if (isGroupFinal && groupIdFinal) {
    const group = await Group.findById(groupIdFinal).select('participants').lean();
    if (!group) return { ok: false, status: 404, message: 'Không tìm thấy nhóm chat' };
    const isMember = (group.participants || []).some((p) => String(p.userId) === senderId);
    if (!isMember && !isAdminLevelAccount(sender)) {
      return { ok: false, status: 403, message: 'Bạn không thuộc nhóm chat này' };
    }
  } else {
    // Phase 4: REST + Socket share MessagingPolicy via assertCanDirectMessage
    pair = await assertCanDirectMessage(sender, ridHint, rRoleHint);
    if (!pair.ok) {
      logPolicyDecision({
        allowed: false,
        code: pair.code,
        reason: pair.message,
        policy: pair.policy,
        scope: pair.scope,
        senderId,
        receiverId: ridHint,
        senderProductRole: sender.adminRole || senderRole,
        receiverProductRole: null,
        senderTransportRole: senderRole,
        receiverTransportRole: rRoleHint || null,
        tenantId: sender.tenantId || null,
        branchId: sender.branchId || null,
      });
      return {
        ok: false,
        status: 403,
        message: pair.message || 'Không được nhắn tin đến người này',
        code: pair.code,
        policy: pair.policy,
      };
    }
    logPolicyDecision({
      allowed: true,
      code: pair.code,
      reason: 'PAIR_ALLOWED',
      policy: pair.policy || 'PAIRING_824',
      scope: pair.scope,
      senderId,
      receiverId: pair.finalReceiverId || ridHint,
      senderProductRole: pair.senderProduct || sender.adminRole || null,
      receiverProductRole: pair.productRole || null,
      senderTransportRole: senderRole,
      receiverTransportRole: pair.transportRole || null,
      tenantId: sender.tenantId || null,
      branchId: sender.branchId || null,
    });
  }

  const rid = pair ? String(pair.finalReceiverId || ridHint) : ridHint;
  const rRole = pair ? String(pair.transportRole || rRoleHint) : rRoleHint;
  const peerDoc = pair?.peer || null;

  let conversationId;
  if (isGroupFinal && groupIdFinal) {
    conversationId = `group_${groupIdFinal}`;
  } else {
    conversationId = buildCanonicalConversationId(sender, rRole, rid);
  }

  let sBranch = '';
  if (senderId === 'admin') {
    sBranch = 'HỆ THỐNG';
  } else if (mongoose.Types.ObjectId.isValid(senderId)) {
    if (senderRole === 'teacher' || senderRole === 'admin' || senderRole === 'staff') {
      const t = await Teacher.findById(senderId).select('branchCode').lean();
      sBranch = t?.branchCode || '';
    } else if (senderRole === 'student') {
      const s = await Student.findById(senderId).select('branchCode').lean();
      sBranch = s?.branchCode || '';
    }
  }

  let rBranch = peerDoc?.branchCode || '';
  let resolvedReceiverName = receiverName || peerDoc?.name || '';
  if (!isGroupFinal) {
    if (rid === 'admin') {
      rBranch = 'HỆ THỐNG';
      if (!resolvedReceiverName) resolvedReceiverName = 'Admin';
    } else if (rid === 'ai_support') {
      if (!resolvedReceiverName) resolvedReceiverName = 'Trợ lý Thắng Tin Học';
    } else if (!rBranch && mongoose.Types.ObjectId.isValid(rid)) {
      if (rRole === 'student') {
        const s = await Student.findById(rid).select('branchCode name').lean();
        rBranch = s?.branchCode || '';
        if (!resolvedReceiverName) resolvedReceiverName = s?.name || 'Học viên';
      } else {
        const t = await Teacher.findById(rid).select('branchCode name').lean();
        rBranch = t?.branchCode || '';
        if (!resolvedReceiverName) resolvedReceiverName = t?.name || 'Người nhận';
      }
    }
  }
  if (!resolvedReceiverName && !isGroupFinal) resolvedReceiverName = 'Người nhận';

  // Defense-in-depth branch check (pairing already scoped STAFF)
  if (
    !isAdminLevelAccount(sender)
    && (senderRole === 'staff' || isStaffAccount(sender))
    && rRole === 'student'
    && sender.adminRole !== 'SUPPORT'
  ) {
    if (sBranch && rBranch && sBranch !== rBranch) {
      return { ok: false, status: 403, message: 'Bạn không được phép nhắn tin cho học viên chi nhánh khác' };
    }
  }

  let finalReceiverId = isGroupFinal ? groupIdFinal : rid;
  let finalReceiverName = isGroupFinal ? 'Group' : resolvedReceiverName;
  let finalReceiverRole = isGroupFinal ? 'admin' : rRole;

  if (!isGroupFinal && rid === 'ai_support') {
    finalReceiverRole = 'system';
  }

  if (
    !isGroupFinal
    && senderRole === 'student'
    && rRole === 'admin'
  ) {
    if (rid === 'admin' || !mongoose.Types.ObjectId.isValid(rid)) {
      finalReceiverId = 'admin';
      finalReceiverName = resolvedReceiverName || 'Quản trị viên';
      finalReceiverRole = 'admin';
    }
  }

  let aiImageRemaining = null;
  const isAiImage = !isGroupFinal
    && String(finalReceiverId) === 'ai_support'
    && String(messageType || '') === 'image'
    && String(fileUrl || '').trim();
  if (isAiImage) {
    const {
      ensureSession,
      consumeAiImageQuota,
      peekImageQuota,
    } = require('./aiSupportService');
    const sessionDoc = await ensureSession({
      conversationId,
      userId: senderId,
      userRole: senderRole,
      branchId: sender.branchId || '',
    });
    // Hỏi lại cùng URL ảnh đã gửi trước đó → không trừ thêm quota ảnh trong ngày
    const reusedSameImage = await Message.exists({
      conversationId,
      senderId: String(senderId),
      fileUrl: String(fileUrl).trim(),
      messageType: 'image',
      isRecalled: { $ne: true },
    });
    if (reusedSameImage) {
      const peek = peekImageQuota(sessionDoc);
      if (peek.limit) aiImageRemaining = peek.remaining;
    } else {
      const quota = await consumeAiImageQuota(sessionDoc);
      if (quota.blocked) {
        return {
          ok: false,
          status: 403,
          code: 'AI_IMAGE_QUOTA',
          message: 'Bạn đã gửi đủ 5 ảnh hôm nay. Ngày mai hãy gửi tiếp nhé.',
          remaining: 0,
          limit: quota.limit,
        };
      }
      if (quota.applies) aiImageRemaining = quota.remaining;
    }
  }

  const messagePayload = {
    conversationId,
    senderId,
    senderName,
    senderRole,
    senderBranchCode: sBranch,
    receiverId: finalReceiverId,
    receiverName: finalReceiverName,
    receiverRole: finalReceiverRole,
    receiverBranchCode: rBranch,
    content: String(content || '').trim(),
    messageType: messageType || 'text',
    fileUrl: fileUrl || '',
    fileName: fileName || '',
    isGroup: Boolean(isGroupFinal),
    groupId: isGroupFinal ? groupIdFinal : null,
  };
  if (aiImageRemaining != null) messagePayload.aiImageRemaining = aiImageRemaining;
  if (payload != null && typeof payload === 'object') {
    messagePayload.payload = payload;
  }

  const message = await Message.create(messagePayload);

  logPersisted({
    messageId: message._id,
    conversationId,
    senderId,
    receiverId: finalReceiverId,
    senderRole,
    receiverRole: finalReceiverRole,
  });

  if (isGroupFinal && groupIdFinal) {
    await Group.findByIdAndUpdate(groupIdFinal, {
      lastMessage: { content: message.content, senderName, sentAt: new Date() },
    });
  }

  const unhideIds = [...new Set(
    [senderId, String(finalReceiverId)].filter(Boolean).map(String),
  )];
  if (unhideIds.length) {
    await ConversationVisibility.findOneAndUpdate(
      { conversationId },
      { $pullAll: { hiddenByUsers: unhideIds } },
      { upsert: true },
    );
  }

  const [clientMessage] = await enrichMessageIdentities([message]);

  if (io && typeof notifyUser === 'function') {
    if (isGroupFinal && groupIdFinal) {
      io.to(`group_${groupIdFinal}`).emit('message:receive', clientMessage);
      try {
        const groupDoc = await Group.findById(groupIdFinal).select('participants').lean();
        if (groupDoc?.participants) {
          groupDoc.participants.forEach((p) => {
            if (p?.userId && String(p.userId) !== senderId) {
              notifyUser(p.role || 'student', String(p.userId), 'message:receive', clientMessage);
            }
          });
        }
      } catch (_) { /* ignore */ }
    } else {
      notifyUser(finalReceiverRole, finalReceiverId, 'message:receive', clientMessage);
      notifyUser(senderRole, senderId, 'message:sent', clientMessage);

      // Broadcast cho admin/support nếu đây là hội thoại AI để cập nhật realtime cho Support viên
      if (conversationId && conversationId.includes('system_ai_support')) {
        io.to('ALL_SUPPORT').emit('message:receive', clientMessage);
      }
    }
  }

  // Trợ lý AI — hook riêng, không ảnh hưởng luồng tin nhắn thường
  if (
    !isGroupFinal
    && String(finalReceiverId) === 'ai_support'
    && require('./aiSupportService').isAiSupportEnabled()
    && (String(content || '').trim() || isAiImage)
  ) {
    try {
      const { scheduleAiSupportReply } = require('./aiSupportService');
      scheduleAiSupportReply({
        conversationId,
        sender,
        userText: String(content || '').trim(),
        imageFileUrl: isAiImage ? String(fileUrl || '') : '',
        io,
        notifyUser,
      });
    } catch (hookErr) {
      const logger = require('../config/logger');
      logger.warn({ err: hookErr?.message }, '[AI Support] post-send hook');
    }
  }

  return {
    ok: true,
    message,
    clientMessage,
    conversationId,
  };
}

module.exports = {
  sendCanonicalMessage,
  toClientMessage,
  isAdminLevelAccount,
  getMessagingRole,
  resolveMessagingIdentity,
  enrichMessageIdentities,
};
