import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface InlineErrorProps {
  children: ReactNode;
  /** Layout classes only (margin, width); the tone and size are the primitive's. */
  className?: string;
}

/** A failed-action message beside the thing that failed: announced via `role="alert"`, small danger text. */
export function InlineError({ children, className }: InlineErrorProps) {
  return (
    <p role="alert" className={cx('text-xs text-danger', className)}>
      {children}
    </p>
  );
}
