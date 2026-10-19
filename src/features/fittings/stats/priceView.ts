import type { Appraisal } from '@/engine/market/appraisal';
import { unpricedSellRows } from '../fittingPrice';

/**
 * What the Price section reads off an appraisal. The price loader names each
 * row by its bare typeId; the section and its breakdown read (and the
 * multibuy pastes) the item's real name. A fit with nothing sell-priced totals
 * 0 — that's "unknown", not a free ship, so the section shows a dash.
 */
export function priceView(price: Appraisal | null, typeName: (typeId: number) => string) {
  const named =
    price === null
      ? null
      : { ...price, rows: price.rows.map((row) => ({ ...row, name: typeName(row.typeId) })) };
  return {
    named,
    nothingPriced: price !== null && price.totals.sell === 0,
    unpriced: named === null ? [] : unpricedSellRows(named.rows),
  };
}

/** A `priceView` with an appraisal in hand. */
export type PriceView = ReturnType<typeof priceView> & {
  named: NonNullable<ReturnType<typeof priceView>['named']>;
};
