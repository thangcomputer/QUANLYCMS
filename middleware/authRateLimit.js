/**
 * Rate limiting cho /api/auth — chống brute-force và lạm dụng CAPTCHA.
 * Giá trị có thể chỉnh qua biến môi trường (xem README).
 */
const rateLimit = require('express-rate-limit');

function parseMax(envKey, defaultVal) {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultVal;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

const jsonMessage = (message) => ({ success: false, code: 'RATE_LIMITED', message });

/** Đăng nhập (mọi cổng login) */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseMax('RATE_LIMIT_LOGIN_MAX', 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Đăng nhập quá nhiều lần từ địa chỉ này. Vui lòng thử lại sau ít phút.'),
});

/** Lấy CAPTCHA SVG */
const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseMax('RATE_LIMIT_CAPTCHA_MAX', 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Yêu cầu mã xác thực quá nhanh. Vui lòng đợi rồi thử lại.'),
});

/** Refresh token — vừa phải để app không bị chặn khi nhiều tab */
const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseMax('RATE_LIMIT_REFRESH_MAX', 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Quá nhiều yêu cầu làm mới phiên. Vui lòng thử lại sau.'),
});

/** Quên mật khẩu / đặt lại / đăng ký — window dài hơn */
const sensitiveFlowLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseMax('RATE_LIMIT_SENSITIVE_MAX', 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Quá nhiều yêu cầu từ địa chỉ này. Vui lòng thử lại sau một lúc.'),
});

/** Kiểm tra role theo SĐT/email — hạn chế enumeration */
const checkRoleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseMax('RATE_LIMIT_CHECK_ROLE_MAX', 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Quá nhiều yêu cầu kiểm tra. Vui lòng thử lại sau.'),
});

module.exports = {
  loginLimiter,
  captchaLimiter,
  refreshTokenLimiter,
  sensitiveFlowLimiter,
  checkRoleLimiter,
};
