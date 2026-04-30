const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const axios    = require('axios');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Teacher  = require('../models/Teacher');
const Student  = require('../models/Student');
const blacklist = require('../middleware/tokenBlacklist');
const SystemSettings = require('../models/SystemSettings');

const router = express.Router();

// ── Passport Google Strategy ─────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email  = profile.emails?.[0]?.value || '';
      const name   = profile.displayName || 'Google User';
      const avatar = profile.photos?.[0]?.value || '';
      const googleId = profile.id;

      // Tìm trong Teacher trước (nếu email trùng)
      let user = await Teacher.findOne({ $or: [{ googleId }, { email }] });
      if (user) { user.googleId = googleId; await user.save({ validateModifiedOnly: true }); return done(null, { ...user.toObject(), role: user.role }); }

      // Tìm trong Student
      let student = await Student.findOne({ $or: [{ googleId }, { email }] });
      if (student) { student.googleId = googleId; await student.save({ validateModifiedOnly: true }); return done(null, { ...student.toObject(), role: 'student' }); }

      // Tạo Student mới
      const newStudent = await Student.create({
        name, email, googleId, avatar,
        phone: 'Chưa cập nhật', zalo: 'Chưa cập nhật', course: 'Chưa xếp lớp', price: 0, paid: false, status: 'Chờ xếp lớp',
        password: Math.random().toString(36).slice(-10),
      });
      return done(null, { ...newStudent.toObject(), role: 'student' });
    } catch (err) { return done(err, null); }
  }));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));


// ─── Helpers ──────────────────────────────────────────────────────────────────
const svgCaptcha = require('svg-captcha');

// In-memory CAPTCHA store (cid → { text, expiresAt })
// Tự động dọn dẹp sau 5 phút
const captchaStore = new Map();
const CAPTCHA_TTL = 5 * 60 * 1000; // 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of captchaStore.entries()) {
    if (c.expiresAt < now) captchaStore.delete(id);
  }
}, 60000);

/** Tạo JWT với audience ('public' hoặc 'internal') để phân tách 2 luồng */
const generateTokens = (payload, audience = 'public') => {
  const base = { ...payload, aud: audience };
  const accessToken = jwt.sign(base, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const refreshToken = jwt.sign(base, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
  return { accessToken, refreshToken };
};

// ─── GET /api/auth/captcha  — Sinh CAPTCHA mới ────────────────────────────────
router.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    size:        5,
    ignoreChars: '0oOlI1',
    noise:       2,
    color:       true,
    background:  '#1e293b',
    fontSize:    48,
    width:       140,
    height:      50,
  });
  const cid = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  captchaStore.set(cid, { text: captcha.text.toLowerCase(), expiresAt: Date.now() + CAPTCHA_TTL });
  res.json({ success: true, cid, svg: captcha.data });
});

// ─── POST /api/auth/captcha/verify  — Xác thực CAPTCHA (nội bộ) ───────────────
function verifyCaptcha(cid, input) {
  const record = captchaStore.get(cid);
  if (!record) return { ok: false, reason: 'Mã bảo vệ hết hạn. Vui lòng làm mới.' };
  if (record.expiresAt < Date.now()) { captchaStore.delete(cid); return { ok: false, reason: 'Mã bảo vệ đã hết hạn. Vui lòng làm mới.' }; }
  if (record.text !== (input || '').toLowerCase().trim()) return { ok: false, reason: 'Mã bảo vệ không đúng. Vui lòng thử lại.' };
  captchaStore.delete(cid); // Dùng 1 lần
  return { ok: true };
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Thiếu refreshToken' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const { accessToken } = generateTokens({
      id:          decoded.id,
      role:        decoded.role,
      name:        decoded.name,
      adminRole:   decoded.adminRole   || null,
      permissions: decoded.permissions || [],
      branchId:    decoded.branchId    || null,
      branchCode:  decoded.branchCode  || '',
    }, decoded.aud || 'public');
    return res.json({ success: true, accessToken });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'refreshToken không hợp lệ hoặc đã hết hạn' });
  }
});

