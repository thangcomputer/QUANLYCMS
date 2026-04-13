const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên nhóm không được để trống'],
    trim: true,
  },
  avatar: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  // Danh sách thành viên
  participants: [{
    userId: { type: String, required: true },
    name:   { type: String, required: true },
    role:   { type: String, enum: ['admin', 'teacher', 'student', 'staff'], required: true },
    joinedAt: { type: Date, default: Date.now }
  }],
  // Người tạo nhóm
  createdBy: {
    userId: { type: String, required: true },
    name:   { type: String },
  },
  // Tin nhắn cuối cùng để hiển thị ở sidebar
  lastMessage: {
    content:   { type: String, default: '' },
    senderName: { type: String, default: '' },
    sentAt:    { type: Date, default: Date.now }
  }
}, {
  timestamps: true,
});

// Index để tìm kiếm nhanh nhóm của một user
groupSchema.index({ 'participants.userId': 1 });

module.exports = mongoose.model('Group', groupSchema);
