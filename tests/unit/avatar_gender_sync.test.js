'use strict';

/**
 * PHASE AVATAR-GENDER-SYNC-1 — normalizeGender + resolveAvatarUrl + auth payload.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const avatarsPath = path.join(__dirname, '../../client/src/utils/defaultAvatars.js');
const authPath = path.join(__dirname, '../../routes/authRoutes.js');
const editablePath = path.join(__dirname, '../../client/src/components/EditableAvatar.jsx');
const sidebarPath = path.join(__dirname, '../../client/src/components/AppSidebar.jsx');
const avatarCompPath = path.join(__dirname, '../../client/src/components/admin/shared/Avatar.jsx');
const publicAvatarsDir = path.join(__dirname, '../../client/public/avatars');

describe('avatar gender sync — normalizeGender + resolveAvatarUrl', async () => {
  const mod = await import(pathToFileURL(avatarsPath).href);
  const {
    normalizeGender,
    resolveAvatarUrl,
    isRealAvatar,
    isAvatarUrl,
    DEFAULT_AVATARS,
  } = mod;

  it('normalizeGender: Nam/Nữ/nu/Male/Female → male|female|unknown', () => {
    assert.equal(normalizeGender('Nam'), 'male');
    assert.equal(normalizeGender('nam'), 'male');
    assert.equal(normalizeGender('male'), 'male');
    assert.equal(normalizeGender('MALE'), 'male');
    assert.equal(normalizeGender('Nữ'), 'female');
    assert.equal(normalizeGender('nữ'), 'female');
    assert.equal(normalizeGender('nu'), 'female');
    assert.equal(normalizeGender('female'), 'female');
    assert.equal(normalizeGender(''), 'unknown');
    assert.equal(normalizeGender(null), 'unknown');
    assert.equal(normalizeGender('other'), 'unknown');
  });

  it('unknown gender does NOT coerce to male', () => {
    const male = resolveAvatarUrl({ role: 'student', gender: 'male' });
    const female = resolveAvatarUrl({ role: 'student', gender: 'female' });
    const unknown = resolveAvatarUrl({ role: 'student', gender: '' });
    assert.equal(male, DEFAULT_AVATARS.student_male);
    assert.equal(female, DEFAULT_AVATARS.student_female);
    assert.equal(unknown, DEFAULT_AVATARS.student_unknown);
    assert.notEqual(unknown, male);
    assert.ok(unknown.endsWith('student.png'));
  });

  it('A/B student male/female defaults', () => {
    assert.equal(
      resolveAvatarUrl({ role: 'student', gender: 'male' }),
      DEFAULT_AVATARS.student_male,
    );
    assert.equal(
      resolveAvatarUrl({ role: 'student', gender: 'female' }),
      DEFAULT_AVATARS.student_female,
    );
  });

  it('D/E teacher male/female', () => {
    assert.equal(
      resolveAvatarUrl({ role: 'teacher', gender: 'Nam' }),
      DEFAULT_AVATARS.teacher_male,
    );
    assert.equal(
      resolveAvatarUrl({ role: 'teacher', gender: 'Nữ' }),
      DEFAULT_AVATARS.teacher_female,
    );
  });

  it('F staff male is NOT staff_female / not female-biased', () => {
    const url = resolveAvatarUrl({ role: 'staff', gender: 'male' });
    assert.equal(url, DEFAULT_AVATARS.staff_male);
    assert.ok(!String(DEFAULT_AVATARS.staff).includes('female'));
    assert.notEqual(DEFAULT_AVATARS.staff, DEFAULT_AVATARS.staff_female);
    assert.ok(!url.includes('staff_female'));
  });

  it('G staff female uses staff_female key path', () => {
    assert.equal(
      resolveAvatarUrl({ adminRole: 'STAFF', gender: 'female' }),
      DEFAULT_AVATARS.staff_female,
    );
  });

  it('H/I uploaded avatar wins over gender', () => {
    const up = '/uploads/avatars/x.jpg';
    assert.equal(
      resolveAvatarUrl({ avatar: up, role: 'student', gender: 'female' }),
      up,
    );
    assert.equal(
      resolveAvatarUrl({ avatar: 'https://cdn.example/a.png', role: 'teacher', gender: 'male' }),
      'https://cdn.example/a.png',
    );
  });

  it('initials are NOT real avatars', () => {
    assert.equal(isRealAvatar('TH'), false);
    assert.equal(isAvatarUrl('TH'), false);
    assert.equal(isRealAvatar('/uploads/a.png'), true);
    const url = resolveAvatarUrl({ avatar: 'TH', role: 'student', gender: 'female' });
    assert.equal(url, DEFAULT_AVATARS.student_female);
  });

  it('SUPPORT/STAFF adminRole before role=admin', () => {
    const staff = resolveAvatarUrl({
      role: 'admin',
      adminRole: 'STAFF',
      gender: 'male',
    });
    const support = resolveAvatarUrl({
      role: 'admin',
      adminRole: 'SUPPORT',
      gender: 'unknown',
    });
    const superA = resolveAvatarUrl({
      role: 'admin',
      adminRole: 'SUPER_ADMIN',
      gender: '',
    });
    assert.equal(staff, DEFAULT_AVATARS.staff_male);
    assert.equal(support, DEFAULT_AVATARS.support_unknown);
    assert.equal(superA, DEFAULT_AVATARS.admin_unknown);
  });

  it('default asset files exist on disk', () => {
    const needed = [
      DEFAULT_AVATARS.student_male,
      DEFAULT_AVATARS.student_female,
      DEFAULT_AVATARS.student,
      DEFAULT_AVATARS.teacher_male,
      DEFAULT_AVATARS.staff_male,
      DEFAULT_AVATARS.admin_male,
    ];
    for (const rel of needed) {
      assert.ok(rel.startsWith('/avatars/'), rel);
      const file = path.join(publicAvatarsDir, path.basename(rel));
      assert.ok(fs.existsSync(file), `missing ${file}`);
    }
  });

  it('male and female student paths differ (cartoon PNG)', () => {
    assert.notEqual(DEFAULT_AVATARS.student_male, DEFAULT_AVATARS.student_female);
    assert.ok(DEFAULT_AVATARS.student_male.endsWith('.png'));
    assert.ok(DEFAULT_AVATARS.student_female.endsWith('.png'));
  });
});

describe('avatar gender sync — static UI/API wiring', () => {
  const auth = fs.readFileSync(authPath, 'utf8');
  const editable = fs.readFileSync(editablePath, 'utf8');
  const sidebar = fs.readFileSync(sidebarPath, 'utf8');
  const avatarComp = fs.readFileSync(avatarCompPath, 'utf8');

  it('login userData includes avatar + gender at top level', () => {
    assert.ok(auth.includes('avatar:      user.avatar || \'\''));
    assert.ok(auth.includes('gender:      user.gender || \'\''));
  });

  it('/me includes gender for DB users and root admin', () => {
    assert.ok(auth.includes("router.get('/me'"));
    assert.ok(/gender:\s*user\.gender\s*\|\|\s*''/.test(auth));
    assert.ok(/gender:\s*''/.test(auth)); // root admin unknown
  });

  it('EditableAvatar + AppSidebar pass gender', () => {
    assert.ok(editable.includes('gender'));
    assert.ok(editable.includes('gender,'));
    // Sidebar bổ sung gender từ self profile khi session thiếu → effectiveGender
    assert.ok(sidebar.includes('gender={effectiveGender}') || sidebar.includes('gender={session?.gender}'));
    assert.ok(sidebar.includes('effectiveGender'));
  });

  it('Avatar onError uses resolveAvatarUrl gender-aware fallback', () => {
    assert.ok(avatarComp.includes('resolveAvatarUrl({ role, adminRole, name, gender, avatar: \'\''));
    assert.ok(avatarComp.includes('fallbackStep'));
  });
});
