// ─── API Service - Hệ thống CMS Thắng Tin Học ───────────────────────────────

export const SOCKET_BASE = import.meta.env.VITE_API_URL || '';
export const BASE_URL = SOCKET_BASE;
export const API_BASE = BASE_URL ? (BASE_URL + '/api') : '/api';

export class NetworkOfflineError extends Error {
  constructor(message = 'Mất kết nối máy chủ. Đang thử lại…') {
    super(message);
    this.name = 'NetworkOfflineError';
    this.isNetworkError = true;
  }
}

function isNetworkFetchError(err) {
  if (!err) return false;
  if (err.isNetworkError || err.name === 'NetworkOfflineError') return true;
  if (err.name === 'TypeError') return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('load failed')
    || msg.includes('err_address_unreachable')
    || msg.includes('err_connection')
    || msg.includes('err_name_not_resolved')
    || msg.includes('err_internet_disconnected')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function notifyConnectivity(ok) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('cms:connectivity', { detail: { online: ok } }));
  } catch { /* ignore */ }
}

/** fetch có retry khi mạng tụt (không retry response HTTP đã nhận) */
async function fetchWithNetworkRetry(url, options = {}, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false && attempt === 0) {
        await sleep(400);
      }
      const res = await fetch(url, options);
      notifyConnectivity(true);
      return res;
    } catch (err) {
      lastErr = err;
      notifyConnectivity(false);
      if (!isNetworkFetchError(err) || attempt >= maxAttempts - 1) break;
      await sleep(Math.min(1000 * (2 ** attempt), 8000));
    }
  }
  throw new NetworkOfflineError(lastErr?.message || 'Không kết nối được máy chủ');
}

/** CSRF double-submit (cookie csrf_token + header X-CSRF-Token) */
let _csrfToken = null;
let _csrfPromise = null;

