import { cx } from '@/lib/cx';
import {
  controlHeightClassName,
  disabledClassName,
  focusRingInsetClassName,
  interactiveClassName,
  type ControlSize,
} from './controlStyles';
import { Tooltip } from './Tooltip';

interface SegmentedControlOption<T extends string> {
  value: T;
  /** @summary Already-translated accessible name for the group. */
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  /** @summary The 2–4 choices, each with a value and label. */
  options: readonly SegmentedControlOption<T>[];
  /** @summary The selected option's value. */
  value: T;
  /** @summary Called with the value the user picked. */
  onChange: (value: T) => void;
  size?: ControlSize;
  fill?: boolean;
  uppercase?: boolean;
  describedBy?: string;
  className?: string;
}

/**
 * @summary Pick exactly one of 2–4 views in one joined group of buttons; not tabs and not a filter toggle.
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
        controlHeightClassName[size],
        fill ? 'flex w-full' : 'inline-flex',
        className
      )}
    >
      {options.map((option, index) => {
        const explained = option.disabled && option.disabledReason !== undefined;
        const selected = option.value === value && !option.disabled;
        const segment = (
          <button
            key={explained ? undefined : option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled && !explained}
            aria-disabled={explained || undefined}
            onClick={explained ? undefined : () => onChange(option.value)}
            className={cx(
              'inline-flex items-center justify-center px-3',
              fill ? 'min-w-0 text-center leading-tight' : 'whitespace-nowrap',
              interactiveClassName,
              focusRingInsetClassName,
              disabledClassName,
              uppercase ? 'text-[0.6875rem] font-semibold tracking-widest uppercase' : 'text-xs',
              fill && 'flex-1 basis-0',
              index > 0 && 'border-l border-line',
              selected
                ? 'bg-accent/15 text-accent shadow-[inset_0_-2px_0_var(--color-accent)] enabled:hover:bg-accent/22 enabled:active:bg-accent/28'
                : cx(
                    'text-text-dim',
                    !explained &&
                      'enabled:hover:bg-panel-2 enabled:hover:text-text enabled:active:bg-panel'
                  )
            )}
          >
            {option.label}
          </button>
        );
        return explained ? (
          <Tooltip key={option.value} content={option.disabledReason}>
            {segment}
          </Tooltip>
        ) : (
          segment
        );
      })}
    </div>
  );
}
