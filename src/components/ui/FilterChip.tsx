import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import {
  controlHeightClassName,
  disabledClassName,
  focusRingClassName,
  interactiveClassName,
  toggleChipStateClassName,
  type ControlSize,
} from './controlStyles';
import { Tooltip } from './Tooltip';

interface FilterChipProps {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onToggle: () => void;
  count?: number;
  countLabel?: string;
  className?: string;
  size?: ControlSize;
  disabled?: boolean;
  tooltip?: string;
  expanded?: boolean;
  controls?: string;
}

export function FilterChip({
  label,
  icon,
  selected,
  onToggle,
  count,
  countLabel,
  className = '',
  size = 'sm',
  disabled = false,
  tooltip,
  expanded,
  controls,
}: FilterChipProps) {
  const hasGloss = countLabel !== undefined;
  const explained = disabled && tooltip !== undefined;
  const chip = (
    <button
      type="button"
      aria-pressed={expanded === undefined ? selected : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled && !explained}
      aria-disabled={explained || undefined}
      onClick={explained ? undefined : onToggle}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase',
        interactiveClassName,
        focusRingClassName,
        disabledClassName,
        controlHeightClassName[size],
        toggleChipStateClassName(selected, { hoverable: !explained }),
        className
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <>
          {hasGloss && ' '}
          <span aria-hidden={hasGloss} className="font-medium tabular-nums">
            {count}
          </span>
          {hasGloss && <span className="sr-only">{countLabel}</span>}
        </>
      )}
    </button>
  );

  return tooltip ? (
    <Tooltip content={tooltip} openOnTap={explained}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
