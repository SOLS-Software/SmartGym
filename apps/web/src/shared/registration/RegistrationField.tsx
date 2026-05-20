'use client';

import type { ReactNode } from 'react';

type FieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full';

type RegistrationFieldProps = {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string;
  touched?: boolean;
  required?: boolean;
  className?: string;
  size?: FieldSize;
};

export function RegistrationField({
  label,
  htmlFor,
  children,
  error,
  touched = false,
  required = false,
  className,
  size,
}: RegistrationFieldProps) {
  const sizeClass = size ? `field-size-${size}` : '';
  const classes = ['field', sizeClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {touched && error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
