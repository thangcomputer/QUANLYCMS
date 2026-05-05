/**
 * useInactivityTimer — Tự động đăng xuất sau 60 phút không tương tác
 *
 * Theo dõi: mousemove, keydown, click, scroll, touchstart
 * Cảnh báo: 5 phút trước khi hết hạn
 * Đăng xuất: gọi onLogout() khi hết 60 phút
 */
import { useEffect, useRef, useCallback, useState } from 'react';

const INACTIVITY_LIMIT   = 60 * 60 * 1000; // 60 phút
const WARNING_BEFORE     =  5 * 60 * 1000; // Cảnh báo trước 5 phút
const STORAGE_KEY        = 'last_activity_at';
const EVENTS             = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

export function useInactivityTimer({ onLogout, enabled = true }) {
  const timerRef      = useRef(null);
  const warnTimerRef  = useRef(null);
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft,    setSecondsLeft]    = useState(0);
  const countdownRef  = useRef(null);

  // ── Lưu timestamp hoạt động gần nhất vào localStorage ──────────────────────
  const resetActivity = useCallback(() => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    setWarningVisible(false);

    if (countdownRef.current) clearInterval(countdownRef.current);
    if (timerRef.current)     clearTimeout(timerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);

    if (!enabled) return;

    // Đặt lịch cảnh báo sau (INACTIVITY_LIMIT - WARNING_BEFORE)
    warnTimerRef.current = setTimeout(() => {
      setWarningVisible(true);
      setSecondsLeft(Math.floor(WARNING_BEFORE / 1000));

      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, INACTIVITY_LIMIT - WARNING_BEFORE);

    // Đặt lịch đăng xuất sau INACTIVITY_LIMIT
    timerRef.current = setTimeout(() => {
      setWarningVisible(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      onLogout('inactivity');
    }, INACTIVITY_LIMIT);
  }, [enabled, onLogout]);

  // ── Gắn event listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    // Kiểm tra khi load: nếu đã quá hạn → logout ngay
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const elapsed = Date.now() - Number(saved);
      if (elapsed >= INACTIVITY_LIMIT) {
        onLogout('inactivity');
        return;
      }
    }

    resetActivity();

    const handler = () => resetActivity();
    EVENTS.forEach(ev => window.addEventListener(ev, handler, { passive: true }));

    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, handler));
      if (timerRef.current)     clearTimeout(timerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, resetActivity, onLogout]);

  // ── Người dùng chủ động gia hạn từ hộp cảnh báo ─────────────────────────────
  const extendSession = useCallback(() => {
    resetActivity();
  }, [resetActivity]);

  return { warningVisible, secondsLeft, extendSession };
}
