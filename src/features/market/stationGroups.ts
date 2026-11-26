import type { WalletTransactionCommon } from '@/esi/endpoints';
import type { StationOrder } from '@/features/character/walletTransactionFilter';
import { summarizeTransactions } from './transactionDays';

type StationFill = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'date' | 'is_buy' | 'quantity' | 'unit_price' | 'location_id'
>;

export function stationGroupKey(fill: Pick<StationFill, 'location_id'>): string {
  return String(fill.location_id);
}

export function distinctLocationIds(fills: readonly Pick<StationFill, 'location_id'>[]): number[] {
  return [...new Set(fills.map((fill) => fill.location_id))].sort((a, b) => a - b);
}

const newestMs = (fills: readonly StationFill[]) =>
  fills.reduce((newest, fill) => Math.max(newest, Date.parse(fill.date) || 0), 0);

export function compareStationGroups(
  order: StationOrder,
  nameOf: (locationId: number) => string
): (a: readonly StationFill[], b: readonly StationFill[]) => number {
  const byName = (a: readonly StationFill[], b: readonly StationFill[]) =>
    nameOf(a[0]!.location_id).localeCompare(nameOf(b[0]!.location_id));
  return (a, b) => {
    if (order === 'name') return byName(a, b);
    const diff =
      order === 'trades'
        ? b.length - a.length
        : order === 'recent'
          ? newestMs(b) - newestMs(a)
          : summarizeTransactions(b).net - summarizeTransactions(a).net;
    return diff !== 0 ? diff : byName(a, b);
  };
}
