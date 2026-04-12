const mongoose = require('mongoose');

const trainingProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Can be Teacher ID
  userRole: { type: String, enum: ['teacher', 'admin', 'staff'], default: 'teacher' },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingLesson', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingCourse', required: true },
  status: { type: String, enum: ['locked', 'unlocked', 'completed'], default: 'locked' },
  completedAt: { type: Date },
  lastWatchedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for fast progress lookup
trainingProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
trainingProgressSchema.index({ userId: 1, courseId: 1 });

module.exports = mongoose.model('TrainingProgress', trainingProgressSchema);
