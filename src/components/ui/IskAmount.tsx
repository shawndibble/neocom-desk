import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { Tooltip } from './Tooltip';
import { IskTabStopContext, RowTappableContext } from './tooltipHold';

interface IskAmountProps {
  value: number;
  /**
   * @deprecated Ignored: every figure is tap-reveal except inside a tappable
   * row (`RowTappableContext`). Kept only so the Planetary Industry call sites,
   * which are being overhauled separately, still compile. Remove with them.
   */
  revealOn?: 'tap';
  /** Precision of the revealed exact figure. 2 matches Wallet/Contracts; pass 0 for whole-ISK surfaces. */
  decimals?: number;
  /** Extra classes on the trigger, e.g. a tone or `tabular-nums` alignment from the cell. */
  className?: string;
}

/**
 * An ISK figure shown as shorthand ("1.3B") with the exact value one gesture
 * away — hover, keyboard focus, or a tap. Inside a tappable row (a clickable
 * `DataTable` row, via `RowTappableContext`) the tap belongs to the row and
 * opens it; the exact figure is in the row's detail, and hover and focus still
 * show the bubble. A touch-and-hold never reveals it: inside a row menu it is
 * the menu's, and elsewhere a tap does the job. Shorthand is a display treatment
 * only: clipboard/CSV output keeps reading the underlying number rather than
 * anything rendered here.
 *
 * A screen reader gets both figures as real text — the shorthand it sees on
 * screen, then the exact value in visually hidden text — with no gesture at
 * all. Not an `aria-label`: the trigger is a plain `<span>`, and ARIA forbids
 * naming an element with no role, so many readers drop such a label and,
 * with the shorthand hidden, read an empty cell.
 *
 * It stays a tab stop, unless a dense surface that already has one
 * stop per row turns it off with `IskTabStopContext` (the PI Plan): there the
 * exact figure is still read aloud and still shows on hover or tap. The tooltip is the only way a sighted keyboard user
 * reaches the exact figure, and `Tooltip` reveals on focus, so a figure that
 * cannot take focus would hide that value from the keyboard entirely.
 *
 * Shorthand rounds to one fraction digit, so two different values can render
 * the same string. That is the trade a scanning surface makes, and it is why
 * a sorted column must sort on the underlying value (`DataTable`'s
 * `sortValue`), never on this text. Ledgers and editable fields keep full
 * precision instead — see `docs/context/decisions/` for the rule.
 */
export function IskAmount({ value, decimals = 2, className = '' }: IskAmountProps) {
  const { t } = useTranslation();
  // Inside a clickable row the tap opens the row, whose detail carries the exact figure.
  const rowTappable = useContext(RowTappableContext);
  const tabStop = useContext(IskTabStopContext);
  const exact = t('common.iskExact', { amount: formatIsk(value, decimals) });
  return (
    <Tooltip content={exact} openOnTap={!rowTappable}>
      <span
        tabIndex={tabStop ? 0 : undefined}
        className={cx(
          'cursor-help rounded-xs focus-visible:outline-2 focus-visible:outline-accent',
          className
        )}
      >
        {formatIskCompact(value)}
        {/* The separating space lives inside the hidden text, so no visible gap trails the figure. */}
        <span className="sr-only"> {exact}</span>
      </span>
    </Tooltip>
  );
}
