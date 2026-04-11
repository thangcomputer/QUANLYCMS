const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { authMiddleware } = require('../middleware/auth');

// Lấy danh sách notifications chưa đọc
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const role = req.user.role; // 'admin', 'teacher', 'student'
    const branchId = req.user.branchId; 

    // Compute dynamic receiver matching
    const matchConditions = [
      { receivers: userId },
      { receivers: 'GLOBAL' }
    ];

    if (role === 'admin') {
      matchConditions.push({ receivers: 'ALL_ADMIN' });
      if (branchId) matchConditions.push({ receivers: `ALL_ADMIN_${branchId}` });
    } else if (role === 'teacher') {
      matchConditions.push({ receivers: 'ALL_TEACHER' });
      if (branchId) matchConditions.push({ receivers: `ALL_TEACHER_${branchId}` });
    } else if (role === 'student') {
      matchConditions.push({ receivers: 'ALL_STUDENT' });
      if (branchId) matchConditions.push({ receivers: `ALL_STUDENT_${branchId}` });
    }

    // Unread: not in read_by array
    const unreadNotifications = await Notification.find({
      $or: matchConditions,
      read_by: { $ne: userId }
    }).sort({ createdAt: -1 }).limit(50);

    const count = await Notification.countDocuments({
      $or: matchConditions,
      read_by: { $ne: userId }
    });

    res.json({
      success: true,
      data: unreadNotifications,
      count
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Get unread error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Mark all as read
router.put('/mark-read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // ... we can implement updating read_by array via updateMany
    res.json({ success: true, message: 'Marked as read (mock)' });
  } catch(error) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