export async function ensureCsrfToken(force = false) {
  if (_csrfToken && !force) return _csrfToken;
  if (_csrfPromise) return _csrfPromise;
  _csrfPromise = (async () => {
    const res = await fetchWithNetworkRetry(`${API_BASE}/auth/csrf-token`, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    _csrfToken = body.csrfToken || null;
    return _csrfToken;
  })();
  try {
    return await _csrfPromise;
  } finally {
    _csrfPromise = null;
  }
}

function isMutatingMethod(method) {
  const m = (method || 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/** Parse JSON an toàn — tránh crash khi server trả body rỗng */
async function parseApiJson(res, fallbackMessage = 'Máy chủ không phản hồi') {
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* noop */ }
  }
  if (!res.ok) {
    let msg = data?.message || `${fallbackMessage} (HTTP ${res.status})`;
    try {
        window.dispatchEvent(new CustomEvent('cms:api-error', { detail: { message: msg, status: res.status } }));
      } catch {
        // CustomEvent is unavailable in non-browser consumers.
      }
      if ([502, 503, 504].includes(res.status) && !data?.message) {
        msg = `${fallbackMessage}. Máy chủ đang khởi động lại — vui lòng đợi vài giây rồi tải lại.`;
      }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (!data) {
    throw new Error(`${fallbackMessage}: phản hồi không hợp lệ`);
  }
  return data;
}

/** fetch kèm credentials + CSRF (dùng cho chỗ còn gọi fetch thô) */
export async function csrfFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (isMutatingMethod(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  return fetchWithNetworkRetry(url, { ...options, credentials: 'include', headers });
}

/** POST FormData (upload) với CSRF + Bearer */
export async function uploadWithAuth(path, formData, roleHint = null) {
  const token = roleHint ? getAccessToken(roleHint) : getAccessToken();
  const csrf = await ensureCsrfToken();
  const res = await fetchWithNetworkRetry(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Tải file thất bại (${res.status})`);
  }
  return data;
}

/**
 * Xác định Role dựa trên dữ liệu đang có trong LocalStorage hoặc URL.
 */
export const getRolePrefix = (overrideRole = null) => {
  if (overrideRole) return overrideRole;
  if (typeof window === 'undefined') return 'thvp';

  const path = window.location.pathname;
  const roles = ['admin', 'staff', 'teacher', 'student'];

  const pathRole = path.startsWith('/admin') ? 'admin'
    : path.startsWith('/teacher') ? 'teacher'
    : path.startsWith('/student') ? 'student'
    : null;

  const hasToken = (r) => {
    if (localStorage.getItem(`${r}_access_token`)) return true;
    try {
      const u = JSON.parse(localStorage.getItem(`${r}_user`) || 'null');
      return !!(u?.token || u?.accessToken);
    } catch {
      return false;
    }
  };

  // 1. Ưu tiên vai trò khớp URL (tránh dùng token admin cũ khi đang ở /student)
  if (pathRole && hasToken(pathRole)) return pathRole;

  // 2. Fallback: bất kỳ vai trò nào còn token
  for (const r of roles) {
    if (hasToken(r)) return r;
  }

  if (pathRole) return pathRole;
  return 'thvp';
};

/** Chuẩn hóa URL file upload (IP/http cũ → domain hiện tại) */
const PUBLIC_UPLOAD_RE = /\/uploads\/(logo|favicon|popup|images|avatars|invoice_logo|feed|blog|center-info)(\/|$)/i;

/** Origin API (VITE_API_URL) hoặc origin hiện tại — tránh /uploads/ trỏ nhầm SPA. */
function mediaOrigin() {
  if (SOCKET_BASE) return String(SOCKET_BASE).replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function toAbsoluteUploadsPath(uploadsPath) {
  const path = uploadsPath.startsWith('/') ? uploadsPath : `/${uploadsPath}`;
  // Dev Vite (không có VITE_API_URL): giữ path tương đối để /uploads đi đúng proxy,
  // tránh lệch localhost vs 127.0.0.1 / [::1] làm <img> lỗi tải.
  if (!SOCKET_BASE) return path;
  const origin = mediaOrigin();
  return origin ? `${origin}${path}` : path;
}

function withUploadAccessToken(url) {
  if (!url || typeof window === 'undefined') return url;
  if (!url.includes('/uploads/') || PUBLIC_UPLOAD_RE.test(url)) return url;
  if (/[?&]access_token=/.test(url)) return url;
  const token = getAccessToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

/** Giữ đuôi file từ URL khi tiêu đề không có extension (vd. ZIP). */
function ensureDownloadFileName(displayName, sourceUrl) {
  const name = String(displayName || '').trim();
  const pathPart = String(sourceUrl || '').split('?')[0];
  const extMatch = pathPart.match(/(\.[a-z0-9]{1,8})$/i);
  const ext = extMatch ? extMatch[1] : '';
  if (!name) return extMatch ? pathPart.split('/').pop() : 'download';
  if (ext && !/\.[a-z0-9]{1,8}$/i.test(name)) return `${name}${ext}`;
  return name;
}

export const resolveMediaUrl = (url) => {
  if (!url || url === '#') return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
  // Sửa URL hỏng kiểu https:///uploads/...
  if (/^https?:\/\/\//i.test(trimmed)) {
    const fixed = trimmed.replace(/^https?:\/\/+/, '/');
    if (fixed.startsWith('/uploads/')) {
      return withUploadAccessToken(toAbsoluteUploadsPath(fixed.split('?')[0]) + (fixed.includes('?') ? `?${fixed.split('?').slice(1).join('?')}` : ''));
    }
    return withUploadAccessToken(fixed);
  }
  if (trimmed.startsWith('/uploads/')) {
    return withUploadAccessToken(toAbsoluteUploadsPath(trimmed.split('?')[0]) + (trimmed.includes('?') ? `?${trimmed.split('?').slice(1).join('?')}` : ''));
  }
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('uploads/')) {
    return withUploadAccessToken(toAbsoluteUploadsPath(`/${trimmed.split('?')[0]}`));
  }

  const uploadsPath = trimmed.match(/\/uploads\/[^\s?#]+/i);
  if (uploadsPath) return withUploadAccessToken(toAbsoluteUploadsPath(uploadsPath[0]));

  // Link ngoài không có https:// (Drive, Dropbox, …)
  if (/^https?:\/\//i.test(trimmed)) {
    if (typeof window === 'undefined') return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/')) {
        return withUploadAccessToken(`${toAbsoluteUploadsPath(parsed.pathname)}${parsed.search || ''}`);
      }
      if (parsed.hostname === window.location.hostname) {
        return `${window.location.origin}${parsed.pathname}${parsed.search || ''}`;
      }
      return parsed.href;
    } catch {
      return trimmed;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  if (typeof window === 'undefined') return trimmed;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.pathname.startsWith('/uploads/')) {
      return withUploadAccessToken(`${toAbsoluteUploadsPath(parsed.pathname)}${parsed.search || ''}`);
    }
    if (parsed.hostname === window.location.hostname) {
      return `${window.location.origin}${parsed.pathname}${parsed.search || ''}`;
    }
    return parsed.href;
  } catch {
    return trimmed.includes('/') ? (trimmed.startsWith('/') ? trimmed : `/${trimmed}`) : '';
  }
};

/** URL tải file với tên hiển thị đúng như lúc upload (fileOriginalName) */
export const buildMediaDownloadUrl = (url, displayName) => {
  const base = resolveMediaUrl(url);
  if (!base) return '';
  const name = ensureDownloadFileName(displayName, url || base);
  const params = new URLSearchParams();
  if (base.includes('/uploads/')) params.set('download', '1');
  if (name) params.set('downloadAs', name);
  if (!params.toString()) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${params.toString()}`;
};

/**
 * Tải file upload — ưu tiên fetch + Bearer (ổn định hơn <a href> + access_token trên URL dài).
 * Fallback: mở buildMediaDownloadUrl nếu fetch thất bại do CORS/network.
 */
export const downloadMediaFile = async (url, fileName) => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') throw new Error('Không có link tải file');

  const displayName = ensureDownloadFileName(fileName, raw);
  const token = typeof window !== 'undefined' ? getAccessToken() : null;

  // Absolute uploads URL (không nhét token vào query — dùng Bearer)
  let absolute = '';
  try {
    const uploadsPath = raw.match(/\/uploads\/[^\s?#]+/i)?.[0]
      || (raw.startsWith('uploads/') ? `/${raw.split('?')[0]}` : '');
    if (uploadsPath) {
      absolute = toAbsoluteUploadsPath(uploadsPath);
    } else {
      absolute = resolveMediaUrl(raw).replace(/([?&])access_token=[^&]*/g, '').replace(/[?&]$/, '');
    }
  } catch {
    absolute = '';
  }

  if (absolute && absolute.includes('/uploads/') && typeof window !== 'undefined') {
    try {
      const sep = absolute.includes('?') ? '&' : '?';
      const fetchUrl = `${absolute}${sep}download=1${displayName ? `&downloadAs=${encodeURIComponent(displayName)}` : ''}`;
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const blob = await res.blob();
        const ct = String(res.headers.get('content-type') || '');
        // 401/404 đôi khi trả JSON nhưng status vẫn lạ — chặn tải nhầm JSON lỗi
        if (ct.includes('application/json')) {
          const text = await blob.text();
          let msg = 'Không tải được file';
          try { msg = JSON.parse(text)?.message || msg; } catch { /* ignore */ }
          throw new Error(msg);
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = displayName || 'download';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('Phiên đăng nhập hết hạn — hãy đăng nhập lại rồi tải xuống');
      }
      if (res.status === 404) {
        throw new Error('File không còn trên máy chủ — Admin cần upload lại');
      }
      throw new Error(`Tải thất bại (HTTP ${res.status})`);
    } catch (err) {
      // Chỉ fallback khi lỗi mạng; lỗi nghiệp vụ (401/404) ném tiếp
      if (err?.message && !/Failed to fetch|NetworkError|network/i.test(err.message)
        && !err.isNetworkError) {
        throw err;
      }
    }
  }

  const fullUrl = buildMediaDownloadUrl(raw, displayName);
  if (!fullUrl) throw new Error('Không có link tải file');
  if (typeof window !== 'undefined') {
    const a = document.createElement('a');
    a.href = fullUrl;
    a.rel = 'noopener noreferrer';
    a.setAttribute('download', displayName || 'download');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }
  return false;
};

/**
 * Lấy Access Token từ LocalStorage.
 */
export const getAccessToken = (role = null) => {
  const prefix = getRolePrefix(role);
  const directToken = localStorage.getItem(`${prefix}_access_token`);
  if (directToken) return directToken;

  // Fallback: đọc từ object session user
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    return session?.token || session?.accessToken || null;
  } catch {
    return null;
  }
};

/**
 * Lưu trữ Token một cách tường minh vào LocalStorage.
 */
export const setTokens = (access, refresh, role) => {
  if (!role) return;
  const prefix = role.toLowerCase();
  
  if (access)  localStorage.setItem(`${prefix}_access_token`, access);
  else         localStorage.removeItem(`${prefix}_access_token`);
  
  if (refresh) localStorage.setItem(`${prefix}_refresh_token`, refresh);
  else         localStorage.removeItem(`${prefix}_refresh_token`);
};

/**
 * Xóa sạch thông tin phiên đăng nhập của Role.
 */
export const clearTokens = (role) => {
  if (!role) return;
  const prefix = role.toLowerCase();
  localStorage.removeItem(`${prefix}_access_token`);
  localStorage.removeItem(`${prefix}_refresh_token`);
  localStorage.removeItem(`${prefix}_user`);
};

/** Xóa phiên các vai khác khi đăng nhập (tránh token admin cũ gây 401 trên /student) */
export const clearOtherRoleSessions = (keepRole) => {
  const keep = (keepRole || '').toLowerCase();
  for (const r of ['admin', 'staff', 'teacher', 'student']) {
    if (r !== keep) clearTokens(r);
  }
};

/**
 * Lấy thông tin Refresh Token.
 */
export const getRefreshToken = (role = null) => {
  const prefix = getRolePrefix(role);
  const directToken = localStorage.getItem(`${prefix}_refresh_token`);
  if (directToken) return directToken;
  
  try {
    const session = JSON.parse(localStorage.getItem(`${prefix}_user`) || 'null');
    return session?.refreshToken || null;
  } catch {
    return null;
  }
};

/**
 * Refresh access token bằng refresh token đang lưu (rotate cả refresh token).
 * Gọi đồng thời nhiều request → chia sẻ chung 1 promise để chỉ refresh 1 lần.
 */
let _refreshPromise = null;

const FATAL_AUTH_CODES = new Set([
  'TOKEN_VERSION_MISMATCH',
  'UNAUTHORIZED',
  'TOKEN_REVOKED',
  'REFRESH_REUSE',
  'DEVICE_CONFLICT',
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'USER_NOT_FOUND',
]);

const redirectToLogin = (prefix) => {
  if (typeof window === 'undefined') return;
  const target = prefix === 'admin' || prefix === 'staff' ? '/admin/login' : '/login';
  if (window.location.pathname !== target) {
    window.location.href = target;
  }
};

const tryRefreshAccessToken = async () => {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const role = getRolePrefix();
    const refresh = getRefreshToken(role);
    if (!refresh) return { ok: false, fatal: true };

    try {
      const csrf = await ensureCsrfToken();
      const res = await fetchWithNetworkRetry(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success || !body.accessToken) {
        return {
          ok: false,
          fatal: !!(body?.code && FATAL_AUTH_CODES.has(body.code)) || res.status === 401 || res.status === 403,
        };
      }

      const nextRefresh = body.refreshToken || refresh;
      setTokens(body.accessToken, nextRefresh, role);

      try {
        const userKey = `${role}_user`;
        const userStr = localStorage.getItem(userKey);
        if (userStr) {
          const user = JSON.parse(userStr);
          user.token = body.accessToken;
          user.accessToken = body.accessToken;
          user.refreshToken = nextRefresh;
          localStorage.setItem(userKey, JSON.stringify(user));
        }
      } catch { /* noop */ }

      return { ok: true, accessToken: body.accessToken };
    } catch (err) {
      if (isNetworkFetchError(err)) {
        return { ok: false, network: true };
      }
      return { ok: false, fatal: false, network: true };
    }
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
};

/** Xóa tenant filter lỗi trên trình duyệt + báo UI reset về "Tất cả" */
export function clearSelectedTenantId() {
  try {
    localStorage.removeItem('selected_tenant_id');
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('cms:tenant-cleared'));
  } catch { /* ignore */ }
}

/**
 * CORE FETCH HELPER: Tự động đính kèm Auth Header và xử lý lỗi hệ thống.
 * Tự động refresh token khi nhận 401/TOKEN_EXPIRED và retry 1 lần.
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url     = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const method  = options.method || 'GET';
  const buildHeaders = async (token) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token && !options.skipAuth ? { Authorization: `Bearer ${token}` } : {}),
    };
    // Multi-tenant: Super Admin chon tenant trong UI
    try {
      const tenantId = localStorage.getItem('selected_tenant_id');
      if (tenantId && tenantId !== 'all') headers['X-Tenant-Id'] = tenantId;
    } catch { /* ignore */ }
    if (isMutatingMethod(method) && !options.skipCsrf) {
      const csrf = await ensureCsrfToken(!!options._csrfRetried);
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    return headers;
  };

  const activeToken = getAccessToken();
  let res;
  try {
    res = await fetchWithNetworkRetry(url, {
      ...options,
      credentials: 'include',
      headers: await buildHeaders(activeToken),
    });
  } catch (err) {
    if (isNetworkFetchError(err)) throw err;
    throw new NetworkOfflineError(err?.message || 'Không kết nối được máy chủ');
  }

  // Tenant lưu localStorage không còn tồn tại / bị khóa → xóa để dừng spam 400
  if (res.status === 400) {
    try {
      const body = await res.clone().json();
      const msg = String(body?.message || '');
      if (msg.includes('X-Tenant-Id') || msg.includes('tenant_id không hợp lệ')) {
        clearSelectedTenantId();
      }
    } catch { /* ignore */ }
  }

  // CSRF hết hạn / chưa có cookie → lấy token mới và thử lại 1 lần
  if (res.status === 403 && isMutatingMethod(method) && !options._csrfRetried) {
    let body = null;
    try { body = await res.clone().json(); } catch { /* noop */ }
    if (body?.code === 'CSRF_INVALID') {
      _csrfToken = null;
      return apiFetch(endpoint, { ...options, _csrfRetried: true });
    }
  }

  // Rate limit tạm thời → chờ Retry-After rồi thử lại tối đa 2 lần
  if (res.status === 429 && (options._rateRetryCount || 0) < 2) {
    const raw = parseInt(res.headers.get('Retry-After') || '', 10);
    const waitSec = Number.isFinite(raw) && raw > 0 ? raw : 2 + (options._rateRetryCount || 0);
    const waitMs = Math.min(Math.max(waitSec * 1000, 1000), 12000);
    await sleep(waitMs);
    return apiFetch(endpoint, {
      ...options,
      _rateRetryCount: (options._rateRetryCount || 0) + 1,
    });
  }

  // Server tạm thời (502/503/504) — thường gặp lúc PM2 restart / deploy
  // Retry dài hơn để tránh toast lỗi khi app đang warm-up (~3–8s)
  // Không retry 503 nghiệp vụ (ngân hàng đề, khóa ký thi…) — retry chỉ làm kẹt UI.
  if ([502, 503, 504].includes(res.status) && (options._serverRetryCount || 0) < 4) {
    let peek = null;
    try { peek = await res.clone().json(); } catch { /* ignore */ }
    const appCode = String(peek?.code || '');
    const appMsg = String(peek?.message || '');
    const isExamAppError = appCode.startsWith('EXAM_')
      || appCode === 'DUPLICATE_BANK_QUESTION_ID'
      || /Không tải được bộ câu hỏi|ID câu hỏi bị trùng|khóa ký kỳ thi/i.test(appMsg);
    if (!isExamAppError) {
      const n = options._serverRetryCount || 0;
      await sleep(Math.min(1200 * (n + 1), 5000));
      return apiFetch(endpoint, {
        ...options,
        _serverRetryCount: n + 1,
      });
    }
  }

  if (res.status !== 401 || options.skipAuth || options._retried) {
    return res;
  }

  let errBody = null;
  try {
    errBody = await res.clone().json();
  } catch { /* noop */ }

  const code = errBody?.code;
  if (code && FATAL_AUTH_CODES.has(code)) {
    const prefix = getRolePrefix();
    clearTokens(prefix);
    redirectToLogin(prefix);
    return res;
  }

  // TOKEN_EXPIRED hoặc 401 thường → thử refresh
  const refreshed = await tryRefreshAccessToken();
  if (refreshed?.network) {
    // Mất mạng khi refresh → giữ phiên, báo UI, không đá về login
    throw new NetworkOfflineError('Mất kết nối khi làm mới phiên đăng nhập');
  }
  if (!refreshed?.ok || !refreshed.accessToken) {
    const prefix = getRolePrefix();
    clearTokens(prefix);
    redirectToLogin(prefix);
    return res;
  }

  return apiFetch(endpoint, { ...options, _retried: true });
};

// ─── AUTH API ───────────────────────────────────────────────────────────────
export const authAPI = {
  updateAvatar: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const uploadData = await uploadWithAuth('/files/upload?category=avatars', formData);
    if (!uploadData?.success) throw new Error(uploadData?.message || 'Upload ảnh thất bại');
    const avatarUrl = uploadData.data?.url || uploadData.url;

    const updateRes = await apiFetch('/auth/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatar: avatarUrl }),
    });
    const updateData = await updateRes.json();
    if (!updateData.success) throw new Error(updateData.message || 'Cập nhật avatar thất bại');
    return { success: true, avatar: avatarUrl };
  },

  login: async (phone, password) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
      skipAuth: true
    });
    return res.json();
  },

  mfaVerify: async (mfaToken, code) => {
    const res = await apiFetch('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken, code }),
      skipAuth: true,
    });
    return res.json();
  },

  mfaStatus: async () => {
    const res = await apiFetch('/auth/mfa/status');
    return res.json();
  },

  mfaSetup: async () => {
    const res = await apiFetch('/auth/mfa/setup', { method: 'POST' });
    return res.json();
  },

  mfaEnable: async (code) => {
    const res = await apiFetch('/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    return res.json();
  },

  mfaDisable: async (password, code) => {
    const res = await apiFetch('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    });
    return res.json();
  },
  
  me: async () => {
    const res = await apiFetch('/auth/me');
    return res.json();
  },

  logout: async () => {
    const role = getRolePrefix();
    const access = getAccessToken(role);
    const refresh = getRefreshToken(role);
    // Đọc token trước, gọi API xong mới xóa local — tránh race khiến server không dọn deviceFingerprint
    try {
      const csrf = await ensureCsrfToken();
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ refreshToken: refresh || undefined }),
      });
    } catch {
      /* vẫn xóa local */
    }
    clearTokens(role);
  },

  changePassword: async (oldPassword, newPassword) => {
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    return res.json();
  },

  markWelcomeCelebrationSeen: async () => {
    const res = await apiFetch('/auth/welcome-celebration/seen', { method: 'POST' });
    return res.json();
  },

  markCourseCelebrationSeen: async ({ enrollmentId, courseName } = {}) => {
    const res = await apiFetch('/auth/course-celebration/seen', {
      method: 'POST',
      body: JSON.stringify({ enrollmentId, courseName }),
    });
    return res.json();
  },

  resetPasswordRequest: async (phone, zalo, role) => {
    const res = await apiFetch('/auth/reset-password-request', {
      method: 'POST',
      body: JSON.stringify({ phone, zalo, role }),
      skipAuth: true,
    });
    return res.json();
  },

  adminResetPassword: async (userId, userRole, newPassword) => {
    const res = await apiFetch('/auth/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, userRole, newPassword }),
    });
    return res.json();
  },

  adminGenerateOTP: async (userId, userRole) => {
    const res = await apiFetch('/auth/admin/generate-otp', {
      method: 'POST',
      body: JSON.stringify({ userId, userRole }),
    });
    return res.json();
  },


  adminUpdateProfile: async (data) => {
    const res = await apiFetch('/auth/admin/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },

};

// ─── STUDENT API ────────────────────────────────────────────────────────────
export const studentsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students${q ? `?${q}` : ''}`);
    return res.json();
  },
  getById: async (id) => {
    const res = await apiFetch(`/students/${id}`);
    return res.json();
  },
  getFullDetail: async (id) => {
    const res = await apiFetch(`/students/${id}/full-detail`);
    return res.json();
  },
  create: async (student) => {
    const res = await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify(student),
    });
    return res.json();
  },
  reserveCode: async () => {
    const res = await apiFetch('/students/reserve-code', { method: 'POST', body: '{}' });
    return res.json();
  },
  importBulk: async (students) => {
    const res = await apiFetch('/students/import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
    return res.json();
  },
  update: async (id, updates) => {
    const res = await apiFetch(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.json();
  },
  updateExamProgress: async (id, { subjectId, changes }) => {
    const res = await apiFetch(`/students/${id}/exam-progress`, {
      method: 'PUT',
      body: JSON.stringify({ subjectId, changes }),
    });
    return res.json();
  },
  startExamAttempt: async (id, subjectId, liveAttemptId = '') => {
    const res = await apiFetch(`/students/${id}/exam-attempt`, {
      method: 'POST',
      body: JSON.stringify({ subjectId, liveAttemptId }),
    });
    return parseApiJson(res, 'Không thể tạo lượt thi');
  },
  abandonExamAttempt: async (id, payload) => {
    const res = await apiFetch(`/students/${id}/exam-attempt/abandon`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể hủy bài');
  },
  /** Hủy bài khi tải lại / đóng tab (keepalive, không chờ phản hồi) */
  abandonExamAttemptBeacon: (id, subjectId, reason = 'Tải lại hoặc đóng trang khi đang thi') => {
    try {
      const token = getAccessToken('student') || getAccessToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (_csrfToken) headers['X-CSRF-Token'] = _csrfToken;
      fetch(`${API_BASE}/students/${id}/exam-attempt/abandon`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers,
        body: JSON.stringify({ subjectId, reason }),
      }).catch(() => {});
    } catch { /* ignore */ }
  },
  submitExamAttempt: async (id, payload) => {
    const res = await apiFetch(`/students/${id}/exam-attempt/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể nộp bài');
  },
  forfeitExamAttempt: async (id, payload) => {
    const res = await apiFetch(`/students/${id}/exam-attempt/forfeit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể hủy bài');
  },
  remove: async (id) => {
    const res = await apiFetch(`/students/${id}`, { method: 'DELETE' });
    return res.json();
  },
  purgeCancelled: async (payload = {}) => {
    const res = await apiFetch('/students/purge-cancelled', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  payTeacher: async (studentId, action) => {
    const res = await apiFetch(`/students/${studentId}/pay-teacher`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/students/stats${q ? `?${q}` : ''}`);
    return res.json();
  },
  resetTodayAttendance: async (id) => {
    const res = await apiFetch(`/students/${id}/reset-today-attendance`, { method: 'POST' });
    return res.json();
  },
  resetDevices: async (id) => {
    const res = await apiFetch(`/students/${id}/reset-devices`, { method: 'POST' });
    return res.json();
  },
  lockAccount: async (id) => {
    const res = await apiFetch(`/students/${id}/lock-account`, { method: 'POST' });
    return res.json();
  },
  unlockAccount: async (id) => {
    const res = await apiFetch(`/students/${id}/unlock-account`, { method: 'POST' });
    return res.json();
  },
  lockExam: async (id, reason = '') => {
    const res = await apiFetch(`/students/${id}/lock-exam`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },
  assignTeacher: async (id, teacherId, enrollmentId) => {
    const res = await apiFetch(`/students/${id}/assign-teacher`, {
      method: 'PUT',
      body: JSON.stringify({ teacherId, enrollmentId }),
    });
    return res.json();
  },
  addEnrollment: async (id, data) => {
    const res = await apiFetch(`/students/${id}/enrollments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  payEnrollment: async (id, enrollmentId, data = {}) => {
    const res = await apiFetch(`/students/${id}/enrollments/${enrollmentId}/pay`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  updateEnrollmentSettings: async (id, enrollmentId, data = {}) => {
    const res = await apiFetch(`/students/${id}/enrollments/${encodeURIComponent(enrollmentId)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  deleteEnrollment: async (id, enrollmentId, body) => {
    const res = await apiFetch(`/students/${id}/enrollments/${enrollmentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  },
  pay: async (id, data) => {
    const res = await apiFetch(`/students/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// ─── TEACHER API ────────────────────────────────────────────────────────────
export const teachersAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/teachers${q ? `?${q}` : ''}`);
    return parseApiJson(res, 'Không tải được danh sách giảng viên');
  },
  getById: async (id) => {
    const res = await apiFetch(`/teachers/${id}`);
    return parseApiJson(res, 'Không tải được thông tin giảng viên');
  },
  getPublicCard: async (id) => {
    const res = await apiFetch(`/teachers/${id}/public-card`);
    return parseApiJson(res, 'Không tải được thông tin giảng viên');
  },
  create: async (teacher) => {
    const res = await apiFetch('/teachers', {
      method: 'POST',
      body: JSON.stringify(teacher),
    });
    return parseApiJson(res, 'Không thêm được giảng viên');
  },
  getPendingSessions: async (id) => {
    const res = await apiFetch(`/teachers/${id}/finance/pending`);
    return res.json();
  },
  payFlexible: async (teacherId, sessionsCount, amount, note, opts = {}) => {
    const res = await apiFetch(`/teachers/${teacherId}/finance/pay-flexible`, {
      method: 'PUT',
      body: JSON.stringify({
        sessionsCount,
        amount,
        note,
        includeStarBonus: !!opts.includeStarBonus,
        ...(Array.isArray(opts.starBonusMonths) ? { starBonusMonths: opts.starBonusMonths } : {}),
      }),
    });
    return res.json();
  },
  update: async (id, updates) => {
    const res = await apiFetch(`/teachers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/teachers/${id}`, { method: 'DELETE' });
    return res.json();
  },
  getFinance: async (teacherId) => {
    const res = await apiFetch(`/teachers/${teacherId}/finance`);
    return res.json();
  },
  approve: async (id) => {
    const res = await apiFetch(`/teachers/${id}/approve`, { method: 'PUT' });
    return res.json();
  },
  uploadPractical: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithAuth('/teachers/upload-practical', formData, getAccessToken('teacher') ? 'teacher' : 'admin');
  },
  startExamAttempt: async (id) => {
    const res = await apiFetch(`/teachers/${id}/exam-attempt`, {
      method: 'POST',
      body: '{}',
    });
    return parseApiJson(res, 'Không thể tạo lượt thi');
  },
  submitExamAttempt: async (id, payload) => {
    const res = await apiFetch(`/teachers/${id}/exam-attempt/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể nộp bài');
  },
  forfeitExamAttempt: async (id, payload) => {
    const res = await apiFetch(`/teachers/${id}/exam-attempt/forfeit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể hủy bài');
  },
  submitPractical: async (id, fileUrl) => {
    const res = await apiFetch(`/teachers/${id}/submit-practical`, {
      method: 'POST',
      body: JSON.stringify({ fileUrl }),
    });
    return parseApiJson(res, 'Không thể nộp bài thực hành');
  },
  forfeitPractical: async (id, payload) => {
    const res = await apiFetch(`/teachers/${id}/practical-forfeit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return parseApiJson(res, 'Không thể cập nhật bài thực hành');
  },
};

// ─── FINANCE / INVOICES API ─────────────────────────────────────────────────
export const invoicesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/invoices${q ? `?${q}` : ''}`);
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/invoices/stats${q ? `?${q}` : ''}`);
    return res.json();
  },
};

export const transactionsAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/transactions${q ? `?${q}` : ''}`);
    return res.json();
  },
  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/transactions/teacher/${teacherId}`);
    return res.json();
  },
  create: async (data) => {
    const res = await apiFetch('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  confirm: async (id, status) => {
    const res = await apiFetch(`/transactions/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return res.json();
  },
};

export const staffAPI = {
  getAll: async () => {
    const res = await apiFetch('/staff');
    return res.json();
  },
  create: async (data) => {
    const res = await apiFetch('/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id, data) => {
    const res = await apiFetch(`/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/staff/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// ─── AI SUPPORT API ─────────────────────────────────────────────────────────
export const aiSupportAPI = {
  status: async () => {
    const res = await apiFetch('/ai-support/status');
    return res.json();
  },
  open: async () => {
    const res = await apiFetch('/ai-support/open', { method: 'POST', body: '{}' });
    return res.json();
  },
  escalate: async (conversationId) => {
    const res = await apiFetch('/ai-support/escalate', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return res.json();
  },
  reset: async (conversationId) => {
    const res = await apiFetch('/ai-support/reset', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return res.json();
  },
  clearHistory: async () => {
    const res = await apiFetch('/ai-support/clear-history', { method: 'POST', body: '{}' });
    return res.json();
  },
  queue: async () => {
    const res = await apiFetch('/ai-support/queue');
    return res.json();
  },
  thread: async (conversationId) => {
    const res = await apiFetch(`/ai-support/thread/${encodeURIComponent(conversationId)}`);
    return res.json();
  },
  claim: async (conversationId) => {
    const res = await apiFetch('/ai-support/claim', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return res.json();
  },
  resolve: async (conversationId) => {
    const res = await apiFetch('/ai-support/resolve', {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    });
    return res.json();
  },
  reply: async (conversationId, contentOrOpts) => {
    const opts = typeof contentOrOpts === 'string'
      ? { content: contentOrOpts }
      : (contentOrOpts || {});
    const res = await apiFetch('/ai-support/reply', {
      method: 'POST',
      body: JSON.stringify({
        conversationId,
        content: opts.content || '',
        fileUrl: opts.fileUrl || '',
        fileName: opts.fileName || '',
        messageType: opts.messageType || 'text',
      }),
    });
    return res.json();
  },
};

// ─── MESSAGE API ────────────────────────────────────────────────────────────
export const messagesAPI = {
    getMessage: async (id) => {
      const res = await apiFetch(`/messages/message/${id}`);
      return res.json();
    },
    pinMessage: async (conversationId, messageId) => {
      const res = await apiFetch('/messages/' + conversationId + '/pin', {
        method: 'PUT',
        body: JSON.stringify({ messageId })
      });
      return res.json();
    },
  getContacts: async () => {
    const res = await apiFetch('/messages/contacts');
    return res.json();
  },
  getHiddenConversations: async () => {
    const res = await apiFetch('/messages/hidden');
    return res.json();
  },
  purgeOrphans: async () => {
    const res = await apiFetch('/messages/purge-orphans', { method: 'POST' });
    return res.json();
  },
  hideConversation: async (conversationId) => {
    const res = await apiFetch(`/messages/hide/${conversationId}`, { method: 'POST' });
    return res.json();
  },
  getGroups: async (userId) => {
    // Nếu có userId thì gọi route đúng, nếu không thì fallback về /groups
    const url = userId ? `/messages/groups/user/${userId}` : '/messages/groups';
    const res = await apiFetch(url);
    return res.json();
  },
  getHistory: async (groupId) => {
    const res = await apiFetch(`/messages/history/${groupId}`);
    return res.json();
  },
  send: async (data) => {
    const res = await apiFetch('/messages', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      const err = new Error(body?.message || `Gửi tin nhắn thất bại (HTTP ${res.status})`);
      err.status = res.status;
      err.data = body;
      err.code = body?.code;
      throw err;
    }
    return body;
  },
  uploadMessageFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithAuth('/messages/upload', formData);
  },
  syncByUser: async (userId) => {
    const res = await apiFetch(`/messages/sync/${userId}`);
    return res.json();
  },
  toggleReaction: async (messageId, type) => {
    const res = await apiFetch(`/messages/${messageId}/reaction`, {
      method: 'PATCH',
      body: JSON.stringify({ type })
    });
    return res.json();
  },
  recall: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/recall`, { method: 'PATCH' });
    return res.json();
  },
  softDelete: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/soft-delete`, { method: 'PATCH' });
    return res.json();
  },
  createGroup: async (name, participants) => {
    const res = await apiFetch('/messages/groups', {
      method: 'POST',
      body: JSON.stringify({ name, participants })
    });
    return res.json();
  },
  deleteGroup: async (groupId) => {
    const res = await apiFetch(`/messages/groups/${groupId}`, { method: 'DELETE' });
    return res.json();
  },
  leaveGroup: async (groupId) => {
    const res = await apiFetch(`/messages/groups/${groupId}/leave`, { method: 'POST' });
    return res.json();
  },
  addGroupMembers: async (groupId, participants) => {
    const res = await apiFetch(`/messages/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ participants })
    });
    return res.json();
  },

  markRead: async (conversationId) => {
    const res = await apiFetch(`/messages/read/${conversationId}`, { method: 'PUT' });
    return res.json();
  },
  getUnread: async (userId, { excludeAi = false } = {}) => {
    const q = excludeAi ? '?excludeAi=1' : '';
    const res = await apiFetch(`/messages/unread/${encodeURIComponent(userId)}${q}`);
    return res.json();
  },
  broadcast: async (targetRole, content, extra = {}) => {
    const res = await apiFetch('/messages/broadcast', {
      method: 'POST',
      body: JSON.stringify({ targetRole, content, ...extra })
    });
    return res.json();
  }
};


// ─── SCHEDULE API ───────────────────────────────────────────────────────────
export const schedulesAPI = {
  getAll: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules${q ? `?${q}` : ''}`);
    return res.json();
  },
  getStats: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules/stats${q ? `?${q}` : ''}`);
    return res.json();
  },
  getByTeacher: async (teacherId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/schedules/teacher/${teacherId}${q ? `?${q}` : ''}`);
    return res.json();
  },
  getByStudent: async (studentId) => {
    const res = await apiFetch(`/schedules/student/${studentId}`);
    return res.json();
  },
  getById: async (id) => {
    const res = await apiFetch(`/schedules/${id}`);
    return res.json();
  },
  create: async (data) => {
    const res = await apiFetch('/schedules', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  update: async (id, data) => {
    const res = await apiFetch(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getPendingConfirm: async () => {
    const res = await apiFetch('/schedules/pending-confirm');
    return res.json();
  },
  getDisputes: async () => {
    const res = await apiFetch('/schedules/disputes');
    return res.json();
  },
  studentConfirm: async (id, decision) => {
    const res = await apiFetch(`/schedules/${id}/student-confirm`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    return res.json();
  },
  resolveDispute: async (id, decision) => {
    const res = await apiFetch(`/schedules/${id}/resolve-dispute`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    return res.json();
  },
  cancel: async (id, reason = '') => {
    const res = await apiFetch(`/schedules/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    return res.json();
  }
};

// ─── EVALUATION API ─────────────────────────────────────────────────────────
export const evaluationsAPI = {
  getPrivate: async ({ branchId } = {}) => {
    const qs = new URLSearchParams();
    if (branchId) {
      qs.set('branch_id', branchId);
      qs.set('branchId', branchId);
    }
    const q = qs.toString();
    const res = await apiFetch(`/evaluations/admin${q ? `?${q}` : ''}`);
    return res.json();
  },
  getByTeacher: async (teacherId) => {
    const res = await apiFetch(`/evaluations/teacher/${encodeURIComponent(teacherId)}`);
    return res.json();
  },
  getMine: async () => {
    const res = await apiFetch('/evaluations/mine');
    return res.json();
  },
  submit: async (data) => {
    const res = await apiFetch('/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  markRead: async (id) => {
    const res = await apiFetch(`/evaluations/${id}/read`, { method: 'POST' });
    return res.json();
  },
};

// ─── ASSIGNMENT API ─────────────────────────────────────────────────────────
export const assignmentsAPI = {
  getByCourse: async (courseId) => {
    const res = await apiFetch(`/assignments/course/${encodeURIComponent(courseId)}`);
    return res.json();
  },
  getByStudentAndCourse: async (studentId, courseId) => {
    const res = await apiFetch(`/assignments/student/${encodeURIComponent(studentId)}/course/${encodeURIComponent(courseId)}`);
    return res.json();
  },
  create: async (data) => {
    const res = await apiFetch(`/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (assignmentId, data) => {
    const res = await apiFetch(`/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (assignmentId) => {
    const res = await apiFetch(`/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithAuth('/assignments/upload', formData);
  },
  submit: async (assignmentId, data) => {
    const res = await apiFetch(`/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  grade: async (submissionId, data) => {
    const res = await apiFetch(`/assignments/submissions/${submissionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// ─── PROCTOR AUDIT API (không gửi video/frame) ───────────────────────────────
export const proctorAPI = {
  postEvents: async (events) => {
    const res = await apiFetch('/proctor/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
    return res.json();
  },
  getMyEvents: async (limit = 50) => {
    const res = await apiFetch(`/proctor/events/me?limit=${limit}`);
    const data = await res.json();
    return data.data || [];
  },
};

// ─── EXAM RESULTS API ───────────────────────────────────────────────────────
export const examResultsAPI = {
  getAll: async (typeOrParams = '') => {
    const params =
      typeof typeOrParams === 'string'
        ? (typeOrParams ? { type: typeOrParams } : {})
        : (typeOrParams || {});
    const q = new URLSearchParams(params).toString();
    const res = await apiFetch(`/exam-results${q ? `?${q}` : ''}`);
    const data = await res.json();
    return data.data || [];
  },
  create: async (data) => {
    const res = await apiFetch('/exam-results', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  update: async (id, data) => {
    const res = await apiFetch(`/exam-results/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/exam-results/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// ─── SETTINGS API ───────────────────────────────────────────────────────────
export const settingsAPI = {
  getAll: async () => {
    const res = await apiFetch('/settings');
    return res.json();
  },
  update: async (data) => {
    const res = await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getWeb: async () => {
    const res = await apiFetch('/settings/web', { skipAuth: true });
    return res.json();
  },
  updateWeb: async (data) => {
    const res = await apiFetch('/settings/web', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  resetData: async (data) => {
    const res = await apiFetch('/settings/reset-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  uploadLogo: async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    return uploadWithAuth('/settings/upload-logo', fd);
  },
  uploadFavicon: async (file, kind = 'public') => {
    const k = kind === 'admin' ? 'admin' : 'public';
    const fd = new FormData();
    fd.append('kind', k);
    fd.append('favicon', file);
    return uploadWithAuth(`/settings/upload-favicon?kind=${k}`, fd);
  },
  uploadPopupImage: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadWithAuth('/settings/upload-popup-image', fd);
  },
  uploadStudentBanner: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadWithAuth('/settings/upload-student-banner', fd);
  },
  uploadTeacherBanner: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadWithAuth('/settings/upload-teacher-banner', fd);
  },
  uploadInvoiceSignature: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadWithAuth('/settings/upload-invoice-signature', fd);
  },
  uploadInvoiceLogo: async (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    return uploadWithAuth('/settings/upload-invoice-logo', fd);
  },
  getPopup: async () => {
    const res = await apiFetch('/settings/popup');
    return res.json();
  },
  getPayment: async () => {
    const res = await apiFetch('/settings/payment', { skipAuth: true });
    return res.json();
  },
  getTrainingData: async () => {
    const res = await apiFetch('/settings/training-data');
    return res.json();
  },
  updateTrainingData: async (trainingData) => {
    const res = await apiFetch('/settings/training-data', {
      method: 'PUT',
      body: JSON.stringify({ trainingData }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Lưu dữ liệu đào tạo thất bại (${res.status})`);
    }
    return data;
  },
  getStudentTrainingData: async () => {
    const res = await apiFetch('/settings/student-training-data');
    return res.json();
  },
  updateStudentTrainingData: async (studentTrainingData) => {
    const res = await apiFetch('/settings/student-training-data', {
      method: 'PUT',
      body: JSON.stringify({ studentTrainingData }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Lưu tài liệu khóa học thất bại (${res.status})`);
    }
    return data;
  },
  getTeacherExamConfig: async () => {
    const res = await apiFetch('/settings/teacher-exam-config');
    return res.json();
  },
  updateTeacherExamConfig: async (payload) => {
    const res = await apiFetch('/settings/teacher-exam-config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Lưu cấu hình thất bại (${res.status})`);
    }
    return data;
  },
  getStudentExamConfig: async () => {
    const res = await apiFetch('/settings/student-exam-config');
    return res.json();
  },
  updateStudentExamConfig: async (payload) => {
    const res = await apiFetch('/settings/student-exam-config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  getExamSubjectsCatalog: async () => {
    const res = await apiFetch('/settings/exam-subjects');
    return res.json();
  },
  addExamSubject: async (payload) => {
    const res = await apiFetch('/settings/exam-subjects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  updateExamSubject: async (id, payload) => {
    const res = await apiFetch(`/settings/exam-subjects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
    return res.json();
  },
  deleteExamSubject: async (id) => {
    const res = await apiFetch(`/settings/exam-subjects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.json();
  },
  updateExamAdminGroupLabel: async (label) => {
    const res = await apiFetch('/settings/exam-admin-group-label', {
      method: 'PUT',
      body: JSON.stringify({ label }),
    });
    return res.json();
  },
  uploadTrainingFile: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadWithAuth('/settings/upload-training-file', fd);
  },
  uploadExamWarningSound: async (file) => {
    const fd = new FormData();
    fd.append('sound', file);
    return uploadWithAuth('/settings/upload-exam-warning-sound', fd);
  },
};


// ─── SYSTEM LOGS API ────────────────────────────────────────────────────────
export const systemLogsAPI = {
  getAll: async (page = 1, limit = 50) => {
    const res = await apiFetch(`/system-logs?page=${page}&limit=${limit}`);
    return res.json();
  },
  create: async (payload) => {
    const res = await apiFetch('/system-logs', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/system-logs/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

// ─── NOTIFICATIONS API (Notification Center) ────────────────────────────────
// ─── TENANTS API (Multi-tenant, Super Admin) ────────────────────────────────
export const tenantsAPI = {
  list: async (status = 'all') => {
    const q = status !== 'all' ? `?status=${status}` : '';
    const res = await apiFetch(`/tenants${q}`);
    return res.json();
  },
  get: async (id) => {
    const res = await apiFetch(`/tenants/${id}`);
    return res.json();
  },
  stats: async (id) => {
    const res = await apiFetch(`/tenants/${id}/stats`);
    return res.json();
  },
  create: async (payload) => {
    const res = await apiFetch('/tenants', { method: 'POST', body: JSON.stringify(payload) });
    return res.json();
  },
  update: async (id, payload) => {
    const res = await apiFetch(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    return res.json();
  },
  assignBranch: async (tenantId, branchId) => {
    const res = await apiFetch(`/tenants/${tenantId}/branches`, {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
    return res.json();
  },
  listBranchesMeta: async () => {
    const res = await apiFetch('/tenants/meta/branches');
    return res.json();
  },
};

// ─── FORM / REPORT BUILDER API ──────────────────────────────────────────────
export const builderAPI = {
  listForms: async (status = 'all') => {
    const q = status && status !== 'all' ? `?status=${status}` : '';
    const res = await apiFetch(`/builder/forms${q}`);
    return res.json();
  },
  getForm: async (idOrSlug) => {
    const res = await apiFetch(`/builder/forms/${idOrSlug}`);
    return res.json();
  },
  createForm: async (payload) => {
    const res = await apiFetch('/builder/forms', { method: 'POST', body: JSON.stringify(payload) });
    return res.json();
  },
  updateForm: async (id, payload) => {
    const res = await apiFetch(`/builder/forms/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    return res.json();
  },
  deleteForm: async (id) => {
    const res = await apiFetch(`/builder/forms/${id}`, { method: 'DELETE' });
    return res.json();
  },
  listSubmissions: async (formId, page = 1) => {
    const res = await apiFetch(`/builder/forms/${formId}/submissions?page=${page}`);
    return res.json();
  },
  exportSubmissions: async (formId, slug = 'form') => {
    const res = await apiFetch(`/builder/forms/${formId}/submissions/export`);
    if (!res.ok) throw new Error('Export thất bại');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listReportSources: async () => {
    const res = await apiFetch('/builder/reports/sources');
    return res.json();
  },
  listReports: async () => {
    const res = await apiFetch('/builder/reports');
    return res.json();
  },
  createReport: async (payload) => {
    const res = await apiFetch('/builder/reports', { method: 'POST', body: JSON.stringify(payload) });
    return res.json();
  },
  updateReport: async (id, payload) => {
    const res = await apiFetch(`/builder/reports/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    return res.json();
  },
  deleteReport: async (id) => {
    const res = await apiFetch(`/builder/reports/${id}`, { method: 'DELETE' });
    return res.json();
  },
  runReport: async (id) => {
    const res = await apiFetch(`/builder/reports/${id}/run`);
    return res.json();
  },
  exportReport: async (id, name = 'report') => {
    const res = await apiFetch(`/builder/reports/${id}/export`);
    if (!res.ok) throw new Error('Export thất bại');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${name}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── WORKFLOWS API ──────────────────────────────────────────────────────────
export const workflowsAPI = {
  definitions: async () => {
    const res = await apiFetch('/workflows/definitions');
    return res.json();
  },
  list: async ({ status = 'open', definitionKey, sync = true, page = 1 } = {}) => {
    const q = new URLSearchParams({ status, page: String(page) });
    if (definitionKey) q.set('definitionKey', definitionKey);
    if (sync) q.set('sync', '1');
    const res = await apiFetch(`/workflows?${q}`);
    return res.json();
  },
  get: async (id) => {
    const res = await apiFetch(`/workflows/${id}`);
    return res.json();
  },
  start: async (payload) => {
    const res = await apiFetch('/workflows', { method: 'POST', body: JSON.stringify(payload) });
    return res.json();
  },
  advance: async (id, { action, note }) => {
    const res = await apiFetch(`/workflows/${id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    });
    return res.json();
  },
  sync: async () => {
    const res = await apiFetch('/workflows/sync', { method: 'POST' });
    return res.json();
  },
};

// ─── BI API ─────────────────────────────────────────────────────────────────
export const biAPI = {
  overview: async ({ period = '1m', branchId = 'all' } = {}) => {
    // Backend branchFilter ưu tiên branch_id (HIGH_ADMIN all-branch allowlist).
    const q = new URLSearchParams({
      period,
      branchId,
      branch_id: branchId,
    });
    const res = await apiFetch(`/bi/overview?${q}`);
    return res.json();
  },
  exportCsv: async ({ period = '1m', branchId = 'all' } = {}) => {
    const q = new URLSearchParams({
      period,
      branchId,
      branch_id: branchId,
    });
    const res = await apiFetch(`/bi/export?${q}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || 'Export thất bại');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bi-overview-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── AI API (Admin) ─────────────────────────────────────────────────────────
const aiAuthHint = (res, body) => {
  if (res.status !== 401) return body?.message || 'AI thất bại';
  return 'Phiên đăng nhập hết hạn — vui lòng đăng nhập lại tài khoản admin';
};

export const aiAPI = {
  status: async () => {
    const res = await apiFetch('/ai/status');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: aiAuthHint(res, body), code: body.code || 'AI_STATUS_FAILED' };
    return body;
  },
  quiz: async (payload) => {
    const res = await apiFetch('/ai/quiz', { method: 'POST', body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: aiAuthHint(res, body), code: body.code || 'AI_QUIZ_FAILED' };
    return body;
  },
  notificationDraft: async (payload) => {
    const res = await apiFetch('/ai/notification-draft', { method: 'POST', body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: aiAuthHint(res, body), code: body.code || 'AI_DRAFT_FAILED' };
    return body;
  },
  summarize: async (payload) => {
    const res = await apiFetch('/ai/summarize', { method: 'POST', body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: aiAuthHint(res, body), code: body.code || 'AI_SUMMARIZE_FAILED' };
    return body;
  },
  complete: async (payload) => {
    const res = await apiFetch('/ai/complete', { method: 'POST', body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, message: aiAuthHint(res, body), code: body.code || 'AI_COMPLETE_FAILED' };
    return body;
  },
};

// ─── MONITORING API ─────────────────────────────────────────────────────────
export const monitoringAPI = {
  overview: async () => {
    const res = await apiFetch('/monitoring/overview');
    return res.json();
  },
  health: async () => {
    const res = await apiFetch('/monitoring/health');
    return res.json();
  },
  metrics: async () => {
    const res = await apiFetch('/monitoring/metrics');
    return res.json();
  },
  resetMetrics: async () => {
    const res = await apiFetch('/monitoring/metrics/reset', { method: 'POST' });
    return res.json();
  },
};

// ─── BACKUPS API (Super Admin) ──────────────────────────────────────────────
export const backupsAPI = {
  list: async ({ page = 1, limit = 20 } = {}) => {
    const res = await apiFetch(`/backups?page=${page}&limit=${limit}`);
    return res.json();
  },
  stats: async () => {
    const res = await apiFetch('/backups/stats');
    return res.json();
  },
  create: async () => {
    const res = await apiFetch('/backups', { method: 'POST' });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/backups/${id}`, { method: 'DELETE' });
    return res.json();
  },
  download: async (id, filename = 'backup.json.gz') => {
    const res = await apiFetch(`/backups/${id}/download`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || 'Tải backup thất bại');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── FILES API (File Center) ────────────────────────────────────────────────
export const filesAPI = {
  list: async ({ page = 1, limit = 20, category, status = 'active', q } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    const res = await apiFetch(`/files?${params}`);
    return res.json();
  },
  stats: async () => {
    const res = await apiFetch('/files/stats');
    return res.json();
  },
  categories: async () => {
    const res = await apiFetch('/files/categories');
    return res.json();
  },
  upload: async (file, category = 'general') => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadWithAuth(`/files/upload?category=${encodeURIComponent(category)}`, fd);
    return res;
  },
  remove: async (id) => {
    const res = await apiFetch(`/files/${id}`, { method: 'DELETE' });
    return res.json();
  },
  purgeExpired: async () => {
    const res = await apiFetch('/files/purge-expired', { method: 'POST' });
    return res.json();
  },
};

export const notificationsAPI = {
  list: async ({ page = 1, limit = 20, type, unreadOnly } = {}) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type) q.set('type', type);
    if (unreadOnly) q.set('unreadOnly', '1');
    const res = await apiFetch(`/notifications?${q}`);
    return res.json();
  },
  count: async () => {
    const res = await apiFetch('/notifications/count');
    return res.json();
  },
  markRead: async (notificationId) => {
    const res = await apiFetch('/notifications/mark-read', {
      method: 'PUT',
      body: JSON.stringify(notificationId ? { notificationId } : { markAll: true }),
    });
    return res.json();
  },
  dismiss: async (id) => {
    const res = await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
    return res.json();
  },
  broadcast: async (payload) => {
    const res = await apiFetch('/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
};

// ─── TRAINING LMS (đào tạo GV) ───────────────────────────────────────────────
export const trainingLmsAPI = {
  getTeacherOverview: async () => {
    const res = await apiFetch('/training-lms/teacher/overview');
    return res.json();
  },
  getMyProgress: async () => {
    const res = await apiFetch('/training-lms/progress/me');
    return res.json();
  },
  getLessons: async (courseId) => {
    const res = await apiFetch(`/training-lms/courses/${courseId}/lessons`);
    return res.json();
  },
  checkoutVideoCourse: async (courseId) => {
    const res = await apiFetch(`/training-lms/video-courses/${courseId}/checkout`, { method: 'POST' });
    return res.json();
  },
  listVideoPurchases: async () => {
    const res = await apiFetch('/training-lms/video-purchases');
    return res.json();
  },
  getVideoPurchaseSession: async (sessionId) => {
    const res = await apiFetch(`/training-lms/video-purchases/session/${encodeURIComponent(sessionId)}`);
    return res.json();
  },
  completeLesson: async (payload) => {
    const res = await apiFetch('/training-lms/complete-lesson', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  saveWatchProgress: async (payload) => {
    const res = await apiFetch('/training-lms/save-watch-progress', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  listQa: async ({ courseId, lessonId, qaId, audience, status } = {}) => {
    const q = new URLSearchParams();
    if (courseId) q.set('courseId', courseId);
    if (lessonId) q.set('lessonId', lessonId);
    if (qaId) q.set('qaId', qaId);
    if (audience) q.set('audience', audience);
    if (status) q.set('status', status);
    const res = await apiFetch(`/training-lms/qa?${q.toString()}`);
    return res.json();
  },
  createQa: async (payload) => {
    const res = await apiFetch('/training-lms/qa', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  answerQa: async (qaId, answer) => {
    const res = await apiFetch(`/training-lms/qa/${qaId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
    return res.json();
  },
  listReviews: async ({ courseId, audience } = {}) => {
    const q = new URLSearchParams();
    if (courseId) q.set('courseId', courseId);
    if (audience) q.set('audience', audience);
    const res = await apiFetch(`/training-lms/reviews?${q.toString()}`);
    return res.json();
  },
  createReview: async (payload) => {
    const res = await apiFetch('/training-lms/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
};

// ─── THÔNG TIN TRUNG TÂM (nhập tay) ──────────────────────────────────────────
export const centerInfoAPI = {
  getPublic: async () => {
    const res = await apiFetch('/center-info');
    return res.json();
  },
  getOverview: async () => {
    const res = await apiFetch('/center-info/manage/overview');
    return res.json();
  },
  saveOverview: async (payload) => {
    const res = await apiFetch('/center-info/manage/overview', {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
    return res.json();
  },
  listItems: async (section) => {
    const res = await apiFetch(`/center-info/manage/items?section=${encodeURIComponent(section)}`);
    return res.json();
  },
  createItem: async (payload) => {
    const res = await apiFetch('/center-info/manage/items', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return res.json();
  },
  updateItem: async (id, payload) => {
    const res = await apiFetch(`/center-info/manage/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
    return res.json();
  },
  removeItem: async (id) => {
    const res = await apiFetch(`/center-info/manage/items/${id}`, { method: 'DELETE' });
    return res.json();
  },
  reorderItems: async (section, ids) => {
    const res = await apiFetch('/center-info/manage/items/reorder', {
      method: 'POST',
      body: JSON.stringify({ section, ids }),
    });
    return res.json();
  },
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadWithAuth('/center-info/manage/upload', fd);
  },
};

// ─── FINANCE (Ledger SoT) ────────────────────────────────────────────────────
export const financeAPI = {
  summary: async ({ branchId = 'all', from = '', to = '', studentId = '' } = {}) => {
    const q = new URLSearchParams();
    if (branchId) q.set('branchId', branchId);
    if (branchId) q.set('branch_id', branchId);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (studentId) q.set('studentId', studentId);
    const res = await apiFetch(`/finance/summary?${q}`);
    return res.json();
  },
  ledger: async ({
    branchId = 'all', studentId = '', teacherId = '', type = '',
    from = '', to = '', status = 'posted', page = 1, limit = 50,
  } = {}) => {
    const q = new URLSearchParams();
    if (branchId) q.set('branchId', branchId);
    if (branchId) q.set('branch_id', branchId);
    if (studentId) q.set('studentId', studentId);
    if (teacherId) q.set('teacherId', teacherId);
    if (type) q.set('type', type);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (status) q.set('status', status);
    q.set('page', String(page));
    q.set('limit', String(limit));
    const res = await apiFetch(`/finance/ledger?${q}`);
    return res.json();
  },
  studentCard: async (studentId) => {
    const res = await apiFetch(`/finance/students/${studentId}`);
    return res.json();
  },
  voidEntry: async (entryId, { reason = '', createReversal = true } = {}) => {
    const res = await apiFetch(`/finance/ledger/${entryId}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason, createReversal }),
    });
    return res.json();
  },
  reconcile: async ({ branchId = 'all', from = '', to = '' } = {}) => {
    const q = new URLSearchParams();
    if (branchId) q.set('branchId', branchId);
    if (branchId) q.set('branch_id', branchId);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const res = await apiFetch(`/finance/reconcile?${q}`);
    return res.json();
  },
};

// ─── BANG TIN (hoi bai / trao doi) ───────────────────────────────────────────
export const feedAPI = {
  list: async (page = 1, limit = 20) => {
    const res = await apiFetch(`/feed?page=${page}&limit=${limit}`);
    return res.json();
  },
  create: async (payload) => {
    const res = await apiFetch('/feed', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/feed/${id}`, { method: 'DELETE' });
    return res.json();
  },
  update: async (id, data) => {
    const res = await apiFetch(`/feed/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  },
  like: async (id, type = 'heart') => {
    const res = await apiFetch(`/feed/${id}/like`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
    return res.json();
  },
  react: async (id, type = 'heart') => {
    const res = await apiFetch(`/feed/${id}/react`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
    return res.json();
  },
  comment: async (id, payload) => {
    const body = typeof payload === 'string'
      ? { content: payload }
      : {
          content: payload?.content || '',
          images: payload?.images || [],
          parentId: payload?.parentId || null,
        };
    const res = await apiFetch(`/feed/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json();
  },
  removeComment: async (postId, commentId) => {
    const res = await apiFetch(`/feed/${postId}/comments/${commentId}`, { method: 'DELETE' });
    return res.json();
  },
  uploadImages: async (files) => {
    const fd = new FormData();
    (files || []).forEach((f) => fd.append('images', f));
    return uploadWithAuth('/feed/upload', fd);
  },
};

// ─── TIN TỨC / BLOG TRUNG TÂM ────────────────────────────────────────────────
export const blogAPI = {
  list: async ({ page = 1, limit = 12, q, target, topic, sort, period } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) qs.set('q', q);
    if (target) qs.set('target', target);
    if (topic && topic !== 'all') qs.set('topic', topic);
    if (sort) qs.set('sort', sort);
    if (period) qs.set('period', period);
    const res = await apiFetch(`/blog/posts?${qs}`);
    return res.json();
  },
  get: async (slugOrId, { manage = false } = {}) => {
    const qs = manage ? '?manage=1' : '';
    const res = await apiFetch(`/blog/posts/${encodeURIComponent(slugOrId)}${qs}`);
    return res.json();
  },
  getManage: async (id) => {
    const res = await apiFetch(`/blog/manage/posts/${encodeURIComponent(id)}`);
    return res.json();
  },
  manageList: async ({ page = 1, limit = 20, status, q, topic, sort, period } = {}) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    if (topic && topic !== 'all') qs.set('topic', topic);
    if (sort) qs.set('sort', sort);
    if (period) qs.set('period', period);
    const res = await apiFetch(`/blog/manage/posts?${qs}`);
    return res.json();
  },
  create: async (payload) => {
    const res = await apiFetch('/blog/manage/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  update: async (id, payload) => {
    const res = await apiFetch(`/blog/manage/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  publish: async (id) => {
    const res = await apiFetch(`/blog/manage/posts/${id}/publish`, { method: 'POST' });
    return res.json();
  },
  hide: async (id) => {
    const res = await apiFetch(`/blog/manage/posts/${id}/hide`, { method: 'POST' });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/blog/manage/posts/${id}`, { method: 'DELETE' });
    return res.json();
  },
  upload: async (files) => {
    const fd = new FormData();
    (files || []).forEach((f) => fd.append('files', f));
    return uploadWithAuth('/blog/manage/upload', fd);
  },
  listTopics: async () => {
    const res = await apiFetch('/blog/topics');
    return res.json();
  },
  createTopic: async (payload) => {
    const res = await apiFetch('/blog/manage/topics', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  updateTopic: async (id, payload) => {
    const res = await apiFetch(`/blog/manage/topics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  removeTopic: async (id) => {
    const res = await apiFetch(`/blog/manage/topics/${id}`, { method: 'DELETE' });
    return res.json();
  },
};

export const quizzesAPI = {
  getAdminQuizzes: async () => {
    const res = await apiFetch('/quizzes/admin/all');
    return res.json();
  },
  getTeacherQuizzes: async () => {
    const res = await apiFetch('/quizzes/teacher');
    return res.json();
  },
  create: async (payload) => {
    const res = await apiFetch('/quizzes/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  generateAi: async (payload) => {
    const res = await apiFetch('/quizzes/generate-ai', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  remove: async (id) => {
    const res = await apiFetch(`/quizzes/${id}`, { method: 'DELETE' });
    return res.json();
  },
  getStudentQuizzes: async () => {
    const res = await apiFetch('/quizzes/student');
    return res.json();
  },
  getQuizForExam: async (id) => {
    const res = await apiFetch(`/quizzes/${id}`);
    return res.json();
  },
  submit: async (id, answers, opts = {}) => {
    const res = await apiFetch(`/quizzes/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        answers,
        forfeit: opts.forfeit === true,
        exitReason: opts.exitReason || '',
      }),
    });
    return res.json();
  },
  /** Best-effort forfeit khi đóng tab / reload (keepalive, không chờ retry) */
  submitForfeitBeacon: (id, exitReason = 'Tải lại hoặc đóng trang khi đang làm bài') => {
    try {
      const token = getAccessToken('student') || getAccessToken();
      const csrf = _csrfToken;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (csrf) headers['X-CSRF-Token'] = csrf;
      fetch(`${API_BASE}/quizzes/${id}/submit`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers,
        body: JSON.stringify({ answers: [], forfeit: true, exitReason }),
      }).catch(() => {});
    } catch { /* ignore */ }
  },
};

export default {
  auth:         authAPI,
  students:     studentsAPI,
  teachers:     teachersAPI,
  invoices:     invoicesAPI,
  transactions: transactionsAPI,
  messages:     messagesAPI,
  schedules:    schedulesAPI,
  evaluations:  evaluationsAPI,
  assignments:  assignmentsAPI,
  quizzes:      quizzesAPI,
  examResults:  examResultsAPI,
  settings:     settingsAPI,
  systemLogs:   systemLogsAPI,
  staff:        staffAPI,
  notifications: notificationsAPI,
  files:         filesAPI,
  backups:       backupsAPI,
  monitoring:    monitoringAPI,
  ai:            aiAPI,
  aiSupport:     aiSupportAPI,
  bi:            biAPI,
  finance:       financeAPI,
  workflows:     workflowsAPI,
  builder:       builderAPI,
  tenants:       tenantsAPI,
  trainingLms:   trainingLmsAPI,
  feed:          feedAPI,
  blog:          blogAPI,
  centerInfo:    centerInfoAPI,
};





