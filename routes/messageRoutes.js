const express = require('express');
const router  = express.Router();
const Message = require('../models/Message');
const Group   = require('../models/Group');
const { authMiddleware } = require('../middleware/auth');
const { policyShadowMessage } = require('../middleware/policyShadowMessage');
const { messagesCutoverGate } = require('../middleware/messagesCutoverGate');
const { dataScopeObserve } = require('../middleware/dataScopeObserve');

router.use(authMiddleware);

/** Phase 7.20: auth → policyShadowMessage → messagesCutoverGate → handler */
function messagesGuard(action) {
  return [policyShadowMessage(action), messagesCutoverGate(action)];
}

const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const ConversationVisibility = require('../models/ConversationVisibility');
const logger = require('../config/logger');
const { buildConversationId } = require('../utils/chatConversationId');
const {
  getMessagingRole,
  canAccessDirectConversation,
} = require('../utils/messagingRoles');
const { expandConversationIdAliases } = require('../services/messagingPairing');
const { sanitizeMessages, sanitizeMessageDoc } = require('../utils/messageFileRetention');
const { enrichMessageIdentities } = require('../services/messagingIdentity');
const { normalizeMulterFile } = require('../utils/escapeRegex');
const { purgeOrphanMessages } = require('../services/userCascadeCleanup');
const isStaffAccount = (u = {}) => u.role === 'staff' || u.adminRole === 'STAFF' || u.adminRole === 'SUPPORT';
const isSuperAdminAccount = (u = {}) => u.id === 'admin' || u.adminRole === 'SUPER_ADMIN';
const isHighAdminAccount = (u = {}) => u.adminRole === 'HIGH_ADMIN';
/** SUPER_ADMIN + HIGH_ADMIN — chia sẻ admin mailbox legacy (không gồm STAFF/SUPPORT) */
const isAdminLevelAccount = (u = {}) => isSuperAdminAccount(u) || isHighAdminAccount(u);

function isSpecialPeerId(id) {
  const s = String(id || '');
  return !s || s === 'admin' || s.startsWith('ALL_') || s.startsWith('group_');
}

async function filterAliveConversationPeers(conversations) {
  const peerIds = [...new Set(
    (conversations || [])
      .map((c) => String(c?.otherUser?.id || ''))
      .filter((id) => id && !isSpecialPeerId(id)),
  )];
  if (peerIds.length === 0) return conversations || [];

  const objectIds = peerIds.filter((id) => require('mongoose').Types.ObjectId.isValid(id));
  const [teachers, students] = await Promise.all([
    Teacher.find({ _id: { $in: objectIds } }).select('_id').lean(),
    Student.find({ _id: { $in: objectIds } }).select('_id').lean(),
  ]);
  const alive = new Set([
    ...teachers.map((t) => String(t._id)),
    ...students.map((s) => String(s._id)),
  ]);

  return (conversations || []).filter((c) => {
    const id = String(c?.otherUser?.id || '');
    if (isSpecialPeerId(id)) return true;
    return alive.has(id);
  });
}

function toClientMessage(doc) {
  const plain = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  return sanitizeMessageDoc(plain);
}

/** Hiển thị tin nhắn tới học viên: STAFF vs SUPER_ADMIN */
const DEPT_STAFF_LABEL = 'Phòng Giáo Vụ';
const DEPT_SUPER_LABEL = 'ADMIN CẤP CAO';

function staffDisplayName(rawName, branchCode) {
  return (rawName && rawName.trim()) ? rawName.trim() : 'Nhân viên';
}

function deptOutboundToStudent(reqUser) {
  if (isStaffAccount(reqUser)) return DEPT_STAFF_LABEL;
  if (isAdminLevelAccount(reqUser)) return DEPT_SUPER_LABEL;
  if (reqUser.role === 'admin' || reqUser.role === 'staff') return DEPT_SUPER_LABEL;
  return null;
}
// AdminUser was wrong, they are stored in Teacher

