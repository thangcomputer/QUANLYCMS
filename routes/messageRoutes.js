const express = require('express');
const router  = express.Router();
const Message = require('../models/Message');
const Group   = require('../models/Group');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const ConversationVisibility = require('../models/ConversationVisibility');
const logger = require('../config/logger');
const { buildConversationId } = require('../utils/chatConversationId');
const isStaffAccount = (u = {}) => u.role === 'staff' || u.adminRole === 'STAFF';
const isSuperAdminAccount = (u = {}) => u.id === 'admin' || u.adminRole === 'SUPER_ADMIN';

/** Hiển thị tin nhắn tới học viên: STAFF vs SUPER_ADMIN */
const DEPT_STAFF_LABEL = 'Phòng Giáo Vụ';
const DEPT_SUPER_LABEL = 'Phòng Tuyển Sinh';

function staffDisplayName(rawName, branchCode) {
  const base = rawName || DEPT_STAFF_LABEL;
  const bc = (branchCode || '').trim();
  return bc ? `${base} (P.Giáo Vụ-${bc})` : `${base} (P.Giáo Vụ)`;
}

function deptOutboundToStudent(reqUser) {
  if (isStaffAccount(reqUser)) return DEPT_STAFF_LABEL;
  if (isSuperAdminAccount(reqUser)) return DEPT_SUPER_LABEL;
  if (reqUser.role === 'admin' || reqUser.role === 'staff') return DEPT_SUPER_LABEL;
  return null;
}
// AdminUser was wrong, they are stored in Teacher

