const jwt       = require('jsonwebtoken');
const Teacher   = require('../models/Teacher');
const Student   = require('../models/Student');
const blacklist = require('./tokenBlacklist');

// ── authMiddleware: Xác thực JWT + Token Blacklist + Token Version ─────────────
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Không có token, truy cập bị từ chối',
    });
  }

  // ⭐ Fix 3: Kiểm tra Token Blacklist (token đã bị đăng xuất)
  if (blacklist.isBlacklisted(token)) {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_REVOKED',
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.accessToken = token; // Lưu token gốc để dùng khi logout
    req.tokenAudience = decoded.aud || 'legacy'; // 'public' | 'internal' | 'legacy'

    // ⭐ Fix 1: Kiểm tra tokenVersion (chống chia sẻ tài khoản)
    // Chỉ áp dụng cho user có ID thực (không phải hardcoded admin)
    if (decoded.id && decoded.id !== 'admin' && decoded.tokenVersion !== undefined) {
      let dbUser = null;
      if (decoded.role === 'student') {
        dbUser = await Student.findById(decoded.id).select('tokenVersion').lean();
      } else {
        dbUser = await Teacher.findById(decoded.id).select('tokenVersion').lean();
      }

      if (dbUser && dbUser.tokenVersion !== undefined && dbUser.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_VERSION_MISMATCH',
          message: 'Tài khoản đã đăng nhập ở thiết bị khác. Phiên này đã bị vô hiệu.',
        });
      }
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Token đã hết hạn. Vui lòng đăng nhập lại.',
      });
    }
    res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
  }
};

// ── isAdmin: Chỉ cho phép role 'admin' ────────────────────────────────────────
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'staff')) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Quyền truy cập bị từ chối: Yêu cầu quyền Admin',
    });
  }
};

// ── isTeacher: Cho phép role 'teacher' hoặc 'admin' ──────────────────────────
const isTeacher = (req, res, next) => {
  if (req.user && (req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'staff')) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Quyền truy cập bị từ chối: Yêu cầu quyền Giảng viên',
    });
  }
};

// ── isSuperAdmin: Chỉ hardcoded admin hoặc SUPER_ADMIN ───────────────────────
const isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.id === 'admin') {
    return next(); // hardcoded admin: toàn quyền
  }
  if (req.user && req.user.adminRole === 'SUPER_ADMIN') {
    return next();
  }
  res.status(403).json({
    success: false,
    message: 'Quyền truy cập bị từ chối: Chỉ Super Admin mới có quyền này',
  });
};

/**
 * checkPermission(requiredPermission)
 *
 * Middleware factory kiểm tra quyền cụ thể.
 * - Hardcoded admin ('admin'): toàn quyền
 * - SUPER_ADMIN: toàn quyền
 * - STAFF: chỉ được truy cập nếu permissions[] chứa requiredPermission
 *
 * Lưu ý: permissions được fetch từ DB mỗi lần request để đảm bảo
 * phản ánh thay đổi real-time (không stale cache từ JWT)
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Hardcoded admin: bỏ qua tất cả
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Chưa xác thực' });
      }

      if (req.user.id === 'admin') return next();

      if (req.user.role !== 'admin' && req.user.role !== 'staff') {
        return res.status(403).json({
          success: false,
          message: `403 Forbidden: Cần quyền "${requiredPermission}"`,
        });
      }

      // Fetch từ DB để lấy adminRole + permissions real-time
      const user = await Teacher.findById(req.user.id).select('adminRole permissions role').lean();
      if (!user) {
        return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
      }

      // SUPER_ADMIN: toàn quyền
      if (user.adminRole === 'SUPER_ADMIN') return next();

      // STAFF: kiểm tra mảng permissions
      if (!user.permissions || !user.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          message: `403 Forbidden: Bạn không có quyền "${requiredPermission}". Liên hệ Super Admin để được cấp quyền.`,
        });
      }

      // Gắn permissions vào req để các route tiếp theo dùng nếu cần
      req.user.adminRole   = user.adminRole;
      req.user.permissions = user.permissions;
      next();
    } catch (err) {
      console.error('[checkPermission] error:', err);
      res.status(500).json({ success: false, message: 'Lỗi server khi kiểm tra quyền' });
    }
  };
};

/**
 * branchFilter — Middleware tự động giới hạn dữ liệu theo chi nhánh
 *
 * Gắn req.branchFilter vào request:
 * - SUPER_ADMIN / hardcoded admin: {}  (không lọc → toàn bộ dữ liệu)
 * - STAFF: { branchId: <ID chi nhánh của nhân viên> }
 *
 * Các route dùng: Student.find({ ...req.branchFilter, ... })
 */
const branchFilter = async (req, res, next) => {
  try {
    // Hardcoded admin
    if (!req.user || req.user.id === 'admin') {
      const qBranch = req.query.branch_id;
      if (qBranch && qBranch !== 'all' && qBranch !== '') {
        req.branchFilter = { branchId: qBranch };
      } else {
        req.branchFilter = {};
      }
      return next();
    }

    if (req.user.role === 'admin' || req.user.role === 'staff') {
      const user = await Teacher.findById(req.user.id)
        .select('adminRole branchId branchCode')
        .lean();

      if (!user) {
        req.branchFilter = {};
        return next();
      }

      // SUPER_ADMIN: nếu có query branch_id → lọc theo đó (từ Dropdown topbar)
      if (user.adminRole === 'SUPER_ADMIN' || !user.branchId) {
        // ⭐ KEY FIX: Super Admin gửi ?branch_id=xxx từ dropdown → phải respect nó
        const qBranch = req.query.branch_id;
        if (qBranch && qBranch !== 'all' && qBranch !== '') {
          req.branchFilter = { branchId: qBranch };
        } else {
          req.branchFilter = {};
        }
      } else {
        // STAFF: chỉ dữ liệu của chi nhánh mình
        req.branchFilter = { branchId: user.branchId };
        req.userBranchId   = user.branchId;
        req.userBranchCode = user.branchCode || '';
      }
    } else {
      // Teacher / Student: không áp dụng
      req.branchFilter = {};
    }

    next();
  } catch (err) {
    console.error('[branchFilter] error:', err);
    req.branchFilter = {};
    next();
  }
};

/**
 * requireInternalToken — Chặn token public truy cập API quản trị
 * Áp dụng sau authMiddleware trên các route nhạy cảm (staff/admin routes)
 */
const requireInternalToken = (req, res, next) => {
  // Legacy token (không có aud) hoặc hardcoded admin → cho qua để tương thích ngược
  if (!req.tokenAudience || req.tokenAudience === 'legacy' || req.tokenAudience === 'internal') return next();
  if (req.user?.id === 'admin') return next();
  // Token có aud='public' → chặn
  return res.status(403).json({
    success: false,
    message: 'Token không hợp lệ cho khu vực quản trị. Vui lòng đăng nhập qua cổng nội bộ (/admin/login).',
  });
};

module.exports = { authMiddleware, isAdmin, isTeacher, isSuperAdmin, checkPermission, branchFilter, requireInternalToken };
