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
   *
   * Optional, so a `count` can still ship without one — but a bare figure in an
   * accessible name says "Corp, 2" and never what the 2 counts, so a new
   * `count` should pass this. The chips that predate it (Contacts, CorpRoster,
   * Open Orders) do not yet, and are worth a follow-up.
   */
  countLabel?: string;
  className?: string;
  /** `sm` (default) matches every existing toolbar; `md` lines up with a `SearchInput`/`NativeSelect` left at their own default size. */
  size?: ControlSize;
  /**
   * Inert and muted, same as a disabled `Button` — for a toggle whose
   * capability isn't available right now (e.g. Corp Assets without the
   * Director role) rather than one that is merely off. Pair with a tooltip on
   * the caller's side explaining why; this component only renders the state.
   */
  disabled?: boolean;
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
  disabled = false,
}: FilterChipProps) {
  const hasGloss = countLabel !== undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40',
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
          {/* A real space text node, and only when a gloss follows: a CSS gap
              is not a word separator, and leading whitespace inside an element
              is trimmed away by the accessible name algorithm — both leave the
              name running together as "Corp2 unread". Flexbox drops
              whitespace-only children, so it costs nothing visually. Scoped to
              the `countLabel` case so a plain match count's name is exactly
              what it has always been. */}
          {hasGloss && ' '}
          <span aria-hidden={hasGloss} className="font-medium tabular-nums">
            {count}
          </span>
          {hasGloss && <span className="sr-only">{countLabel}</span>}
        </>
      )}
    </button>
  );
}
