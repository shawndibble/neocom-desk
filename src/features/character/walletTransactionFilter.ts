import type { TFunction } from 'i18next';
import { activeDateRangeFilters, summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import {
  defineUrlFilter,
  enumParam,
  idListParam,
  nullableTextParam,
  textParam,
} from '@/lib/urlState';

export type TransactionSide = 'all' | 'buy' | 'sell';

export type TransactionView = 'flat' | 'station';

export type StationOrder = 'recent' | 'net' | 'name' | 'trades';

export interface WalletTransactionFilter {
  side: TransactionSide;
  startDate: string | null;
  endDate: string | null;
  text: string;
  stations: readonly number[];
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
  stationsBy: 'recent',
};

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
    codec: enumParam<StationOrder>(['recent', 'net', 'name', 'trades'], 'recent'),
  },
});

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
    const day = txn.date.slice(0, 10);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    if (text !== '' && !nameFor(txn.type_id).toLowerCase().includes(text)) return false;
    return true;
  });
}

export function activeWalletTransactionFilters(
  filter: WalletTransactionFilter,
  t: TFunction,
  stationOptions?: readonly { id: number; label: string }[]
): ActiveFilter<WalletTransactionFilter>[] {
  const active: ActiveFilter<WalletTransactionFilter>[] = [];
  if (filter.side !== 'all')
    active.push({
      label: t('wallet.sideFilterLabel'),
      value: t(filter.side === 'buy' ? 'wallet.buy' : 'wallet.sell'),
      clear: (value) => ({ ...value, side: 'all' }),
    });
  active.push(
    ...activeDateRangeFilters(filter, t, {
      from: t('wallet.dateFromLabel'),
      to: t('wallet.dateToLabel'),
    })
  );
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