// ══ GET /api/chat/contacts  ──  RBAC/ABAC Matrix ══
// ┌────────────────┼────────────────────────────────────────────┐
// │ CALLER         │ CÓ THỂ THẤY                                         │
// ├────────────────┼────────────────────────────────────────────┤
// │ STUDENT        │ SuperAdmin + STAFF(cùng branch) + Teacher(đang dạy mình)   │
// │ TEACHER        │ SuperAdmin + STAFF(cùng branch) + Student(được phân công) │
// │ STAFF          │ SuperAdmin + Teacher(cùng branch) + Student(cùng branch)   │
// │ SUPER_ADMIN    │ Tất cả (có filter theo branch trên query)                  │
// └────────────────┴────────────────────────────────────────────┘
router.get('/contacts', async (req, res) => {
  try {
    const { role: userRole, id: userId, adminRole } = req.user;
    const { branch_id: queryBranchId } = req.query; // SUPER_ADMIN có thể lọc theo CS

    // Helper: định dạng contact trả về
    const mapContact = (doc, role) => ({
      id:     doc._id.toString(),
      name:   doc.name || 'Không rõ tên',
      role,
      phone:  doc.phone || '',
      avatar: String(doc.name || 'U').substring(0, 2).toUpperCase(),
      branchId:   doc.branchId   ? doc.branchId.toString()   : null,
      branchCode: doc.branchCode || ''
    });

    // ────── [1] SuperAdmin luon được lay truoc (mọi role đèu tháy) ──────
    const superAdmins = await Teacher.find(
      { $or: [{ adminRole: 'SUPER_ADMIN' }, { role: 'admin', adminRole: { $ne: 'STAFF' } }] },
      'name phone branchId branchCode'
    ).lean();

    const superAdminContacts = superAdmins.map(a => ({
      id:     a._id.toString(),
      name:   DEPT_SUPER_LABEL,
      role:   'admin',
      phone:  a.phone || '',
      avatar: 'AD',
      branchId: a.branchId || null,
      branchCode: a.branchCode || ''
    }));

    // Luôn đảm bảo có ít nhất 1 tài khoản Admin hệ thống (hardcoded 'admin')
    if (!superAdminContacts.some(c => c.id === 'admin')) {
      superAdminContacts.unshift({
        id: 'admin',
        name: DEPT_SUPER_LABEL,
        role: 'admin',
        phone: '0935758462',
        avatar: 'AD',
        branchId: null,
        branchCode: 'HỆ THỐNG'
      });
    }

    let staffContacts    = [];
    let teacherContacts  = [];
    let studentContacts  = [];

    // ══ [2] SUPER_ADMIN: xem toàn hệ thống, có hỗ trợ filter branch ══
    if (adminRole === 'SUPER_ADMIN') {
      const branchFilter = queryBranchId && queryBranchId !== 'all'
        ? { branchId: queryBranchId }
        : {};

      const [staffDocs, teacherDocs, studentDocs] = await Promise.all([
        Teacher.find({ adminRole: 'STAFF', ...branchFilter },
                     'name phone branchId branchCode').lean(),
        Teacher.find({ role: 'teacher', status: { $in: ['Active', 'active'] }, ...branchFilter },
                     'name phone branchId branchCode').lean(),
        Student.find({ ...branchFilter },
                     'name phone branchId branchCode').lean(),
      ]);

      staffContacts   = staffDocs.map(d => ({
        ...mapContact(d, 'admin'),
        name: staffDisplayName(d.name, d.branchCode),
      }));
      teacherContacts = teacherDocs.map(d => mapContact(d, 'teacher'));
      studentContacts = studentDocs.map(d => mapContact(d, 'student'));
    }

    // ══ [3] STAFF ADMIN: chỉ thấy dữ liệu cùng branch ══
    else if (adminRole === 'STAFF') {
      // Lấy branchId của STAFF từ DB (máy chủ tin cậy hơn token)
      const staffUser = await Teacher.findById(userId).select('branchId').lean();
      const staffBranchId = staffUser?.branchId ? staffUser.branchId.toString() : null;

      if (!staffBranchId) {
        // STAFF chưa có branch → chỉ thấy SuperAdmin
        return res.json({ success: true, data: superAdminContacts });
      }

      const [teacherDocs, studentDocs] = await Promise.all([
        Teacher.find(
          { role: 'teacher', status: { $in: ['Active', 'active'] }, branchId: staffBranchId },
          'name phone branchId branchCode'
        ).lean(),
        Student.find(
          { branchId: staffBranchId },
          'name phone branchId branchCode'
        ).lean(),
      ]);

      const staffDoc = await Teacher.findById(userId).select('name branchCode').lean();
      staffContacts = staffDoc ? [{
        ...mapContact(staffDoc, 'admin'),
        name: staffDisplayName(staffDoc.name, staffDoc.branchCode),
      }] : [];
      teacherContacts = teacherDocs.map(d => mapContact(d, 'teacher'));
      studentContacts = studentDocs.map(d => mapContact(d, 'student'));
    }

    // ══ [4] TEACHER: chỉ thấy STAFF cùng branch + Student được phân công ══
    else if (userRole === 'teacher') {
      const teacher = await Teacher.findById(userId).select('branchId').lean();
      const teacherBranchId = teacher?.branchId ? teacher.branchId.toString() : null;

      const [staffDocs, studentDocs] = await Promise.all([
        // STAFF cùng chi nhánh
        teacherBranchId
          ? Teacher.find(
              { adminRole: 'STAFF', branchId: teacherBranchId },
              'name phone branchId branchCode'
            ).lean()
          : Promise.resolve([]),
        // Student được phân công triệt để (teacherId là ObjectId)
        Student.find(
          { teacherId: userId },
          'name phone branchId branchCode'
        ).lean(),
      ]);

      staffContacts   = staffDocs.map(d => ({
        ...mapContact(d, 'admin'),
        name: staffDisplayName(d.name, d.branchCode),
      }));
      studentContacts = studentDocs.map(d => mapContact(d, 'student'));
      // Không thêm GV khác vào danh bạ
    }

    // ══ [5] STUDENT: chỉ thấy STAFF cùng branch + Teacher đang dạy mình ══
    else if (userRole === 'student') {
      const student = await Student.findById(userId)
        .select('branchId teacherId')
        .lean();

      const studentBranchId = student?.branchId ? student.branchId.toString() : null;
      const myTeacherId     = student?.teacherId ? student.teacherId.toString() : null;

      const [staffDocs, teacherDocs] = await Promise.all([
        // STAFF cùng chi nhánh
        studentBranchId
          ? Teacher.find(
              { adminRole: 'STAFF', branchId: studentBranchId },
              'name phone branchId branchCode'
            ).lean()
          : Promise.resolve([]),
        // Chỉ GV được phân công trực tiếp
        myTeacherId
          ? Teacher.find(
              { _id: myTeacherId, role: 'teacher' },
              'name phone branchId branchCode'
            ).lean()
          : Promise.resolve([]),
      ]);

      staffContacts   = staffDocs.map(d => ({
        ...mapContact(d, 'admin'),
        name: staffDisplayName(d.name, d.branchCode),
      }));
      teacherContacts = teacherDocs.map(d => mapContact(d, 'teacher'));
      // Không thêm HV khác vào danh bạ
    }

    // ──── Hợp nhất ────
    const contacts = [
      ...superAdminContacts,
      ...staffContacts,
      ...teacherContacts,
      ...studentContacts,
    ];

    // Loại trừ chính mình khỏi danh bạ (nếu bị include)
    const selfId = userId?.toString();
    const deduped = contacts.filter(c => c.id !== selfId);

    res.json({ success: true, data: deduped });
  } catch (err) {
    logger.error('[CONTACTS]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ── Lấy danh sách cuộc trò chuyện ──
router.get('/conversations/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Bảo vệ: Chỉ Admin hoặc chính User đó mới được xem
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }

    // Branch Filtering logic
    const isSuperAdmin = isSuperAdminAccount(req.user);
    const userBranch = req.user.branchCode || '';

    const matchQuery = { 
      $or: [
        { senderId: userId },
        { receiverId: userId },
        // Hộp chung admin (admin_admin) chỉ dành cho SUPER_ADMIN
        ...(isSuperAdminAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
      ]
    };

    // If STAFF or TEACHER, filter by their branch
    if (!isSuperAdmin && userBranch) {
      matchQuery.$and = [
        { $or: [
          { senderBranchCode: userBranch },
          { receiverBranchCode: userBranch },
          // Không leak hộp chung admin cho STAFF/TEACHER
          ...(isSuperAdminAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
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
            { $in: ['$receiverId', isSuperAdminAccount(req.user) ? ['admin', String(userId)] : [String(userId)]] },
            { $eq: ['$isRead', false] },
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

    res.json({ success: true, data: conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Tìm kiếm tin nhắn toàn cục (bỏ qua is_hidden) ──
router.get('/search/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { q } = req.query;
    
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tìm kiếm' });
    }

    if (!q) return res.json({ success: true, data: [] });

    const sanitizeRegex = require('../middleware/sanitizeRegex');
    const safeQ = sanitizeRegex(q);

    const isSuperAdmin = isSuperAdminAccount(req.user);
    const userBranch = req.user.branchCode || '';

    const searchQuery = {
      $or: [
        { senderId: userId }, 
        { receiverId: userId },
        ...(isSuperAdminAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : [])
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

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy danh sách cuộc trò chuyện bị ẨN (phải đặt TRƯỚC /:conversationId vì không thì "hidden" bị coi là conversationId → 403) ──
router.get('/hidden', async (req, res) => {
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
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Bảo vệ: Phải là một trong hai bên trong conversationId (hoặc Admin)
    // conversationId format: role_id__role_id (sorted)
    const isStaffOrAdmin = req.user.role === 'admin' || isStaffAccount(req.user);
    const isParticipant = (() => {
      const parts = String(conversationId || '').split('__').filter(Boolean);
      const hasSelf = parts.some((p) => p.endsWith(`_${req.user.id}`));
      if (hasSelf) return true;
      // Chỉ super admin (hardcoded admin / SUPER_ADMIN) mới được xem hộp chung admin_admin
      if (isStaffOrAdmin && isSuperAdminAccount(req.user)) {
        return parts.includes('admin_admin');
      }
      return false;
    })();

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Bạn không thuộc cuộc hội thoại này' });
    }
    const messages = await Message.find({ 
      conversationId: req.params.conversationId,
      hiddenFor: { $ne: req.user.id }
    })
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy toàn bộ tin nhắn của một user (để đồng bộ) ──
router.get('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền đồng bộ dữ liệu này' });
    }

    // Lấy các nhóm mà user là thành viên
    const userGroups = await Group.find({ 'participants.userId': userId });
    const groupIds = userGroups.map(g => String(g._id));

    // Lấy tin nhắn cá nhân + tin nhắn nhóm
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId },
        ...(isSuperAdminAccount(req.user) ? [{ senderId: 'admin' }, { receiverId: 'admin' }] : []),
        // Tin nhắn nhóm: conversationId bắt đầu bằng "group_" và thuộc nhóm của user
        ...(groupIds.length > 0 ? [{ conversationId: { $in: groupIds.map(id => `group_${id}`) } }] : [])
      ],
      hiddenFor: { $ne: userId }
    }).sort({ createdAt: 1 });

    res.json({ success: true, data: messages });
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
    const okMime = /^(image\/|application\/pdf|application\/zip|application\/vnd\.|text\/plain|video\/|audio\/)/.test(file.mimetype || '');
    const okExt = allowedMsgExt.test(file.originalname || '');
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Định dạng file không được phép'));
  },
});

// ── Upload file ──
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file' });
    const fileUrl = `/${req.file.path.replace(/\\/g, '/')}`;
    res.json({ success: true, url: fileUrl, name: req.file.originalname });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Gửi tin nhắn ──
router.post('/', async (req, res) => {
  try {
    // Luôn dùng ID và Role từ token để ngăn chặn giả mạo (impersonation)
    const senderId = req.user.id;
    // Thống nhất role admin cho cả SUPER_ADMIN và STAFF trong hệ thống Chat
    const senderRole = isStaffAccount(req.user) ? 'admin' : req.user.role;
    const senderName = req.user.name;

    const { receiverId, receiverName, receiverRole, content, isGroup, groupId, messageType, fileUrl, fileName } = req.body;

    const isBroadcast = receiverId === 'ALL_USERS' || receiverId === 'ALL_STUDENTS' || receiverId === 'ALL_TEACHERS';

    let conversationId;
    if (isGroup && groupId) {
      conversationId = `group_${groupId}`;
    } else if (isBroadcast) {
      conversationId = req.body.conversationId || [`${senderRole}_${senderId}`, `system_${String(receiverId).replace(/[^a-zA-Z0-9_]/g, '_')}`].sort().join('__');
    } else {
      // Luôn tính từ server (bỏ qua client) để HV→staff có conversationId riêng, không gộp nhầm với hộp admin
      conversationId = buildConversationId(senderRole, senderId, receiverRole, receiverId);
    }

    // Tìm branchCode của cả 2 bên để lưu vào Message (Cần check ID hợp lệ tránh lỗi findById('admin'))
    const Teacher = require('../models/Teacher');
    const Student = require('../models/Student');
    const mongoose = require('mongoose');
    
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

    let rBranch = '';
    if (!isGroup) {
      if (receiverId === 'admin') {
        rBranch = 'HỆ THỐNG';
      } else if (mongoose.Types.ObjectId.isValid(receiverId)) {
        if (receiverRole === 'teacher' || receiverRole === 'admin' || receiverRole === 'staff') {
          const t = await Teacher.findById(receiverId).select('branchCode').lean();
          rBranch = t?.branchCode || '';
        } else if (receiverRole === 'student') {
          const s = await Student.findById(receiverId).select('branchCode').lean();
          rBranch = s?.branchCode || '';
        }
      }
    }

    // ⭐ CHỐNG CHÉO CHI NHÁNH (Cross-Branch Protection)
    const isSuperAdmin = isSuperAdminAccount(req.user);
    if (!isSuperAdmin && (senderRole === 'admin' || senderRole === 'staff') && receiverRole === 'student') {
        // Staff messaging student
        if (sBranch && rBranch && sBranch !== rBranch) {
            return res.status(403).json({ success: false, message: 'Bạn không được phép nhắn tin cho học viên chi nhánh khác' });
        }
    }

    // Tên hiển thị: STAFF → "<tên gốc> (P.Giáo Vụ-CSx)", SUPER → "Phòng Tuyển Sinh"
    let finalSenderId = senderId;
    let finalSenderName = senderName;
    if (receiverRole === 'student' && (req.user.role === 'admin' || req.user.role === 'staff')) {
      if (isStaffAccount(req.user)) {
        finalSenderName = staffDisplayName(senderName, sBranch);
      } else if (isSuperAdminAccount(req.user)) {
        finalSenderName = DEPT_SUPER_LABEL;
      }
    }
    
    // Học viên → admin/staff: chỉ gộp receiverId = 'admin' khi nhắn vào hộp thư chung (id chữ "admin" hoặc không phải ObjectId).
    // Nếu chọn staff / admin cụ thể (ObjectId) → lưu đúng receiverId để super admin không thấy tin nhắn riêng của chi nhánh.
    let finalReceiverId = isBroadcast ? receiverId : (isGroup ? groupId : receiverId);
    let finalReceiverName = isBroadcast ? 'Thông báo hệ thống' : (isGroup ? 'Group' : receiverName);
    if (!isBroadcast && !isGroup && senderRole === 'student' && (receiverRole === 'admin' || receiverRole === 'staff')) {
      const rid = String(receiverId || '');
      if (rid === 'admin' || !mongoose.Types.ObjectId.isValid(rid)) {
        finalReceiverId = 'admin';
        finalReceiverName = DEPT_SUPER_LABEL;
      } else {
        finalReceiverId = rid;
        finalReceiverName = staffDisplayName(receiverName, rBranch);
      }
    }

    const message = await Message.create({
      conversationId, 
      senderId: finalSenderId, 
      senderName: finalSenderName, 
      senderRole,
      senderBranchCode: sBranch,
      receiverId: finalReceiverId, 
      receiverName: finalReceiverName, 
      receiverRole: isBroadcast ? 'system' : (isGroup ? 'admin' : receiverRole), 
      receiverBranchCode: rBranch,
      content,
      messageType: messageType || 'text',
      fileUrl: fileUrl || '',
      fileName: fileName || '',
      isGroup: isGroup || false,
      groupId: isGroup ? groupId : null,
    });

    // Cập nhật Group lastMessage
    if (isGroup && groupId) {
      await Group.findByIdAndUpdate(groupId, {
        lastMessage: { content, senderName, sentAt: new Date() }
      });
    }

    // Auto-Unhide: Tự động xóa mảng ẩn khi có tin nhắn mới tới để hiển thị lại
    const ConversationVisibility = require('../models/ConversationVisibility');
    await ConversationVisibility.findOneAndUpdate(
      { conversationId },
      { $set: { hiddenByUsers: [] } },
      { upsert: true }
    );

    // Gửi qua Socket.io real-time
    const io = req.app.get('io');
    if (io) {
      if (isGroup && groupId) {
        // Phát cho cả room group
        io.to(`group_${groupId}`).emit('message:receive', message);
      } else {
        // 1. Gửi cho người nhận (dùng bản đã lưu — receiverId có thể là 'admin' hoặc ObjectId staff/admin cụ thể)
        req.app.notifyUser(message.receiverRole, message.receiverId, 'message:receive', message);

        // 2. Confirm lại cho người gửi (để UI gửi xong cập nhật)
        if (senderRole !== 'admin' && senderRole !== 'staff') {
          // Nếu là HV/GV gửi cho Admin -> notifyUser người nhận đã xử lý ở bước 1
          // Chỉ cần gửi confirm lại cho người gửi
          req.app.notifyUser(senderRole, senderId, 'message:sent', message);
        }
      }
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Ẩn cuộc trò chuyện ──
router.post('/hide/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    await ConversationVisibility.findOneAndUpdate(
      { conversationId },
      { $addToSet: { hiddenByUsers: userId } },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Đã ẩn cuộc trò chuyện' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Đánh dấu đã đọc ──
router.put('/read/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const readerId = req.user.id;
    const isStaffOrAdmin = req.user.role === 'admin' || isStaffAccount(req.user);
    const isParticipant = (() => {
      const parts = String(conversationId || '').split('__').filter(Boolean);
      const hasSelf = parts.some((p) => p.endsWith(`_${readerId}`));
      if (hasSelf) return true;
      if (isStaffOrAdmin && isSuperAdminAccount(req.user)) {
        return parts.includes('admin_admin');
      }
      return false;
    })();
    
    if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Thao tác không hợp lệ' });
    }

    const receiverTargets = isSuperAdminAccount(req.user)
      ? ['admin', String(readerId)]
      : [String(readerId)];

    await Message.updateMany(
      { conversationId, receiverId: { $in: receiverTargets }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ success: true, message: 'Đã đánh dấu đọc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Phản ứng (Reaction) ──
router.patch('/:messageId/reaction', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { type } = req.body; // 'heart' or 'like'
    const userId = req.user.id;
    const userName = req.user.name;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

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
        // Phát cho cả room group
        io.to(`group_${message.groupId}`).emit('message:reaction', { 
           messageId: message._id, 
           reactions: message.reactions,
           groupId: message.groupId,
           conversationId: message.conversationId 
        });
      } else {
        // Thông báo cho cả 2 bên (sender & receiver)
        const parts = (message.conversationId || '').split('__');
        parts.forEach(p => {
          if (!p) return;
          const [role, id] = p.split('_');
          if (role && id) {
            req.app.notifyUser(role, id, 'message:reaction', { 
              messageId: message._id, 
              reactions: message.reactions,
              conversationId: message.conversationId 
            });
          }
        });
      }
    }

    res.json({ success: true, data: message.reactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Thu hồi tin nhắn ──
router.patch('/:messageId/recall', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

    if (message.senderId !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thu hồi tin nhắn này' });
    }

    // 24h limit check
    const now = new Date();
    const sentAt = new Date(message.createdAt);
    const diffHours = (now - sentAt) / (1000 * 60 * 60);
    if (diffHours > 24) {
      return res.status(403).json({ success: false, message: 'Chỉ có thể thu hồi tin nhắn trong vòng 24 giờ kể từ lúc gửi' });
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
        const parts = message.conversationId.split('__');
        parts.forEach(p => {
          const [role, id] = p.split('_');
          req.app.notifyUser(role, id, 'message:recall', { 
            messageId: message._id, 
            conversationId: message.conversationId 
          });
        });
      }
    }

    res.json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Xóa mềm tin nhắn (Chỉ xóa phía mình) ──
router.patch('/:messageId/soft-delete', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Không tìm thấy tin nhắn' });

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

// ── Tạo nhóm mới ──
router.post('/groups', async (req, res) => {
  try {
    if (req.user.role === 'student') {
        return res.status(403).json({ success: false, message: 'Học viên không có quyền tạo nhóm' });
    }
    const { name, participants } = req.body;
    const group = await Group.create({
      name,
      participants: [...participants, { userId: req.user.id, name: req.user.name, role: req.user.role }],
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
router.get('/groups/user/:userId', async (req, res) => {
  try {
    const groups = await Group.find({ 'participants.userId': req.params.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Xóa nhóm vĩnh viễn ──
router.delete('/groups/:groupId', async (req, res) => {
  try {
    if (req.user.role === 'student') {
        return res.status(403).json({ success: false, message: 'Học viên không có quyền xóa nhóm' });
    }
    const { groupId } = req.params;
    
    // Xóa tất cả tin nhắn của nhóm này
    await Message.deleteMany({ conversationId: `group_${groupId}` });
    
    // Xóa Group
    await Group.findByIdAndDelete(groupId);

    res.json({ success: true, message: 'Đã xóa nhóm vĩnh viễn' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Lấy số tin nhắn chưa đọc ──
router.get('/unread/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) {
       return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối' });
    }
    const receiverTargets = isSuperAdminAccount(req.user) ? ['admin', String(userId)] : [String(userId)];
    const count = await Message.countDocuments({
      receiverId: { $in: receiverTargets },
      isRead: false,
    });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ══ POST /api/chat/broadcast  ──  Gửi tin nhắn hàng loạt ══
router.post('/broadcast', async (req, res) => {
  try {
    const { role: userRole, id: userId, adminRole, name: userName } = req.user;
    const { targetRole, content, messageType = 'text', fileUrl, fileName } = req.body;

    // Chỉ Admin hoặc STAFF mới được gửi broadcast
    if (userRole !== 'admin' && userRole !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });
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

    // Tạo tin nhắn cho từng người nhận
    for (const target of targets) {
      // Không tự gửi cho chính mình
      if (target._id.toString() === userId) continue;

      const receiverId = target._id.toString();
      const receiverName = target.name;
      const receiverRole = (targetRole === 'admin') 
        ? (target.adminRole === 'STAFF' ? 'staff' : 'admin') 
        : targetRole;

      const conversationId = buildConversationId(userRole, userId, receiverRole, receiverId);

      const finalSenderId = userId;
      const finalSenderName = (receiverRole === 'student')
        ? (adminRole === 'STAFF' ? staffDisplayName(userName, senderDoc?.branchCode) : DEPT_SUPER_LABEL)
        : userName;

      const newMsg = new Message({
        conversationId,
        senderId: finalSenderId,
        senderName: finalSenderName,
        senderRole: userRole,
        senderBranchCode: senderDoc?.branchCode || '',
        receiverId,
        receiverName,
        receiverRole,
        receiverBranchCode: target.branchCode || '',
        content,
        messageType,
        fileUrl,
        fileName,
      });

      await newMsg.save();
      results.push(newMsg);

      // Emit socket real-time
      if (io) {
        const msgPayload = {
          ...newMsg.toObject(),
          _id: newMsg._id,
        };
        // 1. Gửi trực tiếp cho người nhận qua room cá nhân
        io.to(receiverId).emit('message:receive', msgPayload);
        // 2. Đồng bộ cho Team Admin
        io.to('ADMIN_TEAM').emit('message:receive', msgPayload);
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

