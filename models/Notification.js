const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['SYSTEM', 'COURSE', 'FINANCE', 'EVALUATION', 'MESSAGE', 'EXAM', 'SCHEDULE'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  sender_id: {
    type: String,
    default: 'SYSTEM'
  },
  // "GLOBAL", "ALL_ADMIN", "ALL_TEACHER", or specific IDs
  receivers: [{
    type: String,
    required: true,
  }],
  // IDs of users who have read the notification
  read_by: [{
    type: String
  }],
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  path: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for faster queries later (if needed)
notificationSchema.index({ receivers: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
