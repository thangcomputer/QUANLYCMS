const mongoose = require('mongoose');

const trainingLessonSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingCourse', required: true },
  title: { type: String, required: true },
  description: { type: String },
  videoUrl: { type: String, required: true }, // YouTube URL or ID
  duration: { type: Number }, // in seconds
  orderIndex: { type: Number, required: true },
  chapterTitle: { type: String, default: 'Chương 1' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure unique ordering within a course
trainingLessonSchema.index({ courseId: 1, orderIndex: 1 }, { unique: true });

module.exports = mongoose.model('TrainingLesson', trainingLessonSchema);
