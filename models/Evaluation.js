const mongoose = require('mongoose');

const EvaluationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  targetTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  studentName: { type: String },
  teacherName: { type: String },
  courseName: { type: String },
  milestone: { type: String },
  type: { type: String, enum: ['teacher_rating', 'admin_feedback'], required: true },
  criteria: { type: Object },
  content: { type: String },
  read: { type: Boolean, default: false },
  isReadByAdmin: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Evaluation', EvaluationSchema);
