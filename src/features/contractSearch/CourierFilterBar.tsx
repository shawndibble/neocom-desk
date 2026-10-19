/**
 * The Courier tab's filter bar and the field controls it is built from. Split
 * out of `CourierResults`; the board still owns every value.
 */
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FilterBar,
  countActive,
  FilterChip,
  FilterField,
  IskInput,
  RegionSelect,
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
  narrowsSpace,
  type CourierUiFilter,
  type MyRegion,
  type RegionOption,
} from '@/features/contractSearch/courierFilterHelpers';
import { OVER_RATE_FILTERS, type OverRateFilter } from '@/features/contractSearch/overRateFilter';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';

/** The From/To pair: the same control twice, differing only in which end of the haul it reads. */
function RegionFilterField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: RegionOption[];
  onChange: (regionId: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <FilterField label={label}>
      <RegionSelect
        options={options}
        value={value}
        onChange={onChange}
        allLabel={t('contractSearch.allRegions')}
        searchPlaceholder={t('common.searchRegions')}
        noResultsLabel={t('common.noRegionMatches')}
        aria-label={label}
        className="w-44"
      />
    </FilterField>
  );
}

/**
 * "From my region": sets the origin filter to the region the active character
 * is standing in (issue #940).
 *
 * Region, not station or system, and the label says so. ESI answers this
 * question with a solar system; the filter beside it is region-scoped, so
 * naming anything finer would claim a precision the control does not have.
 *
 * The answer is *not* held here. `FilterBar` unmounts its controls whenever
 * the funnel closes or the sheet is dismissed, so state kept in this component
 * would be thrown away every time the hauler collapsed the bar — and the next
 * press would have to ask ESI all over again to re-learn something it had
 * already been told. The board above owns it instead; this only renders it.
 *
 * Three honest states once it has been asked. A region that no haul in the
 * current snapshot starts in disables the control and says so, rather than
 * setting a value the dropdown beside it has no option for — that would leave
 * the filter showing something its own control cannot represent, and an empty
 * table under it. An unresolvable location disables it with a plain reason: a
 * character whose grant predates `esi-location.read_location.v1` should find a
 * convenience missing, never a re-auth banner.
 */
function MyRegionButton({
  state,
  pending,
  options,
  onResolve,
  onPick,
}: {
  state: MyRegion;
  pending: boolean;
  options: RegionOption[];
  /** Asks the board to resolve the location, and answers with what it found. */
  onResolve: () => Promise<MyRegion>;
  onPick: (regionId: number) => void;
}) {
  const { t } = useTranslation();

  const offered = (regionId: number) => options.some((option) => option.id === regionId);
  const eligible = state.kind === 'region' && offered(state.regionId);
  // Disabled while in flight as much as for the answer: on a phone a double
  // tap is exactly how "at most one request" becomes two.
  const disabled =
    pending || state.kind === 'unavailable' || (state.kind === 'region' && !eligible);

  const message =
    state.kind === 'unavailable'
      ? t('contractSearch.fromMyRegionUnavailable')
      : state.kind === 'region' && !eligible
        ? t('contractSearch.noHaulsFromMyRegion')
        : null;

  async function handleClick() {
    // Already known and offered — the only way this click is reachable with an
    // answer in hand, since every other answer disables the button.
    if (state.kind === 'region') {
      onPick(state.regionId);
      return;
    }
    const resolved = await onResolve();
    if (resolved.kind === 'region' && offered(resolved.regionId)) onPick(resolved.regionId);
  }

  // A plain group rather than a `FilterField`: the button's own text is its
  // caption, and `FilterField` would stack an identical one above it in the
  // sheet. Same shape as the space chips below.
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={disabled} onClick={() => void handleClick()}>
        {t('contractSearch.fromMyRegion')}
      </Button>
      {/*
        The reason, announced and not only drawn: the button goes unfocusable
        in the same commit that renders this, so a screen reader following the
        control would otherwise be told nothing at all about why it died.
      */}
      {message && (
        <span role="status" className="text-xs text-text-dim">
          {message}
        </span>
      )}
    </div>
  );
}

