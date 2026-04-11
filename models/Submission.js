const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
  assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  submitted_file_url: { type: String, required: true },
  status: { type: String, enum: ['ON_TIME', 'LATE', 'MISSING'], default: 'ON_TIME' },
  grade: { type: Number, min: 0, max: 10, default: null },
  teacher_feedback: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Submission', SubmissionSchema);
