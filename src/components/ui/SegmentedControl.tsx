import { cx } from '@/lib/cx';
import {
  controlHeightClassName,
  disabledClassName,
  focusRingInsetClassName,
  interactiveClassName,
  type ControlSize,
} from './controlStyles';

interface SegmentedControlOption<T extends string> {
  value: T;
  /** Already-translated label. */
  label: string;
  /** Inert and muted. The group's other segments stay live. */
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** Already-translated accessible name for the group. */
  label: string;
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Height from the shared control scale; `md` (default) is 44px on a phone, 36px for a pointer. */
  size?: ControlSize;
  /** Stretch to the container's full width, segments sharing it equally. */
  fill?: boolean;
  /** Micro-label casing (default). Turn off for labels that are units or codes, like `30d`. */
  uppercase?: boolean;
  /** Id(s) of a hint describing the group, for `aria-describedby`. */
  describedBy?: string;
  className?: string;
}

/**
 * Pick exactly one of a few views: one joined group, one selected look
 * (`FilterChip`'s accent tint plus a 2px accent underline, so it isn't colour alone). A `role="group"` of `aria-pressed` buttons, not
 * a tablist — it switches what a panel shows rather than navigating between
 * places (`Tabs`), and it needs no open-then-pick step (`Select`).
 *
 * Not a `FilterChip` either: a chip toggles a filter on and off independently,
 * while exactly one segment here is always on and picking it again is a no-op.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  fill = false,
  uppercase = true,
  describedBy,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className={cx(
        'overflow-hidden rounded-xs border border-line',
        fill ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center justify-center px-3 whitespace-nowrap',
              interactiveClassName,
              focusRingInsetClassName,
              disabledClassName,
              controlHeightClassName[size],
              uppercase ? 'text-[0.6875rem] font-semibold tracking-widest uppercase' : 'text-xs',
              fill && 'flex-1 basis-0',
              index > 0 && 'border-l border-line',
              selected
                ? 'bg-accent/15 text-accent shadow-[inset_0_-2px_0_var(--color-accent)] enabled:hover:bg-accent/22 enabled:active:bg-accent/28'
                : 'text-text-dim enabled:hover:bg-panel-2 enabled:hover:text-text enabled:active:bg-panel'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
