const express = require('express');
const router = express.Router();
const SystemLog = require('../models/SystemLog');
const { authMiddleware, isAdmin } = require('../middleware/auth');

// GET /api/system-logs
// Kéo danh sách log với pagination và sắp xếp mới nhất lên đầu
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Trả về 50 log mỗi trang mặc định
    const skip = (page - 1) * limit;

    const totalLogs = await SystemLog.countDocuments();
    
    // Sort thời gian từ mới -> cũ
    const logs = await SystemLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Faster JSON object conversions
      
    res.json({
      success: true,
      data: logs,
      pagination: {
        total: totalLogs,
        page,
        pages: Math.ceil(totalLogs / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi lấy System Logs: ' + error.message });
  }
});

module.exports = router;
