/**
 * The Market History "By station" view's grouping rules.
 *
 * Pure: no fetch, no DOM. A group is every fill at one `location_id`; the
 * header totals come from `summarizeTransactions`, and this module only says
 * which fills share a group and in what order the groups sit.
 */
import type { WalletTransactionCommon } from '@/esi/endpoints';
import type { StationOrder } from '@/features/character/walletTransactionFilter';
import { summarizeTransactions } from './transactionDays';

export type { StationOrder };
type StationFill = Pick<
  WalletTransactionCommon,
  'transaction_id' | 'date' | 'is_buy' | 'quantity' | 'unit_price' | 'location_id'
>;

/** The `DataTable` group key of a fill: its station or structure id. */
export function stationGroupKey(fill: Pick<StationFill, 'location_id'>): string {
  return String(fill.location_id);
}

/** The distinct location ids in `fills`, ascending: the Station filter's option list. */
export function distinctLocationIds(fills: readonly Pick<StationFill, 'location_id'>[]): number[] {
  return [...new Set(fills.map((fill) => fill.location_id))].sort((a, b) => a - b);
}

/**
 * Orders two station groups for the "Stations by" picker. Net and Trades rank
 * highest first; every tie falls back to the station's name, so the order is
 * the same on every render and for every equal pair.
 */
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
        : summarizeTransactions(b).net - summarizeTransactions(a).net;
    return diff !== 0 ? diff : byName(a, b);
  };
}
