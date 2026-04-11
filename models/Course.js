const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên khóa học không được để trống'],
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
  },
  category: {
    type: String,
    enum: ['van-phong', 'do-hoa', 'lap-trinh', 'ai', 'chung-chi', 'khac'],
    default: 'van-phong',
  },
  description: {
    type: String,
    default: '',
  },
  shortDescription: {
    type: String,
    maxlength: 200,
    default: '',
  },
  thumbnail: {
    type: String,
    default: '',
  },
  price: {
    type: Number,
    required: [true, 'Giá khóa học không được để trống'],
    min: 0,
  },
  discountPrice: {
    type: Number,
    default: 0,
  },
  discountPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  totalSessions: {
    type: Number,
    required: true,
    min: 1,
    default: 12,
  },
  duration: {
    type: String,
    default: '4 tuần',
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  },
  format: {
    type: String,
    enum: ['online-1-1', 'online-group', 'offline', 'video'],
    default: 'online-1-1',
  },
  // Chương trình học
  curriculum: [{
    title: { type: String, required: true },
    sessions: { type: Number, default: 1 },
    duration: { type: String, default: '1 giờ 30 phút' },
    topics: [{ type: String }],
  }],
  // Phần mềm/Công cụ sử dụng
  tools: [{ type: String }],
  // Đối tượng phù hợp
  targetAudience: [{ type: String }],
  // Lợi ích
  benefits: [{ type: String }],
  // Trạng thái
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published',
  },
  featured: {
    type: Boolean,
    default: false,
  },
  // Thống kê
  enrollCount: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 5.0,
  },
  // SEO
  metaTitle: { type: String, default: '' },
  metaDescription: { type: String, default: '' },
}, {
  timestamps: true,
});

// Tạo slug từ name
courseSchema.pre('save', async function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  // Tính giá giảm
  if (this.discountPercent > 0) {
    this.discountPrice = Math.round(this.price * (1 - this.discountPercent / 100));
  }
});

courseSchema.index({ category: 1, status: 1 });

// Tính discountPrice khi UPDATE (findByIdAndUpdate bypass pre-save)
courseSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate();
  const price   = update?.price   ?? update?.$set?.price;
  const pct     = update?.discountPercent ?? update?.$set?.discountPercent;

  if (price !== undefined || pct !== undefined) {
    if (price !== undefined && pct !== undefined) {
      const dp = pct > 0 ? Math.round(price * (1 - pct / 100)) : price;
      if (!update.$set) update.$set = {};
      update.$set.discountPrice = dp;
    }
  }
});

// Virtual helper: giá thực tế thu
courseSchema.virtual('effectivePrice').get(function () {
  return this.discountPercent > 0 ? this.discountPrice : this.price;
});

module.exports = mongoose.model('Course', courseSchema);
