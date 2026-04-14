const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { authMiddleware } = require('../middleware/auth');

// Láº¥y danh sÃ¡ch notifications chÆ°a Ä‘á»c
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user.id || req.user._id);
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

    // Get ALL recent notifications for the user
    // (We keep the endpoint name '/unread' but it returns recent notifications)
    const recentNotifications = await Notification.find({
      $or: matchConditions
    }).sort({ createdAt: -1 }).limit(50);

    const count = await Notification.countDocuments({
      $or: matchConditions,
      read_by: { $ne: userId }
    });

    res.json({
      success: true,
      data: recentNotifications,
      count
    });
  } catch (error) {
    console.error('[NOTIFICATIONS] Get unread error:', error);
    res.status(500).json({ success: false, message: 'Lá»—i server' });
  }
});

// Mark all as read
router.put('/mark-read', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user.id || req.user._id);
    const { notificationId, markAll } = req.body;

    if (markAll) {
      // Find all notifications matching receiver logic and add userId to read_by
      const role = req.user.role;
      const branchId = req.user.branchId; 
      const matchConditions = [{ receivers: userId }, { receivers: 'GLOBAL' }];
      if (role === 'admin') {
        matchConditions.push({ receivers: 'ALL_ADMIN' });
        if (branchId) matchConditions.push({ receivers: `ALL_ADMIN_${branchId}` });
      } else if (role === 'teacher') {
        matchConditions.push({ receivers: 'ALL_TEACHER' });
      } else if (role === 'student') {
        matchConditions.push({ receivers: 'ALL_STUDENT' });
      }
      
      await Notification.updateMany(
        { $or: matchConditions, read_by: { $ne: userId } },
        { $addToSet: { read_by: userId } }
      );
    } else if (notificationId) {
      await Notification.findByIdAndUpdate(notificationId, { $addToSet: { read_by: userId } });
    }
    
    res.json({ success: true, message: 'ÄÃ£ Ä‘Ã¡nh dáº¥u Ä‘á»c' });
  } catch(error) {
    res.status(500).json({ success: false, message: 'Lá»—i server' });
  }
});

module.exports = router;
