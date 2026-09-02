import { cx } from '@/lib/cx';
import { controlHeightClassName } from './controlStyles';

interface FilterChipProps {
  /** Already-translated label. */
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Optional match count, shown after the label. */
  count?: number;
  className?: string;
}

/**
 * Toggleable filter pill. `StatChip`'s look, but interactive: accent when on,
 * and sized from the shared control scale so it lines up with the `Button` and
 * `Select` it shares a toolbar with — including the touch tier, which a
 * readout chip does not get.
 */
export function FilterChip({ label, selected, onToggle, count, className = '' }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        controlHeightClassName.sm,
        selected
          ? 'border-accent-dim bg-accent/15 text-accent'
          : 'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text',
        className
      )}
    >
      {label}
      {count !== undefined && <span className="font-medium tabular-nums">{count}</span>}
    </button>
  );
}