/** An ISK bound — reward floor, collateral ceiling — through the shared `IskInput`. */
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
    <FilterField label={label}>
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

/** A bare numeric bound — reward floor, collateral ceiling, cargo ceiling, deadline floor. */
function NumericFilterField({
  label,
  value,
  width,
  onChange,
}: {
  label: string;
  value: string;
  /** The field carries the width it needs *in the row*; the sheet stretches it regardless. */
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField label={label}>
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

/**
 * Which trip the distances describe. A hauler who only flies highsec and one
 * who will cross a 0.4 system for a shorter run are asking different
 * questions of the same contract, and they get different jump counts — so
 * this is a control, not a constant.
 */
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
    <FilterField label={label}>
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
  /** The table's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
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
}: CourierFilterBarProps) {
  const { t } = useTranslation();
  // Counted off the controls, not off the parsed engine filter, for the same
  // reason the item bar does it: a half-typed "1e" parses to `null` there, and
  // the badge should say the field has been touched.
  const activeCount = countActive([
    filter.routeQuery,
    filter.originRegionId !== null,
    filter.destinationRegionId !== null,
    narrowsSpace(filter.destinationSpace, spaceKinds),
    filter.hideUncompletable,
    filter.overRate !== 'all',
    filter.minReward,
    filter.maxCollateral,
    filter.maxVolume,
    filter.minDays,
  ]);

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
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
      {(draft, setDraft) => (
        <>
          <RegionFilterField
            label={t('contractSearch.originRegionLabel')}
            value={draft.originRegionId}
            options={originRegions}
            onChange={(originRegionId) => setDraft({ ...draft, originRegionId })}
          />
          <MyRegionButton
            state={myRegion}
            pending={myRegionPending}
            onResolve={onResolveMyRegion}
            options={originRegions}
            onPick={(originRegionId) => setDraft({ ...draft, originRegionId })}
          />
          <RegionFilterField
            label={t('contractSearch.destinationRegionLabel')}
            value={draft.destinationRegionId}
            options={destinationRegions}
            onChange={(destinationRegionId) => setDraft({ ...draft, destinationRegionId })}
          />
          {/*
            Named for the endpoint, not the route: this says where a haul ends,
            and there is deliberately no "avoid lowsec" control beside it — that
            would be a safety claim about the whole trip made from data that
            only describes its two ends.

            Hidden entirely when no band is on offer, rather than shown as a
            label with nothing under it: that is the state while the endpoints
            are still being placed, and the permanent state if the local station
            snapshot cannot be read at all.
          */}
          {spaceKinds.length > 0 && (
            <div
              role="group"
              aria-label={t('contractSearch.destinationSpaceLabel')}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-text-dim">{t('contractSearch.destinationSpaceLabel')}</span>
              {spaceKinds.map((kind) => (
                <FilterChip
                  key={kind}
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
          )}
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
          {/*
            One control, not a per-flag set: a hauler either wants the jobs they
            may not be able to deliver out of the way or they do not. What it
            hides — and what it deliberately does not — is `blocksCompletion`'s
            to decide, which is more than the label has room to say: hence the
            tooltip, which states both halves and the nullsec exclusion.
          */}
          <FilterField label={t('contractSearch.overRateLabel')}>
            <Select
              value={draft.overRate}
              onValueChange={(value) => setDraft({ ...draft, overRate: value as OverRateFilter })}
            >
              <SelectTrigger className="w-44" aria-label={t('contractSearch.overRateLabel')}>
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
          <FilterChip
            label={t('contractSearch.hideUncompletableLabel')}
            tooltip={t('contractSearch.hideUncompletableTooltip')}
            selected={draft.hideUncompletable}
            onToggle={() => setDraft({ ...draft, hideUncompletable: !draft.hideUncompletable })}
          />
        </>
      )}
    </FilterBar>
  );
}
