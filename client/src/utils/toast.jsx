import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST CONTEXT — Hệ thống thông báo toàn cục
// ═══════════════════════════════════════════════════════════════════════════════

const ToastContext = createContext(null);

const ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
  loading: '⏳',
};

const COLORS = {
  success: { bg: '#064e3b', border: '#10b981', text: '#d1fae5' },
  error:   { bg: '#450a0a', border: '#ef4444', text: '#fecaca' },
  warning: { bg: '#451a03', border: '#f59e0b', text: '#fde68a' },
  info:    { bg: '#0c1a2e', border: '#3b82f6', text: '#bfdbfe' },
  loading: { bg: '#1e1b4b', border: '#8b5cf6', text: '#ddd6fe' },
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, leaving: false }]);

    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, d)  => show(msg, 'success', d),
    error:   (msg, d)  => show(msg, 'error',   d ?? 6000),
    warning: (msg, d)  => show(msg, 'warning', d),
    info:    (msg, d)  => show(msg, 'info',     d),
    loading: (msg)     => show(msg, 'loading',  0), // manual dismiss
    dismiss,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

// ── Toast Container UI ────────────────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div style={{
      position:  'fixed',
      top:       '1.25rem',
      right:     '1.25rem',
      zIndex:    99999,
      display:   'flex',
      flexDirection: 'column',
      gap:       '0.6rem',
      maxWidth:  '380px',
      width:     'calc(100vw - 2.5rem)',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  const c = COLORS[t.type] || COLORS.info;

  return (
    <div
      onClick={() => onDismiss(t.id)}
      style={{
        background:   c.bg,
        border:       `1px solid ${c.border}`,
        color:        c.text,
        borderRadius: '10px',
        padding:      '0.75rem 1rem',
        display:      'flex',
        alignItems:   'flex-start',
        gap:          '0.6rem',
        cursor:       'pointer',
        pointerEvents: 'all',
        boxShadow:    `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px ${c.border}22`,
        animation:    t.leaving
          ? 'toastOut 0.3s ease forwards'
          : 'toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        fontSize:     '0.875rem',
        lineHeight:   '1.4',
        maxWidth:     '100%',
        wordBreak:    'break-word',
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>
        {t.type === 'loading' ? <span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⏳</span> : ICONS[t.type]}
      </span>
      <span style={{ flex: 1 }}>{t.message}</span>
      <span style={{ opacity: 0.5, fontSize: '0.75rem', flexShrink: 0, marginTop: '2px' }}>✕</span>

      <style>{`
        @keyframes toastIn  { from { opacity:0; transform:translateX(100%) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes toastOut { from { opacity:1; transform:translateX(0) scale(1); } to { opacity:0; transform:translateX(100%) scale(0.9); } }
        @keyframes spin     { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};

export default ToastProvider;
