import { type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { STAT_EYEBROW_TYPE } from './statKit';

export function SectionHeading({ children, warning }: { children: ReactNode; warning?: boolean }) {
  return (
    <p className={cx(STAT_EYEBROW_TYPE, warning ? 'text-warning' : 'text-text-dim')}>{children}</p>
  );
}

export function SuccessBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-xs bg-success px-1.5 text-[0.625rem] font-bold tracking-wider text-accent-contrast uppercase">
      {children}
    </span>
  );
}
