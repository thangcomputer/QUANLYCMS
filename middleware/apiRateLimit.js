/**
 * General API rate limit — skips /api/auth/* (already limited there).
 */
const rateLimit = require('express-rate-limit');

const jsonMessage = (message) => ({ success: false, code: 'RATE_LIMITED', message });

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_MAX || '400', 10) || 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Quá nhiều yêu cầu API. Vui lòng thử lại sau.'),
});

function apiRateLimitUnlessAuth(req, res, next) {
  // Local/dev: tắt rate limit để debug & test UI không bị 429
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env !== 'production') return next();

  if (req.originalUrl.startsWith('/api/auth')) return next();
  if (req.originalUrl.startsWith('/api/webhooks')) return next();
  // Các endpoint public được gọi ngay khi load app/login (logo/branches)
  // Tránh 429 giả do nhiều component mount đồng thời.
  if (req.method === 'GET' && req.originalUrl.startsWith('/api/settings/web')) return next();
  if (req.method === 'GET' && req.originalUrl === '/api/branches') return next();
  return generalApiLimiter(req, res, next);
}

module.exports = { generalApiLimiter, apiRateLimitUnlessAuth };
