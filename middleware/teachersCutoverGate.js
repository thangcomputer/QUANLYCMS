/**
 * Phase 7.31 — Controlled cutover gate for LIVE /api/teachers ONLY.
 *
 * LEGACY (default): retain prior middleware stack per action
 *   (isAdmin / isTeacher / checkPermission / assertTeacherBranchAccess / superAdminOnlyTeacher).
 *   Handler-owned gates (list / get_one / update hybrid / finance_self) stay next().
 *
 * POLICY (env opt-in): Policy decision is HTTP authority.
 * Fail-safe: ERROR / UNKNOWN / malformed → Legacy path above.
 * Does not create/update/delete teachers, mutate finance, notify, emit, or upload.
 * Mutations / finance / realtime / storage remain handler-owned.
 */
const Teacher = require('../models/Teacher');
const logger = require('../config/logger');
const { isAdmin, isTeacher, checkPermission } = require('./auth');
const { assertTeacherBranchAccess } = require('./teacherBranchGuard');
const { PERMISSIONS } = require('../constants/permissions');
const {
  AUTHORITY,
  getAuthorizationAuthority,
} = require('../services/policyShadow/cutoverAuthority');

const legacyViewTeachers = checkPermission(PERMISSIONS.VIEW_TEACHERS);
const legacyManageTeachers = checkPermission(PERMISSIONS.MANAGE_TEACHERS);
const legacyManageFinance = checkPermission(PERMISSIONS.MANAGE_FINANCE);

/** Super Admin hoặc HIGH_ADMIN — create/delete/pay giảng viên (STAFF/SUPPORT không). */
const superAdminOnlyTeacher = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa xác thực' });
  if (req.user.id === 'admin') return next();
  const user = await Teacher.findById(req.user.id).select('adminRole').lean();
  if (user?.adminRole === 'SUPER_ADMIN' || user?.adminRole === 'HIGH_ADMIN') return next();
  return res.status(403).json({
    success: false,
    message: '403 Forbidden — Bạn không có quyền thực hiện thao tác này. Chỉ Super Admin hoặc High Admin mới được thêm/sửa/xóa / trả lương giảng viên.',
  });
};

function compose(...middlewares) {
  return (req, res, next) => {
    let i = 0;
    const run = (err) => {
      if (err) return next(err);
      const mw = middlewares[i++];
      if (!mw) return next();
      return mw(req, res, run);
    };
    return run();
  };
}

function denyTeachers(res, statusHint, reason, action) {
  const r = String(reason || '').replace(/^policy_/, '');
  if (
    statusHint === 401
    || r === 'unauthenticated'
  ) {
    return res.status(401).json({
      success: false,
      message: 'Chưa xác thực',
    });
  }
  if (statusHint === 404 || r === 'teacher_not_found') {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy giảng viên',
    });
  }
  if (r === 'cross_branch') {
    if (action === 'get_one') {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem giảng viên chi nhánh khác',
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Không có quyền thao tác giảng viên chi nhánh khác',
    });
  }
  if (r === 'super_admin_only') {
    return res.status(403).json({
      success: false,
      message: '403 Forbidden — Bạn không có quyền thực hiện thao tác này. Chỉ Super Admin hoặc High Admin mới được thêm/sửa/xóa / trả lương giảng viên.',
    });
  }
  if (r === 'not_admin_role') {
    return res.status(403).json({
      success: false,
      message: 'Quyền truy cập bị từ chối: Yêu cầu quyền Admin',
    });
  }
  if (r === 'not_teacher_middleware') {
    return res.status(403).json({
      success: false,
      message: 'Quyền truy cập bị từ chối: Yêu cầu quyền Giảng viên',
    });
  }
  if (r === 'list_role_denied') {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền xem danh sách giảng viên',
    });
  }
  if (r === 'student_denied') {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền truy cập',
    });
  }
  if (r === 'teacher_not_self' || r === 'get_role_denied') {
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền xem thông tin này',
    });
  }
  if (r === 'submit_not_self') {
    return res.status(403).json({
      success: false,
      message: 'Bạn không thể nộp giùm người khác',
    });
  }
  if (r === 'finance_forbidden') {
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền truy cập thông tin này',
    });
  }
  if (r === 'update_role_denied') {
    return res.status(403).json({
      success: false,
      message: 'Không có quyền',
    });
  }
  if (r === 'missing_manage_training_or_teachers') {
    return res.status(403).json({
      success: false,
      message: '403 Forbidden — Chỉ Super Admin hoặc tài khoản có quyền Đào tạo / Quản lý Giảng viên mới được sửa thông tin giảng viên.',
    });
  }
  if (r === 'role_not_staff' || r.startsWith('missing_')) {
    return res.status(403).json({
      success: false,
      message: '403 Forbidden: Bạn không có quyền thực hiện thao tác này. Liên hệ Super Admin để được cấp quyền.',
    });
  }
  return res.status(403).json({
    success: false,
    message: '403 Forbidden: Bạn không có quyền thực hiện thao tác này. Liên hệ Super Admin để được cấp quyền.',
  });
}

