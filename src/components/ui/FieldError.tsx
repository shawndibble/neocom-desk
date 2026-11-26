import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface FieldErrorProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <span id={id} role="alert" className={cx('text-danger', className)}>
      {children}
    </span>
  );
}
