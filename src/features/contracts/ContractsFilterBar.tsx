import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBar, FilterChip, FilterField, SearchInput } from '@/components/ui';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import { activeContractsFilters, type ContractsFilter } from '@/features/character/contractsFilter';
import type { Contract } from '@/esi/endpoints';
import { useIsPhone } from '@/lib/useIsPhone';

interface ContractsFilterBarProps {
  filter: ContractsFilter;
  onChange: (filter: ContractsFilter) => void;
  statusOptions: Contract['status'][];
  typeOptions: Contract['type'][];
  /** The History table's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
  /** Rows the filter leaves, for the phone sheet's done button. */
  resultCount?: number;
}

/** Search plus status/type filter chips above the contracts table (issue #417). */
export function ContractsFilterBar({
  filter,
  onChange,
  statusOptions,
  typeOptions,
  actions,
  resultCount,
}: ContractsFilterBarProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const statusLabel = t('contracts.statusFilterLabel');
  // On a phone the status chips sit in their own row under the bar
  // (`ContractsHistoryTable`), which already shows the pick and changes it in
  // one tap; a status pill there would be the same setting twice. Left out
  // of the badge and Clear all too, the way the order book's inline Jump
  // Range is (`OrderBookScopeBar`).
  const active = activeContractsFilters(filter, t).filter(
    (entry) => !isPhone || entry.label !== statusLabel
  );
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      active={active}
      resultCount={resultCount}
      actions={actions}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contracts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('contracts.statusFilterLabel')} stretch={false}>
            <div
              role="group"
              aria-label={t('contracts.statusFilterLabel')}
              className="flex flex-wrap gap-2"
            >
              {statusOptions.map((status) => (
                <FilterChip
                  key={status}
                  label={t(CONTRACT_STATUS_KEY[status])}
                  selected={draft.status === status}
                  onToggle={() =>
                    setDraft({ ...draft, status: draft.status === status ? null : status })
                  }
                />
              ))}
            </div>
          </FilterField>
          <FilterField label={t('contracts.typeFilterLabel')} stretch={false}>
            <div
              role="group"
              aria-label={t('contracts.typeFilterLabel')}
              className="flex flex-wrap gap-2"
            >
              {typeOptions.map((type) => (
                <FilterChip
                  key={type}
                  label={t(CONTRACT_TYPE_KEY[type])}
                  selected={draft.type === type}
                  onToggle={() => setDraft({ ...draft, type: draft.type === type ? null : type })}
                />
              ))}
            </div>
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}
