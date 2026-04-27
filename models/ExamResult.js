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

// Indexes: tăng tốc truy vấn theo học viên, giảng viên, trạng thái thi
ExamResultSchema.index({ studentId: 1 });
ExamResultSchema.index({ teacherId: 1 });
ExamResultSchema.index({ passed: 1 });
ExamResultSchema.index({ studentId: 1, subject: 1 });

module.exports = mongoose.model('ExamResult', ExamResultSchema);
