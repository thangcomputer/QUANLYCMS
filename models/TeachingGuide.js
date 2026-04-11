const mongoose = require('mongoose');

const teachingGuideSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Tiêu đề là bắt buộc'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    enum: ['gv_moi', 'chuyen_mon', 'tai_lieu_hv'],
    required: true,
    // gv_moi       = Dành cho Giảng viên mới
    // chuyen_mon   = Kỹ năng chuyên môn
    // tai_lieu_hv  = Tài liệu cho học viên
  },
  type: {
    type: String,
    enum: ['video', 'file'],
    required: true,
  },
  // Video fields
  videoUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  duration: { type: String, default: '' }, // "15:30"

  // File fields
  fileUrl: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileSize: { type: String, default: '' }, // "2.4MB"
  fileType: { type: String, default: '' }, // PDF, XLSX, DOCX, PPTX

  // Metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
  },
  isActive: { type: Boolean, default: true },
  viewCount: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Index cho tìm kiếm nhanh
teachingGuideSchema.index({ category: 1, type: 1, isActive: 1 });

module.exports = mongoose.model('TeachingGuide', teachingGuideSchema);
