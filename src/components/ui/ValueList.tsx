import { createContext, useContext, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { STAT_CHIP_TONE_TEXT_CLASS, type StatChipTone } from './statChipTone';

type ValueListVariant = 'divided' | 'plain';

const VariantContext = createContext<ValueListVariant>('divided');

interface ValueListProps {
  /** `divided`: a hairline between rows, roomy (a panel's main list). `plain`: tight, no lines (a sub-list under it). */
  variant?: ValueListVariant;
  className?: string;
  children: ReactNode;
}

/**
 * A short list of labelled figures, one per line: the label at the start, the
 * value at the end. For a handful of facts about one thing (what is parked in
 * orders, how sell orders split by health); a list of many comparable items
 * is a `DataTable`, a row of headline figures is `StatChips`.
 *
 * @summary A short list of label-and-value rows, value at the line's end.
 */
export function ValueList({ variant = 'divided', className, children }: ValueListProps) {
  return (
    <VariantContext.Provider value={variant}>
      <dl
        className={cx(
          'text-sm',
          variant === 'divided' ? 'divide-y divide-line' : 'space-y-1',
          className
        )}
      >
        {children}
      </dl>
    </VariantContext.Provider>
  );
}

interface ValueRowProps {
  /** @summary What the figure is. */
  label: ReactNode;
  /** @summary The figure, usually an `IskAmount`. Right-aligned, tabular. */
  value: ReactNode;
  /** @summary A dim aside after the label ("3 orders"). */
  note?: ReactNode;
  /** @summary Colour of the value: `default`, or a status tone. */
  tone?: StatChipTone;
}

/** One line of a `ValueList`. */
export function ValueRow({ label, value, note, tone = 'default' }: ValueRowProps) {
  const variant = useContext(VariantContext);
  return (
    <div
      className={cx(
        'flex items-baseline justify-between gap-3',
        variant === 'divided' && 'py-2 first:pt-0 last:pb-0'
      )}
    >
      <dt className="min-w-0">
        {label}
        {note !== undefined && note !== null && <span className="ml-1 text-text-dim">{note}</span>}
      </dt>
      <dd className={cx('shrink-0 tabular-nums', STAT_CHIP_TONE_TEXT_CLASS[tone])}>{value}</dd>
    </div>
  );
}
