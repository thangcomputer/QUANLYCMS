/**
 * transactionRoutes.js — Quản lý phiếu chi lương giảng viên
 * Có branchFilter: STAFF chỉ thấy giao dịch của chi nhánh mình
 */
const express     = require('express');
const router      = express.Router();
const Transaction = require('../models/Transaction');
const Teacher     = require('../models/Teacher');
const Schedule    = require('../models/Schedule');
const { authMiddleware, isAdmin, isTeacher, branchFilter } = require('../middleware/auth');

// ─── GET /api/transactions ─────────────────────────────────────────────────────
// Admin/Staff: Lấy giao dịch lương (STAFF chỉ thấy chi nhánh của mình)
router.get('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const { status, teacherId, month, branchId: queryBranch } = req.query;
    const filter = { ...req.branchFilter };

    if (queryBranch && queryBranch !== 'all' && !filter.branchId) filter.branchId = queryBranch;
    if (status)    filter.status    = status;
    if (teacherId) filter.teacherId = teacherId;
    if (month)     filter.month     = { $regex: month, $options: 'i' };

    const transactions = await Transaction.find(filter)
      .populate('teacherId', 'name phone specialty bankAccount branchId branchCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/transactions/stats ──────────────────────────────────────────────
// Thống kê tài chính giảng viên (Admin/Staff, branch-aware)
router.get('/stats', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    // ⭐ Fix: branch-aware stats
    const matchFilter = { status: 'confirmed' };
    const pendingMatchFilter = { status: 'pending' };

    // STAFF chỉ thấy giao dịch của GV thuộc chi nhánh mình
    if (req.userBranchId) {
      // Lấy danh sách teacherIds thuộc chi nhánh
      const branchTeachers = await Teacher.find({ branchId: req.userBranchId }).select('_id').lean();
      const teacherIds = branchTeachers.map(t => t._id);
      matchFilter.teacherId = { $in: teacherIds };
      pendingMatchFilter.teacherId = { $in: teacherIds };
    } else if (req.query.branch_id && req.query.branch_id !== 'all') {
      const branchTeachers = await Teacher.find({ branchId: req.query.branch_id }).select('_id').lean();
      const teacherIds = branchTeachers.map(t => t._id);
      matchFilter.teacherId = { $in: teacherIds };
      pendingMatchFilter.teacherId = { $in: teacherIds };
    }

    const totalResult = await Transaction.aggregate([
      { $match: matchFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingResult = await Transaction.aggregate([
      { $match: pendingMatchFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalPaid    = totalResult[0]?.total   || 0;
    const totalPending = pendingResult[0]?.total  || 0;
    const countPending = await Transaction.countDocuments(pendingMatchFilter);
    const countTotal   = await Transaction.countDocuments(
      req.userBranchId ? { teacherId: matchFilter.teacherId } : {}
    );

    res.json({
      success: true,
      data: { totalPaid, totalPending, countPending, countTotal },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/transactions/teacher/:teacherId ──────────────────────────────────
// Giảng viên xem lịch sử nhận lương
router.get('/teacher/:teacherId', authMiddleware, async (req, res) => {
  try {
    // Chỉ Admin hoặc chính Teacher đó mới được xem
    if (req.user.role !== 'admin' && req.user.role !== 'staff' && req.user.id !== req.params.teacherId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }
    const transactions = await Transaction.find({ teacherId: req.params.teacherId })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/transactions/calculate ─────────────────────────────────────────
// Tính lương tự động theo buổi dạy đã hoàn thành trong tháng
router.post('/calculate', authMiddleware, isTeacher, async (req, res) => {
  try {
    const { teacherId, month } = req.body;
    
    // Nếu không phải Admin, chỉ được tự tính lương của chính mình
    if (req.user.role !== 'admin' && req.user.role !== 'staff' && req.user.id !== teacherId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này' });
    }
    // month: "YYYY-MM"
    if (!teacherId || !month) {
      return res.status(400).json({ success: false, message: 'Cần teacherId và month (YYYY-MM)' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    const [year, m] = month.split('-').map(Number);
    const startDate = new Date(year, m - 1, 1);
    const endDate   = new Date(year, m,     1);

    // Đếm số buổi đã hoàn thành
    const completedSessions = await Schedule.countDocuments({
      teacherId,
      status:  'completed',
      date: { $gte: startDate, $lt: endDate },
    });

    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const totalAmount      = completedSessions * salaryPerSession;
    const monthLabel       = `Tháng ${m}/${year}`;

    res.json({
      success: true,
      data: {
        teacherId,
        teacherName:       teacher.name,
        month:             monthLabel,
        completedSessions,
        salaryPerSession,
        totalAmount,
        bankAccount:       teacher.bankAccount,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/transactions ────────────────────────────────────────────────────
// Admin tạo phiếu chi lương cho giảng viên
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { teacherId, amount, description, month, note } = req.body;

    if (!teacherId || !amount) {
      return res.status(400).json({ success: false, message: 'Thiếu teacherId hoặc amount' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    const transaction = await Transaction.create({
      teacherId,
      teacherName:  teacher.name,
      teacherPhone: teacher.phone || '',
      amount,
      description:  description || `Thù lao giảng dạy ${month || ''}`,
      month:        month       || '',
      note:         note        || '',
      bankName:     teacher.bankAccount?.bankName    || '',
      bankAccount:  teacher.bankAccount?.accountNumber || '',
      // Gắn branchId từ teacher để filter sau này
      branchId:     teacher.branchId   || null,
      branchCode:   teacher.branchCode || '',
      status: 'pending',
    });

    // Thông báo real-time cho giảng viên
    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      await NotificationService.send(io, {
        type: 'FINANCE',
        title: '💵 Phiếu chi lương mới',
        content: `Admin đã tạo phiếu chi ${amount.toLocaleString('vi-VN')}đ cho tháng ${month || ''}`,
        receivers: teacherId.toString(),
        payload: { transactionId: transaction._id },
        link: '/teacher/finance'
      });
      
      io.emit('data:refresh', { type: 'transaction', id: transaction._id });
    }

    res.status(201).json({ success: true, data: transaction });
  } catch (err) {
    console.error('[TRANSACTIONS] Create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/transactions/:id/confirm ────────────────────────────────────────
// Admin xác nhận đã thanh toán lương
router.put('/:id/confirm', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { confirmedBy = 'Admin' } = req.body;

    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', confirmedBy, confirmedAt: new Date() },
      { new: true }
    ).populate('teacherId', 'name phone');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
    }

    // Thông báo real-time cho giảng viên
    const io = req.app.get('io');
    if (io) {
      const NotificationService = require('../services/NotificationService');
      await NotificationService.send(io, {
        type: 'FINANCE',
        title: '✅ Lương đã được thanh toán',
        content: `Đã xác nhận thanh toán ${transaction.amount.toLocaleString('vi-VN')}đ cho ${transaction.month}`,
        receivers: transaction.teacherId._id.toString(),
        link: '/teacher/finance'
      });

      io.emit('revenue:updated', { amount: transaction.amount, type: 'salary' });
      io.emit('data:refresh', { type: 'transaction', id: transaction._id });
    }

    res.json({ success: true, data: transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/transactions/:id/cancel ─────────────────────────────────────────
router.put('/:id/cancel', authMiddleware, isAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
    }

    res.json({ success: true, data: transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/transactions/:id ────────────────────────────────────────────
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndDelete(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
    }
    res.json({ success: true, message: 'Đã xóa giao dịch' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
