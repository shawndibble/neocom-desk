import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface InlineErrorProps {
  children: ReactNode;
  className?: string;
}

export function InlineError({ children, className }: InlineErrorProps) {
  return (
    <p role="alert" className={cx('text-xs text-danger', className)}>
      {children}
    </p>
  );
}
