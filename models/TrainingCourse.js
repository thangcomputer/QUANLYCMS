const mongoose = require('mongoose');

const trainingCourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  thumbnail: { type: String },
  instructor: { type: String, default: 'Thắng Tin Học' },
  totalLessons: { type: Number, default: 0 },
  category: { type: String, enum: ['CORE', 'OFFICE', 'DESIGN', 'SYSTEM', 'TEACHING'], default: 'TEACHING' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('TrainingCourse', trainingCourseSchema);
