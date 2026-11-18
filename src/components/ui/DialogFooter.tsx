import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface DialogFooterProps {
  /** Usually a Cancel `Button` then the primary or danger one. */
  children: ReactNode;
  /** Phone stack: full-width buttons, the primary first (flex-col-reverse puts it on top). Pass the caller's own phone flag. */
  stacked?: boolean;
  /** Spacing only, e.g. `mt-3` when the row sits in a dialog body instead of `Modal`'s `footer`. */
  className?: string;
}

/**
 * The action row of a dialog: right-aligned buttons with a `gap-2`, or stacked
 * full-width on a phone. Goes in `Modal`'s `footer`.
 *
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
