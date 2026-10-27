import { type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterField,
  IskInput,
  RegionSelect,
  SearchInput,
  TextInput,
} from '@/components/ui';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import type { JumpRange } from '@/engine/route/jumpRange';
import { type CurrentSystemState } from '@/features/route/currentSystem';
import { CurrentSystemPicker, JumpRangeSelect } from '@/features/route/JumpRangeControls';
import { SOURCE_TOGGLES, type SourceToggle } from './bpcSourcingUrl';
import { SOURCE_LABEL_KEYS, SOURCE_TOOLTIP_KEYS } from './bpcSourcingHelpers';
import {
  bpcActiveFilterCount,
  type BpcHideDefaults,
  type BpcSourcingFilter,
} from './bpcActiveFilters';

export type UiFilter = BpcSourcingFilter;

interface BpcFilterBarProps {
  filter: UiFilter;
  onChange: (filter: UiFilter) => void;
  regionOptions: { id: number; name: string }[];
  sources: ReadonlySet<SourceToggle>;
  onSourcesChange: (next: ReadonlySet<SourceToggle>) => void;
  spaceKinds: readonly SpaceKind[];
  onSpaceKindsChange: (next: readonly SpaceKind[]) => void;
  jumps: JumpRange;
  onJumpsChange: (next: JumpRange) => void;
  currentSystem: CurrentSystemState;
  /** The pilot's own Exclude defaults (Settings): hiding at the default is not an active filter. */
  hideDefaults: BpcHideDefaults;
  /** The blueprint box's combobox wiring — role, expanded state, active option and arrow keys — owned by the panel, which renders the listbox. */
  searchComboboxProps: InputHTMLAttributes<HTMLInputElement>;
  /** The column picker, inline between the search box and the funnel. */
  actions?: ReactNode;
}

export function BpcFilterBar({
  filter,
  onChange,
  regionOptions,
  sources,
  onSourcesChange,
  spaceKinds,
  onSpaceKindsChange,
  jumps,
  onJumpsChange,
  currentSystem,
  hideDefaults,
  searchComboboxProps,
  actions,
}: BpcFilterBarProps) {
  const { t } = useTranslation();
  const activeCount = bpcActiveFilterCount({ filter, sources, spaceKinds, jumps }, hideDefaults);

  const compositeValue = { ...filter, sources, spaceKinds, jumps };

  /** Widened past `UiFilter` so Source/Space/Distance commit through the same `FilterBar` value as the other fields (matching Contracts.tsx and Market's FilterBar usage). Space is a Dexie-backed preference, written here and nowhere else. */
  function handleCompositeChange(next: typeof compositeValue) {
    const {
      sources: nextSources,
      spaceKinds: nextSpaceKinds,
      jumps: nextJumps,
      ...restFilter
    } = next;
    onChange(restFilter);
    if (nextSources !== sources) onSourcesChange(nextSources);
    if (nextSpaceKinds !== spaceKinds) onSpaceKindsChange(nextSpaceKinds);
    if (nextJumps !== jumps) onJumpsChange(nextJumps);
  }

  return (
    <FilterBar
      value={compositeValue}
      onChange={handleCompositeChange}
      activeCount={activeCount}
      className="border-b border-line px-3 py-2"
      actions={actions}
      search={
        <SearchInput
          value={filter.typeQuery}
          onChange={(event) => onChange({ ...filter, typeQuery: event.target.value })}
          placeholder={t('bpcContracts.searchPlaceholder')}
          className="min-w-32 flex-1 sm:min-w-48"
          {...searchComboboxProps}
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('bpcContracts.regionLabel')}>
            <RegionSelect
              options={regionOptions}
              value={draft.regionId}
              onChange={(regionId) => setDraft({ ...draft, regionId })}
              allLabel={t('bpcContracts.allRegions')}
              searchPlaceholder={t('common.searchRegions')}
              noResultsLabel={t('common.noRegionMatches')}
              aria-label={t('bpcContracts.regionLabel')}
              className="w-48"
            />
          </FilterField>
          <FilterField label={t('jumpRange.label')}>
            <div className="flex flex-wrap items-center gap-2">
              <JumpRangeSelect
                value={draft.jumps}
                onChange={(next) => setDraft({ ...draft, jumps: next })}
              />
              <CurrentSystemPicker current={currentSystem} />
            </div>
          </FilterField>
          <FilterField label={t('bpcContracts.minMeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              aria-label={t('bpcContracts.minMeLabel')}
              placeholder={t('bpcContracts.minMeLabel')}
              className="w-24"
              value={draft.minMe}
              onChange={(event) => setDraft({ ...draft, minMe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minTeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              aria-label={t('bpcContracts.minTeLabel')}
              placeholder={t('bpcContracts.minTeLabel')}
              className="w-24"
              value={draft.minTe}
              onChange={(event) => setDraft({ ...draft, minTe: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.minRunsLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('bpcContracts.minRunsLabel')}
              placeholder={t('bpcContracts.minRunsLabel')}
              className="w-24"
              value={draft.minRuns}
              onChange={(event) => setDraft({ ...draft, minRuns: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.maxPriceLabel')}>
            <IskInput
              aria-label={t('bpcContracts.maxPriceLabel')}
              placeholder={t('bpcContracts.maxPriceLabel')}
              className="w-32"
              value={draft.maxPrice}
              onChange={(maxPrice) => setDraft({ ...draft, maxPrice })}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.excludeLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.excludeLabel')}
              className="w-44"
              options={[
                { value: 'auctions' as const, label: t('bpcContracts.hideAuctions') },
                {
                  value: 'plex' as const,
                  label: t('bpcContracts.hidePlex'),
                  description: t('bpcContracts.hidePlexTooltip'),
                },
              ]}
              selected={
                new Set([
                  ...(draft.hideAuctions ? (['auctions'] as const) : []),
                  ...(draft.hidePlex ? (['plex'] as const) : []),
                ])
              }
              onToggle={(value) =>
                setDraft(
                  value === 'auctions'
                    ? { ...draft, hideAuctions: !draft.hideAuctions }
                    : { ...draft, hidePlex: !draft.hidePlex }
                )
              }
            />
          </FilterField>
          <FilterField label={t('bpcContracts.sourceLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.sourceLabel')}
              className="w-44"
              options={SOURCE_TOGGLES.map((source) => ({
                value: source,
                label: t(SOURCE_LABEL_KEYS[source]),
                description: SOURCE_TOOLTIP_KEYS[source] && t(SOURCE_TOOLTIP_KEYS[source]),
              }))}
              selected={draft.sources}
              onToggle={(source) => {
                const next = new Set(draft.sources);
                if (next.has(source)) next.delete(source);
                else next.add(source);
                setDraft({ ...draft, sources: next });
              }}
            />
          </FilterField>
          <FilterField label={t('bpcContracts.spaceLabel')}>
            <CheckboxSelect
              label={t('bpcContracts.spaceLabel')}
              className="w-44"
              options={SPACE_KINDS.map((kind) => ({
                value: kind,
                label: t(`common.spaceOption.${kind}`),
              }))}
              selected={new Set(draft.spaceKinds)}
              onToggle={(kind) => {
                const next = draft.spaceKinds.includes(kind)
                  ? draft.spaceKinds.filter((existing) => existing !== kind)
                  : [...draft.spaceKinds, kind];
                setDraft({ ...draft, spaceKinds: next });
              }}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}
