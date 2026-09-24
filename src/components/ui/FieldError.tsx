import type { ReactNode } from 'react';

interface FieldErrorProps {
  id: string;
  children: ReactNode;
}

/** A field-level validation message: announced via `role="alert"`, paired with the field's `aria-describedby`. */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <span id={id} role="alert" className="text-danger">
      {children}
    </span>
  );
}
