/**
 * The wallet transactions filter row: search, then Side, a date range and
 * (when the caller passes stations) a Station pick in the funnel. Shared by
 * the personal panel in Market History and the corp wallet's Transactions
 * tab, which filter the same fields of the same ESI shape.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DateRangeFields,
  FilterBar,
  FilterField,
  MultiSelect,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type MultiSelectOption,
} from '@/components/ui';
import {
  activeWalletTransactionFilters,
  type TransactionSide,
  type WalletTransactionFilter,
} from './walletTransactionFilter';

/** Radix needs a value here, and `''` reads to it as "nothing selected". */
const SIDE_OPTIONS: readonly TransactionSide[] = ['all', 'buy', 'sell'];

const SIDE_LABEL: Record<TransactionSide, string> = {
  all: 'wallet.sideFilterAll',
  buy: 'wallet.buy',
  sell: 'wallet.sell',
};

export function TransactionsFilterBar({
  filter,
  onChange,
  actions,
  stationOptions,
  resultCount,
}: {
  filter: WalletTransactionFilter;
  onChange: (filter: WalletTransactionFilter) => void;
  /** The column picker, inline between the search box and the funnel. */
  actions?: ReactNode;
  /** Transactions the filter leaves, for the phone sheet's done button. */
  resultCount?: number;
  /**
   * The stations to pick from. Market History passes them for its Station
   * filter; the corp wallet doesn't, and gets no such field.
   */
  stationOptions?: readonly MultiSelectOption<number>[];
}) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      active={activeWalletTransactionFilters(filter, t, stationOptions)}
      resultCount={resultCount}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('wallet.transactionsSearchPlaceholder')}
          className="min-w-28 flex-1"
        />
      }
      actions={actions}
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('wallet.sideFilterLabel')}>
            <Select
              value={draft.side}
              onValueChange={(value) => setDraft({ ...draft, side: value as TransactionSide })}
            >
              <SelectTrigger
                active={draft.side !== 'all'}
                aria-label={t('wallet.sideFilterLabel')}
                className="w-32"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIDE_OPTIONS.map((side) => (
                  <SelectItem key={side} value={side}>
                    {t(SIDE_LABEL[side])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <DateRangeFields
            from={draft.startDate}
            to={draft.endDate}
            onFromChange={(value) => setDraft({ ...draft, startDate: value })}
            onToChange={(value) => setDraft({ ...draft, endDate: value })}
            fromLabel={t('wallet.dateFromLabel')}
            toLabel={t('wallet.dateToLabel')}
          />
          {stationOptions && (
            <FilterField label={t('wallet.stationsFilterLabel')}>
              <MultiSelect<number>
                label={t('wallet.stationsFilterLabel')}
                triggerLabel={
                  draft.stations.length === 0
                    ? t('wallet.stationsAll')
                    : t('wallet.stationsFilterLabel')
                }
                summary={
                  draft.stations.length === 0
                    ? undefined
                    : `${draft.stations.length} / ${stationOptions.length}`
                }
                searchPlaceholder={t('wallet.stationsSearchPlaceholder')}
                noResultsLabel={t('wallet.stationsNoResults')}
                options={stationOptions}
                selected={new Set(draft.stations)}
                onToggle={(id) =>
                  setDraft({
                    ...draft,
                    stations: draft.stations.includes(id)
                      ? draft.stations.filter((station) => station !== id)
                      : [...draft.stations, id].sort((a, b) => a - b),
                  })
                }
                active={draft.stations.length > 0}
                className="w-44"
              />
            </FilterField>
          )}
        </>
      )}
    </FilterBar>
  );
}
