import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  FilterBar,
  FilterChip,
  FilterField,
  IskInput,
  RegionSelect,
  type RegionSelectShortcut,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SearchInput,
  TextInput,
} from '@/components/ui';
import type { SpaceKind } from '@/engine/space';
import {
  activeCourierFilters,
  type CourierUiFilter,
  type MyRegion,
  type RegionOption,
} from '@/features/contractSearch/courierFilterHelpers';
import { OVER_RATE_FILTERS, type OverRateFilter } from '@/features/contractSearch/overRateFilter';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';

function RegionFilterField({
  label,
  value,
  options,
  onChange,
  shortcut,
}: {
  label: string;
  value: number | null;
  options: RegionOption[];
  onChange: (regionId: number | null) => void;
  shortcut?: RegionSelectShortcut;
}) {
  const { t } = useTranslation();
  return (
    <FilterField captionInline label={label}>
      <RegionSelect
        options={options}
        value={value}
        onChange={onChange}
        allLabel={t('contractSearch.allRegions')}
        searchPlaceholder={t('common.searchRegions')}
        noResultsLabel={t('common.noRegionMatches')}
        aria-label={label}
        className="w-44"
        shortcut={shortcut}
      />
    </FilterField>
  );
}

function myRegionShortcut({
  t,
  state,
  pending,
  options,
  onResolve,
}: {
  t: TFunction;
  state: MyRegion;
  pending: boolean;
  options: RegionOption[];
  onResolve: () => Promise<MyRegion>;
}): RegionSelectShortcut {
  const offered = (regionId: number) => options.some((option) => option.id === regionId);
  const eligible = state.kind === 'region' && offered(state.regionId);
  const disabled =
    pending || state.kind === 'unavailable' || (state.kind === 'region' && !eligible);

  const note =
    state.kind === 'unavailable'
      ? t('contractSearch.fromMyRegionUnavailable')
      : state.kind === 'region' && !eligible
        ? t('contractSearch.noHaulsFromMyRegion')
        : null;

  return {
    label: t('contractSearch.fromMyRegion'),
    disabled,
    note,
    onSelect: async () => {
      if (state.kind === 'region') return state.regionId;
      const resolved = await onResolve();
      return resolved.kind === 'region' && offered(resolved.regionId) ? resolved.regionId : null;
    },
  };
}

function IskFilterField({
  label,
  value,
  width,
  onChange,
}: {
  label: string;
  value: string;
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField captionInline label={label}>
      <IskInput
        aria-label={label}
        placeholder={label}
        className={width}
        value={value}
        onChange={onChange}
      />
    </FilterField>
  );
}

function NumericFilterField({
  label,
  value,
  width,
  onChange,
}: {
  label: string;
  value: string;
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField captionInline label={label}>
      <TextInput
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={label}
        placeholder={label}
        className={width}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FilterField>
  );
}

