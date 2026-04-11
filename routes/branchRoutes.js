/**
 * branchRoutes.js — CRUD Chi nhánh
 *
 * GET    /api/branches          — Danh sách (public, để form đăng ký dùng)
 * POST   /api/branches          — Thêm chi nhánh (SUPER_ADMIN)
 * PUT    /api/branches/:id      — Sửa chi nhánh (SUPER_ADMIN)
 * DELETE /api/branches/:id      — Xóa chi nhánh (SUPER_ADMIN)
 */
const express = require('express');
const Branch  = require('../models/Branch');
const { authMiddleware, checkPermission } = require('../middleware/auth');

const router = express.Router();
const adminGuard = [authMiddleware, checkPermission('manage_staff')];

// ── GET /api/branches ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true }).sort({ name: 1 });
    return res.json({ success: true, count: branches.length, data: branches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/branches/all — kể cả inactive (cho admin UI) ────────────────────
router.get('/all', adminGuard, async (req, res) => {
  try {
    const branches = await Branch.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: branches.length, data: branches });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/branches ────────────────────────────────────────────────────────
router.post('/', adminGuard, async (req, res) => {
  try {
    const { name, code, address, phone } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Thiếu tên hoặc mã chi nhánh' });
    }

    const branch = await Branch.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      address: address || '',
      phone: phone || '',
    });

    return res.status(201).json({ success: true, message: `Đã thêm chi nhánh: ${name}`, data: branch });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyValue?.code ? 'Mã chi nhánh' : 'Tên chi nhánh';
      return res.status(409).json({ success: false, message: `${field} đã tồn tại` });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/branches/:id ─────────────────────────────────────────────────────
router.put('/:id', adminGuard, async (req, res) => {
  try {
    const updates = {};
    const allowed = ['name', 'code', 'address', 'phone', 'isActive'];
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const updated = await Branch.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Không tìm thấy chi nhánh' });

    return res.json({ success: true, message: 'Đã cập nhật chi nhánh', data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/branches/:id ──────────────────────────────────────────────────
router.delete('/:id', adminGuard, async (req, res) => {
  try {
    // Soft-delete: chỉ đặt isActive = false để không mất data lịch sử
    const deleted = await Branch.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!deleted) return res.status(404).json({ success: false, message: 'Không tìm thấy chi nhánh' });

    return res.json({ success: true, message: `Đã vô hiệu hóa chi nhánh: ${deleted.name}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