// ─── POST /api/auth/check-role ────────────────────────────────────────────────
// Nhận identifier (phone/email), trả về role để hiện badge UI
router.post('/check-role', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.json({ success: true, data: null });

    const isEmail = identifier.includes('@');
    const query   = isEmail ? { email: identifier } : { $or: [{ phone: identifier }, { zalo: identifier }] };

    // Tìm trong Teacher/Admin/Staff trước
    const teacher = await Teacher.findOne(isEmail ? { email: identifier } : { phone: identifier })
      .select('name role adminRole status');
    if (teacher) {
      const labelMap = { admin: 'Quản trị viên', staff: 'Nhân viên', teacher: 'Giảng viên' };
      return res.json({ success: true, data: {
        role:      teacher.role,
        adminRole: teacher.adminRole || null,
        label:     teacher.adminRole === 'SUPER_ADMIN' ? 'Super Admin' : (labelMap[teacher.role] || 'Nội bộ'),
        color:     teacher.role === 'admin' ? 'black' : teacher.role === 'staff' ? 'indigo' : 'blue',
      }});
    }

    // Tìm trong Student
    const student = await Student.findOne(isEmail ? { email: identifier } : { $or: [{ phone: identifier }, { zalo: identifier }] })
      .select('name role status');
    if (student) {
      return res.json({ success: true, data: { role: 'student', label: 'Học viên', color: 'red' } });
    }

    return res.json({ success: true, data: null }); // Không tìm thấy
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/auth/google ─────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// ─── GET /api/auth/google/callback ───────────────────────────────────────────
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=google_failed` }),
  (req, res) => {
    try {
      const user = req.user;
      const { accessToken, refreshToken } = generateTokens({
        id: user._id, role: user.role || 'student', name: user.name,
        adminRole: user.adminRole || null, permissions: user.permissions || [],
      });
      // Redirect về frontend với token trong query (frontend đọc và lưu vào localStorage)
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      res.redirect(`${clientUrl}/login?socialToken=${accessToken}&socialRefresh=${refreshToken}&socialRole=${user.role || 'student'}&socialName=${encodeURIComponent(user.name)}&socialId=${user._id}`);
    } catch (err) {
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=token_failed`);
    }
  }
);

// ─── GET /api/auth/zalo ───────────────────────────────────────────────────────
// Redirect về Zalo OAuth dialog
router.get('/zalo', (req, res) => {
  const appId    = process.env.ZALO_APP_ID || '';
  const callback = encodeURIComponent(process.env.ZALO_CALLBACK_URL || 'http://localhost:5000/api/auth/zalo/callback');
  if (!appId) return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=zalo_not_configured`);
  res.redirect(`https://oauth.zaloapp.com/v4/permission?app_id=${appId}&redirect_uri=${callback}&state=login`);
});

