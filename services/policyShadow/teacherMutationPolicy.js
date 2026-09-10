/**
 * Policy shadow evaluator for teacher score / approve / reject.
 * READ-ONLY decision — does not authorize HTTP.
 *
 * Reproduces live legacy rules:
 * - MANAGE_TEACHERS (live constants)
 * - SUPER_ADMIN / hardcoded admin bypass
 * - HIGH_ADMIN / STAFF / SUPPORT: must hold manage_teachers
 * - non-admin/staff roles: DENY
 * - branch: if userBranchId set and teacher.branchId set and mismatch → DENY
 * - client branchId ignored (not consulted)
 */
const { TEACHER_WRITE_LIVE, actorHasLivePermission } = require('./livePermissionAdapter');

const ACTIONS = new Set(['score', 'approve', 'reject', 'review_practical', 'grant_exam_access', 'manual_activate', 'suspend', 'reactivate']);

/**
 * @typedef {'ALLOW'|'DENY'} Decision
 * @typedef {{ decision: Decision, reason: string, statusHint?: number }} EvalResult
 */

/**
 * Build trusted subject from server state (never from client role/branch spoof).
 */
function buildSubject({ user, actorDoc, userBranchId }) {
  return {
    id: String(user?.id || user?._id || ''),
    role: String(user?.role || actorDoc?.role || ''),
    adminRole: actorDoc?.adminRole || user?.adminRole || null,
    permissions: Array.isArray(actorDoc?.permissions)
      ? actorDoc.permissions
      : (Array.isArray(user?.permissions) ? user.permissions : []),
    userBranchId: userBranchId != null && userBranchId !== '' ? String(userBranchId) : null,
  };
}

/**
 * Legacy-equivalent permission decision (checkPermission(MANAGE_TEACHERS)).
 * @returns {EvalResult}
 */
function evaluateLegacyPermission(subject) {
  if (!subject?.id) {
    return { decision: 'DENY', reason: 'unauthenticated', statusHint: 401 };
  }
  if (subject.id === 'admin') {
    return { decision: 'ALLOW', reason: 'hardcoded_admin', statusHint: 200 };
  }
  const role = String(subject.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'staff') {
    return { decision: 'DENY', reason: 'role_not_staff', statusHint: 403 };
  }
  if (subject.adminRole === 'SUPER_ADMIN') {
    return { decision: 'ALLOW', reason: 'super_admin', statusHint: 200 };
  }
  if (!actorHasLivePermission(subject, TEACHER_WRITE_LIVE)) {
    return { decision: 'DENY', reason: 'missing_manage_teachers', statusHint: 403 };
  }
  return { decision: 'ALLOW', reason: 'has_manage_teachers', statusHint: 200 };
}

/**
 * Legacy-equivalent branch decision (assertTeacherBranchAccess).
 * Matches live code: only DENY when both branches present and differ.
 * @returns {EvalResult}
 */
function evaluateLegacyBranch(subject, resourceTeacher) {
  if (!subject?.userBranchId) {
    return { decision: 'ALLOW', reason: 'no_user_branch_scope', statusHint: 200 };
  }
  if (!resourceTeacher) {
    return { decision: 'DENY', reason: 'teacher_not_found', statusHint: 404 };
  }
  const teacherBranch = resourceTeacher.branchId != null && resourceTeacher.branchId !== ''
    ? String(resourceTeacher.branchId)
    : null;
  if (teacherBranch && teacherBranch !== String(subject.userBranchId)) {
    return { decision: 'DENY', reason: 'cross_branch', statusHint: 403 };
  }
  return { decision: 'ALLOW', reason: 'branch_ok', statusHint: 200 };
}

/**
 * Combined legacy decision for teacher write.
 * @returns {EvalResult & { permission: EvalResult, branch: EvalResult }}
 */
function evaluateLegacyTeacherWrite(subject, resourceTeacher) {
  const permission = evaluateLegacyPermission(subject);
  if (permission.decision === 'DENY') {
    return { decision: 'DENY', reason: permission.reason, statusHint: permission.statusHint, permission, branch: null };
  }
  const branch = evaluateLegacyBranch(subject, resourceTeacher);
  if (branch.decision === 'DENY') {
    return { decision: 'DENY', reason: branch.reason, statusHint: branch.statusHint, permission, branch };
  }
  return { decision: 'ALLOW', reason: 'legacy_allow', statusHint: 200, permission, branch };
}

/**
 * Policy shadow decision — must MATCH evaluateLegacyTeacherWrite for this family.
 * Uses live MANAGE_TEACHERS via adapter; ignores client body/query branchId.
 */
function evaluatePolicyTeacherWrite(subject, resourceTeacher, action, _untrusted = {}) {
  if (!ACTIONS.has(String(action || ''))) {
    return { decision: 'DENY', reason: 'unknown_action', statusHint: 403 };
  }
  // Explicitly ignore untrusted client branch hints
  void _untrusted.bodyBranchId;
  void _untrusted.queryBranchId;

  const permission = evaluateLegacyPermission(subject);
  if (permission.decision === 'DENY') {
    return {
      decision: 'DENY',
      reason: `policy_${permission.reason}`,
      statusHint: permission.statusHint,
      requiredPermission: TEACHER_WRITE_LIVE,
    };
  }
  const branch = evaluateLegacyBranch(subject, resourceTeacher);
  if (branch.decision === 'DENY') {
    return {
      decision: 'DENY',
      reason: `policy_${branch.reason}`,
      statusHint: branch.statusHint,
      requiredPermission: TEACHER_WRITE_LIVE,
    };
  }
  return {
    decision: 'ALLOW',
    reason: 'policy_allow',
    statusHint: 200,
    requiredPermission: TEACHER_WRITE_LIVE,
  };
}

function compareDecisions(legacy, policy) {
  if (!legacy || !policy) return 'UNKNOWN';
  if (legacy.decision === policy.decision) return 'MATCH';
  return 'MISMATCH';
}

module.exports = {
  ACTIONS,
  TEACHER_WRITE_LIVE,
  buildSubject,
  evaluateLegacyPermission,
  evaluateLegacyBranch,
  evaluateLegacyTeacherWrite,
  evaluatePolicyTeacherWrite,
  compareDecisions,
};
