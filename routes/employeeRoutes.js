/**
 * employeeRoutes.js — CRUD Nhân sự + Trả lương
 * Branch-aware: STAFF chỉ thấy nhân viên chi nhánh mình
 */
const express    = require('express');
const router     = express.Router();
const Employee   = require('../models/Employee');
const PayrollLog = require('../models/PayrollLog');
const { authMiddleware, isAdmin, branchFilter } = require('../middleware/auth');

// ─── GET /api/employees ─────────────────────────────────────────────────────────
// Danh sách nhân sự (branch-aware)
router.get('/', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    const filter = { ...req.branchFilter };
    if (req.query.position && req.query.position !== 'all') filter.position = req.query.position;
    if (req.query.status && req.query.status !== 'all')     filter.status   = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { name:  { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } },
      ];
    }
    const employees = await Employee.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/employees/stats ────────────────────────────────────────────────────
router.get('/stats', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    const bf = { ...req.branchFilter };
    const total  = await Employee.countDocuments({ ...bf, status: 'active' });
    const salaryResult = await Employee.aggregate([
      { $match: { ...bf, status: 'active' } },
      { $group: { _id: null, total: { $sum: '$baseSalary' } } },
    ]);
    const totalSalary = salaryResult[0]?.total || 0;

    // Tổng đã trả trong tháng hiện tại
    const nowVN = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), 1) - 7 * 60 * 60 * 1000);
    const paidFilter = { ...bf, payDate: { $gte: startOfMonth }, salaryType: 'LUONG_CUNG' };
    const paidResult = await PayrollLog.aggregate([
      { $match: paidFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const paidThisMonth = paidResult[0]?.total || 0;

    // Phân bổ theo chức vụ
    const byPosition = await Employee.aggregate([
      { $match: { ...bf, status: 'active' } },
      { $group: { _id: '$position', count: { $sum: 1 }, salary: { $sum: '$baseSalary' } } },
      { $sort: { count: -1 } },
    ]);

    res.json({ success: true, data: { total, totalSalary, paidThisMonth, byPosition } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/employees ────────────────────────────────────────────────────────
router.post('/', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    const { name, phone, position, baseSalary, startDate, note, branchId, branchCode, linkedTeacherId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Tên nhân viên là bắt buộc' });

    // STAFF: auto-assign branch
    const finalBranchId   = req.userBranchId || branchId || '';
    const finalBranchCode = req.userBranchCode || branchCode || '';

    const employee = await Employee.create({
      name, phone: phone || '',
      position: position || 'KHAC',
      baseSalary: Number(baseSalary) || 0,
      startDate: startDate ? new Date(startDate) : new Date(),
      note: note || '',
      branchId: finalBranchId,
      branchCode: finalBranchCode,
      linkedTeacherId: linkedTeacherId || null,
    });

    res.status(201).json({ success: true, data: employee });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/employees/:id ─────────────────────────────────────────────────────
router.put('/:id', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    // Branch guard
    if (req.userBranchId) {
      const emp = await Employee.findById(req.params.id).select('branchId').lean();
      if (emp && String(emp.branchId) !== String(req.userBranchId)) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa nhân viên chi nhánh khác' });
      }
    }
    const updates = { ...req.body };
    if (updates.baseSalary !== undefined) updates.baseSalary = Number(updates.baseSalary);
    if (updates.startDate) updates.startDate = new Date(updates.startDate);

    const employee = await Employee.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    res.json({ success: true, data: employee });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/employees/:id ──────────────────────────────────────────────────
router.delete('/:id', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    if (req.userBranchId) {
      const emp = await Employee.findById(req.params.id).select('branchId').lean();
      if (emp && String(emp.branchId) !== String(req.userBranchId)) {
        return res.status(403).json({ success: false, message: 'Không có quyền xóa nhân viên chi nhánh khác' });
      }
    }
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    res.json({ success: true, message: `Đã xóa nhân viên ${employee.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/employees/:id/pay ────────────────────────────────────────────────
// Trả lương cho nhân viên → ghi vào PayrollLog
router.post('/:id/pay', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });

    // Branch guard
    if (req.userBranchId && String(employee.branchId) !== String(req.userBranchId)) {
      return res.status(403).json({ success: false, message: 'Không có quyền trả lương nhân viên chi nhánh khác' });
    }

    const { amount, payDate, note, monthLabel } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền phải lớn hơn 0' });
    }

    const log = await PayrollLog.create({
      employeeId:   employee._id,
      employeeName: employee.name,
      position:     employee.position,
      branchId:     employee.branchId,
      branchCode:   employee.branchCode,
      amount:       Number(amount),
      payDate:      payDate ? new Date(payDate) : new Date(),
      monthLabel:   monthLabel || '',
      note:         note || '',
      paidBy:       req.user?.name || 'Admin',
      salaryType:   'LUONG_CUNG',
    });

    res.status(201).json({ success: true, data: log, message: `Đã trả lương ${employee.name}: ${Number(amount).toLocaleString('vi-VN')}đ` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── GET /api/employees/payroll ─────────────────────────────────────────────────
// Lịch sử trả lương (branch-aware)
router.get('/payroll', [authMiddleware, isAdmin, branchFilter], async (req, res) => {
  try {
    const filter = { ...req.branchFilter };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.month) {
      const [y, m] = req.query.month.split('-').map(Number);
      filter.payDate = {
        $gte: new Date(y, m - 1, 1),
        $lt:  new Date(y, m, 1),
      };
    }
    const logs = await PayrollLog.find(filter)
      .populate('employeeId', 'name position phone')
      .sort({ payDate: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
