import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface DialogFooterProps {
  children: ReactNode;
  stacked?: boolean;
  className?: string;
}

/**
 * @summary Right-aligned Cancel + primary/danger row for a dialog's footer.
 */
export function DialogFooter({ children, stacked = false, className }: DialogFooterProps) {
  return (
    <div
      className={cx(
        'flex gap-2',
        stacked ? 'flex-col-reverse [&>button]:w-full' : 'justify-end',
        className
      )}
    >
      {children}
    </div>
  );
}
