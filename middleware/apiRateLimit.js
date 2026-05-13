/**
 * General API rate limit — skips /api/auth/* (already limited there).
 *
 * KEY STRATEGY: Decode JWT token (without verify — just for rate limiting identity)
 * so each authenticated user has their own quota, even if multiple users share the same IP.
 * Falls back to IP for unauthenticated requests.
 */
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const jsonMessage = (message) => ({ success: false, code: 'RATE_LIMITED', message });

/**
 * Lấy userId từ Bearer token (decode nhanh, không verify)
 * để mỗi người dùng có quota riêng — tránh share theo IP.
 */
function resolveKey(req) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) {
      const decoded = jwt.decode(token); // Không verify, chỉ lấy payload
      const uid = decoded && (decoded._id || decoded.id || decoded.sub);
      if (uid) return String(uid);
    }
  } catch (_) { /* ignore */ }
  // Fallback: IP (request chưa đăng nhập)
  return req.ip;
}

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_MAX || '10000', 10) || 10000,
  keyGenerator: resolveKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
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

