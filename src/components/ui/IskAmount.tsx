import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { Tooltip } from './Tooltip';

/**
 * How a touch reader gets the exact value. `longPress` wherever the tap
 * already does something — a table row that opens a detail view owns its tap,
 * and taking it would break the row. `tap` where the figure is inert.
 * No default: the two surfaces look identical in JSX, so the call site says
 * which one it is.
 */
export type IskRevealGesture = 'tap' | 'longPress';

interface IskAmountProps {
  value: number;
  /** Reveal gesture for touch — see `IskRevealGesture`. */
  revealOn: IskRevealGesture;
  /** Precision of the revealed exact figure. 2 matches Wallet/Contracts; pass 0 for whole-ISK surfaces. */
  decimals?: number;
  /** Extra classes on the trigger, e.g. a tone or `tabular-nums` alignment from the cell. */
  className?: string;
}

/**
 * An ISK figure shown as shorthand ("1.3B") with the exact value one gesture
 * away — hover, keyboard focus, or touch. Shorthand is a display treatment
 * only: clipboard/CSV output keeps reading the underlying number rather than
 * anything rendered here.
 *
 * A screen reader gets both figures as real text — the shorthand it sees on
 * screen, then the exact value in visually hidden text — with no gesture at
 * all. Not an `aria-label`: the trigger is a plain `<span>`, and ARIA forbids
 * naming an element with no role, so many readers drop such a label and,
 * with the shorthand hidden, read an empty cell.
 *
 * It stays a tab stop. The tooltip is the only way a sighted keyboard user
 * reaches the exact figure, and `Tooltip` reveals on focus, so a figure that
 * cannot take focus would hide that value from the keyboard entirely.
 *
 * Shorthand rounds to one fraction digit, so two different values can render
 * the same string. That is the trade a scanning surface makes, and it is why
 * a sorted column must sort on the underlying value (`DataTable`'s
 * `sortValue`), never on this text. Ledgers and editable fields keep full
 * precision instead — see `docs/context/decisions/` for the rule.
 */
export function IskAmount({ value, revealOn, decimals = 2, className = '' }: IskAmountProps) {
  const { t } = useTranslation();
  const exact = t('common.iskExact', { amount: formatIsk(value, decimals) });
  return (
    <Tooltip content={exact} openOnTap={revealOn === 'tap'}>
      <span
        tabIndex={0}
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