// ══ GET /api/messages/contacts  ── Phase 6: MessagingPolicy.canDiscoverContacts ══
// Orchestration: messagingContactsService loads candidates → policy filters.
router.get('/contacts', messagesGuard('contacts'), dataScopeObserve('message'), async (req, res) => {
  try {
    const { listDiscoverableContacts } = require('../services/messagingContactsService');
    const { branch_id: queryBranchId } = req.query;
    const data = await listDiscoverableContacts(req.user, { queryBranchId });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[CONTACTS]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ── Lấy danh sách cuộc trò chuyện ──
router.get('/conversations/:userId', messagesGuard('conversations'), async (req, res) => {
  try {
    const userId = req.params.userId;

    // Bảo vệ: Chỉ Admin hoặc chính User đó mới được xem
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }

    // Branch Filtering logic
    const isSuperAdmin = isAdminLevelAccount(req.user);
    const userBranch = req.user.branchCode || '';

    // Legacy shared admin mailbox (senderId/receiverId === 'admin') — SUPER/HIGH only.
    // STAFF/SUPPORT must not inherit other staff's admin_admin traffic.
    const matchQuery = { 
      $or: [
        { senderId: userId },
        { receiverId: userId },
        ...(isAdminLevelAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
      ]
    };

    // If STAFF or TEACHER, filter by their branch
    if (!isSuperAdmin && userBranch) {
      matchQuery.$and = [
        { $or: [
          { senderBranchCode: userBranch },
          { receiverBranchCode: userBranch },
          // Không leak hộp chung admin cho STAFF/TEACHER
          ...(isAdminLevelAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
        ]}
      ];
    }

    const messages = await Message.aggregate([
      { $match: matchQuery },
      { $sort: { createdAt: -1 }},
      { $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: { $sum: { $cond: [
          { $and: [
            { $in: ['$receiverId', isAdminLevelAccount(req.user) ? ['admin', String(userId)] : [String(userId)]] },
            { $eq: ['$isRead', false] },
            { $ne: ['$messageType', 'system'] },
            { $ne: ['$isRecalled', true] },
            { $ne: ['$senderId', 'ai_support'] },
          ]}, 1, 0,
        ]}},
      }},
      { $sort: { 'lastMessage.createdAt': -1 }},
    ]);

    const conversations = messages.map(m => {
      const isReceiver = m.lastMessage.receiverId === userId;
      return {
        conversationId: m._id,
        otherUser: {
          id: isReceiver ? m.lastMessage.senderId : m.lastMessage.receiverId,
          name: isReceiver ? m.lastMessage.senderName : m.lastMessage.receiverName,
          role: isReceiver ? m.lastMessage.senderRole : m.lastMessage.receiverRole,
        },
        lastMessage: {
          content: m.lastMessage.content,
          createdAt: m.lastMessage.createdAt,
        },
        unreadCount: m.unreadCount,
      };
    });

    const aliveConversations = await filterAliveConversationPeers(conversations);
    res.json({ success: true, data: aliveConversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Dọn tin nhắn orphan (peer đã xóa tài khoản) — SUPER/HIGH ──
router.post('/purge-orphans', messagesGuard('purge_orphans'), async (req, res) => {
  try {
    if (!isAdminLevelAccount(req.user) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Không có quyền dọn tin nhắn orphan' });
    }
    const result = await purgeOrphanMessages();
    res.json({
      success: true,
      message: `Đã xóa ${result.deletedMessages || 0} tin nhắn orphan`,
      data: result,
    });
  } catch (err) {
    logger.error('[MESSAGES] purge-orphans:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Tìm kiếm tin nhắn toàn cục (bỏ qua is_hidden) ──
router.get('/search/:userId', messagesGuard('search'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const { q } = req.query;
    
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tìm kiếm' });
    }

    if (!q) return res.json({ success: true, data: [] });

    const { sanitizeRegex } = require('../middleware/sanitizeRegex');
    const safeQ = sanitizeRegex(q);

    const isSuperAdmin = isAdminLevelAccount(req.user);
    const userBranch = req.user.branchCode || '';

    const searchQuery = {
      $or: [
        { senderId: userId }, 
        { receiverId: userId },
        ...(isAdminLevelAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
      ],
      content: { $regex: safeQ, $options: 'i' }
    };

    if (!isSuperAdmin && userBranch) {
      searchQuery.$and = [
        { $or: [
          { senderBranchCode: userBranch },
          { receiverBranchCode: userBranch }
        ]}
      ];
    }

    const messages = await Message.find(searchQuery).sort({ createdAt: -1 }).limit(50);

    res.json({ success: true, data: sanitizeMessages(messages) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy danh sách cuộc trò chuyện bị ẨN (phải đặt TRƯỚC /:conversationId vì không thì "hidden" bị coi là conversationId → 403) ──
router.get('/hidden', messagesGuard('hidden'), async (req, res) => {
  try {
    const userId = req.user.id;
    const hiddenRows = await ConversationVisibility.find({ hiddenByUsers: userId }).lean();
    const hiddenList = hiddenRows.map(r => r.conversationId);
    res.json({ success: true, data: hiddenList });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy tin nhắn của cuộc trò chuyện ──
router.get('/:conversationId', messagesGuard('get_conversation'), async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Bảo vệ: participant canonical HOẶC legacy admin_admin chỉ SUPER/HIGH
    const isGroupConv = String(conversationId || '').startsWith('group_');
    let isParticipant = false;
    let queryIds = [conversationId];
    if (isGroupConv) {
      const mongoose = require('mongoose');
      const groupId = String(conversationId).slice('group_'.length);
      if (mongoose.Types.ObjectId.isValid(groupId)) {
        const g = await Group.findOne({
          _id: groupId,
          'participants.userId': String(req.user.id),
        }).select('_id').lean();
        isParticipant = !!g || isAdminLevelAccount(req.user);
      }
    } else {
      const { canonical, ids } = expandConversationIdAliases(conversationId);
      queryIds = ids;
      isParticipant = ids.some((id) => canAccessDirectConversation(id, req.user));
      // Prefer canonical for response continuity when aliased
      if (canonical && canonical !== conversationId) {
        // still query both ids; access already checked
      }
    }

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
    }
    const messages = await Message.find({
      conversationId: { $in: queryIds },
      hiddenFor: { $ne: req.user.id }
    })
      .sort({ createdAt: 1 })
      .limit(200);

    const sanitized = sanitizeMessages(messages);
    const enriched = await enrichMessageIdentities(sanitized);
    res.json({
      success: true,
      data: enriched,
      conversationId: expandConversationIdAliases(conversationId).canonical,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy toàn bộ tin nhắn của một user (để đồng bộ) ──
router.get('/sync/:userId', messagesGuard('sync'), async (req, res) => {
  try {
    const { userId } = req.params;
    const isSelf = String(req.user.id) === String(userId) || String(req.user._id) === String(userId);
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff' || isAdminLevelAccount(req.user);
    if (!isSelf && !isAdminOrStaff) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đồng bộ dữ liệu này' });
    }

    const targetIds = [...new Set([
      String(userId || ''),
      String(req.user.id || ''),
      String(req.user._id || ''),
      ...(isAdminLevelAccount(req.user) ? ['admin'] : []),
    ].filter(Boolean))];

    // Lấy các nhóm mà user là thành viên hoặc người tạo
    const userGroups = await Group.find({
      $or: [
        { 'participants.userId': { $in: targetIds } },
        { 'createdBy.userId': { $in: targetIds } },
      ],
    });
    const groupIds = userGroups.map(g => String(g._id));

    // Lấy tin nhắn cá nhân + tin nhắn nhóm
    // Legacy receiverId/senderId 'admin' chỉ cho SUPER/HIGH — không fan-out cho STAFF
    const syncRole = getMessagingRole(req.user);
    const broadcastIds = syncRole === 'student'
      ? ['ALL_USERS', 'ALL_STUDENTS']
      : syncRole === 'teacher'
        ? ['ALL_USERS', 'ALL_TEACHERS']
        : ['ALL_USERS'];
    const messages = await Message.find({
      $or: [
        { senderId: { $in: targetIds } },
        { receiverId: { $in: targetIds } },
        { receiverId: { $in: broadcastIds } },
        ...(isAdminLevelAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : []),
        ...(groupIds.length > 0 ? [
          { conversationId: { $in: groupIds.map(id => `group_${id}`) } },
          { groupId: { $in: groupIds } },
          { isGroup: true, groupId: { $in: groupIds } },
        ] : []),
      ],
      hiddenFor: { $nin: targetIds }
    }).sort({ createdAt: -1 }).limit(1000);

    const sanitized = sanitizeMessages(messages.reverse());
    const enriched = await enrichMessageIdentities(sanitized);
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads/messages folder if not exists
const uploadDir = 'uploads/messages';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMsgExt = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|mp4|webm|mp3|wav)$/i;
const allowedMsgMime = /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/zip|application\/x-zip-compressed|application\/x-rar-compressed|application\/vnd\.rar|application\/x-7z-compressed|application\/vnd\.|application\/msword|application\/octet-stream|text\/plain|video\/(mp4|webm)|audio\/(mpeg|mp3|wav|x-wav|wave))$/i;
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = allowedMsgMime.test(file.mimetype || '');
    const okExt = allowedMsgExt.test(file.originalname || '');
    // Bắt buộc cả mime và extension (chống spoof một phía)
    if (okMime && okExt) return cb(null, true);
    cb(new Error('Định dạng file không được phép'));
  },
});

// ── Upload file ──
router.post('/upload', messagesGuard('upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file' });
    normalizeMulterFile(req.file);

    const { validateUploadedFileMagic } = require('../utils/uploadSniff');
    const sniff = validateUploadedFileMagic(req.file.path, req.file.originalname || req.file.filename);
    if (!sniff.ok) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({
        success: false,
        message: 'Nội dung file không khớp định dạng khai báo',
        code: 'MAGIC_MISMATCH',
      });
    }

    const fileUrl = `/${req.file.path.replace(/\\/g, '/')}`;
    // Đăng ký FileAsset (Phase 8) — không chặn response nếu registry lỗi
    try {
      const fileService = require('../services/fileService');
      await fileService.registerUploadedFile(req.file, {
        category: 'messages',
        uploadedBy: String(req.user?.id || ''),
        uploadedByRole: req.user?.role || '',
        relatedType: 'message',
      });
    } catch (regErr) {
      logger.warn({ err: regErr.message }, '[MESSAGES] FileAsset register failed');
    }
    res.json({ success: true, url: fileUrl, name: req.file.originalname });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Gửi tin nhắn ──
router.post('/', messagesGuard('send'), async (req, res) => {
  try {
    const senderId = req.user.id;
    const senderRole = getMessagingRole(req.user);
    const senderName = req.user.name;

    const { receiverId, receiverName, receiverRole, content, isGroup, groupId, messageType, fileUrl, fileName, conversationId: bodyConversationId, payload } = req.body;

    const isBroadcast = receiverId === 'ALL_USERS' || receiverId === 'ALL_STUDENTS' || receiverId === 'ALL_TEACHERS';
    if (isBroadcast && !(req.user.role === 'admin' || req.user.role === 'staff')) {
      return res.status(403).json({ success: false, message: 'Chỉ admin/staff được gửi thông báo broadcast' });
    }
    if (isBroadcast && receiverId === 'ALL_STUDENTS' && req.user.adminRole === 'HIGH_ADMIN') {
      return res.status(403).json({ success: false, message: 'Admin cấp cao không gửi thông báo tới học viên' });
    }

    // Broadcast keeps dedicated path (role/global rooms). DM/group use canonical service.
    if (isBroadcast) {
      const conversationId = req.body.conversationId || [`${senderRole}_${senderId}`, `system_${String(receiverId).replace(/[^a-zA-Z0-9_]/g, '_')}`].sort().join('__');
      const message = await Message.create({
        conversationId,
        senderId,
        senderName: senderName || 'Admin',
        senderRole,
        senderBranchCode: '',
        receiverId,
        receiverName: 'Thông báo hệ thống',
        receiverRole: 'system',
        receiverBranchCode: '',
        content,
        messageType: messageType || 'text',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        isGroup: false,
        groupId: null,
      });
      const clientMessage = toClientMessage(message);
      const io = req.app.get('io');
      if (io) {
        if (receiverId === 'ALL_USERS') io.emit('message:receive', clientMessage);
        else if (receiverId === 'ALL_STUDENTS') io.to('ALL_STUDENT').emit('message:receive', clientMessage);
        else if (receiverId === 'ALL_TEACHERS') io.to('ALL_TEACHER').emit('message:receive', clientMessage);
        req.app.notifyUser(senderRole, senderId, 'message:sent', clientMessage);
      }
      return res.status(201).json({ success: true, data: clientMessage });
    }

    const { sendCanonicalMessage } = require('../services/directMessageService');
    const {
      runWithMessagingCorrelation,
      newCorrelationId,
    } = require('../services/messagingObservability');
    const correlationId = req.correlationId || req.headers['x-correlation-id'] || newCorrelationId('http');
    req.correlationId = correlationId;
    const result = await runWithMessagingCorrelation({
      correlationId,
      requestId: req.requestId || req.id || correlationId,
      channel: 'http',
    }, () => sendCanonicalMessage({
      sender: req.user,
      receiverId,
      receiverName,
      receiverRole,
      content,
      messageType,
      fileUrl,
      fileName,
      isGroup,
      groupId,
      conversationId: bodyConversationId || null,
      payload: payload && typeof payload === 'object' ? payload : null,
      notifyUser: req.app.notifyUser,
      io: req.app.get('io'),
    }));
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message,
        ...(result.code ? { code: result.code } : {}),
        ...(result.policy ? { policy: result.policy } : {}),
      });
    }
    return res.status(201).json({ success: true, data: result.clientMessage });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Ẩn cuộc trò chuyện ──
router.post('/hide/:conversationId', messagesGuard('hide'), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    await ConversationVisibility.findOneAndUpdate(
      { conversationId },
      { $addToSet: { hiddenByUsers: userId } },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true, message: 'Đã ẩn cuộc trò chuyện' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Đánh dấu đã đọc ──
router.put('/read/:conversationId', messagesGuard('read'), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { conversationId } = req.params;
    const readerId = req.user.id;
    const isStaffOrAdmin = req.user.role === 'admin' || isStaffAccount(req.user);
    const isGroupConv = String(conversationId || '').startsWith('group_');
    let allowed = false;
    if (isGroupConv) {
      const groupId = String(conversationId).slice('group_'.length);
      if (mongoose.Types.ObjectId.isValid(groupId)) {
        const g = await Group.findOne({
          _id: groupId,
          'participants.userId': String(readerId),
        }).select('_id').lean();
        allowed = !!g;
      }
    } else {
      const { ids } = expandConversationIdAliases(conversationId);
      allowed = ids.some((id) => canAccessDirectConversation(id, req.user));
    }
    if (!allowed) {
        return res.status(403).json({ success: false, message: 'Thao tác không hợp lệ' });
    }

    const receiverTargets = isAdminLevelAccount(req.user)
      ? ['admin', String(readerId)]
      : [String(readerId)];

    const readIds = isGroupConv
      ? [conversationId]
      : expandConversationIdAliases(conversationId).ids;

    const filter = isGroupConv
      ? { conversationId, isRead: false, senderId: { $nin: receiverTargets } }
      : { conversationId: { $in: readIds }, receiverId: { $in: receiverTargets }, isRead: false };

    await Message.updateMany(
      filter,
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true, message: 'Đã đánh dấu đọc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Ghim tin nhắn ──
router.put('/:conversationId/pin', messagesGuard('reaction'), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId } = req.body;
    const message = await Message.findOne({ _id: messageId, conversationId });
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

    const isGroupConv = String(conversationId).startsWith('group_');
    let canPin = false;
    if (isGroupConv) {
      const groupId = String(conversationId).slice('group_'.length);
      const group = await Group.findById(groupId).select('participants').lean();
      canPin = Boolean(
        group?.participants?.some((p) => String(p.userId) === String(req.user.id))
        || isAdminLevelAccount(req.user),
      );
    } else {
      canPin = canAccessDirectConversation(conversationId, req.user);
    }
    if (!canPin) {
      return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
    }

    // Toggle pin status
    message.isPinned = !message.isPinned;
    await message.save();

    // If it is pinned, unpin all others in this conversation
    if (message.isPinned) {
      await Message.updateMany(
        { conversationId, _id: { $ne: message._id }, isPinned: true },
        { $set: { isPinned: false } }
      );
    }

    const io = req.app.get('io');
    if (io) {
      const pinPayload = {
        conversationId,
        messageId: String(message._id),
        isPinned: message.isPinned
      };
      if (conversationId.startsWith('group_')) {
        io.to(conversationId).emit('message:pinned', pinPayload);
      } else {
        const parts = (conversationId || '').split('__');
        parts.forEach(p => {
          if (!p) return;
          const sepIdx = p.indexOf('_');
          if (sepIdx <= 0) return;
          const role = p.slice(0, sepIdx);
          const id = p.slice(sepIdx + 1);
          if (role && id) {
            req.app.notifyUser(role, id, 'message:pinned', pinPayload);
          }
        });
      }
    }

    res.json({ success: true, message: message.isPinned ? 'Đã ghim tin nhắn' : 'Đã bỏ ghim', pinnedMessageId: message.isPinned ? message._id : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Phản ứng (Reaction) ──
router.patch('/:messageId/reaction', messagesGuard('reaction'), async (req, res) => {
  try {
    const { messageId } = req.params;
    const { type } = req.body; // 'heart' or 'like'
    if (!['heart', 'like'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Loại reaction không hợp lệ' });
    }
    const userId = req.user.id;
    const userName = req.user.name;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });
    if (String(message.conversationId || '').includes('system_ai_support')) {
      return res.status(403).json({ success: false, message: 'Không thể thả cảm xúc trong cuộc trò chuyện với Trợ lý AI' });
    }

    // BUG-04: Kiểm tra user thuộc cuộc hội thoại
    if (message.isGroup && message.groupId) {
      const group = await Group.findById(message.groupId).select('participants').lean();
      const isMember = group && (group.participants || []).some(p => String(p.userId) === String(userId));
      if (!isMember && !isAdminLevelAccount(req.user)) {
        return res.status(403).json({ success: false, message: 'Bạn không thuộc nhóm chat này' });
      }
    } else {
      const isParticipant = String(message.senderId) === String(userId) ||
        String(message.receiverId) === String(userId) ||
        (isAdminLevelAccount(req.user) && (message.senderId === 'admin' || message.receiverId === 'admin'));
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
      }
    }

    // Kiểm tra đã có reaction chưa
    const existingIdx = message.reactions.findIndex(r => r.userId === userId && r.type === type);
    
    if (existingIdx >= 0) {
      // Bỏ reaction
      message.reactions.splice(existingIdx, 1);
    } else {
      // Thêm reaction
      message.reactions.push({ type, userId, userName });
    }

    await message.save();

    // Phát real-time via Socket.io
    const io = req.app.get('io');
    if (io) {
      if (message.isGroup && message.groupId) {
        io.to(`group_${message.groupId}`).emit('message:reaction', { 
           messageId: message._id, 
           reactions: message.reactions,
           groupId: message.groupId,
           conversationId: message.conversationId 
        });
      } else {
        // BUG-16: Parse conversationId đúng bằng indexOf thay vì split
        const parts = (message.conversationId || '').split('__');
        parts.forEach(p => {
          if (!p) return;
          const sepIdx = p.indexOf('_');
          if (sepIdx <= 0) return;
          const role = p.slice(0, sepIdx);
          const id = p.slice(sepIdx + 1);
          if (role && id) {
            req.app.notifyUser(role, id, 'message:reaction', { 
              messageId: message._id, 
              reactions: message.reactions,
              conversationId: message.conversationId 
            });
          }
        });
        
        if (message.conversationId && message.conversationId.includes('system_ai_support')) {
          io.to('ALL_SUPPORT').emit('message:reaction', {
            messageId: message._id,
            reactions: message.reactions,
            conversationId: message.conversationId
          });
        }
      }
    }

    res.json({ success: true, data: message.reactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Thu hồi tin nhắn ──
router.patch('/:messageId/recall', messagesGuard('recall'), async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

    const isStaffOrAdmin = req.user.role === 'admin' || isStaffAccount(req.user);
    const senderMatch = String(message.senderId) === String(userId) || 
      (isStaffOrAdmin && (message.senderId === 'admin' || String(message.senderId) === String(userId)));
    if (!senderMatch) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thu hồi tin nhắn này' });
    }

    // 24h limit check
    const now = new Date();
    const sentAt = new Date(message.createdAt);
    const diffHours = (now - sentAt) / (1000 * 60 * 60);
    if (diffHours > 24) {
      return res.status(403).json({ success: false, message: 'Chỉ có thể thu hồi tin nhắn trong vòng 24 giờ kể từ lúc gửi' });
    }

    // BUG-11: Xóa file đính kèm khi thu hồi
    if (['file', 'image'].includes(message.messageType) && message.fileUrl && !message.fileExpired) {
      const { expireMessageFile } = require('../utils/messageFileRetention');
      await expireMessageFile(message, { save: false });
    }

    message.isRecalled = true;
    message.content = 'Tin nhắn đã được thu hồi';
    await message.save();

    const io = req.app.get('io');
    if (io) {
      if (message.isGroup && message.groupId) {
        io.to(`group_${message.groupId}`).emit('message:recall', { 
           messageId: message._id, 
           groupId: message.groupId 
        });
      } else {
        // BUG-08: Parse conversationId đúng bằng indexOf thay vì split('_')
        const parts = (message.conversationId || '').split('__');
        parts.forEach(p => {
          if (!p) return;
          const sepIdx = p.indexOf('_');
          if (sepIdx <= 0) return;
          const role = p.slice(0, sepIdx);
          const id = p.slice(sepIdx + 1);
          if (role && id) {
            req.app.notifyUser(role, id, 'message:recall', { 
              messageId: message._id, 
              conversationId: message.conversationId 
            });
          }
        });
        
        if (message.conversationId && message.conversationId.includes('system_ai_support')) {
          io.to('ALL_SUPPORT').emit('message:recall', {
            messageId: message._id,
            conversationId: message.conversationId
          });
        }
      }
    }

    res.json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Xóa mềm tin nhắn (Chỉ xóa phía mình) ──
router.patch('/:messageId/soft-delete', messagesGuard('soft_delete'), async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

    // BUG-04: Kiểm tra user thuộc cuộc hội thoại trước khi cho xóa
    if (message.isGroup && message.groupId) {
      const group = await Group.findById(message.groupId).select('participants').lean();
      const isMember = group && (group.participants || []).some(p => String(p.userId) === String(userId));
      if (!isMember && !isAdminLevelAccount(req.user)) {
        return res.status(403).json({ success: false, message: 'Bạn không thuộc nhóm chat này' });
      }
    } else {
      const isParticipant = String(message.senderId) === String(userId) ||
        String(message.receiverId) === String(userId) ||
        (isAdminLevelAccount(req.user) && (message.senderId === 'admin' || message.receiverId === 'admin'));
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
      }
    }

    // Thêm userId vào mảng hiddenFor nếu chưa có
    if (!message.hiddenFor) message.hiddenFor = [];
    if (!message.hiddenFor.includes(userId)) {
      message.hiddenFor.push(userId);
      await message.save();
    }

    res.json({ success: true, message: 'Đã xóa tin nhắn', data: message.hiddenFor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const normalizeGroupRole = (r) => {
  const upper = String(r || '').toUpperCase();
  if (upper === 'HIGH_ADMIN' || upper === 'SUPER_ADMIN' || upper === 'ADMIN') return 'admin';
  if (upper === 'STAFF' || upper === 'SUPPORT') return 'staff';
  if (String(r).toLowerCase() === 'teacher') return 'teacher';
  if (String(r).toLowerCase() === 'student') return 'student';
  if (String(r).toLowerCase() === 'staff') return 'staff';
  return null;
};

// ── Tạo nhóm mới ──
router.post('/groups', messagesGuard('group_create'), async (req, res) => {
  try {
    if (req.user.role === 'student') {
        return res.status(403).json({ success: false, message: 'Học viên không có quyền tạo nhóm' });
    }
    const { name, participants } = req.body;

    // BUG-03: Validate tên nhóm
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên nhóm không được để trống' });
    }

    // BUG-03: Validate & sanitize participants
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách thành viên không hợp lệ' });
    }
    const validRoles = ['admin', 'teacher', 'student', 'staff'];

    const sanitizedParticipants = participants
      .map(p => ({ ...p, normRole: normalizeGroupRole(p?.role) }))
      .filter(p => p && typeof p === 'object' && p.userId && p.name && p.normRole)
      .map(p => ({
        userId: String(p.userId).slice(0, 50),
        name: String(p.name).slice(0, 100),
        role: p.normRole,
        joinedAt: new Date(),
      }));

    if (sanitizedParticipants.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có thành viên hợp lệ' });
    }

    const uniqueParticipants = [...new Map(
      sanitizedParticipants.map((participant) => [participant.userId, participant]),
    ).values()].filter((participant) => participant.userId !== String(req.user.id));

    if (uniqueParticipants.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một thành viên khác bạn' });
    }

    const creatorRole = normalizeGroupRole(req.user.adminRole) || normalizeGroupRole(req.user.role) || 'admin';

    const group = await Group.create({
      name: String(name).trim().slice(0, 100),
      participants: [...uniqueParticipants, { userId: req.user.id, name: req.user.name, role: creatorRole }],
      createdBy: { userId: req.user.id, name: req.user.name }
    });

    const io = req.app.get('io');
    if (io) {
      group.participants.forEach(p => {
        req.app.notifyUser(p.role, p.userId.toString(), 'group:new', group);
      });
    }

    res.status(201).json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy danh sách nhóm của user ──
router.get('/groups/user/:userId', messagesGuard('group_list'), async (req, res) => {
  try {
    const targetId = String(req.params.userId || '');
    const isSelf = String(req.user.id) === targetId || String(req.user._id) === targetId;
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff' || isAdminLevelAccount(req.user);
    if (!isSelf && !isAdminOrStaff) {
      return res.status(403).json({ success: false, message: 'Không có quyền xem nhóm của người khác' });
    }

    const targetIds = [...new Set([
      targetId,
      String(req.user.id || ''),
      String(req.user._id || ''),
      ...(isAdminLevelAccount(req.user) ? ['admin'] : []),
    ].filter(Boolean))];

    const groups = await Group.find({
      $or: [
        { 'participants.userId': { $in: targetIds } },
        { 'createdBy.userId': { $in: targetIds } },
      ],
    }).sort({ updatedAt: -1 });
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Rời nhóm ──
router.post('/groups/:groupId/leave', async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = String(req.user.id);
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });

    const isMember = group.participants.some(p => String(p.userId) === userId);
    if (!isMember) return res.status(400).json({ success: false, message: 'Bạn không phải là thành viên nhóm này' });

    group.participants = group.participants.filter(p => String(p.userId) !== userId);
    await group.save();

    const systemMsg = await Message.create({
      conversationId: `group_${groupId}`,
      senderId: req.user.id,
      senderName: 'Thông báo hệ thống',
      senderRole: 'system',
      receiverId: groupId,
      receiverName: group.name,
      receiverRole: 'group',
      content: `${req.user.name} đã rời khỏi nhóm.`,
      messageType: 'system'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`group_${groupId}`).emit('message:receive', systemMsg);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Thêm thành viên vào nhóm ──
router.post('/groups/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { participants } = req.body;
    const group = await Group.findById(groupId);
    
    if (!group) return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });

    const isCreator = String(group.createdBy?.userId) === String(req.user.id);
    if (!isCreator && !isAdminLevelAccount(req.user)) {
      return res.status(403).json({ success: false, message: 'Chỉ người tạo nhóm mới có quyền thêm thành viên' });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách thành viên không hợp lệ' });
    }

    const sanitizedParticipants = participants
      .map(p => ({ ...p, normRole: normalizeGroupRole(p?.role) }))
      .filter(p => p && typeof p === 'object' && p.userId && p.name && p.normRole)
      .map(p => ({
        userId: String(p.userId).slice(0, 50),
        name: String(p.name).slice(0, 100),
        role: p.normRole,
        joinedAt: new Date(),
      }));

    if (sanitizedParticipants.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có thành viên hợp lệ' });
    }

    // Filter out already existing participants
    const newMembers = sanitizedParticipants.filter(np => 
      !group.participants.some(op => String(op.userId) === String(np.userId))
    );

    if (newMembers.length > 0) {
      group.participants.push(...newMembers);
      await group.save();

      const io = req.app.get('io');
      for (const member of newMembers) {
        const systemMsg = await Message.create({
          conversationId: `group_${groupId}`,
          senderId: req.user.id,
          senderName: 'Thông báo hệ thống',
          senderRole: 'system',
          receiverId: groupId,
          receiverName: group.name,
          receiverRole: 'group',
          content: `${member.name} đã được thêm vào nhóm.`,
          messageType: 'system'
        });
        
        if (io) {
          io.to(`group_${groupId}`).emit('message:receive', systemMsg);
        }
        
        // Notify the new member to join the group locally
        req.app.notifyUser(member.role, member.userId, 'group:new', group);
      }
    }

    res.json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ── Xóa nhóm vĩnh viễn ──
router.delete('/groups/:groupId', messagesGuard('group_delete'), async (req, res) => {
  try {
    if (req.user.role === 'student') {
        return res.status(403).json({ success: false, message: 'Học viên không có quyền xóa nhóm' });
    }
    const { groupId } = req.params;

    // BUG-02: Kiểm tra quyền — chỉ creator hoặc SuperAdmin mới được xóa nhóm
    const group = await Group.findById(groupId).select('createdBy participants name').lean();
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm' });
    }
    const isCreator = String(group.createdBy?.userId) === String(req.user.id);
    if (!isCreator && !isAdminLevelAccount(req.user)) {
      return res.status(403).json({ success: false, message: 'Chỉ người tạo nhóm hoặc Super Admin mới có quyền xóa nhóm' });
    }
    
    // Xóa tất cả tin nhắn của nhóm này
    await Message.deleteMany({ conversationId: `group_${groupId}` });
    
    // Xóa Group
    await Group.findByIdAndDelete(groupId);

    // Phát sự kiện Real-time group:deleted đến toàn bộ thành viên và các phòng liên quan
    const io = req.app.get('io');
    if (io) {
      const deletePayload = {
        groupId: String(groupId),
        groupName: group.name || 'Nhóm',
        deletedBy: {
          id: String(req.user.id),
          name: req.user.name || 'Quản trị viên',
          role: req.user.role || 'admin',
        },
      };

      // 1. Gửi vào socket room của nhóm
      io.to(`group_${groupId}`).emit('group:deleted', deletePayload);

      // 2. Gửi vào socket cá nhân của từng thành viên trong nhóm
      if (Array.isArray(group.participants)) {
        group.participants.forEach((p) => {
          if (p && p.userId) {
            const memberRole = p.role || 'student';
            req.app.notifyUser(memberRole, p.userId, 'group:deleted', deletePayload);
          }
        });
      }

      // 3. Gửi thông báo đến các phòng tổng để đồng bộ danh sách nhóm tức thì
      io.to('ALL_ADMIN').emit('group:deleted', deletePayload);
      io.to('ALL_STAFF').emit('group:deleted', deletePayload);
      io.to('ALL_TEACHER').emit('group:deleted', deletePayload);
    }

    res.json({ success: true, message: 'Đã xóa nhóm vĩnh viễn' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy số tin nhắn chưa đọc ──
router.get('/unread/:userId', messagesGuard('unread'), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) {
       return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối' });
    }
    const receiverTargets = isAdminLevelAccount(req.user) ? ['admin', String(userId)] : [String(userId)];
    const senderNin = [String(userId)];
    const countFilter = {
      receiverId: { $in: receiverTargets },
      isRead: false,
      isRecalled: { $ne: true },
      messageType: { $ne: 'system' },
      senderId: { $nin: senderNin },
      hiddenFor: { $nin: receiverTargets },
    };
    // Bỏ tin AI khỏi badge (tin người thật) — trừ khi ?includeAi=1
    const includeAi = req.query.includeAi === '1' || req.query.includeAi === 'true';
    if (!includeAi) {
      senderNin.push('ai_support');
      countFilter.senderId = { $nin: senderNin };
      countFilter.conversationId = { $not: /system_ai_support/ };
    }
    const count = await Message.countDocuments(countFilter);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ══ POST /api/chat/broadcast  ──  Gửi tin nhắn hàng loạt ══
router.post('/broadcast', messagesGuard('broadcast'), async (req, res) => {
  try {
    const { role: userRole, id: userId, adminRole, name: userName } = req.user;
    const { targetRole, content, messageType = 'text', fileUrl, fileName } = req.body;

    // Chỉ Admin hoặc STAFF mới được gửi broadcast
    if (userRole !== 'admin' && userRole !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });
    }
    if (adminRole === 'HIGH_ADMIN' && targetRole === 'student') {
      return res.status(403).json({ success: false, message: 'Admin cấp cao không gửi thông báo tới học viên' });
    }

    if (!['student', 'teacher', 'admin'].includes(targetRole)) {
      return res.status(400).json({ success: false, message: 'Đối tượng nhận không hợp lệ' });
    }

    if (!content && messageType === 'text') {
      return res.status(400).json({ success: false, message: 'Nội dung không được trống' });
    }

    // Lấy branchId của người gửi (nếu là STAFF thì chỉ gửi trong branch đó)
    let senderDoc = null;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(userId)) {
      senderDoc = await Teacher.findById(userId).select('branchId branchCode').lean();
    }
    const branchFilter = (adminRole === 'STAFF' && senderDoc?.branchId) 
      ? { branchId: senderDoc.branchId } 
      : {};

    let targets = [];
    if (targetRole === 'student') {
      targets = await Student.find(branchFilter, '_id name phone branchCode').lean();
    } else if (targetRole === 'teacher') {
      targets = await Teacher.find({ role: 'teacher', status: { $in: ['Active', 'active'] }, ...branchFilter }, '_id name phone branchCode').lean();
    } else if (targetRole === 'admin') {
      // Gửi cho toàn bộ Admin/Staff
      targets = await Teacher.find({ role: { $in: ['admin', 'staff'] }, ...branchFilter }, '_id name phone adminRole branchCode').lean();
    }

    const io = req.app.get('io');
    const results = [];

    // BUG-07: Tạo tin nhắn hàng loạt bằng insertMany thay vì loop save
    const bulkDocs = [];
    for (const target of targets) {
      if (target._id.toString() === userId) continue;

      const receiverId = target._id.toString();
      const receiverName = target.name;
      const receiverRole = (targetRole === 'admin') 
        ? (target.adminRole === 'STAFF' ? 'staff' : 'admin') 
        : targetRole;

      const conversationId = buildConversationId(userRole, userId, receiverRole, receiverId);

      bulkDocs.push({
        conversationId,
        senderId: userId,
        senderName: userName || 'Người gửi',
        senderRole: userRole,
        senderBranchCode: senderDoc?.branchCode || '',
        receiverId,
        receiverName,
        receiverRole,
        receiverBranchCode: target.branchCode || '',
        content,
        messageType,
        fileUrl: fileUrl || '',
        fileName: fileName || '',
      });
    }

    // Batch insert (tối đa 200 mỗi lần để tránh quá tải)
    const BATCH_SIZE = 200;
    for (let i = 0; i < bulkDocs.length; i += BATCH_SIZE) {
      const batch = bulkDocs.slice(i, i + BATCH_SIZE);
      const saved = await Message.insertMany(batch, { ordered: false });
      results.push(...saved);
    }

    // Emit socket real-time cho từng người nhận
    if (io) {
      for (const msg of results) {
        const msgPayload = toClientMessage(msg);
        io.to(String(msg.receiverId)).emit('message:receive', msgPayload);
      }
      // Đồng bộ 1 lần cho admin/staff
      if (results.length > 0) {
        const lastPayload = toClientMessage(results[results.length - 1]);
        io.to('ALL_ADMIN').emit('message:receive', lastPayload);
        io.to('ALL_STAFF').emit('message:receive', lastPayload);
      }
    }

    res.json({ 
      success: true, 
      message: `Đã gửi tin nhắn tới ${results.length} người dùng.`,
      count: results.length 
    });

  } catch (err) {
    logger.error('[BROADCAST] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi gửi broadcast' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File quá lớn (tối đa 50MB).' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.message === 'Định dạng file không được phép') {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;
