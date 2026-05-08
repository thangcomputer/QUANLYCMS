/**
 * Token blacklist — TTL-based revocation (logout / refresh rotation).
 * Optional Redis (REDIS_URL) for multi-instance; otherwise in-memory Map.
 */

const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

class TokenBlacklist {
  constructor() {
    this._store = new Map();
    this._redis = null;
    this._cleaner = null;

    if (process.env.REDIS_URL) {
      try {
        const Redis = require('ioredis');
        this._redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
      } catch {
        this._redis = null;
      }
    }

    if (!this._redis) {
      this._cleaner = setInterval(() => {
        const now = Date.now();
        for (const [token, expiresAt] of this._store.entries()) {
          if (expiresAt <= now) this._store.delete(token);
        }
      }, 60_000);
    }
  }

  /**
   * @param {string} token
   * @param {number} ttlSeconds
   */
  async add(token, ttlSeconds = 28800) {
    if (!token) return;
    const ttlMs = Math.max(1, ttlSeconds) * 1000;
    const key = `jwtbl:${hashToken(token)}`;

    if (this._redis) {
      try {
        await this._redis.set(key, '1', 'PX', ttlMs);
      } catch {
        this._store.set(token, Date.now() + ttlMs);
      }
      return;
    }
    this._store.set(token, Date.now() + ttlMs);
  }

  /**
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async isBlacklisted(token) {
    if (!token) return false;
    const key = `jwtbl:${hashToken(token)}`;

    if (this._redis) {
      try {
        const v = await this._redis.exists(key);
        return v === 1;
      } catch {
        // fall through to memory
      }
    }

    const expiresAt = this._store.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      this._store.delete(token);
      return false;
    }
    return true;
  }

  get size() {
    return this._store.size;
  }

  async close() {
    if (this._cleaner) clearInterval(this._cleaner);
    if (this._redis) {
      try {
        await this._redis.quit();
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = new TokenBlacklist();
