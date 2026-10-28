import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  NPC_STANDING_KINDS,
  activeNpcStandingsFilterCount,
  type NpcStandingKind,
  type NpcStandingsFilter,
} from '@/features/character/npcStandingsRows';
import { toggleInSet } from '@/lib/sets';
import { useIsNarrow } from '@/lib/useIsNarrow';

const ANY_LEVEL = 'any';
/** The agent levels the Access filter offers: level 1 is open to everyone. */
const FILTER_LEVELS = [2, 3, 4, 5];

interface NpcStandingsFilterBarProps {
  filter: NpcStandingsFilter;
  onChange: (filter: NpcStandingsFilter) => void;
  /** Rows per kind, for the Type filter's counts. */
  counts: Record<NpcStandingKind, number>;
  /** The Columns button, at the right end of the row. */
  columnPicker: ReactNode;
}

/** Every filter, written once for the inline row and the phone's sheet. */
function FilterControls({
  filter,
  onChange,
  counts,
}: Omit<NpcStandingsFilterBarProps, 'columnPicker'>) {
  const { t } = useTranslation();
  return (
    <>
      <FilterField label={t('contacts.standings.typeFilter')}>
        <CheckboxSelect<NpcStandingKind>
          label={t('contacts.standings.typeFilter')}
          size="md"
          className="w-44"
          options={NPC_STANDING_KINDS.map((kind) => ({
            value: kind,
            label: t('contacts.standings.typeOption', {
              kind: t(`contacts.standingsKind.${kind}`),
              count: counts[kind],
            }),
          }))}
          selected={filter.kinds}
          onToggle={(kind) => {
            const kinds = toggleInSet(filter.kinds, kind);
            // Switching the last type off would show nothing: it means all again.
            onChange({ ...filter, kinds: kinds.size === 0 ? new Set(NPC_STANDING_KINDS) : kinds });
          }}
        />
      </FilterField>
      <FilterField label={t('contacts.standings.accessFilter')}>
        <Select
          value={filter.minAccess === null ? ANY_LEVEL : String(filter.minAccess)}
          onValueChange={(value) =>
            onChange({ ...filter, minAccess: value === ANY_LEVEL ? null : Number(value) })
          }
        >
          <SelectTrigger
            size="md"
            aria-label={t('contacts.standings.accessFilter')}
            className="w-52"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_LEVEL}>{t('contacts.standings.accessAny')}</SelectItem>
            {FILTER_LEVELS.map((level) => (
              <SelectItem key={level} value={String(level)}>
                {t('contacts.standings.accessAtLeast', { level })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>
      <FilterField label={t('contacts.standings.feesFilter')} stretch={false}>
        <FilterChip
          size="md"
          label={t('contacts.standings.usedForFees')}
          selected={filter.feesOnly}
          onToggle={() => onChange({ ...filter, feesOnly: !filter.feesOnly })}
        />
      </FilterField>
    </>
  );
}

/**
 * The Standings tab's one filter row: search, the filters, then the Columns
 * button at the right, all at the search box's height. A phone gets the shared
 * `FilterBar` instead: search, Columns and a funnel that opens the filters in
 * a bottom sheet.
 */
export function NpcStandingsFilterBar({
  filter,
  onChange,
  counts,
  columnPicker,
}: NpcStandingsFilterBarProps) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const search = (
    <SearchInput
      value={filter.text}
      onChange={(event) => onChange({ ...filter, text: event.target.value })}
      placeholder={t('contacts.searchPlaceholder')}
      aria-label={t('contacts.searchPlaceholder')}
      className={narrow ? 'min-w-0 flex-1' : 'w-64'}
    />
  );
  if (narrow) {
    return (
      <FilterBar
        value={filter}
        onChange={onChange}
        search={search}
        actions={columnPicker}
        activeCount={activeNpcStandingsFilterCount(filter)}
      >
        {(draft, setDraft) => <FilterControls filter={draft} onChange={setDraft} counts={counts} />}
      </FilterBar>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      <FilterControls filter={filter} onChange={onChange} counts={counts} />
      <div className="ml-auto">{columnPicker}</div>
    </div>
  );
}
