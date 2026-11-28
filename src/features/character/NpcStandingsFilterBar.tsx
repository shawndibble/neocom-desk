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
  activeNpcStandingsFilters,
  type NpcStandingKind,
  type NpcStandingsFilter,
} from '@/features/character/npcStandingsRows';
import { toggleInSet } from '@/lib/sets';

const ANY_LEVEL = 'any';
const FILTER_LEVELS = [2, 3, 4, 5];

interface NpcStandingsFilterBarProps {
  filter: NpcStandingsFilter;
  onChange: (filter: NpcStandingsFilter) => void;
  counts: Record<NpcStandingKind, number>;
  columnPicker: ReactNode;
}

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
          active={filter.kinds.size !== NPC_STANDING_KINDS.length}
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
            active={filter.minAccess !== null}
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

export function NpcStandingsFilterBar({
  filter,
  onChange,
  counts,
  columnPicker,
}: NpcStandingsFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contacts.searchPlaceholder')}
          aria-label={t('contacts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
      actions={columnPicker}
      active={activeNpcStandingsFilters(filter, t)}
    >
      {(draft, setDraft) => <FilterControls filter={draft} onChange={setDraft} counts={counts} />}
    </FilterBar>
  );
}
