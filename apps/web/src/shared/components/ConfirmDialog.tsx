'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Guarda quem abriu o dialogo para devolver o foco no fechamento
    // (WCAG 2.4.3) — antes o foco caia no <body> e o usuario de teclado
    // reiniciava a navegacao do topo da pagina.
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }

      // Foco preso dentro do dialogo (WCAG 2.1.2 No Keyboard Trap ao contrario:
      // aqui o problema era o oposto — o Tab ESCAPAVA para a pagina atras do
      // modal, deixando o usuario operando controles que estao visualmente
      // bloqueados pelo backdrop).
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div aria-hidden="true" className="confirm-backdrop" onClick={onCancel} />
      <div
        aria-describedby="confirm-message"
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="confirm-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <div aria-hidden="true" className={`confirm-icon-wrap confirm-icon-${variant}`}>
          <AlertTriangle size={22} />
        </div>
        <h3 className="confirm-title" id="confirm-title">{title}</h3>
        {/* aria-describedby: o leitor de tela anuncia titulo E mensagem ao abrir.
            Sem isso, so o titulo era lido e a consequencia da acao ficava de fora. */}
        <p className="confirm-message" id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel} ref={cancelRef} type="button">
            {cancelLabel}
          </button>
          <button className={`confirm-btn confirm-btn-${variant}`} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
