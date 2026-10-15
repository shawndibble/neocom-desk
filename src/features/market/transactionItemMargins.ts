import type { RealizedMargin } from '@/engine/market/realizedMargin';
import type { WalletTransaction } from '@/esi/endpoints';

export interface ItemMarginRow {
  typeId: number;
  fills: number;
  unitsSold: number;
  /** Sum of the Margin column over the item's sells; null when any sell is uncovered or there are none. */
  margin: number | null;
}

type Fill = Pick<WalletTransaction, 'transaction_id' | 'type_id' | 'is_buy' | 'quantity'>;

/** Rolls the per-fill Margin up by item; adds no accounting of its own. */
export function rollupMarginsByItem(
  rows: readonly Fill[],
  margins: ReadonlyMap<number, RealizedMargin>
): ItemMarginRow[] {
  const byItem = new Map<number, ItemMarginRow & { uncovered: boolean; total: number }>();
  for (const row of rows) {
    let item = byItem.get(row.type_id);
    if (!item) {
      item = {
        typeId: row.type_id,
        fills: 0,
        unitsSold: 0,
        margin: null,
        uncovered: false,
        total: 0,
      };
      byItem.set(row.type_id, item);
    }
    item.fills += 1;
    if (row.is_buy) continue;
    item.unitsSold += row.quantity;
    const margin = margins.get(row.transaction_id);
    if (margin) item.total += margin.margin;
    else item.uncovered = true;
  }
  return [...byItem.values()].map(({ typeId, fills, unitsSold, uncovered, total }) => ({
    typeId,
    fills,
    unitsSold,
    margin: unitsSold > 0 && !uncovered ? total : null,
  }));
}

/** Items with a margin first, best or worst first; the rest follow unranked. */
export function rankItemMargins(
  rows: readonly ItemMarginRow[],
  order: 'best' | 'worst'
): ItemMarginRow[] {
  const sign = order === 'best' ? -1 : 1;
  const ranked = rows.filter((r) => r.margin !== null);
  const unranked = rows.filter((r) => r.margin === null);
  ranked.sort((a, b) => sign * ((a.margin as number) - (b.margin as number)));
  return [...ranked, ...unranked];
}
