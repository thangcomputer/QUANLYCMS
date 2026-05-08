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

// ✅ CHỐNG RACE CONDITION: Mỗi học viên chỉ có 1 bản nộp/bài tập
SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
