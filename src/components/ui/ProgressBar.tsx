import { cx } from '@/lib/cx';

export type ProgressBarTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';

interface ProgressBarProps {
  /** @summary The bar's accessible name; ignored when `decorative`. */
  label: string;
  value: number | null;
  max?: number;
  tone?: ProgressBarTone;
  size?: 'xs' | 'sm' | 'md';
  surface?: 'panel' | 'panel-2';
  className?: string;
  /** @summary The figure is printed beside the bar, which only draws it: hidden from assistive tech, no progressbar role. */
  decorative?: boolean;
}

const TONE_CLASS: Record<ProgressBarTone, string> = {
  accent: 'bg-accent',
  neutral: 'bg-line-bright',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const TRACK_CLASS = { panel: 'bg-panel-2', 'panel-2': 'bg-line' } as const;

const SIZE_CLASS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

const INDETERMINATE_WIDTH = '30%';

/** @summary A thin filled track for how far along something is. */
export function ProgressBar({
  label,
  value,
  max = 100,
  tone = 'accent',
  size = 'sm',
  surface = 'panel',
  className,
  decorative = false,
}: ProgressBarProps) {
  const determinate = value !== null;
  const share = determinate && max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': determinate ? max : undefined,
            'aria-valuenow': determinate ? value : undefined,
          })}
      className={cx(
        'block overflow-hidden rounded-xs',
        TRACK_CLASS[surface],
        SIZE_CLASS[size],
        className
      )}
    >
      <span
        className={cx(
          'block h-full',
          TONE_CLASS[tone],
          determinate
            ? 'motion-safe:transition-[width] motion-safe:duration-(--motion-quick) motion-safe:ease-(--motion-ease-out)'
            : 'motion-safe:animate-pulse'
        )}
        style={{ width: determinate ? `${share * 100}%` : INDETERMINATE_WIDTH }}
      />
    </span>
  );
}
