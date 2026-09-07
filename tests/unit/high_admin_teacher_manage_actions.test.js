'use strict';

/**
 * Static assertions: Super + HIGH_ADMIN can manage teacher pay/edit/delete.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('HIGH_ADMIN teacher manage actions', () => {
  it('FE: canManageTeacherActions = Super || High', () => {
    const tab = read('client/src/components/admin/tabs/AdminTeachersTab.jsx');
    assert.match(tab, /canManageTeacherActions\s*=\s*!!\(isSuperAdmin\s*\|\|\s*isHighAdmin\)/);
    assert.match(tab, /canManageTeacherActions && active/);
    assert.match(tab, /Thanh toán lương/);
    assert.match(tab, /Chỉnh sửa \/ lương/);
    assert.match(tab, /Xóa giảng viên/);
    assert.match(tab, /Chỉ Super \/ High Admin thao tác được/);
    assert.doesNotMatch(tab, /isSuperAdmin && active &&/);
  });

  it('FE: adminTabValue exposes isHighAdmin', () => {
    const state = read('client/src/components/admin/hooks/useAdminDashboardState.jsx');
    assert.match(state, /isHighAdmin/);
    assert.match(state, /teacherSearch, setTeacherSearch, isSuperAdmin, isHighAdmin/);
    assert.match(state, /isSuperAdmin,\s*\n\s*isHighAdmin,/);
  });

  it('FE: Add/Edit teacher modal branch picker for Super||High', () => {
    // Modal đã tách khỏi AdminDashboard → AdminModalManager
    const modals = read('client/src/components/admin/shared/AdminModalManager.jsx');
    assert.match(modals, /isSuperAdmin=\{isSuperAdmin \|\| isHighAdmin\}/);
  });

  it('BE gate: Super hoặc HIGH_ADMIN ALLOW; message updated', () => {
    const gate = read('middleware/teachersCutoverGate.js');
    assert.match(
      gate,
      /adminRole === 'SUPER_ADMIN' \|\| user\?\.adminRole === 'HIGH_ADMIN'/,
    );
    assert.match(gate, /Super Admin hoặc High Admin/);
  });

  it('Policy shadow evaluateSuperAdminOnly allows HIGH_ADMIN', () => {
    const pol = read('services/policyShadow/teacherRoutePolicy.js');
    assert.match(pol, /adminRole === 'HIGH_ADMIN'/);
    assert.match(pol, /reason: 'high_admin'/);
  });
});
