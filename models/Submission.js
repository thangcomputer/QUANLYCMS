const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: false },
  submittedFileUrl: { type: String, required: true },
  status: { type: String, enum: ['submitted', 'late', 'graded'], default: 'submitted' },
  grade: { type: Number, min: 0, max: 10, default: null },
  teacherFeedback: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Submission', SubmissionSchema);
