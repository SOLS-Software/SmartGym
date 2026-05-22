'use client';

import { useEffect } from 'react';

export function GlobalValidation() {
  useEffect(() => {
    function handleInvalid(e: Event) {
      const input = e.target as HTMLInputElement;
      if (input.validity.valueMissing) {
        input.setCustomValidity('Por favor preencha este campo');
      } else {
        input.setCustomValidity('');
      }
    }

    function handleInput(e: Event) {
      const input = e.target as HTMLInputElement;
      input.setCustomValidity('');
    }

    document.addEventListener('invalid', handleInvalid, true);
    document.addEventListener('input', handleInput, true);

    return () => {
      document.removeEventListener('invalid', handleInvalid, true);
      document.removeEventListener('input', handleInput, true);
    };
  }, []);

  return null;
}
