/**
 * staffRoutes.js — Quản lý tài khoản nội bộ (Admin / Staff) CRUD
 * Thêm: validate branchId tồn tại trong Branches, auto-fill branchCode
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const Teacher = require('../models/Teacher');
const Branch  = require('../models/Branch');
const { authMiddleware, checkPermission } = require('../middleware/auth');

const router = express.Router();
const guard  = [authMiddleware, checkPermission('manage_staff')];

// ── GET /api/staff ─────────────────────────────────────────────────────────────
router.get('/', guard, async (req, res) => {
  try {
    const staff = await Teacher.find({ role: { $in: ['admin', 'staff'] } })
      .select('-password -refreshToken').sort({ createdAt: -1 });
    return res.json({ success: true, count: staff.length, data: staff });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/staff ────────────────────────────────────────────────────────────
router.post('/', guard, async (req, res) => {
  try {
    const { name, phone, password, adminRole = 'STAFF', permissions = [], branchId } = req.body;

    if (!name || !phone || !password)
      return res.status(400).json({ success: false, message: 'Thiếu tên, số điện thoại hoặc mật khẩu' });

    // Validate branch cho STAFF
    let branchCode = '';
    if (adminRole === 'STAFF') {
      if (!branchId)
        return res.status(400).json({ success: false, message: 'Nhân viên (STAFF) phải thuộc một chi nhánh. Vui lòng chọn chi nhánh.' });
      const branch = await Branch.findById(branchId);
      if (!branch)
        return res.status(400).json({ success: false, message: 'Chi nhánh không hợp lệ hoặc không tồn tại.' });
      branchCode = branch.code || '';
    }

    const exists = await Teacher.findOne({ phone });
    if (exists)
      return res.status(409).json({ success: false, message: 'Số điện thoại đã được sử dụng' });

    const newStaff = await Teacher.create({
      name, phone, password,
      role:        adminRole === 'SUPER_ADMIN' ? 'admin' : 'staff',
      adminRole,
      permissions: adminRole === 'SUPER_ADMIN' ? [] : permissions,
      branchId:    adminRole === 'SUPER_ADMIN' ? null : (branchId  || null),
      branchCode:  adminRole === 'SUPER_ADMIN' ? ''   : branchCode,
      status:    'active',
      approvedBy: req.user?.name || 'Admin',
      approvedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: `Đã tạo tài khoản ${adminRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Nhân viên'}: ${name}`,
      data: { ...newStaff.toObject(), password: undefined },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Số điện thoại đã tồn tại' });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/staff/:id ─────────────────────────────────────────────────────────
router.put('/:id', guard, async (req, res) => {
  try {
    const { name, adminRole, permissions = [], status, password, branchId } = req.body;
    const updates = {};

    if (name)   updates.name   = name;
    if (status) updates.status = status;

    if (adminRole) {
      updates.adminRole = adminRole;
      if (adminRole === 'SUPER_ADMIN') {
        updates.role        = 'admin';
        updates.permissions = [];
        updates.branchId    = null;
        updates.branchCode  = '';
      } else {
        updates.role        = 'staff';
        updates.permissions = permissions;
        if (branchId) {
          const branch = await Branch.findById(branchId);
          if (!branch)
            return res.status(400).json({ success: false, message: 'Chi nhánh không hợp lệ' });
          updates.branchId   = branchId;
          updates.branchCode = branch.code || '';
        } else if (branchId === null || branchId === '') {
          updates.branchId   = null;
          updates.branchCode = '';
        }
      }
    }

    if (password && password.length >= 6)
      updates.password = await bcrypt.hash(password, 10);

    const updated = await Teacher.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: false,
    }).select('-password -refreshToken');

    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    return res.json({ success: true, message: 'Đã cập nhật phân quyền', data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/staff/:id ──────────────────────────────────────────────────────
router.delete('/:id', guard, async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản của mình' });
    const deleted = await Teacher.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    return res.json({ success: true, message: `Đã xóa tài khoản: ${deleted.name}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
