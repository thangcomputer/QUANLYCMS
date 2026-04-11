const express  = require('express');
const mongoose = require('mongoose');
const Teacher  = require('../models/Teacher');
const Schedule = require('../models/Schedule');
const Transaction = require('../models/Transaction');
const { authMiddleware, isAdmin, isTeacher, branchFilter } = require('../middleware/auth');

const router = express.Router();

// ⭐ RBAC Guard: Chặn STAFF thực hiện thao tác ghi trên teachers
// STAFF chỉ được GET (xem), KHÔNG được POST/PUT/DELETE
const superAdminOnlyTeacher = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (req.user.id === 'admin') return next(); // Hardcoded admin
  const user = await Teacher.findById(req.user.id).select('adminRole').lean();
  if (user?.adminRole === 'SUPER_ADMIN') return next();
  return res.status(403).json({
    success: false,
    message: '403 Forbidden — Bạn không có quyền thực hiện thao tác này. Chỉ Super Admin mới được thêm/sửa/xóa giảng viên.',
  });
};

// ─── POST /api/teachers ───────────────────────────────────────────────────────
// Chỉ Super Admin được tạo giảng viên
router.post('/', [authMiddleware, isAdmin, superAdminOnlyTeacher, branchFilter], async (req, res) => {
  try {
    const { name, phone, specialty, password, status, branchId: reqBranchId, branchCode: reqBranchCode } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên và Số điện thoại' });
    }
    const exists = await Teacher.findOne({ phone });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Số điện thoại này đã được đăng ký' });
    }
    if (!password && phone.length < 6) {
      return res.status(400).json({ success: false, message: 'Số điện thoại làm mật khẩu mặc định phải ít nhất 6 ký tự' });
    }

    // ⭐ Xác định branchId:
    //   - STAFF → bắt buộc dùng branchId của chính họ (không được chọn chi nhánh khác)
    //   - SUPER_ADMIN → dùng branchId từ request body (dropdown chọn), hoặc null
    let finalBranchId   = null;
    let finalBranchCode = '';
    if (req.userBranchId) {
      // STAFF → ép branchId
      finalBranchId   = req.userBranchId;
      finalBranchCode = req.userBranchCode || '';
    } else if (reqBranchId) {
      // SUPER_ADMIN chọn chi nhánh
      finalBranchId   = reqBranchId;
      finalBranchCode = reqBranchCode || '';
    }

    // Auto-Approve Logic: Nếu Admin gán chi nhánh ngay từ lúc tạo, tự động duyệt
    const isAssigningBranch = !!(finalBranchId || finalBranchCode);
    
    const teacher = await Teacher.create({
      name,
      phone,
      specialty: specialty || '',
      password:  password  || phone,
      status:    status || 'pending',
      testStatus: null,
      role: 'teacher',
      branchId:   finalBranchId,
      branchCode: finalBranchCode,
    });

    // Emit socket cho Admin thấy real-time
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:new', {
        teacherId: teacher._id,
        name: teacher.name,
        branchCode: teacher.branchCode,
        message: `Giảng viên mới: ${teacher.name} — Chi nhánh: ${teacher.branchCode || 'Chưa phân'}`,
      });
    }

    return res.status(201).json({
      success: true,
      message: `Đã tạo giảng viên ${teacher.name}`,
      data: { ...teacher.toObject(), password: undefined },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã tồn tại' });
    }
    console.error('[TEACHERS] Create error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
});

