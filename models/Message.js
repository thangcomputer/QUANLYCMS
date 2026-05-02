const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Cuộc trò chuyện
  conversationId: {
    type: String,
    required: true,
    index: true,
    // Format: "role1_id1__role2_id2" (sắp xếp alphabetically)
  },

  // Người gửi
  senderId: {
    type: String,
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['admin', 'teacher', 'student', 'staff'],
    required: true,
  },
  senderBranchCode: {
    type: String,
    default: '',
  },

  // Người nhận
  receiverId: {
    type: String,
    required: true,
  },
  receiverName: {
    type: String,
    required: true,
  },
  receiverRole: {
    type: String,
    enum: ['admin', 'teacher', 'student', 'staff'],
    required: true,
  },
  receiverBranchCode: {
    type: String,
    default: '',
  },

  // Nội dung
  content: {
    type: String,
    required: [true, 'Nội dung tin nhắn không được trống'],
    maxlength: 2000,
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'image', 'system'],
    default: 'text',
  },
  fileUrl: { type: String, default: '' },
  fileName: { type: String, default: '' },

  // Trạng thái Read & Recall
  isRead:     { type: Boolean, default: false },
  readAt:     { type: Date },
  isRecalled: { type: Boolean, default: false },

  // Nhóm trò chuyện (nếu có)
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  isGroup: { type: Boolean, default: false },

  // Phản ứng (Heart, Like)
  reactions: [{
    type: { type: String }, // 'heart', 'like'
    userId: { type: String },
    userName: { type: String }
  }],

  // Danh sách ID người dùng đã Xóa mềm tin nhắn này
  hiddenFor: [{ type: String }],
}, {
  timestamps: true,
});

// Index cho truy vấn nhanh
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);