// ─── GET /api/auth/zalo/callback ──────────────────────────────────────────────
router.get('/zalo/callback', async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${clientUrl}/login?error=zalo_no_code`);

    // Lấy access token từ Zalo
    const tokenRes = await axios.post('https://oauth.zaloapp.com/v4/access_token', {
      app_id:       process.env.ZALO_APP_ID,
      app_secret:   process.env.ZALO_APP_SECRET,
      code,
      grant_type:   'authorization_code',
    });
    const zaloAccessToken = tokenRes.data?.access_token;
    if (!zaloAccessToken) return res.redirect(`${clientUrl}/login?error=zalo_token_failed`);

    // Lấy profile Zalo
    const profileRes = await axios.get('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: { access_token: zaloAccessToken },
    });
    const zProfile = profileRes.data;
    const zaloId = zProfile.id;
    const zName  = zProfile.name || 'Zalo User';
    const zAvatar= zProfile.picture?.data?.url || '';

    // Tìm hoặc tạo user
    let student = await Student.findOne({ zaloId });
    if (!student) {
      student = await Student.create({
        name: zName, zaloId, avatar: zAvatar,
        phone: 'Chưa cập nhật', zalo: 'Chưa cập nhật', course: 'Chưa xếp lớp', price: 0, paid: false, status: 'Chờ xếp lớp',
        password: Math.random().toString(36).slice(-10),
      });
    }

    const { accessToken, refreshToken } = generateTokens({ id: student._id, role: 'student', name: student.name });
    res.redirect(`${clientUrl}/login?socialToken=${accessToken}&socialRefresh=${refreshToken}&socialRole=student&socialName=${encodeURIComponent(student.name)}&socialId=${student._id}`);
  } catch (err) {
    console.error('[ZALO OAuth]', err.message);
    res.redirect(`${clientUrl}/login?error=zalo_server_error`);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
/**
 * @route   POST /api/auth/login
 * @desc    Đăng nhập bằng Số điện thoại + Mật khẩu
 * @access  Public
 *
 * Body: { phone: "0935758462", password: "123456", role: "teacher"|"admin"|"student" }
 */
router.post('/login', async (req, res) => {
  try {
    // Hỗ trợ cả 'identifier' (mới) lẫn 'phone' (cũ) để tương thích ngược
    const { identifier, phone: legacyPhone, password, role = 'teacher' } = req.body;
    const rawId = (identifier || legacyPhone || '').trim();

    if (!rawId || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
    }

    // Detect: có @ → email, chỉ số → phone
    const isEmail = rawId.includes('@');

    // ── Hardcoded admin ────────────────────────────────────────────
    if (rawId === 'admin') {
      // Lấy admin credentials từ DB (nếu đã đổi)
      const sysSettings = await SystemSettings.findOne({ _key: 'main' });
      const dbAdminName = sysSettings?.adminName || 'Admin Thắng Tin Học';
      const dbAdminHash = sysSettings?.adminPasswordHash || '';

      let adminPasswordMatch = false;
      if (dbAdminHash) {
        adminPasswordMatch = await bcrypt.compare(password, dbAdminHash);
      } else {
        adminPasswordMatch = (password === 'admin123'); // Default fallback
      }

      if (adminPasswordMatch) {
        const { accessToken, refreshToken } = generateTokens({ id: 'admin', role: 'admin', name: dbAdminName, adminRole: 'SUPER_ADMIN' });
        return res.json({ success: true, data: { id: 'admin', _id: 'admin', name: dbAdminName, phone: 'admin', role: 'admin', adminRole: 'SUPER_ADMIN', accessToken, refreshToken } });
      }
      return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    // ── Tìm user theo identifier ───────────────────────────────────
    let user = null;
    let userRole = role;

    // Tìm trong Teacher/Admin/Staff trước
    const teacherQuery = isEmail ? { email: rawId } : { phone: rawId };
    user = await Teacher.findOne(teacherQuery).select('+password +refreshToken');

    if (user) {
      userRole = user.role; // 'teacher', 'admin', 'staff'

      if (user.isLocked) {
        const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
        return res.status(423).json({ success: false, message: `Tài khoản bị khóa tạm thời. Thử lại sau ${minutesLeft} phút.` });
      }
      const sStatus = String(user.status || '').toLowerCase();
      if (sStatus === 'inactive')  return res.status(403).json({ success: false, isBan: true, message: 'Tài khoản chưa được cấp quyền đăng nhập.' });
      if (sStatus === 'suspended') return res.status(403).json({ success: false, message: 'Tài khoản đã bị vô hiệu hóa.' });
      if (user.status === 'Locked') return res.status(403).json({ success: false, isBan: true, message: 'Tài khoản bị khóa do không qua bài thi.' });
      if (user.status === 'Pending' && user.practicalStatus === 'submitted') {
        return res.status(403).json({ success: false, isBan: true, message: 'Bạn đã hoàn thành bài thi. Vui lòng chờ Admin chấm điểm.' });
      }
    } else {
      // Tìm trong Student
      const studentQuery = isEmail
        ? { email: rawId }
        : { $or: [{ phone: rawId }, { zalo: rawId }] };
      user = await Student.findOne(studentQuery).select('+password');

      if (!user) {
        return res.status(401).json({ success: false, message: 'Tài khoản chưa được đăng ký trong hệ thống' });
      }
      if (!user.password) {
        return res.status(403).json({ success: false, message: 'Tài khoản học viên chưa được tạo mật khẩu. Vui lòng liên hệ trung tâm.' });
      }
      userRole = 'student';
    }

    // ── Kiểm tra mật khẩu ─────────────────────────────────────────
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      // Tăng login attempts nếu là giảng viên
      if (user.incLoginAttempts) await user.incLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không đúng',
      });
    }

    // ⭐ Fix 1: Increment tokenVersion → vô hiệu token cũ trên thiết bị khác
    const newTokenVersion = (user.tokenVersion || 0) + 1;
    user.tokenVersion = newTokenVersion;

    // ── Tạo tokens ────────────────────────────────────────────────
    const tokenPayload = {
      id:           user._id,
      role:         userRole,
      name:         user.name,
      adminRole:    user.adminRole  || null,
      permissions:  user.permissions || [],
      branchId:     user.branchId   || null,
      branchCode:   user.branchCode || '',
      tokenVersion: newTokenVersion,                // ⭐ Embed version in JWT
    };

    const { accessToken, refreshToken } = generateTokens(tokenPayload);

    // Lưu refresh token + tokenVersion vào DB
    user.refreshToken    = refreshToken;
    user.lastLogin       = new Date();
    user.loginAttempts   = 0;
    if (user.lockUntil) user.lockUntil = undefined;
    user.markModified('tokenVersion');  // Force Mongoose to persist new field
    await user.save({ validateModifiedOnly: true });

    // ── Chuẩn bị response data (không trả password) ───────────────
    const userData = {
      _id:         user._id,
      name:        user.name,
      phone:       user.phone || user.zalo,
      role:        userRole,
      adminRole:   user.adminRole  || null,
      permissions: user.permissions || [],
      branchId:    user.branchId   || null,
      branchCode:  user.branchCode || '',
      status:      user.status,
      ...(userRole === 'teacher' || userRole === 'admin' || userRole === 'staff'
        ? {
            testScore:       user.testScore,
            assignedClasses: user.assignedClasses,
            avatar:          user.avatar,
          }
        : {
            course:            user.course,
            remainingSessions: user.remainingSessions,
            grade:             user.grade,
          }),
    };

    // ── Trả về response ───────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: `Đăng nhập thành công! Chào ${user.name}`,
      data: {
        user: userData,
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      },
    });

  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau.',
    });
  }
});

// ─── Helper: Lookup user bằng identifier ─────────────────────────────────────
async function lookupUser(rawId, requestedRole = null) {
  const isEmail = rawId.includes('@');
  const isAdminHardcoded = rawId === 'admin';

  if (isAdminHardcoded && (!requestedRole || requestedRole === 'admin')) return { type: 'hardcoded', role: 'admin' };

  // Teacher/Admin/Staff
  if (!requestedRole || requestedRole === 'teacher' || requestedRole === 'admin' || requestedRole === 'staff') {
    const teacherQ = isEmail ? { email: rawId } : { phone: rawId };
    const teacher = await Teacher.findOne(teacherQ).select('+password +refreshToken');
    if (teacher) return { type: 'teacher', user: teacher, role: teacher.role };
  }

  // Student
  if (!requestedRole || requestedRole === 'student') {
    const studentQ = isEmail ? { email: rawId } : { $or: [{ phone: rawId }, { zalo: rawId }] };
    const student = await Student.findOne(studentQ).select('+password');
    if (student) return { type: 'student', user: student, role: 'student' };
  }

  return null;
}

// ─── POST /api/auth/login/public ─────────────────────────────────────────────
// Cổng đăng nhập dành cho HỌC VIÊN & GIẢNG VIÊN (Social Login hợp lệ với route này)
router.post('/login/public', async (req, res) => {
  try {
    const { identifier, password, role } = req.body;
    const rawId = (identifier || '').trim();
    if (!rawId || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
    }

    const found = await lookupUser(rawId, role);
    if (!found) {
      return res.status(401).json({ success: false, message: 'Tài khoản chưa được đăng ký trong hệ thống' });
    }

    // Chặn Admin/Staff dùng cổng public
    if (['admin', 'staff'].includes(found.role) || found.type === 'hardcoded') {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản này thuộc nhóm Nhân Viên/Quản Trị. Vui lòng chuyển sang Cổng nội bộ (Admin) để đăng nhập!',
        redirect: '/admin/login',
      });
    }

    const { user, role: userRole } = found;

    // ⭐ Chặn đăng nhập nếu trạng thái không hợp lệ (Case-insensitive)
    const sStatus = String(user.status || '').toLowerCase();
    if (userRole === 'teacher') {
      if (sStatus === 'inactive')  return res.status(403).json({ success: false, isBan: true, message: 'Tài khoản chưa được cấp quyền đăng nhập. Vui lòng liên hệ trung tâm.' });
      if (sStatus === 'suspended') return res.status(403).json({ success: false, message: 'Tài khoản đã bị tạm vắng / vô hiệu hóa.' });
      if (sStatus === 'locked')    return res.status(403).json({ success: false, isBan: true, message: 'Tài khoản đã bị khóa do không vượt qua bài thi thực tế.' });
      
      // Nếu là pending nhưng đã nộp bài → chờ chấm
      if (sStatus === 'pending' && user.practicalStatus === 'submitted') {
         return res.status(403).json({ success: false, isBan: true, message: 'Bạn đã hoàn thành bài thi. Vui lòng chờ Admin chấm điểm.' });
      }
    }

    // Xác thực mật khẩu
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (user.incLoginAttempts) await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    // ⭐ Fix 1: tokenVersion
    const newTokenVersion = (user.tokenVersion || 0) + 1;
    user.tokenVersion = newTokenVersion;

    const tokenPayload = {
      id: user._id, role: userRole, name: user.name,
      adminRole: null, permissions: [], branchId: null, branchCode: '',
      tokenVersion: newTokenVersion,
    };
    const { accessToken, refreshToken } = generateTokens(tokenPayload, 'public');

    user.refreshToken = refreshToken; user.lastLogin = new Date();
    user.loginAttempts = 0;
    user.markModified('tokenVersion');
    await user.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: `Chào mừng ${user.name}!`,
      data: {
        user: { _id: user._id, name: user.name, role: userRole, phone: user.phone || user.zalo || '', status: user.status, course: user.course, remainingSessions: user.remainingSessions },
        accessToken, refreshToken,
      },
    });
  } catch (err) {
    console.error('[AUTH] login/public error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server. Vui lòng thử lại.' });
  }
});

// ─── POST /api/auth/login/internal ───────────────────────────────────────────
// Cổng đăng nhập nội bộ — CHỈ ADMIN & STAFF — yêu cầu CAPTCHA
router.post('/login/internal', async (req, res) => {
  try {
    const { identifier, password, captchaId, captchaAnswer } = req.body;
    const rawId = (identifier || '').trim();

    // Bước 1: Xác thực CAPTCHA
    const captchaResult = verifyCaptcha(captchaId, captchaAnswer);
    if (!captchaResult.ok) {
      return res.status(400).json({ success: false, message: captchaResult.reason, captchaError: true });
    }

    if (!rawId || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
    }

    // Bước 2: Hardcoded admin
    if (rawId === 'admin') {
      const sysSettings = await SystemSettings.findOne({ _key: 'main' });
      const dbAdminName = sysSettings?.adminName || 'Admin Thắng Tin Học';
      const dbAdminHash = sysSettings?.adminPasswordHash || '';

      let adminPasswordMatch = false;
      if (dbAdminHash) {
        adminPasswordMatch = await bcrypt.compare(password, dbAdminHash);
      } else {
        adminPasswordMatch = (password === 'admin123');
      }

      if (adminPasswordMatch) {
        const { accessToken, refreshToken } = generateTokens(
          { id: 'admin', role: 'admin', name: dbAdminName, adminRole: 'SUPER_ADMIN', permissions: [], branchId: null, branchCode: '' },
          'internal'
        );
        return res.json({ success: true, data: { user: { _id: 'admin', id: 'admin', name: dbAdminName, role: 'admin', adminRole: 'SUPER_ADMIN', permissions: [], status: 'active' }, accessToken, refreshToken } });
      }
      return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    // Bước 3: Tìm user
    const found = await lookupUser(rawId);
    if (!found || found.type === 'student') {
      // Student/Teacher không được vào cổng nội bộ
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập khu vực quản trị.' });
    }

    const { user, role: userRole } = found;

    // Chỉ admin/staff được vào
    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập khu vực quản trị.' });
    }

    // Kiểm tra trạng thái tài khoản
    if (user.isLocked) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Tài khoản bị khóa tạm thời. Thử lại sau ${minutesLeft} phút.` });
    }
    const sStatus = String(user.status || '').toLowerCase();
    if (sStatus === 'inactive' || sStatus === 'suspended') {
      return res.status(403).json({ success: false, isBan: true, message: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị.' });
    }

    // Bước 4: Xác thực mật khẩu
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (user.incLoginAttempts) await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    // ⭐ Fix 1: tokenVersion
    const newTokenVersion = (user.tokenVersion || 0) + 1;
    user.tokenVersion = newTokenVersion;

    const tokenPayload = {
      id: user._id, role: userRole, name: user.name,
      adminRole:   user.adminRole  || null,
      permissions: user.permissions || [],
      branchId:    user.branchId   || null,
      branchCode:  user.branchCode || '',
      tokenVersion: newTokenVersion,
    };
    const { accessToken, refreshToken } = generateTokens(tokenPayload, 'internal');

    user.refreshToken = refreshToken; user.lastLogin = new Date();
    user.loginAttempts = 0;
    user.markModified('tokenVersion');
    await user.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: `Chào mừng ${user.name} — ${userRole === 'admin' ? 'Quản trị viên' : 'Nhân viên'}`,
      data: {
        user: {
          _id: user._id, name: user.name, role: userRole,
          adminRole:   user.adminRole  || null,
          permissions: user.permissions || [],
          branchId:    user.branchId   || null,
          branchCode:  user.branchCode || '',
          status:      user.status,
        },
        accessToken, refreshToken,
      },
    });
  } catch (err) {
    console.error('[AUTH] login/internal error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server. Vui lòng thử lại.' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
/**
 * @route   POST /api/auth/refresh
 * @desc    Làm mới access token bằng refresh token
 * @access  Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Thiếu refresh token' });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      id:   decoded.id,
      role: decoded.role,
      name: decoded.name,
    });

    return res.status(200).json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });

  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
/**
 * @route   POST /api/auth/logout
 * @desc    Đăng xuất — blacklist token + xóa refreshToken khỏi DB
 * @access  Protected
 */
const { authMiddleware } = require('../middleware/auth');

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { role } = req.user;
    const userId = req.user.id;

    // ⭐ Fix 3: Blacklist access token (chặn dùng lại từ Postman)
    if (req.accessToken) {
      try {
        const decoded = jwt.decode(req.accessToken);
        if (decoded?.exp) {
          const remainingSeconds = decoded.exp - Math.floor(Date.now() / 1000);
          if (remainingSeconds > 0) {
            blacklist.add(req.accessToken, remainingSeconds);
          }
        } else {
          blacklist.add(req.accessToken, 28800); // fallback 8h
        }
      } catch { blacklist.add(req.accessToken, 28800); }
    }

    // Xóa refreshToken khỏi DB
    if (userId && userId !== 'admin') {
      if (role === 'student') {
        // Student không có refreshToken trong schema, nhưng nếu có thì xóa
      } else {
        await Teacher.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
      }
    }

    return res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/auth/register-teacher ─────────────────────────────────────────
/**
 * @route   POST /api/auth/register-teacher
 * @desc    Đăng ký tài khoản giảng viên (chờ Admin duyệt)
 * @access  Public
 */
router.post('/register-teacher', async (req, res) => {
  try {
    const { name, phone, password, password2, specialty } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ: Tên, Số điện thoại, Mật khẩu',
      });
    }

    if (password !== password2) {
      return res.status(400).json({ success: false, message: 'Mật khẩu xác nhận không khớp' });
    }

    const exists = await Teacher.findOne({ phone });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Số điện thoại này đã được đăng ký',
      });
    }

    const teacher = await Teacher.create({
      name,
      phone,
      password, // sẽ được hash bởi pre-save hook
      specialty: specialty || '',
      status: 'pending',
      role: 'teacher',
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công! Tài khoản đang chờ Admin Thắng Tin Học phê duyệt.',
      data: {
        _id: teacher._id,
        name: teacher.name,
        phone: teacher.phone,
        status: teacher.status,
      },
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Số điện thoại đã tồn tại' });
    }
    console.error('[AUTH] Register error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
  }
});

