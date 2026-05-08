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
  if (req.originalUrl.startsWith('/api/auth')) return next();
  if (req.originalUrl.startsWith('/api/webhooks')) return next();
  return generalApiLimiter(req, res, next);
}

module.exports = { generalApiLimiter, apiRateLimitUnlessAuth };
