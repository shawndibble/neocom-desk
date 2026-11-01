import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { toggleInSet } from '@/lib/sets';
import type { BuildGroup } from './buildGroups';
import {
  GROUP_ANY,
  GROUP_NONE,
  PLAN_ACTIVITIES,
  PLAN_OWNERSHIPS,
  PLAN_VERDICTS,
  activePlanFilterCount,
  type BuildPlanFilterState,
} from './buildPlanFilter';

interface BuildPlanFilterBarProps {
  filter: BuildPlanFilterState;
  onChange: (next: BuildPlanFilterState) => void;
  groups: readonly BuildGroup[];
  /** The blueprint picker: it stays in the row, the funnel sits beside it. */
  search: ReactNode;
  /** Whether a pilot is active; without one no blueprint can be "owned", so that control is hidden. */
  canFilterOwnership: boolean;
}

/** The Build Plan list's filters, behind the funnel beside the blueprint picker. */
export function BuildPlanFilterBar({
  filter,
  onChange,
  groups,
  search,
  canFilterOwnership,
}: BuildPlanFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      search={search}
      rowAlign="start"
      activeCount={activePlanFilterCount(filter)}
      title={t('industry.planFilters.title')}
    >
      {(draft, setDraft) => (
        <div className="grid w-full grid-cols-2 gap-3 lg:contents">
          {canFilterOwnership && (
            <FilterField captionInline label={t('industry.planFilters.ownership')}>
              <Select
                value={draft.ownership}
                onValueChange={(value) =>
                  setDraft({ ...draft, ownership: value as BuildPlanFilterState['ownership'] })
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t('industry.planFilters.ownership')}
                  className="w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OWNERSHIPS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`industry.planFilters.ownerships.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}
          <FilterField captionInline label={t('industry.planFilters.verdict')}>
            <CheckboxSelect
              label={t('industry.planFilters.verdict')}
              className="w-44"
              options={PLAN_VERDICTS.map((value) => ({
                value,
                label: t(`industry.planFilters.verdicts.${value}`),
              }))}
              selected={draft.verdicts}
              onToggle={(value) =>
                setDraft({ ...draft, verdicts: toggleInSet(draft.verdicts, value) })
              }
            />
          </FilterField>
          <FilterField captionInline label={t('industry.planFilters.activity')}>
            <Select
              value={draft.activity}
              onValueChange={(value) =>
                setDraft({ ...draft, activity: value as BuildPlanFilterState['activity'] })
              }
            >
              <SelectTrigger
                size="sm"
                aria-label={t('industry.planFilters.activity')}
                className="w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_ACTIVITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`industry.planFilters.activities.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          {groups.length > 0 && (
            <FilterField captionInline label={t('industry.planFilters.group')}>
              <Select
                value={draft.group}
                onValueChange={(value) => setDraft({ ...draft, group: value })}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t('industry.planFilters.group')}
                  className="w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GROUP_ANY}>{t('industry.planFilters.groupAny')}</SelectItem>
                  <SelectItem value={GROUP_NONE}>{t('industry.planFilters.groupNone')}</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}
          <FilterField captionInline label={t('industry.planFilters.profit')}>
            <FilterChip
              label={t('industry.planFilters.profitableOnly')}
              selected={draft.profitableOnly}
              onToggle={() => setDraft({ ...draft, profitableOnly: !draft.profitableOnly })}
            />
          </FilterField>
        </div>
      )}
    </FilterBar>
  );
}