// ─── POST /api/auth/change-password ──────────────────────────────────────────
/**
 * @route   POST /api/auth/change-password
 * @desc    Đổi mật khẩu
 * @access  Protected (cần accessToken)
 */
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { id: userId, role } = req.user;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu cũ và mới' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    }

    const Model = role === 'student' ? Student : Teacher;
    const user  = await Model.findById(userId).select('+password');

    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Mật khẩu cũ không đúng' });

    user.password = newPassword;
    await user.save({ validateModifiedOnly: true });

    return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công' });

  } catch (error) {
    console.error('[AUTH] Change password error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
/**
 * @route   GET /api/auth/me
 * @desc    Xác minh token + trả về thông tin user hiện tại (dùng khi reload trang)
 * @access  Protected
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Không có token' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Lấy thông tin mới nhất từ DB
    let user = null;

    if (decoded.id === 'admin') {
      // Hardcoded admin — lấy tên từ DB nếu đã đổi
      const sysSettings = await SystemSettings.findOne({ _key: 'main' });
      const dbAdminName = sysSettings?.adminName || 'Admin Thắng Tin Học';
      return res.json({
        success: true,
        data: {
          _id:    'admin',
          id:     'admin',
          name:   dbAdminName,
          phone:  'admin',
          role:   'admin',
          status: 'active',
          avatar: '',
        },
      });
    }

    if (decoded.role === 'student') {
      user = await Student.findById(decoded.id).select('-password');
    } else {
      user = await Teacher.findById(decoded.id).select('-password -refreshToken');
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    return res.json({
      success: true,
      data: {
        _id:         user._id,
        id:          user._id,
        name:        user.name,
        phone:       user.phone || user.zalo,
        role:        decoded.role,
        adminRole:   user.adminRole  || null,
        permissions: user.permissions || [],
        branchId:    user.branchId   || null,
        branchCode:  user.branchCode || '',
        status:      user.status,
        avatar:      user.avatar || '',
        ...(decoded.role === 'teacher' || decoded.role === 'admin' || decoded.role === 'staff' ? {
          testScore:       user.testScore,
          assignedClasses: user.assignedClasses,
          specialty:       user.specialty,
        } : {}),
        ...(decoded.role === 'student' ? {
          course:              user.course,
          remainingSessions:   user.remainingSessions,
          studentExamUnlocked: user.studentExamUnlocked,
          grade:               user.grade,
        } : {}),
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
    console.error('[AUTH] /me error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── OTP Store (in-memory, key = phone+role) ─────────────────────────────────
const otpStore = new Map(); // "phone:role" → { otp, expiresAt, userId, userName }

async function sendZaloOTP(phoneOrZalo, otp, userName) {
  // TODO: Kết nối Zalo OA API khi có ZALO_OA_TOKEN trong .env
  const zaloOAToken = process.env.ZALO_OA_TOKEN || '';
  console.log(`[OTP] Gửi OTP ${otp} tới ${userName} (SĐT/Zalo: ${phoneOrZalo})`);
  if (zaloOAToken) {
    try {
      await axios.post('https://openapi.zalo.me/v2.0/oa/message', {
        recipient: { user_id: phoneOrZalo },
        message: {
          text: `[THẮNG TIN HỌC] Mã OTP cấp lại mật khẩu của bạn là: *${otp}*\nMã có hiệu lực trong 60 giây. Không chia sẻ mã này cho bất kỳ ai.`
        }
      }, { headers: { access_token: zaloOAToken } });
      console.log(`[OTP] Đã gửi Zalo OA tới ${phoneOrZalo}`);
    } catch (e) {
      console.warn('[OTP] Gửi Zalo OA thất bại:', e.message);
    }
  }
}

// ─── POST /api/auth/forgot-password/request ───────────────────────────────────
/**
 * @route   POST /api/auth/forgot-password/request
 * @desc    Bước 1: Gửi OTP về Zalo để cấp lại mật khẩu
 * @access  Public
 */
router.post('/forgot-password/request', async (req, res) => {
  try {
    const { phone, role } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại' });

    let user = null;
    if (role === 'teacher') {
      user = await Teacher.findOne({ $or: [{ phone: phone.trim() }, { zalo: phone.trim() }] });
    } else {
      user = await Student.findOne({ $or: [{ phone: phone.trim() }, { zalo: phone.trim() }] });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với số điện thoại này' });
    }

    // Tạo OTP 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `${phone.trim()}:${role || 'student'}`;
    otpStore.set(key, { otp, expiresAt: Date.now() + 60000, userId: user._id.toString(), userName: user.name, role: role || 'student' });

    // Tự xóa sau 65s
    setTimeout(() => otpStore.delete(key), 65000);

    // Gửi OTP qua Zalo
    const zaloTarget = user.zalo || user.phone || phone.trim();
    await sendZaloOTP(zaloTarget, otp, user.name);

    // Che một phần số điện thoại
    const masked = phone.trim().replace(/(\d{3})\d+(\d{3})/, '$1****$2');

    return res.json({
      success: true,
      message: `Đã gửi mã OTP về Zalo số ${masked}. Mã có hiệu lực trong 60 giây.`,
      data: { masked, name: user.name }
    });
  } catch (error) {
    console.error('[AUTH] forgot-password/request error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/auth/forgot-password/verify ────────────────────────────────────
/**
 * @route   POST /api/auth/forgot-password/verify
 * @desc    Bước 2: Xác minh OTP và cấp mật khẩu mới
 * @access  Public
 */
router.post('/forgot-password/verify', async (req, res) => {
  try {
    const { phone, otp, role } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

    const key = `${phone.trim()}:${role || 'student'}`;
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.' });
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn (60 giây). Vui lòng yêu cầu lại.' });
    }
    if (record.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng. Vui lòng kiểm tra lại.' });
    }

    // OTP đúng → đặt lại mật khẩu
    otpStore.delete(key);
    const newPassword = Math.floor(100000 + Math.random() * 900000).toString();

    let user = null;
    if (record.role === 'teacher') {
      user = await Teacher.findById(record.userId).select('+password');
    } else {
      user = await Student.findById(record.userId).select('+password');
    }
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });

    user.password = newPassword;
    await user.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: 'Cấp lại mật khẩu thành công!',
      data: { newPassword, name: user.name }
    });
  } catch (error) {
    console.error('[AUTH] forgot-password/verify error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── POST /api/auth/reset-password-request (backward compat) ─────────────────
router.post('/reset-password-request', async (req, res) => {
  try {
    const { phone, zalo, role } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại' });

    let user = null;
    if (role === 'student') {
      user = await Student.findOne({ $or: [{ phone: phone.trim() }, { zalo: phone.trim() }] });
    } else {
      user = await Teacher.findOne({ $or: [{ phone: phone.trim() }, { zalo: phone.trim() }] });
    }
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });

    const userZalo = (user.zalo || user.phone || '').trim();
    if (!zalo || userZalo !== (zalo || '').trim()) {
      return res.status(400).json({ success: false, message: 'Số Zalo xác minh không khớp' });
    }

    const newPassword = Math.floor(100000 + Math.random() * 900000).toString();
    user.password = newPassword;
    await user.save({ validateModifiedOnly: true });
    return res.json({ success: true, message: 'Cấp lại mật khẩu thành công!', data: { newPassword, name: user.name } });
  } catch (error) {
    console.error('[AUTH] reset-password-request error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});


// ─── POST /api/auth/admin/reset-password ─────────────────────────────────────
/**
 * @route   POST /api/auth/admin/reset-password
 * @desc    Admin cấp lại mật khẩu cho giảng viên/học viên
 * @access  Admin only
 */
router.post('/admin/reset-password', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ success: false, message: 'Không có quyền thực hiện' });
    }

    const { userId, userRole, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu userId hoặc mật khẩu mới' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });
    }

    const Model = userRole === 'student' ? Student : Teacher;
    const user = await Model.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    user.password = newPassword;
    await user.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: `Đã cấp lại mật khẩu cho ${user.name}`,
      data: { name: user.name }
    });

  } catch (error) {
    console.error('[AUTH] Admin reset password error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ─── PUT /api/auth/admin/profile ─────────────────────────────────────────────
/**
 * @route   PUT /api/auth/admin/profile
 * @desc    Admin đổi tên hiển thị và/hoặc mật khẩu
 * @access  Admin only
 */
router.put('/admin/profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Chỉ Admin mới được thay đổi' });
    }

    const { name, oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Hardcoded admin — lưu vào SystemSettings
    if (userId === 'admin') {
      let sysSettings = await SystemSettings.findOne({ _key: 'main' });
      if (!sysSettings) sysSettings = new SystemSettings({ _key: 'main' });

      let changed = false;

      // Đổi tên
      if (name && name.trim()) {
        sysSettings.adminName = name.trim();
        changed = true;
      }

      // Đổi mật khẩu
      if (newPassword) {
        if (!oldPassword) {
          return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại' });
        }
        if (newPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });
        }

        // Xác thực mật khẩu cũ
        const dbAdminHash = sysSettings.adminPasswordHash || '';
        let oldPwMatch = false;
        if (dbAdminHash) {
          oldPwMatch = await bcrypt.compare(oldPassword, dbAdminHash);
        } else {
          oldPwMatch = (oldPassword === 'admin123'); // Chỉ khi chưa đổi lần nào
        }

        if (!oldPwMatch) {
          return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
        }

        // Hash và lưu mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        sysSettings.adminPasswordHash = await bcrypt.hash(newPassword, salt);
        changed = true;
      }

      if (!changed) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập thông tin cần thay đổi' });
      }

      sysSettings.markModified('adminPasswordHash');
      sysSettings.markModified('adminName');
      await sysSettings.save();

      return res.json({
        success: true,
        message: 'Cập nhật thông tin Admin thành công!',
        data: { name: sysSettings.adminName || 'Admin Thắng Tin Học' }
      });
    }

    const user = await Teacher.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    // Đổi tên
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // Đổi mật khẩu (yêu cầu mật khẩu cũ)
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });
      }
      const isMatch = await user.comparePassword(oldPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
      }
      user.password = newPassword;
    }

    await user.save({ validateModifiedOnly: true });

    return res.json({
      success: true,
      message: 'Cập nhật thông tin thành công',
      data: { name: user.name }
    });

  } catch (error) {
    console.error('[AUTH] Admin profile update error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

module.exports = router;

