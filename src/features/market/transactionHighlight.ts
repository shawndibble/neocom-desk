import type { WalletTransactionCommon } from '@/esi/endpoints';

export { parsePositiveInt as parseHighlightTypeId } from '@/engine/market/urlState';

export type HighlightableTransaction = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'type_id' | 'is_buy' | 'date'
>;

export function highlightedTransactionId(
  rows: readonly HighlightableTransaction[],
  typeId: number | null
): number | null {
  if (typeId === null) return null;
  let best: HighlightableTransaction | null = null;
  for (const row of rows) {
    if (row.is_buy || row.type_id !== typeId) continue;
    if (
      best === null ||
      row.date > best.date ||
      (row.date === best.date && row.transaction_id > best.transaction_id)
    ) {
      best = row;
    }
  }
  return best?.transaction_id ?? null;
}
