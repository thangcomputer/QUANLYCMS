import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST CONTEXT — Thông báo nổi toàn cục (không icon, card + typography + shadow)
// ═══════════════════════════════════════════════════════════════════════════════

const ToastContext = createContext(null);

/** Mỗi loại: thanh accent trái + nền + màu chữ (thiết kế SaaS, không emoji) */
const VARIANT = {
  success: {
    accent: '#059669',
    bg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    color: '#0f172a',
    ring: 'rgba(5, 150, 105, 0.12)',
  },
  error: {
    accent: '#dc2626',
    bg: 'linear-gradient(180deg, #fffefe 0%, #fef2f2 100%)',
    color: '#450a0a',
    ring: 'rgba(220, 38, 38, 0.12)',
  },
  warning: {
    accent: '#d97706',
    bg: 'linear-gradient(180deg, #fffefb 0%, #fffbeb 100%)',
    color: '#422006',
    ring: 'rgba(217, 119, 6, 0.15)',
  },
  info: {
    accent: '#2563eb',
    bg: 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)',
    color: '#1e3a5f',
    ring: 'rgba(37, 99, 235, 0.12)',
  },
  loading: {
    accent: '#7c3aed',
    bg: 'linear-gradient(180deg, #ffffff 0%, #f5f3ff 100%)',
    color: '#1e1b4b',
    ring: 'rgba(124, 58, 237, 0.15)',
  },
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 280);
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
    loading: (msg)     => show(msg, 'loading',  0),
    dismiss,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="toast-portal"
      style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.25rem',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        maxWidth: 'min(420px, calc(100vw - 2rem))',
        width: 'min(420px, calc(100vw - 2rem))',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(16px) translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(12px) scale(0.98); }
        }
        @keyframes toastShimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  const v = VARIANT[t.type] || VARIANT.info;

  return (
    <div
      role="status"
      title="Nhấn để đóng"
      onClick={() => onDismiss(t.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDismiss(t.id); }}
      tabIndex={0}
      style={{
        position: 'relative',
        background: v.bg,
        color: v.color,
        borderRadius: '14px',
        padding: '14px 18px 14px 16px',
        cursor: 'pointer',
        pointerEvents: 'all',
        border: `1px solid ${v.ring}`,
        boxShadow: `
          0 22px 50px -12px rgba(15, 23, 42, 0.18),
          0 12px 24px -8px rgba(15, 23, 42, 0.12),
          0 0 0 1px rgba(255, 255, 255, 0.6) inset
        `,
        animation: t.leaving
          ? 'toastOut 0.28s ease forwards'
          : 'toastIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        overflow: 'hidden',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Thanh nhấn trái — không dùng icon */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: v.accent,
          borderRadius: '14px 0 0 14px',
        }}
      />

      <div style={{ paddingLeft: '10px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.5,
            fontFeatureSettings: '"kern" 1, "liga" 1',
          }}
        >
          {t.message}
        </p>
        {t.type === 'loading' && (
          <div
            aria-hidden
            style={{
              marginTop: '10px',
              height: '3px',
              borderRadius: '999px',
              background: `linear-gradient(90deg, ${v.accent}33, ${v.accent}, ${v.accent}33)`,
              backgroundSize: '200% 100%',
              animation: 'toastShimmer 1.2s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};

export default ToastProvider;
