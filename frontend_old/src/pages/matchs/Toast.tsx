import React, { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastEvent = {
  message: string;
  type: ToastType;
  duration?: number;
};

const EVENT_NAME = 'app:toast';

export function useToast() {
  return (message: string, type: ToastType = 'info', duration = 3200) => {
    window.dispatchEvent(new CustomEvent<ToastEvent>(EVENT_NAME, { detail: { message, type, duration } }));
  };
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Array<Toast & { leaving?: boolean }>>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ev = e as CustomEvent<ToastEvent>;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const { message, type, duration = 3200 } = ev.detail;

      setToasts((prev) => [...prev, { id, message, type }]);

      window.setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      }, Math.max(0, duration - 260));

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };

    window.addEventListener(EVENT_NAME, onToast as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onToast as EventListener);
  }, []);

  return (
    <div style={styles.stack}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            ...styles.toast,
            ...stylesByType[t.type],
            ...(t.leaving ? styles.leaving : {}),
          }}>
          <span style={styles.icon}>{iconFor(t.type)}</span>
          <span style={styles.text}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function iconFor(type: ToastType) {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '!';
    case 'warning':
      return '⚠';
    default:
      return 'i';
  }
}

const styles: Record<string, React.CSSProperties> = {
  stack: {
    position: 'fixed',
    right: 18,
    bottom: 18,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'none',
    maxWidth: 380,
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 16,
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 650,
    lineHeight: 1.2,
    boxShadow: '0 18px 40px rgba(0,0,0,.45)',
    border: '1px solid rgba(255,255,255,.16)',
    transform: 'translateY(10px) scale(.98)',
    opacity: 0,
    animation: 'toastIn .22s ease forwards',
    backdropFilter: 'blur(6px)',
  },
  leaving: {
    animation: 'toastOut .22s ease forwards',
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(0,0,0,.22)',
    fontSize: 14,
    flex: '0 0 auto',
    marginTop: 1,
  },
  text: {
    flex: '1 1 auto',
  },
};

const stylesByType: Record<ToastType, React.CSSProperties> = {
  success: { background: 'linear-gradient(135deg, rgba(32,201,151,.98), rgba(11,189,135,.95))' },
  error: { background: 'linear-gradient(135deg, rgba(255,77,109,.98), rgba(201,24,74,.95))' },
  warning: { background: 'linear-gradient(135deg, rgba(255,183,3,.98), rgba(251,133,0,.95))' },
  info: { background: 'linear-gradient(135deg, rgba(77,171,247,.98), rgba(28,126,214,.95))' },
};

const styleTagId = '__toast_keyframes__';
if (typeof document !== 'undefined' && !document.getElementById(styleTagId)) {
  const el = document.createElement('style');
  el.id = styleTagId;
  el.textContent = `
    @keyframes toastIn { to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes toastOut { to { opacity: 0; transform: translateY(8px) scale(.98); } }
  `;
  document.head.appendChild(el);
}
