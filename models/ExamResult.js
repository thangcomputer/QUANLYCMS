const mongoose = require('mongoose');

const ExamResultSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['student', 'teacher'],
    required: true,
    default: 'student',
  },

  // Học viên
  studentId:   { type: String, default: '' },
  studentName: { type: String, default: '' },

  // Giảng viên
  teacherId:   { type: String, default: '' },
  teacherName: { type: String, default: '' },

  // Môn/Bài thi
  subject: { type: String, default: '' },

  // Trắc nghiệm
  multipleChoiceCorrect: { type: Number, default: 0 },
  multipleChoiceTotal:   { type: Number, default: 0 },

  // Tự luận / Thực hành
  essayScore: { type: Number, default: null },
  essayNote:  { type: String, default: '' },

  // Kết quả
  passed: { type: Boolean, default: false },
  date:   { type: String, default: '' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ExamResult', ExamResultSchema);
