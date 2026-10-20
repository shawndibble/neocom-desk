import { useTranslation } from 'react-i18next';
import {
  FilterChip,
  FilterField,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { CharacterGroup, CharacterSortKey } from '@/features/character/groups';
import { UNGROUPED_VALUE } from '@/features/character/rosterQueueChip';
import {
  ALL_CORPS_VALUE,
  ALL_GROUPS_VALUE,
  QUEUE_FILTER_STATES,
  SORT_KEYS,
  type RosterFilter,
} from '@/features/character/useCharactersView';

interface CharactersFilterFieldsProps {
  draft: RosterFilter;
  setDraft: (next: RosterFilter) => void;
  corpOptions: readonly string[];
  /** Whether any Group exists: with none there is nothing to narrow to. */
  hasGroups: boolean;
  groupFilterOptions: readonly CharacterGroup[];
}

/** The Characters page's `FilterBar` panel: queue, corp, group, starred/alerts chips and sort. */
export function CharactersFilterFields({
  draft,
  setDraft,
  corpOptions,
  hasGroups,
  groupFilterOptions,
}: CharactersFilterFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        role="group"
        aria-label={t('characters.filterQueueLabel')}
        className="flex flex-wrap gap-2"
      >
        {QUEUE_FILTER_STATES.map((state) => (
          <FilterChip
            key={state}
            label={t(`characters.queueStates.${state}`)}
            selected={draft.queue === state}
            onToggle={() => setDraft({ ...draft, queue: draft.queue === state ? null : state })}
          />
        ))}
      </div>
      {/* One corp has nothing to narrow to — unless a link already set one, which must stay visible to be cleared. */}
      {(corpOptions.length > 1 || draft.corp !== null) && (
        <FilterField label={t('characters.filterCorpLabel')}>
          <Select
            value={draft.corp ?? ALL_CORPS_VALUE}
            onValueChange={(value) =>
              setDraft({ ...draft, corp: value === ALL_CORPS_VALUE ? null : value })
            }
          >
            <SelectTrigger size="sm" aria-label={t('characters.filterCorpLabel')} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CORPS_VALUE}>{t('characters.allCorporations')}</SelectItem>
              {corpOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}
      {/* No Groups yet has nothing to narrow to — same gate as the corp filter above. */}
      {hasGroups && (
        <FilterField label={t('characters.filterGroupLabel')}>
          <Select
            value={draft.group ?? ALL_GROUPS_VALUE}
            onValueChange={(value) =>
              setDraft({ ...draft, group: value === ALL_GROUPS_VALUE ? null : value })
            }
          >
            <SelectTrigger size="sm" aria-label={t('characters.filterGroupLabel')} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS_VALUE}>{t('characters.allGroups')}</SelectItem>
              <SelectItem value={UNGROUPED_VALUE}>{t('characters.ungrouped')}</SelectItem>
              {groupFilterOptions.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}
      <FilterChip
        label={t('characters.filterStarredOnly')}
        selected={draft.starredOnly}
        onToggle={() => setDraft({ ...draft, starredOnly: !draft.starredOnly })}
      />
      <FilterChip
        label={t('characters.filterHasAlerts')}
        selected={draft.alertsOnly}
        onToggle={() => setDraft({ ...draft, alertsOnly: !draft.alertsOnly })}
      />
      <FilterField label={t('characters.sortBy')}>
        <Select
          value={draft.sortKey}
          onValueChange={(value) => setDraft({ ...draft, sortKey: value as CharacterSortKey })}
        >
          <SelectTrigger size="sm" aria-label={t('characters.sortBy')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`characters.sortKeys.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
      <FilterField label={t('characters.sortDirection')} stretch={false}>
        <IconButton
          size="sm"
          icon={draft.sortDirection === 'asc' ? <Icon.Ascending /> : <Icon.Descending />}
          label={t(
            draft.sortDirection === 'asc'
              ? 'characters.sortDirectionAsc'
              : 'characters.sortDirectionDesc'
          )}
          tooltip={t('characters.sortDirection')}
          onClick={() =>
            setDraft({
              ...draft,
              sortDirection: draft.sortDirection === 'asc' ? 'desc' : 'asc',
            })
          }
        />
      </FilterField>
    </>
  );
}
