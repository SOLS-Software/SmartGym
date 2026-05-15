'use client';

import type { ReactNode } from 'react';

type RegistrationFieldProps = {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
  touched?: boolean;
  required?: boolean;
  className?: string;
};

export function RegistrationField({
  label,
  htmlFor,
  children,
  error,
  touched = false,
  required = false,
  className,
}: RegistrationFieldProps) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {touched && error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
