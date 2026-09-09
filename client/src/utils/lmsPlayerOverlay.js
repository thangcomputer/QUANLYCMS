/** LMS player full-screen (z-100) — báo cho chat/popup nổi lên trên. */
export const LMS_PLAYER_OPEN_EVENT = 'cms:lms-player-open';
export const LMS_PLAYER_BODY_CLASS = 'cms-lms-player-open';

export function setLmsPlayerOpen(open) {
  if (typeof document === 'undefined') return;
  const next = Boolean(open);
  document.body.classList.toggle(LMS_PLAYER_BODY_CLASS, next);
  try {
    window.dispatchEvent(new CustomEvent(LMS_PLAYER_OPEN_EVENT, { detail: { open: next } }));
  } catch { /* ignore */ }
}

export function isLmsPlayerOpen() {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains(LMS_PLAYER_BODY_CLASS);
}
