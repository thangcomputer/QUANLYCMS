/**
 * Fail-fast validation for required secrets and production invariants.
 * Call immediately after dotenv.config().
 */
function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const minLen = isProd ? 32 : 16;

  const jwt = process.env.JWT_SECRET || '';
  const jwr = process.env.JWT_REFRESH_SECRET || '';
  if (jwt.length < minLen) {
    throw new Error(
      `JWT_SECRET must be at least ${minLen} characters (use: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")`
    );
  }
  if (jwr.length < minLen) {
    throw new Error(
      `JWT_REFRESH_SECRET must be at least ${minLen} characters and MUST differ from JWT_SECRET`
    );
  }
  if (jwt === jwr) {
    throw new Error('JWT_REFRESH_SECRET must not equal JWT_SECRET');
  }

  if (isProd && !(process.env.CLIENT_URL || '').trim()) {
    throw new Error('CLIENT_URL is required when NODE_ENV=production (CORS / OAuth)');
  }
}

module.exports = validateEnv;
