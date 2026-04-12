const express = require('express');
const router  = express.Router();
const Student = require('../models/Student');
const Invoice = require('../models/Invoice');
const Schedule = require('../models/Schedule');
const { authMiddleware, isAdmin, isTeacher, branchFilter } = require('../middleware/auth');

// ─── GET /api/students ─────────────────────────────────────────────────────────
// Lấy danh sách học viên (Admin / Teacher) — hỗ trợ Server-side Pagination
router.get('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const { teacherId, paid, status, course, search, page, limit, branch_id } = req.query;
    // Khởi tạo filter với branchFilter (tự động {} cho SUPER_ADMIN, {branchId:...} cho STAFF)
    const filter = { ...req.branchFilter };

    // SUPER_ADMIN: cho phép lọc theo branch_id từ query (Global Branch Filter)
    // STAFF: bỏ qua branch_id từ query, BẮT BUỘC dùng branch của chính họ (đã set trong branchFilter)
    if (branch_id && branch_id !== 'all' && !req.userBranchId) {
      // Chỉ SUPER_ADMIN mới vào đây (userBranchId undefined = không bị lock)
      filter.branchId = branch_id;
    }

    // Nếu là Teacher, chỉ được xem học viên của mình
    if (req.user.role === 'teacher') {
      filter.teacherId = req.user.id;
    } else if (req.user.role === 'admin' || req.user.role === 'staff') {
      if (teacherId) filter.teacherId = teacherId;
    } else {
      // Student không được phép xem danh sách này
      return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối' });
    }

    if (teacherId) filter.teacherId           = teacherId;
    if (paid !== undefined) filter.paid       = paid === 'true';
    if (status)  filter.status                = status;
    if (course)  filter.course               = { $regex: course, $options: 'i' };
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { zalo:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { course:{ $regex: search, $options: 'i' } },
      ];
    }

    // ── Pagination ──────────────────────────────────────────────────
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip     = (pageNum - 1) * limitNum;

    const totalRecords = await Student.countDocuments(filter);
    const totalPages   = Math.ceil(totalRecords / limitNum);

    const students = await Student.find(filter)
      .populate('teacherId', 'name phone specialty')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // ⭐ ĐẾM SỐ BUỔI ĐIỂM DANH THEO TỪNG HỌC VIÊN CỤ THỂ 
    // Tuyệt đối không dùng biến đếm chung (global counter)
    // Số buổi đã học = COUNT các bản ghi Schedule (Attendance) ĐỒNG THỜI 3 điều kiện:
    const studentsWithRealSessions = await Promise.all(students.map(async (st) => {
      const doc = st.toObject();
      // Truy vấn bảng Schedule (Điểm danh)
      const realCompleted = await Schedule.countDocuments({
        studentId: st._id,      // 1. Đúng định danh học viên
        course: st.course,      // 2. Đúng khóa học hiện tại
        status: 'completed',    // 3. Trạng thái 'Đã học/PRESENT'
      });
      
      // Tách biệt logic trừ buổi: Tổng trừ đi số đã điểm danh hợp lệ
      doc.completedSessions = realCompleted;
      doc.remainingSessions = Math.max(0, (st.totalSessions || 12) - realCompleted);

      // Đếm số buổi đã dạy nhưng chưa thanh toán cho Giảng viên
      const pendingPaymentSessions = await Schedule.countDocuments({
        studentId: st._id,
        course: st.course,
        status: 'completed',
        is_paid_to_teacher: false
      });
      doc.pendingTeacherPaymentSessions = pendingPaymentSessions;
      
      return doc;
    }));

    res.json({
      success: true,
      count: studentsWithRealSessions.length,
      totalRecords,
      totalPages,
      currentPage: pageNum,
      data: studentsWithRealSessions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/stats ───────────────────────────────────────────────────
// Thống kê tổng quan (Admin dashboard)
// ─── GET /api/students/stats (branch-aware, timezone-safe) ────────────────────
router.get('/stats', [authMiddleware, branchFilter], async (req, res) => {
  try {
    // branchFilter đã gán req.branchFilter: {} cho SUPER_ADMIN, {branchId:...} cho STAFF
    const bf = { ...req.branchFilter };
    // Admin có thể override bằng ?branch_id query
    const { branch_id } = req.query;
    if (branch_id && branch_id !== 'all' && !req.userBranchId) {
      bf.branchId = branch_id;
    }

    const total   = await Student.countDocuments(bf);
    const paid    = await Student.countDocuments({ ...bf, paid: true });
    const unpaid  = await Student.countDocuments({ ...bf, paid: false });
    const unlocked = await Student.countDocuments({ ...bf, studentExamUnlocked: true });

    // ⭐ Fix: Doanh thu = SUM(paidAmount) chỉ từ HV đã thanh toán
    // paidAmount = số tiền thực nhận qua SePay, chính xác hơn price (giá niêm yết)
    // Fallback sang price nếu paidAmount = 0 (compatibility)
    const revenueResult = await Student.aggregate([
      { $match: { ...bf, paid: true } },
      { $group: {
        _id: null,
        totalPaidAmount: { $sum: { $cond: [{ $gt: ['$paidAmount', 0] }, '$paidAmount', '$price'] } },
        totalListedPrice: { $sum: '$price' },
      }},
    ]);
    const totalRevenue = revenueResult[0]?.totalPaidAmount || 0;

    const pendingResult = await Student.aggregate([
      { $match: { ...bf, paid: false } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);
    const pendingRevenue = pendingResult[0]?.total || 0;

    // ⭐ Fix timezone: Doanh thu HÔM NAY (UTC+7)
    const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    const startOfTodayVN = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()) - 7 * 60 * 60 * 1000);
    const todayResult = await Student.aggregate([
      { $match: { ...bf, paid: true, paidAt: { $gte: startOfTodayVN } } },
      { $group: { _id: null, total: { $sum: { $cond: [{ $gt: ['$paidAmount', 0] }, '$paidAmount', '$price'] } } } },
    ]);
    const todayRevenue = todayResult[0]?.total || 0;

    // Số giảng viên active (branch-aware)
    const Teacher = require('../models/Teacher');
    const teacherBranchFilter = req.userBranchId ? { branchId: req.userBranchId } : {};
    if (branch_id && branch_id !== 'all' && !req.userBranchId) teacherBranchFilter.branchId = branch_id;
    const activeTeachers = await Teacher.countDocuments({ ...teacherBranchFilter, status: { $in: ['Active','active'] }, role: 'teacher' });
    const pendingTeachers = await Teacher.countDocuments({ role: 'teacher', status: 'Pending' });

    res.json({
      success: true,
      data: { total, paid, unpaid, unlocked, totalRevenue, pendingRevenue, todayRevenue, activeTeachers, pendingTeachers },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/:id ─────────────────────────────────────────────────────────────────
router.get('/:id', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('teacherId', 'name phone specialty avatar');

    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // ⭐ 403 guard: STAFF chỉ được xem HV của chi nhánh mình
    if (req.userBranchId) {
      const studentBranch = student.branchId ? String(student.branchId) : null;
      if (studentBranch && studentBranch !== String(req.userBranchId)) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập học viên này' });
      }
    }

    const isSelf      = req.user.role === 'student' && req.user.id === student._id.toString();
    const isMyTeacher = req.user.role === 'teacher'  && student.teacherId?._id?.toString() === req.user.id;
    const isAdminOrStaff = req.user.role === 'admin' || req.user.role === 'staff';

    if (!isAdminOrStaff && !isSelf && !isMyTeacher) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin này' });
    }

    // Lấy thêm thống kê lịch học (Single Source of Truth)
    const realCompleted = await Schedule.countDocuments({
      studentId: req.params.id,
      course: student.course || '',
      status: 'completed',
    });

    const doc = student.toObject();
    doc.completedSessions = realCompleted;
    doc.remainingSessions = Math.max(0, (student.totalSessions || 12) - realCompleted);

    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/students/:id/full-detail (MEGA ENDPOINT) ───────────────────────
// Tổng hợp toàn bộ hồ sơ học viên: Thông tin cá nhân, Lịch sử điểm danh, Hóa đơn, Điểm thi
router.get('/:id/full-detail', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('teacherId', 'name phone specialty avatar');

    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // 🛡️ 403 guard: STAFF chỉ được xem HV của chi nhánh mình
    if (req.userBranchId && student.branchId && String(student.branchId) !== String(req.userBranchId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập dữ liệu học viên cơ sở khác' });
    }

    // 1. Lịch sử điểm danh/học tập
    const schedules = await Schedule.find({ studentId: req.params.id }).sort({ date: -1 });

    // 2. Lịch sử hóa đơn học phí
    const invoices = await Invoice.find({ hocVien: req.params.id }).sort({ createdAt: -1 });

    // 3. Kết quả thi (nếu có)
    const ExamResult = require('../models/ExamResult');
    const examResults = await ExamResult.find({ 
      $or: [
        { studentId: req.params.id },
        { sbd: student.sbd } // Fallback cho dữ liệu cũ dùng SBD
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        student,
        schedules: schedules || [],
        invoices: invoices || [],
        examResults: examResults || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/students/import (BẢN GHI HÀNG LOẠT) ──────────────────────────
// Nhập danh sách học viên từ file Excel (Array of Objects)
router.post('/import', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const { students: rawStudents } = req.body;
    if (!Array.isArray(rawStudents) || rawStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ hoặc rỗng.' });
    }

    // Gán chi nhánh tự động: STAFF chỉ được nhập vào CS của mình
    const branchId = req.userBranchId || null;

    const studentsToInsert = rawStudents.map(s => ({
      ...s,
      name: s.name?.toUpperCase()?.trim(),
      branchId: branchId || s.branchId || null,
      status: s.status || 'Chờ xếp lớp',
      paid: s.paid === true || s.paid === 'Đã đóng phí',
      learningMode: ['ONLINE', 'OFFLINE'].includes(s.learningMode?.toUpperCase()) 
        ? s.learningMode.toUpperCase() 
        : 'OFFLINE'
    })).filter(s => s.name && (s.phone || s.zalo));

    if (studentsToInsert.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có bản ghi nào hợp lệ để nhập (Thiếu Tên hoặc SĐT/Zalo).' });
    }

    const result = await Student.insertMany(studentsToInsert, { ordered: false });

    res.json({
      success: true,
      message: `Đã nhập thành công ${result.length} học viên.`,
      count: result.length
    });
  } catch (err) {
    if (err.name === 'BulkWriteError' || err.code === 11000) {
      const inserted = err.result?.nInserted || 0;
      return res.json({ 
        success: true, 
        message: `Đã nhập ${inserted} bản ghi (Một số bản ghi bị trùng SĐT đã được bỏ qua).`,
        count: inserted
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/students ────────────────────────────────────────────────────────
// Admin thêm học viên mới
// ─── POST /api/students ──────────────────────────────────────────────────────────────────
router.post('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    if (req.body.password === undefined && req.body.zalo) {
      req.body.password = req.body.zalo;
    }

    // Bảo mật: STAFF chỉ được tạo HV thuộc chi nhánh của mình
    // SUPER_ADMIN tự đặt branchId hoặc để trống
    if (req.userBranchId) {
      req.body.branchId   = req.userBranchId;
      req.body.branchCode = req.userBranchCode || '';
    }

    console.log("=== POST /api/students ===");
    console.log("req.body:", req.body);
    const student = new Student(req.body);
    console.log("student doc:", student.toObject());
    await student.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('student:new', {
        studentId: student._id,
        name: student.name,
        course: student.course,
        message: `Học viên mới đăng ký: ${student.name} - ${student.course}`,
      });
    }

    res.status(201).json({ success: true, data: student });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id ─────────────────────────────────────────────────────
// Cập nhật thông tin học viên (Admin, Teacher, Student tự cập nhật)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const safeBody = { ...req.body };
    
    // Nếu là Teacher, chỉ cho phép cập nhật thông tin điểm danh, thành tích
    if (req.user.role === 'teacher') {
      const allowedKeys = ['completedSessions', 'remainingSessions', 'lastGrade', 'avgGrade', 'grades', 'status', 'notes', 'linkHoc', 'nextClass', 'nextClassTime'];
      Object.keys(safeBody).forEach(key => {
        if (!allowedKeys.includes(key)) {
          delete safeBody[key];
        }
      });
    }

    // Nếu là Student, chỉ cho phép cập nhật hồ sơ cá nhân CỦA CHÍNH MÌNH
    if (req.user.role === 'student') {
      if (req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật hồ sơ của chính mình' });
      }
      const allowedKeys = ['name', 'email', 'phone', 'zalo', 'address', 'password', 'avatar'];
      Object.keys(safeBody).forEach(key => {
        if (!allowedKeys.includes(key)) {
          delete safeBody[key];
        }
      });
    }

    console.log("=== PUT /api/students ===");
    console.log("safeBody from UI:", safeBody);

    const student = await Student.findByIdAndUpdate(req.params.id, safeBody, {
      new: true,
      runValidators: true,
    }).populate('teacherId', 'name phone specialty');

    console.log("student updated doc:", student ? student.toObject() : null);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('student:updated', student._id);
      io.emit('data:refresh', { type: 'student', id: student._id });
    }

    res.json({ success: true, data: student });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PATCH /api/students/:id/price ────────────────────────────────────────────
// Admin điều chỉnh học phí riêng cho 1 học viên cụ thể (ghi đè price snapshot)
// Dùng khi: học viên xin giảm học phí, có mã giảm giá, hoặc Admin muốn áp giá mới
router.patch('/:id/price', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { newPrice, reason = '' } = req.body;
    if (!newPrice || isNaN(newPrice) || Number(newPrice) < 0) {
      return res.status(400).json({ success: false, message: 'Học phí không hợp lệ' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const oldPrice = student.price;
    student.price        = Number(newPrice);
    student.priceHistory = student.priceHistory || [];
    student.priceHistory.push({
      oldPrice,
      newPrice: Number(newPrice),
      reason,
      changedBy: req.user.id,
      changedAt: new Date(),
    });
    await student.save({ validateModifiedOnly: true });

    const io = req.app.get('io');
    if (io) io.emit('student:updated', student._id);

    res.json({
      success: true,
      message: `Đã cập nhật học phí từ ${oldPrice.toLocaleString('vi-VN')}đ → ${Number(newPrice).toLocaleString('vi-VN')}đ`,
      data: student,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// ─── PUT /api/students/:id/pay ─────────────────────────────────────────────────
// Workflow 4: Admin xác nhận thu học phí → tạo hóa đơn tự động
router.put('/:id/pay', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { paymentMethod = 'transfer', note = '' } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    if (student.paid) {
      return res.status(409).json({ success: false, message: 'Học viên đã thanh toán trước đó' });
    }

    // Cập nhật trạng thái thanh toán
    student.paid          = true;
    student.paidAt        = new Date();
    student.paymentMethod = paymentMethod;
    await student.save({ validateModifiedOnly: true });

    // Tự động tạo hóa đơn
    const count = await Invoice.countDocuments();
    const now   = new Date();
    const maHD  = `HD${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await Invoice.create({
      maHoaDon: maHD,
      hocVien:  student._id,
      hoTen:    student.name,
      khoaHoc:  student.course,
      hocPhi:   student.price,
      ghiChu:   note,
    });

    // Thông báo real-time
    const io = req.app.get('io');
    if (io) {
      // Notify Admin: doanh thu mới
      io.emit('revenue:updated', {
        studentId: student._id,
        studentName: student.name,
        amount: student.price,
        invoiceId: invoice._id,
        message: `💰 Thu học phí ${student.price.toLocaleString('vi-VN')}đ từ ${student.name}`,
      });
      // Notify học viên: xác nhận đã thanh toán
      io.emit('payment:confirmed', {
        studentId: student._id.toString(),
        invoiceId: invoice._id,
        amount: student.price,
        message: `✅ Học phí của bạn đã được xác nhận. Mã HĐ: ${maHD}`,
      });
    }

    res.json({
      success: true,
      message: `Đã xác nhận thanh toán ${student.price.toLocaleString('vi-VN')}đ`,
      data: { student, invoice },
    });
  } catch (error) {
    console.error('[STUDENTS] Pay error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/unlock-exam ────────────────────────────────────────
// Workflow 2: Admin mở khóa phòng thi thủ công
router.put('/:id/unlock-exam', authMiddleware, isAdmin, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { studentExamUnlocked: true },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    // Thông báo real-time cho học viên
    const io = req.app.get('io');
    if (io) {
      io.emit('exam:unlocked', {
        studentId: student._id.toString(),
        studentName: student.name,
        message: '🔓 Admin đã mở khóa phòng thi cho bạn!',
      });
    }

    res.json({
      success: true,
      message: `Đã mở khóa phòng thi cho ${student.name}`,
      data: student,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/lock-exam ──────────────────────────────────────────
// Workflow 2: Admin khóa phòng thi (vi phạm, ...)
router.put('/:id/lock-exam', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { studentExamUnlocked: false },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('exam:locked', {
        studentId: student._id.toString(),
        reason,
        message: `🔒 Phòng thi đã bị khóa. Lý do: ${reason || 'Vi phạm quy định'}`,
      });
    }

    res.json({ success: true, message: `Đã khóa phòng thi của ${student.name}`, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/assign-teacher ─────────────────────────────────────
// Admin gán giảng viên cho học viên
router.put('/:id/assign-teacher', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!teacherId) {
      return res.status(400).json({ success: false, message: 'Thiếu teacherId' });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { teacherId },
      { new: true }
    ).populate('teacherId', 'name phone specialty');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    // Thông báo cho giảng viên
    const Notification = require('../models/Notification');
    const io = req.app.get('io');
    
    try {
      const newNotif = await Notification.create({
        type: 'COURSE', // Map to matching internal types (COURSE or SYSTEM)
        title: '📚 Học viên mới được giao',
        content: `Học viên ${student.name} (${student.course}) đã được giao cho bạn.`,
        receivers: [teacherId.toString()],
        payload: { studentId: student._id, type: 'student' }
      });

      if (io) {
        // Emit for real-time notification bell
        io.to(teacherId.toString()).emit('RECEIVE_NOTIFICATION', {
          _id: newNotif._id,
          type: 'student', // Frontend use 'student' for icons/colors
          title: newNotif.title,
          message: newNotif.content, // Frontend expects 'message' or 'content'
          time: new Date(),
          userId: teacherId.toString()
        });
        
        // Old event for backward compatibility if needed
        io.emit('student:assigned', {
          teacherId: teacherId.toString(),
          studentId: student._id.toString(),
          studentName: student.name,
          course: student.course,
          message: `📚 Học viên ${student.name} (${student.course}) đã được giao cho bạn`,
        });
      }
    } catch (notifErr) {
      console.error('[ASSIGN_TEACHER] Notification error:', notifErr);
    }

    res.json({ success: true, message: 'Đã gán giảng viên thành công', data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/students/:id ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }
    res.json({ success: true, message: `Đã xóa học viên ${student.name}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/students/:id/reset-history ──────────────────────────────────────
// Reset lịch sử học (xóa buổi học, điểm danh, điểm số) — giữ thông tin cá nhân & học phí
router.post('/:id/reset-history', authMiddleware, isAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    // Xóa tất cả lịch học liên quan đến học viên này
    const deletedSchedules = await Schedule.deleteMany({ studentId: req.params.id });

    // Reset các field lịch sử trên Student document, giữ nguyên: name, phone, zalo, course, paid, price...
    await Student.findByIdAndUpdate(req.params.id, {
      $set: {
        remainingSessions:   student.totalSessions || 12, // reset về đủ buổi
        studentExamUnlocked: false,
        grade:               null,
        status:              'active',
        // Xóa lịch sử điểm danh nếu có field này
        attendanceHistory:   [],
        examScore:           null,
        practicalStatus:     'pending',
      },
    });

    // Log hệ thống
    const io = req.app.get('io');
    if (io) io.emit('student:history_reset', { studentId: req.params.id, name: student.name });

    res.json({
      success: true,
      message: `✅ Đã reset lịch sử học viên "${student.name}" — Xóa ${deletedSchedules.deletedCount} buổi học`,
      data: { deletedSchedules: deletedSchedules.deletedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/students/:id/pay-teacher (THANH TOÁN LƯƠNG TRÊN TỪNG HỌC VIÊN) ───
router.put('/:id/pay-teacher', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { action } = req.body; // 'PARTIAL' (thanh toán cộng dồn) hoặc 'PAID_IN_ADVANCE' (trả trước trọn gói)
    const studentId = req.params.id;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });

    if (action === 'PAID_IN_ADVANCE') {
      // 1. Chuyển trạng thái của học viên thành TRẢ TRƯỚC Toàn bộ
      student.teacher_payment_status = 'PAID_IN_ADVANCE';
      await student.save();

      // 2. Chuyển tất cả buổi "đã học/chưa học" đang pending thành PAID
      await Schedule.updateMany(
        { studentId, status: 'completed', is_paid_to_teacher: false },
        { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
      );

      return res.json({ success: true, message: 'Đã thiết lập thanh toán TRỌN GÓI. Mọi buổi điểm danh tiếp theo sẽ tự động tick Đã thanh toán.' });
    } else {
      // PARTIAL (Thanh toán cộng dồn các buổi dang dở hiện tại)
      const updated = await Schedule.updateMany(
        { studentId, status: 'completed', is_paid_to_teacher: false },
        { $set: { is_paid_to_teacher: true, paymentStatus: 'paid' } }
      );

      if (student.teacher_payment_status === 'UNPAID') {
         student.teacher_payment_status = 'PARTIAL';
         await student.save();
      }

      return res.json({ success: true, message: `Thanh toán thành công ${updated.modifiedCount} buổi dạy của HV ${student.name}.` });
    }
  } catch (error) {
    console.error('[STUDENTS] Pay Teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
