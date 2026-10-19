import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBar, FilterChip, SearchInput } from '@/components/ui';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import {
  activeContractsFilterCount,
  type ContractsFilter,
} from '@/features/character/contractsFilter';
import type { Contract } from '@/esi/endpoints';

interface ContractsFilterBarProps {
  filter: ContractsFilter;
  onChange: (filter: ContractsFilter) => void;
  statusOptions: Contract['status'][];
  typeOptions: Contract['type'][];
  /** The History table's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
}

/** Search plus status/type filter chips above the contracts table (issue #417). */
export function ContractsFilterBar({
  filter,
  onChange,
  statusOptions,
  typeOptions,
  actions,
}: ContractsFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeContractsFilterCount(filter)}
      triggerLabel
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
        </>
      )}
    </FilterBar>
  );
}
