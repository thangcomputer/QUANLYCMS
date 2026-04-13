const mongoose = require('mongoose');

const trainingProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Can be Teacher ID or 'admin'
  userRole: { type: String, enum: ['teacher', 'admin', 'staff'], default: 'teacher' },
  lessonId: { type: String, required: true },
  courseId: { type: String, required: true },
  status: { type: String, enum: ['locked', 'unlocked', 'completed'], default: 'locked' },
  watchedSeconds: { type: Number, default: 0 },  // ⭐ Giây xem thực tế (không tính tua)
  completedAt: { type: Date },
  lastWatchedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for fast progress lookup
trainingProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
trainingProgressSchema.index({ userId: 1, courseId: 1 });

module.exports = mongoose.model('TrainingProgress', trainingProgressSchema);