function legacyTeachersGate(action, req, res, next) {
  switch (action) {
    case 'upload_practical':
    case 'submit_practical':
      return isTeacher(req, res, next);
    case 'create':
    case 'delete':
      return compose(isAdmin, superAdminOnlyTeacher)(req, res, next);
    case 'stats_summary':
      return legacyViewTeachers(req, res, next);
    case 'update_profile':
      return assertTeacherBranchAccess(req, res, next);
    case 'score':
    case 'approve':
    case 'reject':
    case 'review_practical':
    case 'grant_exam_access':
    case 'manual_activate':
    case 'suspend':
    case 'reactivate':
      return compose(legacyManageTeachers, assertTeacherBranchAccess)(req, res, next);
    case 'finance_pending':
      return legacyManageFinance(req, res, next);
    case 'finance_pay_flexible':
    case 'finance_pay_all':
      return compose(legacyManageFinance, superAdminOnlyTeacher)(req, res, next);
    case 'list':
    case 'get_one':
    case 'finance_self':
    default:
      return next();
  }
}

/**
 * @param {string} action - teacherRoutePolicy / teacherMutationPolicy action key
 */
function teachersCutoverGate(action) {
  return (req, res, next) => {
    let authority = AUTHORITY.LEGACY;
    try {
      authority = getAuthorizationAuthority('teachers');
    } catch (err) {
      authority = AUTHORITY.LEGACY;
      logger.warn(
        {
          event: 'POLICY_CUTOVER_FALLBACK',
          family: 'teachers',
          action: `teacher_${action}`,
          authority: AUTHORITY.LEGACY,
          reason: 'authority_helper_throw',
          err: err.message,
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
        '[POLICY_CUTOVER] teachers authority helper failed — Legacy gate',
      );
    }

    req.authzAuthority = authority;
    req.authzFamily = 'teachers';

    if (authority !== AUTHORITY.POLICY) {
      logger.info(
        {
          event: 'POLICY_CUTOVER_AUTHORITY',
          family: 'teachers',
          action: `teacher_${action}`,
          authority: AUTHORITY.LEGACY,
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
        '[POLICY_CUTOVER] teachers using Legacy authority',
      );
      return legacyTeachersGate(action, req, res, next);
    }

    const shadow = req.policyShadow || {};
    const comparison = shadow.comparison;
    const decision = shadow.policyDecision;
    const reason = shadow.policyReason || '';
    const statusHint = shadow.policyStatusHint;

    if (
      comparison === 'ERROR'
      || comparison === 'UNKNOWN'
      || (decision !== 'ALLOW' && decision !== 'DENY')
    ) {
      logger.warn(
        {
          event: 'POLICY_CUTOVER_FALLBACK',
          family: 'teachers',
          action: `teacher_${action}`,
          authority: AUTHORITY.LEGACY,
          reason: comparison === 'ERROR' ? 'policy_eval_error' : 'policy_unknown_or_malformed',
          comparison: comparison || null,
          policyDecision: decision || null,
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
        '[POLICY_CUTOVER] teachers Policy unsafe — fallback Legacy',
      );
      req.authzAuthority = AUTHORITY.LEGACY;
      req.policyAuthoritative = false;
      return legacyTeachersGate(action, req, res, next);
    }

    if (decision === 'ALLOW') {
      req.policyAuthoritative = true;
      logger.info(
        {
          event: 'POLICY_CUTOVER_AUTHORITY',
          family: 'teachers',
          action: `teacher_${action}`,
          authority: AUTHORITY.POLICY,
          policyDecision: 'ALLOW',
          policyReason: reason,
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
        '[POLICY_CUTOVER] teachers Policy ALLOW',
      );
      return next();
    }

    req.policyAuthoritative = true;
    logger.info(
      {
        event: 'POLICY_CUTOVER_AUTHORITY',
        family: 'teachers',
        action: `teacher_${action}`,
        authority: AUTHORITY.POLICY,
        policyDecision: 'DENY',
        policyReason: reason,
        requestId: req.requestId,
        correlationId: req.correlationId,
      },
      '[POLICY_CUTOVER] teachers Policy DENY',
    );
    return denyTeachers(res, statusHint, reason, action);
  };
}

module.exports = { teachersCutoverGate };
