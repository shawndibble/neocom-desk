import { cx } from '@/lib/cx';

export type ProgressBarTone = 'accent' | 'success' | 'warning' | 'danger';

interface ProgressBarProps {
  label: string;
  value: number | null;
  max?: number;
  tone?: ProgressBarTone;
  size?: 'xs' | 'sm' | 'md';
  surface?: 'panel' | 'panel-2';
  className?: string;
}

const TONE_CLASS: Record<ProgressBarTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const TRACK_CLASS = { panel: 'bg-panel-2', 'panel-2': 'bg-line' } as const;

const SIZE_CLASS = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

const INDETERMINATE_WIDTH = '30%';

export function ProgressBar({
  label,
  value,
  max = 100,
  tone = 'accent',
  size = 'sm',
  surface = 'panel',
  className,
}: ProgressBarProps) {
  const determinate = value !== null;
  const share = determinate && max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={determinate ? max : undefined}
      aria-valuenow={determinate ? value : undefined}
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
          determinate ? 'motion-safe:transition-[width]' : 'motion-safe:animate-pulse'
        )}
        style={{ width: determinate ? `${share * 100}%` : INDETERMINATE_WIDTH }}
      />
    </span>
  );
}
