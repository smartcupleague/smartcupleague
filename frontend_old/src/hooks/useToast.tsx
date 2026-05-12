import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import './toast.css';

type ToastType = 'info' | 'success' | 'error';

type Toast = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  timeoutMs: number;
};

type ToastApi = {
  show: (message: string, opts?: { type?: ToastType; title?: string; timeoutMs?: number }) => void;
  info: (message: string, opts?: { title?: string; timeoutMs?: number }) => void;
  success: (message: string, opts?: { title?: string; timeoutMs?: number }) => void;
  error: (message: string, opts?: { title?: string; timeoutMs?: number }) => void;
  remove: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, opts?: { type?: ToastType; title?: string; timeoutMs?: number }) => {
      const id = uid();
      const toast: Toast = {
        id,
        type: opts?.type ?? 'info',
        title: opts?.title,
        message,
        timeoutMs: opts?.timeoutMs ?? 3200,
      };

      setToasts((prev) => [toast, ...prev].slice(0, 4)); 

      window.setTimeout(() => remove(id), toast.timeoutMs);
    },
    [remove],
  );

  const api: ToastApi = useMemo(
    () => ({
      show,
      remove,
      info: (m, o) => show(m, { ...o, type: 'info' }),
      success: (m, o) => show(m, { ...o, type: 'success' }),
      error: (m, o) => show(m, { ...o, type: 'error' }),
    }),
    [show, remove],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ---------- UI ---------- */

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
};

const TITLES: Record<ToastType, string> = {
  success: 'Success',
  error:   'Error',
  info:    'Info',
};

const ToastViewport: React.FC<{
  toasts: Toast[];
  onClose: (id: string) => void;
}> = ({ toasts, onClose }) => {
  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} role="status">
          <div className="toast__bar" />
          <div className="toast__body">
            <div className="toast__icon" aria-hidden="true">
              {ICONS[t.type]}
            </div>
            <div className="toast__content">
              <div className="toast__top">
                <div className="toast__title">
                  {t.title ?? TITLES[t.type]}
                </div>
                <button className="toast__close" onClick={() => onClose(t.id)} aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="toast__msg">{t.message}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
