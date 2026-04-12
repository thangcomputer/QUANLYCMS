const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  courseId: { type: String, required: true }, // string course name or ID
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Assignment', AssignmentSchema);
