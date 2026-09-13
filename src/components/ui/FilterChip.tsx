import { cx } from '@/lib/cx';
import { controlHeightClassName, type ControlSize } from './controlStyles';
import { Tooltip } from './Tooltip';

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
   * Director role) rather than one that is merely off. Pair with `tooltip`
   * explaining why; this component only renders the state.
   *
   * With a `tooltip` it reports `aria-disabled` rather than the native
   * attribute, which takes neither hover nor focus — and so would leave the
   * explanation unreadable by either route.
   */
  disabled?: boolean;
  /**
   * Plain-language explanation of what the filter does, revealed on hover or
   * focus. For a chip whose label cannot state its whole rule — which rows it
   * removes, or which ones it deliberately leaves.
   *
   * A description, never a name: Radix wires it as `aria-describedby`, so the
   * visible label still is the accessible name (WCAG 2.5.3). Rendered here
   * rather than by the caller because the trigger Radix needs is this
   * component's own `<button>` — `FilterChip` forwards neither ref nor props,
   * so a caller-side `Tooltip` would have nothing to attach to.
   */
  tooltip?: string;
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
  tooltip,
}: FilterChipProps) {
  const hasGloss = countLabel !== undefined;
  /*
   * A chip with a reason to give stays hoverable and focusable so the bubble
   * can be read; one with no tooltip keeps the native attribute. Either way
   * the click does nothing.
   */
  const explained = disabled && tooltip !== undefined;
  const chip = (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled && !explained}
      aria-disabled={explained || undefined}
      onClick={explained ? undefined : onToggle}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xs border px-2.5 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 aria-disabled:cursor-default aria-disabled:opacity-40',
        controlHeightClassName[size],
        selected
          ? 'border-accent-dim bg-accent/15 text-accent'
          : 'border-line bg-panel-2 text-text-dim',
        // No hover affordance on a chip that cannot be toggled.
        !selected && !explained && 'hover:border-line-bright hover:text-text',
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

  // No `openOnTap`: the tap toggles the filter, so it belongs to that action
  // and touch-and-hold stays the way to read the bubble (docs/DESIGN.md §
  // `Tooltip`).
  return tooltip ? <Tooltip content={tooltip}>{chip}</Tooltip> : chip;
}
