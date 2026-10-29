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

interface PillProps {
  children: ReactNode;
  /** Tint of the fill and text; `neutral` is the quiet default. */
  tone?: PillTone;
  /** Spacing and layout only; the type recipe and tint are fixed. */
  className?: string;
}

/**
 * A tinted inline badge: uppercase label on a flat fill at one tone, no box
 * (it is static, and a box means "you can click this" — DESIGN.md §6).
 *
 * @summary A static tinted badge beside a name or status ("Done", "Closed", "Corp").
 */
export function Pill({ children, tone = 'neutral', className }: PillProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
        PILL_TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
