const express = require('express');
const router  = express.Router();
const Invoice = require('../models/Invoice');
const Student = require('../models/Student');
const { generateInvoicePDF } = require('../modules/pdfInvoice');
const { authMiddleware, isAdmin, branchFilter } = require('../middleware/auth');

// ─── GET /api/invoices ─────────────────────────────────────────────────────
// Admin/Staff: Lấy hóa đơn (STAFF bị giới hạn theo chi nhánh)
router.get('/', [authMiddleware, branchFilter], async (req, res) => {
  try {
    const { studentId, search, branchId: queryBranch, paymentMethod, from, to } = req.query;
    const filter = { ...req.branchFilter }; // {} for admin, {branchId:...} for staff

    // Admin có thể lọc thêm theo chi nhánh cụ thể qua query param
    if (queryBranch && queryBranch !== 'all' && !req.branchFilter?.branchId) {
      filter.branchId = queryBranch;
    }
    if (studentId) filter.hocVien = studentId;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    if (search) {
      filter.$or = [
        { hoTen:    { $regex: search, $options: 'i' } },
        { khoaHoc:  { $regex: search, $options: 'i' } },
        { maHoaDon: { $regex: search, $options: 'i' } },
      ];
    }

    const invoices = await Invoice.find(filter)
      .populate('hocVien', 'name course phone zalo paid paidAt branchId branchCode')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/invoices/stats (branch-aware, timezone-safe) ────────────────────
router.get('/stats', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    // ⭐ Fix: branch-aware filter
    const bf = { ...req.branchFilter };
    // Admin có thể override bằng query param
    if (req.query.branch_id && req.query.branch_id !== 'all' && !req.userBranchId) {
      bf.branchId = req.query.branch_id;
    }

    const total = await Invoice.countDocuments(bf);
    const revenueResult = await Invoice.aggregate([
      { $match: bf },
      { $group: { _id: null, total: { $sum: '$hocPhi' } } },
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // ⭐ Fix timezone: dùng UTC+7 cho "tháng hiện tại"
    const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), 1) - 7 * 60 * 60 * 1000);
    const thisMonthResult = await Invoice.aggregate([
      { $match: { ...bf, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$hocPhi' } } },
    ]);
    const thisMonthRevenue = thisMonthResult[0]?.total || 0;

    res.json({ success: true, data: { total, totalRevenue, thisMonthRevenue } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/invoices/:id ─────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('hocVien', 'name course phone zalo address');
    
    if (!invoice) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }

    // Bảo vệ: Chỉ Admin hoặc chính Student sở hữu hóa đơn mới được xem
    if (req.user.role !== 'admin' && req.user.id !== invoice.hocVien?._id?.toString()) {
       return res.status(403).json({ success: false, message: 'Bạn không có quyền xem hóa đơn này' });
    }
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/invoices ────────────────────────────────────────────────────────
// Tạo hóa đơn thủ công (Admin) — dùng field names từ Student schema mới
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { hocVienId, ghiChu } = req.body;

    const student = await Student.findById(hocVienId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học viên' });
    }

    // Tạo mã hóa đơn
    const count = await Invoice.countDocuments();
    const now   = new Date();
    const maHD  = `HD${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await Invoice.create({
      maHoaDon: maHD,
      hocVien:  student._id,
      hoTen:    student.name,     // Student schema: name (không phải hoTen)
      khoaHoc:  student.course,   // Student schema: course (không phải khoaHoc)
      hocPhi:   student.price,    // Student schema: price (không phải hocPhi)
      ghiChu:   ghiChu || '',
    });

    // Đánh dấu học viên đã thanh toán nếu chưa
    if (!student.paid) {
      await Student.findByIdAndUpdate(hocVienId, {
        paid:   true,
        paidAt: new Date(),
      });
    }

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Mã hóa đơn đã tồn tại' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── GET /api/invoices/:id/pdf ─────────────────────────────────────────────────
// Xuất hóa đơn PDF
router.get('/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('hocVien', 'name course phone address');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }

    if (req.user.role !== 'admin' && req.user.id !== invoice.hocVien?._id?.toString()) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xuất hóa đơn này' });
    }

    const pdfBuffer = generateInvoicePDF({
      maHoaDon: invoice.maHoaDon,
      hoTen:    invoice.hoTen,
      khoaHoc:  invoice.khoaHoc,
      hocPhi:   invoice.hocPhi,
      ngayXuat: invoice.ngayXuat || invoice.createdAt,
      ghiChu:   invoice.ghiChu,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hoadon-${invoice.maHoaDon}.pdf`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/invoices/:id ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
    }
    res.json({ success: true, message: `Đã xóa hóa đơn ${invoice.maHoaDon}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
