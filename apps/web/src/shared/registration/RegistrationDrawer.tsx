'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type RegistrationDrawerProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function RegistrationDrawer({ isOpen, title, onClose, children }: RegistrationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const firstFocusable = drawer.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled])',
    );
    setTimeout(() => firstFocusable?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    function handleTabTrap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        drawer!.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
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

    drawer.addEventListener('keydown', handleTabTrap);
    return () => drawer.removeEventListener('keydown', handleTabTrap);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div aria-hidden="true" className="drawer-backdrop" onClick={onClose} />
      <div
        aria-label={title}
        aria-modal="true"
        className="registration-drawer"
        ref={drawerRef}
        role="dialog"
      >
        <div className="drawer-header">
          <p className="section-label">{title}</p>
          <button
            aria-label="Fechar"
            className="drawer-close-button"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}
