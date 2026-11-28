import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

export function OriginCrumb({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex min-h-9 items-center gap-1 rounded-xs px-2 text-xs text-text-dim hover:text-text active:text-text-dim md:min-h-0',
        interactiveClassName,
        focusRingClassName,
        className
      )}
    >
      <span aria-hidden="true">‹</span>
      {children}
    </Link>
  );
}
