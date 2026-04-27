const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const axios    = require('axios');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Teacher  = require('../models/Teacher');
const Student  = require('../models/Student');
const blacklist = require('../middleware/tokenBlacklist');

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
    if (rawId === 'admin' && password === 'admin123') {
      const { accessToken, refreshToken } = generateTokens({ id: 'admin', role: 'admin', name: 'Admin Thắng Tin Học', adminRole: 'SUPER_ADMIN' });
      return res.json({ success: true, data: { id: 'admin', _id: 'admin', name: 'Admin Thắng Tin Học', phone: 'admin', role: 'admin', adminRole: 'SUPER_ADMIN', accessToken, refreshToken } });
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
    if (rawId === 'admin' && password === 'admin123') {
      const { accessToken, refreshToken } = generateTokens(
        { id: 'admin', role: 'admin', name: 'Admin Thắng Tin Học', adminRole: 'SUPER_ADMIN', permissions: [], branchId: null, branchCode: '' },
        'internal'
      );
      return res.json({ success: true, data: { user: { _id: 'admin', id: 'admin', name: 'Admin Thắng Tin Học', role: 'admin', adminRole: 'SUPER_ADMIN', permissions: [], status: 'active' }, accessToken, refreshToken } });
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
      // Hardcoded admin
      return res.json({
        success: true,
        data: {
          _id:    'admin',
          id:     'admin',
          name:   'Admin Thắng Tin Học',
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

module.exports = router;

