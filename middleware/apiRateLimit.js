/**
 * General API rate limit — skips /api/auth/* (already limited there).
 */
const rateLimit = require('express-rate-limit');

const jsonMessage = (message) => ({ success: false, code: 'RATE_LIMITED', message });

/**
 * Dùng userId từ JWT (nếu đã xác thực) làm key thay vì IP,
 * tránh nhiều người dùng cùng IP chia sẻ quota và bị chặn nhầm.
 */
function resolveKey(req) {
  // req.user được gắn bởi authMiddleware trước khi vào rate limiter
  if (req.user && req.user._id) return String(req.user._id);
  // Fallback: IP (cho request chưa auth)
  return req.ip;
}

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_MAX || '2000', 10) || 2000,
  keyGenerator: resolveKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Bỏ qua GET requests cho các endpoint tĩnh/public
    if (req.method === 'GET' && req.originalUrl.startsWith('/api/settings/web')) return true;
    if (req.method === 'GET' && req.originalUrl === '/api/branches') return true;
    return false;
  },
  message: jsonMessage('Quá nhiều yêu cầu API. Vui lòng thử lại sau.'),
});

function apiRateLimitUnlessAuth(req, res, next) {
  // Local/dev: tắt rate limit để debug & test UI không bị 429
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env !== 'production') return next();

  if (req.originalUrl.startsWith('/api/auth')) return next();
  if (req.originalUrl.startsWith('/api/webhooks')) return next();
  return generalApiLimiter(req, res, next);
}

module.exports = { generalApiLimiter, apiRateLimitUnlessAuth };
