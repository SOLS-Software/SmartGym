'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 280);
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, type: ToastType) => {
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[type]);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  // WCAG 2.2.1 (Timing Adjustable): a mensagem sumia sozinha em 4-6s sem
  // nenhuma forma de reter. Uma mensagem de erro longa, ou a chegada de um
  // segundo toast, tornava impossivel terminar a leitura. Ao passar o mouse ou
  // focar o toast, o cronometro para; ao sair, reinicia.
  const pause = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      scheduleDismiss(id, type);
    },
    [scheduleDismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Duas regioes vivas separadas dentro de um mesmo container posicionado:
          erro/aviso precisam interromper o leitor de tela (assertive),
          sucesso/info nao. Antes tudo era "polite" numa regiao so, entao uma
          falha de gravacao podia nunca ser anunciada — e o usuario ficava
          achando que tinha salvado. */}
      <div className="toast-container">
        <div aria-live="assertive" className="toast-region" role="log">
          {toasts
            .filter((toast) => toast.type === 'error' || toast.type === 'warning')
            .map((toast) => (
              <ToastItem key={toast.id} onDismiss={dismiss} onPause={pause} onResume={scheduleDismiss} toast={toast} />
            ))}
        </div>
        <div aria-live="polite" className="toast-region" role="log">
          {toasts
            .filter((toast) => toast.type === 'success' || toast.type === 'info')
            .map((toast) => (
              <ToastItem key={toast.id} onDismiss={dismiss} onPause={pause} onResume={scheduleDismiss} toast={toast} />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number, type: ToastType) => void;
}) {
  const Icon = ICON_MAP[toast.type];
  return (
    <div
      className={`toast toast-${toast.type}${toast.exiting ? ' toast-exit' : ''}`}
      onBlur={() => onResume(toast.id, toast.type)}
      onFocus={() => onPause(toast.id)}
      onMouseEnter={() => onPause(toast.id)}
      onMouseLeave={() => onResume(toast.id, toast.type)}
    >
      <Icon aria-hidden="true" className="toast-icon" size={18} />
      <span className="toast-message">{toast.message}</span>
      <button
        aria-label="Fechar mensagem"
        className="toast-close"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
