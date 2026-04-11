const express = require('express');
const TeachingGuide = require('../models/TeachingGuide');
const { authMiddleware, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Lấy tất cả tài liệu đào tạo (cho Admin, Teacher, Student)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = { isActive: true };
    // Nếu có category lọc
    if (req.query.category) {
      filter.category = req.query.category;
    }
    
    const guides = await TeachingGuide.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, data: guides });
  } catch (error) {
    console.error('[TRAINING] Get all error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
