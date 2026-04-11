const express = require('express');
const Course  = require('../models/Course');

const router = express.Router();

// ─── GET /api/courses ─────────────────────────────────────────────────────────
// Lấy tất cả khóa học (hỗ trợ filter)
router.get('/', async (req, res) => {
  try {
    const { category, status, featured, search } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (status)   filter.status = status;
    if (featured) filter.featured = featured === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const courses = await Course.find(filter).sort({ featured: -1, createdAt: -1 });

    return res.json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error('[COURSES] Get all error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/courses/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findOne({
      $or: [
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
        { slug: req.params.id },
      ],
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }

    return res.json({ success: true, data: course });
  } catch (error) {
    console.error('[COURSES] Get by ID error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── Utility: tính giá sau giảm ────────────────────────────────────────────────
function calcEffectivePrice(price, discountPercent) {
  if (!discountPercent || discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100));
}

// ─── POST /api/courses ────────────────────────────────────────────────────────
// Tạo khóa học mới
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    // Tự động tính discountPrice
    if (body.price !== undefined) {
      body.discountPrice = calcEffectivePrice(Number(body.price), Number(body.discountPercent || 0));
    }
    const course = await Course.create(body);
    return res.status(201).json({
      success: true,
      message: `Đã tạo khóa học: ${course.name}`,
      data: { ...course.toObject(), effectivePrice: course.discountPercent > 0 ? course.discountPrice : course.price },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Tên khóa học đã tồn tại' });
    }
    console.error('[COURSES] Create error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
});

// ─── PUT /api/courses/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    // Tự động tính discountPrice
    if (body.price !== undefined || body.discountPercent !== undefined) {
      const course = await Course.findById(req.params.id).lean();
      const price  = Number(body.price ?? course?.price ?? 0);
      const pct    = Number(body.discountPercent ?? course?.discountPercent ?? 0);
      body.discountPrice = calcEffectivePrice(price, pct);
    }

    const updated = await Course.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }

    const ep = updated.discountPercent > 0 ? updated.discountPrice : updated.price;
    return res.json({
      success: true,
      message: `Đã cập nhật khóa học: ${updated.name}`,
      data: { ...updated.toObject(), effectivePrice: ep },
    });
  } catch (error) {
    console.error('[COURSES] Update error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PATCH /api/courses/:id/price ─────────────────────────────────────────────
// Cập nhật nhanh giá + % giảm
router.patch('/:id/price', async (req, res) => {
  try {
    const { price, discountPercent = 0 } = req.body;
    if (price === undefined || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ success: false, message: 'Giá không hợp lệ' });
    }
    const dp = calcEffectivePrice(Number(price), Number(discountPercent));
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { price: Number(price), discountPercent: Number(discountPercent), discountPrice: dp },
      { new: true, runValidators: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    return res.json({
      success: true,
      message: `Đã cập nhật giá: ${dp.toLocaleString('vi-VN')}đ`,
      data: { ...course.toObject(), effectivePrice: dp },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── DELETE /api/courses/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }

    return res.json({
      success: true,
      message: `Đã xóa khóa học: ${course.name}`,
    });
  } catch (error) {
    console.error('[COURSES] Delete error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/courses/seed ───────────────────────────────────────────────────
// Seed dữ liệu mẫu (Development only)
router.post('/seed', async (req, res) => {
  try {
    const count = await Course.countDocuments();
    if (count > 0) {
      return res.json({ success: true, message: `Đã có ${count} khóa học, bỏ qua seed.` });
    }

    const seedCourses = [
      {
        name: 'Tin Học Văn Phòng Cơ Bản',
        category: 'van-phong',
        description: 'Khóa học được thiết kế chuyên biệt cho người đi làm, giúp bạn nâng cao kỹ năng sử dụng Word, Excel và PowerPoint.',
        shortDescription: 'Word, Excel, PowerPoint cho người mới bắt đầu',
        price: 2699000,
        discountPercent: 10,
        totalSessions: 12,
        duration: '4 tuần',
        level: 'beginner',
        format: 'online-1-1',
        tools: ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Ultraviewer'],
        targetAudience: ['Người mới bắt đầu', 'Người đi làm', 'Sinh viên'],
        benefits: [
          'Học kèm 1-1, bám sát mục tiêu công việc',
          'Lịch học linh hoạt theo thời gian rảnh',
          'Có video xem lại từng buổi học',
          'Hỗ trợ 24/7 qua nhóm Zalo',
        ],
        curriculum: [
          { title: 'Buổi Đầu Làm Quen Về Máy Tính', sessions: 1, duration: '1 giờ 30 phút', topics: ['Hướng dẫn bàn phím, gõ 10 ngón tay', 'Tạo thư mục, sao chép, di chuyển file', 'Công nghệ AI vào đời sống'] },
          { title: 'Làm quen phần mềm Word', sessions: 2, duration: '3 giờ', topics: ['Gõ văn bản có dấu', 'Định dạng chữ và đoạn văn', 'Chèn hình ảnh, bảng, mục lục tự động'] },
          { title: 'Làm quen phần mềm Excel', sessions: 4, duration: '6 giờ', topics: ['Công thức cơ bản: SUM, AVERAGE, IF', 'Hàm VLOOKUP, HLOOKUP', 'Biểu đồ và Pivot Table'] },
          { title: 'Làm quen phần mềm PowerPoint', sessions: 2, duration: '3 giờ', topics: ['Thiết kế slide chuyên nghiệp', 'Hiệu ứng chuyển slide', 'Trình chiếu và xuất PDF'] },
        ],
        featured: true,
        status: 'published',
      },
      {
        name: 'Tin Học Văn Phòng Nâng Cao',
        category: 'van-phong',
        description: 'Nâng cao kỹ năng Excel, Word chuyên sâu cho người đã có kiến thức cơ bản.',
        shortDescription: 'Excel nâng cao, Word chuyên sâu, PowerPoint pro',
        price: 3499000,
        discountPercent: 0,
        totalSessions: 12,
        duration: '4 tuần',
        level: 'intermediate',
        format: 'online-1-1',
        tools: ['Microsoft Excel', 'Microsoft Word', 'Microsoft PowerPoint'],
        targetAudience: ['Nhân viên văn phòng', 'Kế toán', 'Quản lý'],
        benefits: ['Excel nâng cao: Pivot, Macro, VBA cơ bản', 'Word: Mail Merge, Template pro', 'Chứng chỉ hoàn thành khóa học'],
        curriculum: [
          { title: 'Excel Nâng Cao', sessions: 6, duration: '9 giờ', topics: ['Hàm nâng cao: VLOOKUP, INDEX/MATCH', 'Pivot Table & Pivot Chart', 'Data Validation, Conditional Formatting'] },
          { title: 'Word Chuyên Sâu', sessions: 3, duration: '4.5 giờ', topics: ['Mail Merge', 'Template & Macro', 'Tạo form chuyên nghiệp'] },
          { title: 'PowerPoint Pro', sessions: 3, duration: '4.5 giờ', topics: ['Master Slide', 'Animation nâng cao', 'Infographic & Data Viz'] },
        ],
        featured: true,
        status: 'published',
      },
      {
        name: 'Khóa Học Sử Dụng Photoshop Cơ Bản',
        category: 'do-hoa',
        description: 'Học Photoshop từ zero đến hero, phù hợp cho người muốn chỉnh sửa ảnh và thiết kế cơ bản.',
        shortDescription: 'Chỉnh sửa ảnh, thiết kế cơ bản với Photoshop',
        price: 3200000,
        totalSessions: 10,
        duration: '3 tuần',
        level: 'beginner',
        format: 'online-1-1',
        tools: ['Adobe Photoshop', 'Canva'],
        featured: false,
        status: 'published',
      },
      {
        name: 'Chỉnh Sửa Ảnh Canva Nâng Cao',
        category: 'do-hoa',
        description: 'Thiết kế chuyên nghiệp với Canva — poster, banner, social media content.',
        shortDescription: 'Thiết kế poster, banner chuyên nghiệp bằng Canva',
        price: 1999000,
        totalSessions: 8,
        duration: '2 tuần',
        level: 'intermediate',
        format: 'online-1-1',
        tools: ['Canva Pro', 'Photopea'],
        featured: false,
        status: 'published',
      },
      {
        name: 'Khóa Học AI Video & Hình Ảnh',
        category: 'ai',
        description: 'Tạo video chuyên nghiệp và hình ảnh độc đáo chỉ trong vài phút bằng AI.',
        shortDescription: 'Dùng AI tạo video và hình ảnh chuyên nghiệp',
        price: 2499000,
        totalSessions: 8,
        duration: '2 tuần',
        level: 'beginner',
        format: 'online-1-1',
        tools: ['ChatGPT', 'Midjourney', 'DALL-E', 'CapCut'],
        featured: true,
        status: 'published',
      },
      {
        name: 'Ôn Luyện Chứng Chỉ MOS',
        category: 'chung-chi',
        description: 'Nắm vững kỹ năng tin học văn phòng theo chuẩn quốc tế Microsoft Office Specialist (MOS).',
        shortDescription: 'Chuẩn bị thi chứng chỉ MOS Word, Excel, PowerPoint',
        price: 4500000,
        totalSessions: 15,
        duration: '5 tuần',
        level: 'advanced',
        format: 'online-1-1',
        tools: ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint'],
        featured: false,
        status: 'published',
      },
      {
        name: 'Cài Đặt Windows & Phần Mềm Cơ Bản',
        category: 'khac',
        description: 'Hướng dẫn cài đặt hệ điều hành Windows, driver, phần mềm cần thiết cho máy tính.',
        shortDescription: 'Cài đặt Windows, driver, phần mềm máy tính',
        price: 999000,
        totalSessions: 4,
        duration: '1 tuần',
        level: 'beginner',
        format: 'online-1-1',
        tools: ['Windows 10/11', 'Rufus', 'WinRAR'],
        featured: false,
        status: 'published',
      },
    ];

    const created = await Course.insertMany(seedCourses);
    return res.status(201).json({
      success: true,
      message: `Seed ${created.length} khóa học thành công!`,
      data: created,
    });
  } catch (error) {
    console.error('[COURSES] Seed error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi seed dữ liệu' });
  }
});

// ─── GET /api/courses/stats/summary ───────────────────────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const total      = await Course.countDocuments();
    const published  = await Course.countDocuments({ status: 'published' });
    const featured   = await Course.countDocuments({ featured: true });
    const categories = await Course.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    return res.json({
      success: true,
      data: { total, published, featured, categories },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
