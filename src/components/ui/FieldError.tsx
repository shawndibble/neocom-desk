import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface FieldErrorProps {
  id: string;
  children: ReactNode;
  /** Extra classes, e.g. a smaller type size to match a neighbouring hint. */
  className?: string;
}

/** A field-level validation message: announced via `role="alert"`, paired with the field's `aria-describedby`. */
export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <span id={id} role="alert" className={cx('text-danger', className)}>
      {children}
    </span>
  );
}
