const mongoose = require('mongoose');

/**
 * Lưu cấu hình toàn hệ thống (Singleton document).
 * Dùng upsert với key cố định 'main' để luôn chỉ có 1 record.
 */
const systemSettingsSchema = new mongoose.Schema({
  _key: { type: String, default: 'main', unique: true },

  // ── Tài khoản ngân hàng thu học phí của Trung tâm ──────────────────
  centerBankCode: { type: String, default: '' },        // BIN/shortName từ VietQR
  centerBankName: { type: String, default: '' },        // Tên hiển thị
  centerBankAccountNumber: { type: String, default: '' },
  centerBankAccountName: { type: String, default: '' }, // Tên chủ tài khoản

  // ── Popup thông báo/quảng cáo (Student/Teacher) ─────────────────────
  popupIsActive: { type: Boolean, default: false },
  popupTitle: { type: String, default: '' },
  popupContent: { type: String, default: '' },
  popupImageUrl: { type: String, default: '' },
  popupTargetRole: {
    type: String,
    enum: ['all', 'student', 'teacher'],
    default: 'all',
  },

  // ── Cài đặt Web (Logo, Loading, Staff Popup) ─────────────────────
  logoUrl:      { type: String, default: '' },                 // URL logo thương hiệu
  loadingStyle: { type: Number, default: 1, min: 1, max: 4 }, // 1-4 kiểu loading screen

  // Staff Announcement Popup
  staffPopup: {
    isActive:  { type: Boolean, default: false },
    title:     { type: String, default: '' },
    content:   { type: String, default: '' },
    updatedAt: { type: Date,   default: Date.now },
  },

  // ── Training Data Raw (Dữ liệu Admin tạo ra cho khóa học nội bộ) ─────────
  trainingRawData: { 
    type: mongoose.Schema.Types.Mixed, 
    default: { videos: [], guides: [], files: [] } 
  },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