// ─── GET /api/teachers ────────────────────────────────────────────────────────
// Lấy danh sách giảng viên (Admin/Staff only — Teacher bị chặn)
router.get('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    // ⭐ Chỉ Admin/Staff được xem danh sách GV — Teacher chỉ được xem profile của mình
    if (req.user.role === 'teacher' || req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Không có quyền xem danh sách giảng viên' });
    }

    const { status, search } = req.query;
    const filter = { ...req.branchFilter };
    filter.role = { $in: ['teacher'] };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name:      { $regex: search, $options: 'i' } },
        { phone:     { $regex: search, $options: 'i' } },
        { specialty: { $regex: search, $options: 'i' } },
      ];
    }

    const teachers = await Teacher.find(filter)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });

    return res.json({ success: true, count: teachers.length, data: teachers });
  } catch (error) {
    console.error('[TEACHERS] Get all error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/stats/summary ──────────────────────────────────────────
router.get('/stats/summary', authMiddleware, isAdmin, async (req, res) => {
  try {
    const total   = await Teacher.countDocuments();
    const active  = await Teacher.countDocuments({ status: 'active' });
    const pending = await Teacher.countDocuments({ status: 'pending' });
    const suspended = await Teacher.countDocuments({ status: 'suspended' });

    return res.json({
      success: true,
      data: { total, active, pending, suspended },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id ────────────────────────────────────────────────────
router.get('/:id', [authMiddleware, branchFilter], async (req, res) => {
  try {
    // Teacher chỉ xem profile của chính mình
    if (req.user.role === 'teacher' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }
    // Student không được xem GV
    if (req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
    }

    const teacher = await Teacher.findById(req.params.id)
      .select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // ⭐ STAFF cross-branch guard: STAFF chỉ xem GV cùng chi nhánh
    if (req.userBranchId && teacher.branchId
        && String(teacher.branchId) !== String(req.userBranchId)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem giảng viên chi nhánh khác' });
    }

    // Lấy thống kê buổi dạy
    const completedSessions = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
    });

    return res.json({
      success: true,
      data: { ...teacher.toObject(), completedSessionsFromDB: completedSessions },
    });
  } catch (error) {
    console.error('[TEACHERS] Get by ID error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id ────────────────────────────────────────────────────
// Cập nhật thông tin cơ bản giảng viên (STAFF bị chặn, teacher tự sửa được)
router.put('/:id', [authMiddleware, branchFilter], async (req, res) => {
  try {
    // Teacher sửa chính mình → cho phép
    const isSelfEdit = req.user.id === req.params.id && req.user.role === 'teacher';
    // STAFF → chặn (chỉ Super Admin mới được sửa GV)
    if (!isSelfEdit && req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }
    if (!isSelfEdit && (req.user.role === 'admin' || req.user.role === 'staff')) {
      // Kiểm tra phải Super Admin
      if (req.user.id !== 'admin') {
        const me = await Teacher.findById(req.user.id).select('adminRole').lean();
        if (me?.adminRole !== 'SUPER_ADMIN') {
          return res.status(403).json({ success: false, message: '403 Forbidden — Chỉ Super Admin mới được sửa thông tin giảng viên.' });
        }
      }
    }

    // ⭐ STAFF cross-branch guard
    if (req.userBranchId) {
      const target = await Teacher.findById(req.params.id).select('branchId').lean();
      if (target?.branchId && String(target.branchId) !== String(req.userBranchId)) {
        return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa giảng viên chi nhánh khác' });
      }
    }

    const isAdminRole = (req.user.role === 'admin' || req.user.role === 'staff');
    const allowedFields = isAdminRole 
      ? [
          'name', 'phone', 'zalo', 'email', 'specialty', 'bio',
          'bankAccount', 'avatar', 'status', 'baseSalaryPerSession',
          'assignedClasses', 'assignedStudents',
          'testScore', 'testStatus', 'testDate', 'testNotes',
          'lockReason', 'practicalFile', 'practicalStatus',
          'branchId', 'branchCode',  // ⭐ Cho phép Admin điều chuyển chi nhánh
        ]
      : [
          'name', 'phone', 'zalo', 'email', 'bio', 'bankAccount', 'avatar',
          'testScore', 'testStatus', 'testDate', 'status', 'lockReason',
          'practicalFile', 'practicalStatus'
        ];

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Security check: teacher cannot set their own status to 'active'
    if (req.user.role === 'teacher' && updates.status === 'active') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tự kích hoạt tài khoản chính thức' });
    }

    // Auto-Approve Logic: Nếu Admin gán chi nhánh hoặc xếp lớp, tự động duyệt
    if (isAdminRole) {
      const isAssigningStudents = updates.assignedClasses?.length > 0 || updates.assignedStudents?.length > 0;
      
      if (isAssigningStudents) {
        updates.status = 'active';
        // Remove test exemption here if they want strict testing, or keep it if assigning students implies exemption
        // updates.testStatus = 'exempt'; 
      }
    }

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    return res.json({
      success: true,
      message: `Đã cập nhật giảng viên ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    console.error('[TEACHERS] Update error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/score ──────────────────────────────────────────────
// Admin nhập điểm bài test Onboarding cho giảng viên
router.put('/:id/score', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { testScore, testNotes } = req.body;

    if (testScore === undefined || testScore === null) {
      return res.status(400).json({ success: false, message: 'Thiếu testScore' });
    }
    if (testScore < 0 || testScore > 100) {
      return res.status(400).json({ success: false, message: 'Điểm phải trong khoảng 0-100' });
    }

    const newStatus = testScore >= 80 ? 'tested_passed' : 'tested_failed';

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        testScore,
        testNotes: testNotes || '',
        testDate:  new Date(),
        status:    newStatus,
      },
      { new: true }
    ).select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // Thông báo real-time cho giảng viên
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:scored', {
        teacherId:  teacher._id.toString(),
        testScore,
        passed:     testScore >= 80,
        message:    testScore >= 80
          ? `🎉 Chúc mừng! Bạn đạt ${testScore}/100 điểm. Đã qua bài test!`
          : `❌ Bạn đạt ${testScore}/100 điểm. Chưa đạt yêu cầu (>=80). Vui lòng liên hệ Admin.`,
      });
    }

    return res.json({
      success: true,
      message: `Đã lưu điểm ${testScore}/100 cho ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    console.error('[TEACHERS] Score error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/approve ────────────────────────────────────────────
// Admin duyệt giảng viên — STRICT: chỉ khi testScore >= 80
router.put('/:id/approve', authMiddleware, isAdmin, async (req, res) => {
  try {
    const teacherCheck = await Teacher.findById(req.params.id);
    if (!teacherCheck) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // STRICT LOGIC (Workflow 1): Không thể approve nếu điểm < 80
    if (teacherCheck.testScore < 80) {
      return res.status(403).json({
        success: false,
        message: `Không thể cấp quyền! Điểm bài test: ${teacherCheck.testScore}/100 (yêu cầu ≥ 80).`,
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { status: 'active', approvedAt: new Date() },
      { new: true }
    ).select('-password -refreshToken');

    // Thông báo real-time
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:approved', {
        teacherId: teacher._id.toString(),
        name:      teacher.name,
        message:   '🎊 Tài khoản của bạn đã được Admin phê duyệt! Bạn có thể bắt đầu giảng dạy.',
      });
    }

    return res.json({
      success: true,
      message: `Đã phê duyệt giảng viên ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    console.error('[TEACHERS] Approve error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/teachers/:id/submit-practical ──────────────────────────────────
// Giảng viên nộp file thực hành (Workflow 1 Phase 2)
router.post('/:id/submit-practical', authMiddleware, isTeacher, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không thể nộp giùm người khác' });
    }
    const { fileUrl } = req.body;
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'Thiếu fileUrl' });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        practicalFileUrl: fileUrl,
        status: 'practical_submitted',
      },
      { new: true }
    ).select('-password');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    // Thông báo Admin có file mới
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:practical_submitted', {
        teacherId:   teacher._id.toString(),
        teacherName: teacher.name,
        fileUrl,
        message: `📁 Giảng viên ${teacher.name} đã nộp bài thực hành`,
      });
    }

    return res.json({ success: true, data: teacher });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/reject ─────────────────────────────────────────────
// Admin từ chối / tạm dừng giảng viên
router.put('/:id/reject', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      {
        status: 'suspended',
        rejectedReason: reason || '',
        rejectedAt: new Date(),
      },
      { new: true }
    ).select('-password -refreshToken');

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:rejected', {
        teacherId: teacher._id.toString(),
        reason,
        message: `❌ Tài khoản bị từ chối. Lý do: ${reason || 'Không đáp ứng yêu cầu'}`,
      });
    }

    return res.json({
      success: true,
      message: `Đã từ chối giảng viên ${teacher.name}`,
      data: teacher,
    });
  } catch (error) {
    console.error('[TEACHERS] Reject error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── DELETE /api/teachers/:id ─────────────────────────────────────────────────
// Admin xóa giảng viên (STAFF bị chặn)
router.delete('/:id', [authMiddleware, isAdmin, superAdminOnlyTeacher], async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên' });
    }
    return res.json({
      success: true,
      message: `Đã xóa giảng viên ${teacher.name}`,
    });
  } catch (error) {
    console.error('[TEACHERS] Delete error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id/finance ──────────────────────────────────────────────
router.get('/:id/finance', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập thông tin này' });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Tổng buổi đã dạy (Trạng thái completed)
    const totalSessions = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
    });

    // Buổi đã dạy nhưng chưa thanh toán
    const pendingSessionsCount = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: false
    });

    // Chưa nhận = pendingSessionsCount * salary_per_session
    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const unpaidAmount = pendingSessionsCount * salaryPerSession;

    // Tổng đã nhận = Tổng tiền từ các giao dịch thành công của giảng viên
    const transactionsContext = await Transaction.aggregate([
      { $match: { 
          teacherId: new mongoose.Types.ObjectId(req.params.id), 
          status: 'confirmed' 
      }},
      { $group: { _id: null, totalString: { $sum: "$amount" } }}
    ]);
    const paidAmount = transactionsContext.length > 0 ? transactionsContext[0].totalString : 0;

    return res.json({
      success: true,
      data: {
        totalSessions,
        unpaidAmount,
        paidAmount,
        salaryPerSession
      }
    });
  } catch (error) {
    console.error('[FINANCE] Get stats error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/teachers/:id/finance/pending ──────────────────────────────────────
// Lấy số buổi còn nợ thanh toán (cho modal Step 1)
router.get('/:id/finance/pending', authMiddleware, isAdmin, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    const pendingSessionsCount = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: false
    });

    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const unpaidAmount = pendingSessionsCount * salaryPerSession;

    return res.json({
      success: true,
      data: {
        pendingSessionsCount,
        salaryPerSession,
        unpaidAmount,
        bankInfo: {
          bankName: teacher.bankAccount?.bankName || '',
          accountNumber: teacher.bankAccount?.accountNumber || '',
          accountHolder: teacher.bankAccount?.accountHolder || teacher.name || '',
          bankCode: teacher.bankAccount?.bankCode || '',
        }
      }
    });
  } catch (error) {
    console.error('[FINANCE] Get pending error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/teachers/:id/finance/pay-flexible ──────────────────────────────────
// Thanh toán linh hoạt: Admin tự chọn số buổi và số tiền, FIFO (cũ nhất trước)
router.put('/:id/finance/pay-flexible', [authMiddleware, isAdmin, superAdminOnlyTeacher], async (req, res) => {
  try {
    const { sessionsCount, amount, note } = req.body;

    if (!sessionsCount || Number(sessionsCount) <= 0) {
      return res.status(400).json({ success: false, message: 'Số buổi thanh toán phải lớn hơn 0' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền thanh toán phải lớn hơn 0' });
    }
    if (Number(amount) > 500000000) {
      return res.status(400).json({ success: false, message: `Số tiền vượt giới hạn 500 triệu/lần` });
    }

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Tìm buổi chưa thanh toán theo FIFO (bao gồm cả 'completed' và 'scheduled')
    // Nếu không có → vẫn tạo giao dịch (thanh toán thủ công do Admin nhập)
    const pendingSessions = await Schedule.find({
      teacherId: req.params.id,
      is_paid_to_teacher: false
    }).sort({ date: 1, createdAt: 1 }).limit(Number(sessionsCount));

    const actualCount = pendingSessions.length;
    const sessionIds = pendingSessions.map(s => s._id);

    // Đánh dấu FIFO nếu có session nào tìm được
    if (sessionIds.length > 0) {
      await Schedule.updateMany(
        { _id: { $in: sessionIds } },
        { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
      );
    }

    // Luôn tạo giao dịch với số tiền và số buổi Admin đã nhập (kể cả thanh toán thủ công)
    const now = new Date();
    const monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    const paidCount = Number(sessionsCount); // dùng số Admin nhập, không phải số session tìm được
    const transaction = await Transaction.create({
      teacherId: req.params.id,
      teacherName: teacher.name,
      teacherPhone: teacher.phone || '',
      amount: Number(amount),
      description: note || `Thù lao ${paidCount} buổi dạy`,
      month: monthLabel,
      status: 'confirmed',
      confirmedBy: req.user?.name || 'Admin',
      confirmedAt: now,
      bankName: teacher.bankAccount?.bankName || '',
      bankAccount: teacher.bankAccount?.accountNumber || '',
      note: note || '',
    });

    // Real-time notify
    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:financeUpdated', {
        teacherId: req.params.id,
        message: `Admin đã thanh toán ${Number(amount).toLocaleString('vi-VN')}đ cho ${paidCount} buổi.`
      });
      io.emit('transactions:new', transaction);
    }

    return res.json({
      success: true,
      message: `Thanh toán thành công ${paidCount} buổi`,
      data: {
        paidSessions: paidCount,
        markedSessions: actualCount, // số session thực tế được đánh dấu trong DB
        totalAmount: Number(amount),
        transaction,
      }

    });
  } catch (error) {
    console.error('[FINANCE] Flexible pay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
});

// ─── PUT /api/teachers/:id/finance/pay-all ──────────────────────────────────────
router.put('/:id/finance/pay-all', [authMiddleware, isAdmin, superAdminOnlyTeacher], async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

    // Tìm các buổi chưa thanh toán
    const pendingSessionsCount = await Schedule.countDocuments({
      teacherId: req.params.id,
      status: 'completed',
      is_paid_to_teacher: false
    });

    if (pendingSessionsCount === 0) {
      return res.status(400).json({ success: false, message: 'Không có buổi dạy nào cần thanh toán' });
    }

    const salaryPerSession = teacher.baseSalaryPerSession || 0;
    const totalAmount = pendingSessionsCount * salaryPerSession;

    // Validation: Không cho phép thanh toán 0đ hoặc số phi lý (> 500 triệu/lần)
    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, message: `Giảng viên chưa được cấu hình mức lương/buổi. Vui lòng Admin cập nhật trường "Lương/buổi" trước khi thanh toán.` });
    }
    if (totalAmount > 500000000) {
      return res.status(400).json({ success: false, message: `Số tiền thanh toán (${totalAmount.toLocaleString('vi-VN')}đ) vượt quá giới hạn 500 triệu. Vui lòng kiểm tra lại mức lương/buổi.` });
    }

    // Đánh dấu các buổi này là đã thanh toán
    await Schedule.updateMany(
      { 
        teacherId: req.params.id, 
        status: 'completed', 
        is_paid_to_teacher: false 
      },
      { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
    );

    // Tạo giao dịch thanh toán
    const now = new Date();
    const transaction = await Transaction.create({
      teacherId: req.params.id,
      teacherName: teacher.name,
      teacherPhone: teacher.phone,
      amount: totalAmount,
      description: `Thanh toán thù lao ${pendingSessionsCount} buổi dạy`,
      month: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
      status: 'confirmed',
      confirmedBy: req.user.name || 'Admin',
      confirmedAt: now,
      bankName: teacher.bankAccount?.bankName || '',
      bankAccount: teacher.bankAccount?.accountNumber || ''
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('teacher:financeUpdated', {
        teacherId: req.params.id,
        message: `Admin đã thanh toán ${totalAmount.toLocaleString('vi-VN')}đ cho ${pendingSessionsCount} buổi dạy.`
      });
      io.emit('transactions:new', transaction);
    }

    return res.json({
      success: true,
      message: 'Đã thanh toán thành công',
      data: {
        paidSessions: pendingSessionsCount,
        totalAmount,
        transaction
      }
    });
  } catch (error) {
    console.error('[FINANCE] Pay error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;
