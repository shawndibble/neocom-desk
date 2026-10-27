import { cx } from '@/lib/cx';

export type ProgressBarTone = 'accent' | 'success' | 'warning' | 'danger';

interface ProgressBarProps {
  /** Accessible name: what is progressing. Always set, since the bar has no visible text of its own. */
  label: string;
  /** How far along, in the same unit as `max`. `null` is indeterminate: work is running but how much is unknown. */
  value: number | null;
  /** The value that means full. Defaults to 100, so `value` reads as a percent. */
  max?: number;
  /** Fill colour: `accent` is progress, the rest carry a status (a tight budget, a ready cooldown). Never the only signal; print the figure beside it. */
  tone?: ProgressBarTone;
  /** Track height: `xs` 4px, `sm` 6px (the usual inline bar), `md` 8px (a card's lead bar). */
  size?: 'xs' | 'sm' | 'md';
  /**
   * The surface the bar sits on. The track is one layering step up from it (§1),
   * so it stays visible: `panel` (a Panel body, the default) gets a `panel-2` track,
   * `panel-2` (a raised row such as an expanded table detail) gets `line`.
   */
  surface?: 'panel' | 'panel-2';
  /** Layout only: width, margin, flex. */
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

/** What an indeterminate bar shows: a partial, pulsing fill rather than a number. */
const INDETERMINATE_WIDTH = '30%';

/**
 * A thin filled track for how far along something is: a cooldown, a hold, a
 * job, a budget, a search. Print the figure beside it where one exists; the
 * bar alone is not a readout (colour is never the only signal, §7).
 *
 * Both layers are spans so it can sit inside a table cell or a flex span
 * without invalid nesting, and `block` makes them lay out like divs. The
 * radius is the house `rounded-xs` (§3); a pill is for avatars and dots.
 *
 * @summary A thin filled track for how far along something is.
 */
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
