/**
 * Shared structured logger (pino).
 * Use:
 *   const logger = require('./config/logger');
 *   logger.info({ userId }, 'message');
 */
const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.JWT_SECRET',
      '*.JWT_REFRESH_SECRET',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
