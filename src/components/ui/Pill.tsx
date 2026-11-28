import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const PILL_TONE_CLASS: Record<PillTone, string> = {
  neutral: 'bg-panel-2 text-text-dim',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

const PILL_OUTLINED_CLASS: Record<PillTone, string> = {
  neutral: 'border-line-bright text-text-dim',
  accent: 'border-accent/45 bg-accent/10 text-accent',
  success: 'border-success/45 bg-success/10 text-success',
  warning: 'border-warning/45 bg-warning/10 text-warning',
  danger: 'border-danger/45 bg-danger/10 text-danger',
};

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  outlined?: boolean;
  className?: string;
}

/** @summary A static tinted badge beside a name or status ("Done", "Closed", "Corp"). */
export function Pill({ children, tone = 'neutral', outlined = false, className }: PillProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-xs px-1.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
        outlined ? 'h-[1.125rem] shrink-0 border' : 'py-0.5',
        outlined ? PILL_OUTLINED_CLASS[tone] : PILL_TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
