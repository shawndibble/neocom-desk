import { type InputHTMLAttributes, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  CheckboxSelect,
  FilterBar,
  FilterField,
  IskInput,
  RegionSelect,
  SearchInput,
  TextInput,
  summarizeFilterValues,
  type ActiveFilter,
} from '@/components/ui';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { type CurrentSystemState } from '@/features/route/currentSystem';
import { CurrentSystemPicker, JumpRangeSelect } from '@/features/route/JumpRangeControls';
import { formatIskCompact, parseIskAmount } from '@/lib/isk';
import { DEFAULT_SOURCE_TOGGLES, SOURCE_TOGGLES, type SourceToggle } from './bpcSourcingUrl';
import { SOURCE_LABEL_KEYS, SOURCE_TOOLTIP_KEYS } from './bpcSourcingHelpers';
import {
  bpcActiveFilterChips,
  type BpcFilterChip,
  type BpcFilterState,
  type BpcHideDefaults,
  type BpcSourcingFilter,
} from './bpcActiveFilters';

export type UiFilter = BpcSourcingFilter;

/** `FilterBar`'s value: the URL fields flattened beside Source, Space and Distance. */
type CompositeFilter = UiFilter & Omit<BpcFilterState, 'filter'>;

function toState({ sources, spaceKinds, jumps, ...filter }: CompositeFilter): BpcFilterState {
  return { filter, sources, spaceKinds, jumps };
}

function fromState({ filter, sources, spaceKinds, jumps }: BpcFilterState): CompositeFilter {
  return { ...filter, sources, spaceKinds, jumps };
}

/**
 * A chip's pill: captioned as its control's `FilterField`, so a click on it
 * focuses that control. Both Exclude picks share the Exclude caption.
 */
function chipPill(
  chip: BpcFilterChip,
  t: TFunction,
  regionName: (id: number) => string
): Omit<ActiveFilter<CompositeFilter>, 'clear'> {
  const names = (list: string[]) =>
    list.length === 0 ? t('filters.none') : summarizeFilterValues(list, t);
  switch (chip.id) {
    case 'region':
      return { label: t('bpcContracts.regionLabel'), value: regionName(chip.value) };
    case 'jumps':
      return { label: t('jumpRange.label'), value: t(`jumpRange.option.${chip.value}`) };
    case 'minMe':
    case 'minTe':
    case 'minRuns':
      return { label: t(`bpcContracts.${chip.id}Label`), value: chip.value };
    case 'maxPrice': {
      // The field keeps what was typed ("50m", "50,000,000"); the pill says it one way.
      const isk = parseIskAmount(chip.value);
      return {
        label: t('bpcContracts.maxPriceLabel'),
        value: isk === null ? chip.value : `${formatIskCompact(isk)} ISK`,
      };
    }
    case 'hideAuctions':
    case 'hidePlex':
      return { label: t('bpcContracts.excludeLabel'), value: t(`bpcContracts.${chip.id}`) };
    case 'sources':
      return {
        label: t('bpcContracts.sourceLabel'),
        value: names(
          SOURCE_TOGGLES.filter((source) => chip.value.includes(source)).map((source) =>
            t(SOURCE_LABEL_KEYS[source])
          )
        ),
      };
    case 'space':
      return {
        label: t('bpcContracts.spaceLabel'),
        value: names(
          SPACE_KINDS.filter((kind) => chip.value.includes(kind)).map((kind) =>
            t(`common.spaceOption.${kind}`)
          )
        ),
      };
  }
}

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
  /** Rows the filters leave, for the phone sheet's done button. */
  resultCount?: number;
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
  resultCount,
}: BpcFilterBarProps) {
  const { t } = useTranslation();
  const compositeValue: CompositeFilter = { ...filter, sources, spaceKinds, jumps };
  const regionNames = new Map(regionOptions.map((region) => [region.id, region.name]));
  // Never the search text: the box above already shows it.
  const active: ActiveFilter<CompositeFilter>[] = bpcActiveFilterChips(
    toState(compositeValue),
    hideDefaults
  ).map((chip) => ({
    ...chipPill(chip, t, (id) => regionNames.get(id) ?? `#${id}`),
    clear: (value) => fromState(chip.clear(toState(value))),
  }));

  /** Widened past `UiFilter` so Source/Space/Distance commit through the same `FilterBar` value as the other fields (matching Contracts.tsx and Market's FilterBar usage). Space is a Dexie-backed preference, written here and nowhere else. */
  function handleCompositeChange(next: CompositeFilter) {
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
      active={active}
      resultCount={resultCount}
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
              active={draft.regionId !== null}
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
                active={draft.jumps !== DEFAULT_JUMP_RANGE}
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
              active={
                (draft.hideAuctions && !hideDefaults.hideAuctions) ||
                (draft.hidePlex && !hideDefaults.hidePlex)
              }
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
              active={
                draft.sources.size !== DEFAULT_SOURCE_TOGGLES.length ||
                !DEFAULT_SOURCE_TOGGLES.every((source) => draft.sources.has(source))
              }
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
              active={draft.spaceKinds.length !== SPACE_KINDS.length}
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
