import { cx } from '@/lib/cx';
import { controlHeightClassName, type ControlSize } from './controlStyles';

interface FilterChipProps {
  /** Already-translated label. */
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Optional match count, shown after the label. */
  count?: number;
  /**
   * Screen-reader gloss for `count`, e.g. "3 unread". It *replaces* the bare
   * numeral in the accessible name — the digit is hidden from assistive tech
   * and this is announced in its place — so the name reads "Inbox 3 unread"
   * rather than the bare "Inbox 3" a naked figure gives, and not the doubled
   * "Inbox 3 3 unread" that appending it would.
   *
   * An addition rather than an `aria-label` override on purpose: WCAG 2.5.3
   * wants the visible word to survive inside the accessible name, and a label
   * override is the usual way that gets broken.
   */
  countLabel?: string;
  className?: string;
  /** `sm` (default) matches every existing toolbar; `md` lines up with a `SearchInput`/`NativeSelect` left at their own default size. */
  size?: ControlSize;
}

/**
 * Toggleable filter pill. `StatChip`'s look, but interactive: accent when on,
 * and sized from the shared control scale so it lines up with the `Button` and
 * `Select` it shares a toolbar with — including the touch tier, which a
 * readout chip does not get.
 */
export function FilterChip({
  label,
  selected,
  onToggle,
  count,
  countLabel,
  className = '',
  size = 'sm',
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        controlHeightClassName[size],
        selected
          ? 'border-accent-dim bg-accent/15 text-accent'
          : 'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text',
        className
      )}
    >
      {label}
      {count !== undefined && (
        <>
          {/* A real space text node, not the flex `gap` and not a space inside
              the span below: a CSS gap is not a word separator, and leading
              whitespace inside an element is trimmed away by the accessible
              name algorithm — both leave the name running together as
              "Corp2 unread". Flexbox drops whitespace-only children, so this
              costs nothing visually. */}{' '}
          <span aria-hidden={countLabel !== undefined} className="font-medium tabular-nums">
            {count}
          </span>
          {countLabel !== undefined && <span className="sr-only">{countLabel}</span>}
        </>
      )}
    </button>
  );
}
