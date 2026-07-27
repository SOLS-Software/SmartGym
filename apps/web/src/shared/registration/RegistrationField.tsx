'use client';

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

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
  /** Texto de apoio exibido abaixo do campo (formato esperado, regra, etc.). */
  hint?: string;
};

type ControlProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean;
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
  hint,
}: RegistrationFieldProps) {
  const sizeClass = size ? `field-size-${size}` : '';
  const classes = ['field', sizeClass, className].filter(Boolean).join(' ');

  const showError = touched && !!error;
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const describedBy = [hint ? hintId : null, showError ? errorId : null].filter(Boolean).join(' ');

  // O erro e a dica so existiam visualmente: o input nao tinha aria-invalid nem
  // aria-describedby, entao quem usa leitor de tela ouvia "CPF, campo de texto"
  // e nada mais — nem que o campo e obrigatorio, nem qual foi o erro. Como o
  // controle vem por children, injetamos os atributos no elemento recebido em
  // vez de exigir que cada uma das ~40 telas repita isso.
  const enhancedChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<ControlProps>;
    return cloneElement(element, {
      'aria-describedby': describedBy || element.props['aria-describedby'],
      'aria-invalid': showError ? true : element.props['aria-invalid'],
      'aria-required': required || element.props['aria-required'],
    });
  });

  return (
    <div className={classes}>
      <label htmlFor={htmlFor}>
        {label}
        {/* O asterisco vira decorativo e a obrigatoriedade e anunciada por
            aria-required — antes o leitor lia literalmente "asterisco". */}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {enhancedChildren}
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {showError ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
