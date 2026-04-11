/**
 * tokenBlacklist.js — Danh sách đen token (in-memory với TTL tự xóa)
 *
 * Khi user đăng xuất, access token bị đưa vào blacklist.
 * Middleware sẽ chặn mọi request dùng token trong blacklist.
 * Token tự xóa khỏi blacklist khi hết hạn (không cần Redis).
 *
 * Phù hợp cho hệ thống single-server. Production lớn → dùng Redis.
 */

class TokenBlacklist {
  constructor() {
    this._store = new Map(); // token → expiresAt (timestamp)

    // Tự dọn dẹp token hết hạn mỗi 60s
    this._cleaner = setInterval(() => {
      const now = Date.now();
      for (const [token, expiresAt] of this._store.entries()) {
        if (expiresAt <= now) this._store.delete(token);
      }
    }, 60_000);
  }

  /**
   * Thêm token vào blacklist
   * @param {string} token - JWT token cần chặn
   * @param {number} ttlSeconds - Thời gian sống còn lại (giây). Mặc định 8h.
   */
  add(token, ttlSeconds = 28800) {
    if (!token) return;
    this._store.set(token, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Kiểm tra token có bị chặn không
   * @param {string} token
   * @returns {boolean}
   */
  isBlacklisted(token) {
    if (!token) return false;
    const expiresAt = this._store.get(token);
    if (!expiresAt) return false;
    // Token hết hạn → xóa khỏi blacklist
    if (expiresAt <= Date.now()) {
      this._store.delete(token);
      return false;
    }
    return true;
  }

  /** Số token đang bị chặn (debug) */
  get size() {
    return this._store.size;
  }
}

// Singleton
module.exports = new TokenBlacklist();
