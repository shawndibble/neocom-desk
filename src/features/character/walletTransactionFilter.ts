/**
 * The filter behind the corp wallet's Transactions tab (issue #570).
 *
 * A sibling of `walletJournalFilter.ts`, deliberately the same shape — the two
 * bars sit one tab apart and a manager should not have to learn two idioms.
 * The one real difference is what free text searches. A journal line carries
 * its own `description`, so its filter is self-contained; a transaction carries
 * only a `type_id`, so this one has to be told how the view spells that id.
 *
 * Lives beside the character filter rather than in `src/engine` for the same
 * reason that one does: it is view state for one panel, not a rule about EVE.
 * It stays pure regardless, and its tests are the specification.
 */
import type { TFunction } from 'i18next';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import {
  defineUrlFilter,
  enumParam,
  idListParam,
  nullableTextParam,
  textParam,
} from '@/lib/urlState';
import { activeDateRangeFilters } from './dateRangeActiveFilters';

/** Buy, sell, or don't care. */
export type TransactionSide = 'all' | 'buy' | 'sell';

/** Market History's transaction views: the flat list, or one group per station. */
export type TransactionView = 'flat' | 'station';

/** What the By station view ranks its groups on (the "Stations by" picker). */
export type StationOrder = 'net' | 'name' | 'trades';

export interface WalletTransactionFilter {
  side: TransactionSide;
  /** Inclusive `YYYY-MM-DD`, compared against the row's own date prefix. */
  startDate: string | null;
  /** Inclusive `YYYY-MM-DD`. */
  endDate: string | null;
  text: string;
  /** Location ids to keep; empty is every station. The corp bar has no field for it. */
  stations: readonly number[];
  /** Market's view picker. Arranges rather than narrows; the corp wallet leaves it flat. */
  view: TransactionView;
  stationsBy: StationOrder;
}

export const EMPTY_WALLET_TRANSACTION_FILTER: WalletTransactionFilter = {
  side: 'all',
  startDate: null,
  endDate: null,
  text: '',
  stations: [],
  view: 'flat',
  stationsBy: 'net',
};

/** The corp Transactions filter bar's fields in the URL (issue #570, #1302), scoped `txn.`. */
export const {
  schema: TRANSACTION_FILTER_PARAMS,
  fieldToParam: TRANSACTION_FIELD_TO_PARAM,
  emptyParams: EMPTY_TRANSACTION_FILTER_PARAMS,
} = defineUrlFilter<WalletTransactionFilter>({
  side: { key: 'txn.side', codec: enumParam<TransactionSide>(['all', 'buy', 'sell'], 'all') },
  startDate: { key: 'txn.start', codec: nullableTextParam() },
  endDate: { key: 'txn.end', codec: nullableTextParam() },
  text: { key: 'txn.q', codec: textParam() },
  stations: { key: 'txn.stations', codec: idListParam() },
  view: { key: 'txn.view', codec: enumParam<TransactionView>(['flat', 'station'], 'flat') },
  stationsBy: {
    key: 'txn.stationsBy',
    codec: enumParam<StationOrder>(['net', 'name', 'trades'], 'net'),
  },
});

/**
 * The rows this filter keeps, in the order they arrived.
 *
 * `nameFor` is the *same* function the table's item column renders with, and
 * that is the contract rather than a convenience: a `type_id` whose name never
 * resolved is drawn as `Type #99999`, so searching for `99999` has to find it.
 * Handing the filter its own name map would let a pending resolve quietly
 * remove rows the eye can see, which is the one failure mode a search box
 * must not have.
 */
export function filterWalletTransactions<T extends WalletTransactionCommon>(
  transactions: readonly T[],
  filter: WalletTransactionFilter,
  nameFor: (typeId: number) => string
): T[] {
  const text = filter.text.trim().toLowerCase();
  const stations = filter.stations.length > 0 ? new Set(filter.stations) : null;
  return transactions.filter((txn) => {
    if (stations && !stations.has(txn.location_id)) return false;
    if (filter.side === 'buy' && !txn.is_buy) return false;
    if (filter.side === 'sell' && txn.is_buy) return false;
    // ESI dates are ISO-8601 in UTC, so the first ten characters are the day
    // and a string compare is a date compare — the same trick the journal's
    // own range uses.
    const day = txn.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (text !== '' && !nameFor(txn.type_id).toLowerCase().includes(text)) return false;
    return true;
  });
}

/**
 * The filters set away from their default, as `FilterBar` pills: side, the
 * date ends, then the stations.
 *
 * Text is left out on purpose: its box stays on screen at every width, so it
 * already says what it holds. So are the view and station order, which arrange
 * the rows rather than narrow them.
 */
export function activeWalletTransactionFilters(
  filter: WalletTransactionFilter,
  t: TFunction,
  /** Names the picked stations; absent on the corp bar, which has no Stations field. */
  stationOptions?: readonly { id: number; label: string }[]
): ActiveFilter<WalletTransactionFilter>[] {
  const active: ActiveFilter<WalletTransactionFilter>[] = [];
  if (filter.side !== 'all')
    active.push({
      label: t('wallet.sideFilterLabel'),
      value: t(filter.side === 'buy' ? 'wallet.buy' : 'wallet.sell'),
      clear: (value) => ({ ...value, side: 'all' }),
    });
  active.push(...activeDateRangeFilters(filter, t));
  if (filter.stations.length > 0)
    active.push({
      label: t('wallet.stationsFilterLabel'),
      value: summarizeFilterValues(
        filter.stations.map(
          (id) => stationOptions?.find((option) => option.id === id)?.label ?? `#${id}`
        ),
        t
      ),
      clear: (value) => ({ ...value, stations: [] }),
    });
  return active;
}
