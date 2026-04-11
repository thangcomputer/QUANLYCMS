const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  course_id: { type: String, required: true }, // Using String as Course name or ID, flexible
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  attached_file_url: { type: String, default: '' },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Assignment', AssignmentSchema);
