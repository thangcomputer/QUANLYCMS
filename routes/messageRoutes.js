const express = require('express');
const router  = express.Router();
const Message = require('../models/Message');
const Group   = require('../models/Group');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const ConversationVisibility = require('../models/ConversationVisibility');
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
      { adminRole: 'SUPER_ADMIN' },
      'name phone branchId branchCode'
    ).lean();
    const superAdminContacts = superAdmins.map(a => ({
      id:     'admin',          // ID cố định để route tin nhắn về một đầu mối
      name:   a.name || 'Admin Thắng Tin Học',
      role:   'admin',
      phone:  a.phone || '',
      avatar: 'AD',
      branchId: null,
      branchCode: ''
    }));

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

      staffContacts   = staffDocs.map(d => mapContact(d, 'admin'));
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

      staffContacts   = staffDocs.map(d => mapContact(d, 'admin'));
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

      staffContacts   = staffDocs.map(d => mapContact(d, 'admin'));
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
    console.error('[CONTACTS]', err);
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

    const messages = await Message.aggregate([
      { $match: { $or: [
        { senderId: userId },
        { receiverId: userId },
      ]}},
      { $sort: { createdAt: -1 }},
      { $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: { $sum: { $cond: [
          { $and: [
            { $eq: ['$receiverId', userId] },
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

    // Query toàn bộ dữ liệu thật, bỏ qua trường hiddenFor như yêu cầu đê tìm kiếm không bị miss
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      content: { $regex: q, $options: 'i' }
    }).sort({ createdAt: -1 }).limit(50);

    res.json({ success: true, data: messages });
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
    if (req.user.role !== 'admin' && !conversationId.includes(req.user.id)) {
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// ── Upload file ──
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file' });
    const fileUrl = `/${req.file.path.replace(/\\/g, '/')}`; // Normalize for frontend
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
    const senderRole = req.user.role;
    const senderName = req.user.name;

    const { receiverId, receiverName, receiverRole, content, isGroup, groupId, messageType, fileUrl, fileName } = req.body;

    let conversationId;
    if (isGroup && groupId) {
      conversationId = `group_${groupId}`;
    } else {
      conversationId = [
        `${senderRole}_${senderId}`,
        `${receiverRole}_${receiverId}`,
      ].sort().join('__');
    }

    const message = await Message.create({
      conversationId, senderId, senderName, senderRole,
      receiverId: isGroup ? groupId : receiverId, 
      receiverName: isGroup ? 'Group' : receiverName, 
      receiverRole: isGroup ? 'admin' : receiverRole, // Dummy for groups
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
        // Gửi cho người nhận
        req.app.notifyUser(receiverRole, receiverId, 'message:receive', message);
        // Gửi confirm lại cho người gửi  
        req.app.notifyUser(senderRole, senderId, 'message:sent', message);
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

// ── Lấy danh sách cuộc trò chuyện bị ẩn ──
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

// ── Đánh dấu đã đọc ──
router.put('/read/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const readerId = req.user.id;

    if (!conversationId.includes(readerId)) {
        return res.status(403).json({ success: false, message: 'Thao tác không hợp lệ' });
    }

    await Message.updateMany(
      { conversationId, receiverId: readerId, isRead: false },
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
    const count = await Message.countDocuments({
      receiverId: req.params.userId,
      isRead: false,
    });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
