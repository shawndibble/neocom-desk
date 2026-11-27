import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DateRangeFields,
  FilterBar,
  FilterField,
  MultiSelect,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type MultiSelectOption,
} from '@/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';
import {
  activeWalletTransactionFilters,
  type TransactionSide,
  type WalletTransactionFilter,
} from './walletTransactionFilter';

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
  actions?: ReactNode;
  resultCount?: number;
  stationOptions?: readonly MultiSelectOption<number>[];
}) {
  const { t } = useTranslation();
  const isNarrow = useIsNarrow();
  const viewSwitch = (
    value: WalletTransactionFilter,
    set: (next: WalletTransactionFilter) => void
  ) => (
    <SegmentedControl
      label={t('wallet.viewLabel')}
      uppercase={false}
      options={[
        { value: 'flat', label: t('wallet.viewFlat') },
        { value: 'station', label: t('wallet.viewByStation') },
      ]}
      value={value.view}
      onChange={(view) => set({ ...value, view })}
    />
  );
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
      actions={
        <>
          {!isNarrow && viewSwitch(filter, onChange)}
          {actions}
        </>
      }
    >
      {(draft, setDraft) => (
        <>
          {isNarrow && (
            <FilterField label={t('wallet.viewLabel')}>{viewSwitch(draft, setDraft)}</FilterField>
          )}
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
