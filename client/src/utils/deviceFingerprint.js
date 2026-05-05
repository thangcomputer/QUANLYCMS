/**
 * deviceFingerprint.js — Tạo fingerprint định danh máy tính (không cần thư viện ngoài)
 *
 * Kết hợp nhiều tín hiệu: canvas, WebGL, fonts, timezone, screen, hardware concurrency…
 * Kết quả là chuỗi hash 8 ký tự, ổn định trên cùng trình duyệt / máy.
 */

// ── Tạo hash 32-bit từ chuỗi (FNV-1a) ──────────────────────────────────────
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ── Canvas fingerprint ───────────────────────────────────────────────────────
function canvasFp() {
  try {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😀', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😀', 4, 17);
    return c.toDataURL().slice(-50);
  } catch { return 'nocanvas'; }
}

// ── WebGL renderer string ────────────────────────────────────────────────────
function webglFp() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return 'nowebgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)}~${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}`
      : 'noext';
  } catch { return 'nowebgl'; }
}

// ── Tổng hợp fingerprint ─────────────────────────────────────────────────────
export function getDeviceFingerprint() {
  const CACHE_KEY = '_dfp';
  const cached = sessionStorage.getItem(CACHE_KEY); // cache per session để tránh tính lại
  if (cached) return cached;

  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.hardwareConcurrency,
    navigator.deviceMemory || 'unknown',
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasFp(),
    webglFp(),
    navigator.platform || '',
    navigator.vendor   || '',
  ];

  const fp = fnv1a(parts.join('|'));
  sessionStorage.setItem(CACHE_KEY, fp);
  return fp;
}
