import { cx } from '@/lib/cx';

interface FilterChipProps {
  /** Already-translated label. */
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Optional match count, shown after the label. */
  count?: number;
  className?: string;
}

/** Toggleable filter pill. StatChip's dimensions, but interactive: accent when on. */
export function FilterChip({ label, selected, onToggle, count, className = '' }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
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
