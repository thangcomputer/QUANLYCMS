/**
 * deviceFingerprint.js — Tạo fingerprint định danh máy tính (không cần thư viện ngoài)
 *
 * Trước đây fingerprint dựa trên canvas/WebGL/userAgent và cache theo sessionStorage
 * nên có thể thay đổi giữa các phiên → gây false-positive "đăng nhập máy khác".
 *
 * Hiện tại: dùng một deviceId ngẫu nhiên, lưu localStorage để ổn định theo trình duyệt.
 */

function randomHex(bytes = 16) {
  try {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback (kém an toàn hơn nhưng đủ cho deviceId)
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}

// ── Tổng hợp fingerprint ─────────────────────────────────────────────────────
export function getDeviceFingerprint() {
  if (typeof window === 'undefined') return 'server';

  const LS_KEY = 'cms_device_id_v1';

  // Migrate từ key cũ nếu còn (để giảm số lần bị "xung đột thiết bị" sau update)
  const legacy = sessionStorage.getItem('_dfp');
  const existing = localStorage.getItem(LS_KEY) || legacy;
  if (existing) {
    localStorage.setItem(LS_KEY, existing);
    return existing;
  }

  const id = randomHex(16);
  localStorage.setItem(LS_KEY, id);
  return id;
}