function RoutePreferenceField({
  value,
  onChange,
}: {
  value: RoutePreferenceKind;
  onChange: (preference: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  const label = t('contractSearch.routePreferenceLabel');
  return (
    <FilterField captionInline label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as RoutePreferenceKind)}>
        <SelectTrigger aria-label={label} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUTE_PREFERENCES.map((preference) => (
            <SelectItem key={preference} value={preference}>
              {t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

interface CourierFilterBarProps {
  filter: CourierUiFilter;
  onChange: (filter: CourierUiFilter) => void;
  myRegion: MyRegion;
  myRegionPending: boolean;
  onResolveMyRegion: () => Promise<MyRegion>;
  originRegions: RegionOption[];
  destinationRegions: RegionOption[];
  spaceKinds: readonly SpaceKind[];
  preference: RoutePreferenceKind;
  onPreferenceChange: (preference: RoutePreferenceKind) => void;
  actions?: ReactNode;
  resultCount?: number;
}

export function CourierFilterBar({
  filter,
  onChange,
  myRegion,
  myRegionPending,
  onResolveMyRegion,
  originRegions,
  destinationRegions,
  spaceKinds,
  preference,
  onPreferenceChange,
  actions,
  resultCount,
}: CourierFilterBarProps) {
  const { t } = useTranslation();
  const spaceField = (draft: CourierUiFilter, setDraft: (next: CourierUiFilter) => void) =>
    spaceKinds.length > 0 && (
      <FilterField captionInline label={t('contractSearch.destinationSpaceLabel')} stretch={false}>
        <div
          role="group"
          aria-label={t('contractSearch.destinationSpaceLabel')}
          className="flex flex-nowrap items-center gap-2"
        >
          {spaceKinds.map((kind) => (
            <FilterChip
              key={kind}
              size="md"
              label={t(`common.spaceOption.${kind}`)}
              selected={draft.destinationSpace.includes(kind)}
              onToggle={() =>
                setDraft({
                  ...draft,
                  destinationSpace: draft.destinationSpace.includes(kind)
                    ? draft.destinationSpace.filter((existing) => existing !== kind)
                    : [...draft.destinationSpace, kind],
                })
              }
            />
          ))}
        </div>
      </FilterField>
    );
  return (
    <FilterBar
      value={filter}
      inline={spaceField}
      onChange={onChange}
      active={activeCourierFilters(filter, t, {
        originRegions,
        destinationRegions,
        spaceKinds,
      })}
      resultCount={resultCount}
      rowAlign="end"
      actions={actions}
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.routeQuery}
          onChange={(event) => onChange({ ...filter, routeQuery: event.target.value })}
          placeholder={t('contractSearch.courierSearchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft, surface) => (
        <>
          <RegionFilterField
            label={t('contractSearch.originRegionLabel')}
            value={draft.originRegionId}
            options={originRegions}
            onChange={(originRegionId) => setDraft({ ...draft, originRegionId })}
            shortcut={myRegionShortcut({
              t,
              state: myRegion,
              pending: myRegionPending,
              options: originRegions,
              onResolve: onResolveMyRegion,
            })}
          />
          <RegionFilterField
            label={t('contractSearch.destinationRegionLabel')}
            value={draft.destinationRegionId}
            options={destinationRegions}
            onChange={(destinationRegionId) => setDraft({ ...draft, destinationRegionId })}
          />
          {surface === 'sheet' && spaceField(draft, setDraft)}
          <IskFilterField
            label={t('contractSearch.minRewardLabel')}
            value={draft.minReward}
            width="w-32"
            onChange={(minReward) => setDraft({ ...draft, minReward })}
          />
          <IskFilterField
            label={t('contractSearch.maxCollateralLabel')}
            value={draft.maxCollateral}
            width="w-32"
            onChange={(maxCollateral) => setDraft({ ...draft, maxCollateral })}
          />
          <NumericFilterField
            label={t('contractSearch.maxVolumeLabel')}
            value={draft.maxVolume}
            width="w-32"
            onChange={(maxVolume) => setDraft({ ...draft, maxVolume })}
          />
          <NumericFilterField
            label={t('contractSearch.minDaysLabel')}
            value={draft.minDays}
            width="w-24"
            onChange={(minDays) => setDraft({ ...draft, minDays })}
          />
          <RoutePreferenceField value={preference} onChange={onPreferenceChange} />
          <FilterField captionInline label={t('contractSearch.overRateLabel')}>
            <Select
              value={draft.overRate}
              onValueChange={(value) => setDraft({ ...draft, overRate: value as OverRateFilter })}
            >
              <SelectTrigger
                className="w-44"
                aria-label={t('contractSearch.overRateLabel')}
                active={draft.overRate !== 'all'}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVER_RATE_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`contractSearch.overRate.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField
            label={t('contractSearch.hideUncompletableLabel')}
            stretch={false}
            hideCaption
          >
            <FilterChip
              size="md"
              label={t('contractSearch.hideUncompletableLabel')}
              tooltip={t('contractSearch.hideUncompletableTooltip')}
              selected={draft.hideUncompletable}
              onToggle={() => setDraft({ ...draft, hideUncompletable: !draft.hideUncompletable })}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}
