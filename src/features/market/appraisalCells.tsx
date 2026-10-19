import type { ReactElement, ReactNode } from 'react';
import { IskAmount } from '@/components/ui';
import { refineBeatsSellAsIs, type AppraisalRow } from '@/engine/market/appraisal';
import { formatIskAuto } from '@/lib/isk';

/**
 * A per-unit price, exact. A missing price is a dash, never a zero — the house
 * placeholder. Stays on `formatIskAuto` rather than shorthand: an each-price
 * runs from a 5 ISK mineral to a billion-ISK hull, and compact notation rounds
 * the cheap end (4.99 and 5.01 both render "5") into nonsense.
 */
export function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

/** A line or hub total as scannable shorthand, exact value one gesture away. */
export function totalCell(value: number | null): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} decimals={0} />;
}

/** Refine wins only because the leftover units sell on top; the refine total alone is below buy total. */
export function leftoverTipsRefine(row: AppraisalRow) {
  return (
    refineBeatsSellAsIs(row) &&
    (row.refineUnitsLeftOver ?? 0) > 0 &&
    row.refineTotal !== undefined &&
    row.buyTotal !== null &&
    row.refineTotal <= row.buyTotal
  );
}

/** Bolds a total only when it actually won a real comparison — never on a row with nothing to compare against. */
export function comparisonCell(
  total: ReactNode,
  highlighted: boolean,
  suffix?: ReactElement | false,
  prefix?: ReactElement | false
) {
  return (
    <span className={highlighted ? 'font-semibold text-isk-pos' : undefined}>
      {prefix}
      {total}
      {suffix}
    </span>
  );
}
