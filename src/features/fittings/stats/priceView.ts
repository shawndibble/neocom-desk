import type { Appraisal } from '@/engine/market/appraisal';
import { unpricedSellRows } from '../fittingPrice';

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

export type PriceView = ReturnType<typeof priceView> & {
  named: NonNullable<ReturnType<typeof priceView>['named']>;
};
