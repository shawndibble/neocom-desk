import { idSetKey } from '@/lib/idSetKey';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReportSkipped } from './useReportSkipped';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, LiveStatus, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { ActiveHaulView } from './ActiveHaulView';
import { buildActiveHaul, useActiveHaul } from './activeHaul';
import { buildHullCatalogue } from '@/engine/fittings/hullCatalogue';
import type { PilotProfile } from '@/engine/fittings/types';
import {
  planMove,
  type HaulerOverride,
  type MoveHull,
  type PackHold,
} from '@/engine/assets/movePlan';
import {
  loadOtherCharactersAssetsDetailed,
  type SkippedCharacterAssets,
} from '@/features/assets/assets';
import { resolvePlace } from '@/features/places';
import { loadTypeNames, loadTypePackagedVolumes } from '@/features/character/typeNames';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';
import {
  useFittingCatalogue,
  useFittingCatalogueFailed,
  type FittingCatalogue,
} from '@/features/fittings/useFittingCatalogue';
import { hullPackHolds } from '@/features/market/haulingCargo';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { formatCubicMetres } from '@/lib/volume';
import { loadGroupCategories, loadShipTree, loadTypes } from '@/sde/loadSde';
import { PickerList } from './MovePlanPicker';
import { PlanResult, type PlanState } from './MovePlanResult';
import {
  fittedRigCounts,
  pickerStacks,
  selectedPlanCharacters,
  type MovePlanSource,
  type PickerStack,
} from './movePlanInput';
import {
  pickedTotals,
  pickupHues,
  pickupHueVar,
  shortStationLabels,
  splitSegments,
  sortStacksByVolume,
} from './movePlanView';

/** SDE category 6. */
const SHIP_CATEGORY_ID = 6;
const HAULER_CLASS = 'Haulers and Industrial Ships';
const HULL_CONCURRENCY = 4;
/** More stacks than this and the picker opens with every pickup group folded. */
const COLLAPSE_ABOVE = 12;

interface Loaded {
  sources: MovePlanSource[];
  shipTypeIds: Set<number>;
  stacks: PickerStack[];
  typeNames: Map<number, string>;
  unitM3: Map<number, number>;
  /** Pickup location name by location id. */
  places: Map<number, string>;
  /** Solar system of each pickup location (null when it did not resolve). */
  systems: Map<number, number | null>;
  /** Palette slot of each pickup location, stable from picker to plan. */
  hues: Map<number, number>;
  /** Rigs fitted to each assembled ship, by itemID. */
  rigs: Map<number, number>;
  /** Chosen Characters whose assets could not be read: their stock is missing from the picker. */
  skipped: SkippedCharacterAssets[];
}

async function load(characterIds: readonly number[]): Promise<Loaded> {
  const [{ entries: sources, skipped }, types, groupCategories] = await Promise.all([
    loadOtherCharactersAssetsDetailed(characterIds),
    loadTypes(),
    loadGroupCategories().catch(() => ({}) as Record<string, number>),
  ]);
  const typeIds = [...new Set(sources.flatMap((s) => s.assets.map((a) => a.type_id)))];
  const shipTypeIds = new Set(
    typeIds.filter((id) => {
      const groupId = types[String(id)]?.groupID;
      return groupId !== undefined && groupCategories[String(groupId)] === SHIP_CATEGORY_ID;
    })
  );
  const stacks = pickerStacks(sources, shipTypeIds);
  const stackTypeIds = [...new Set(stacks.map((s) => s.typeId))];
  const [typeNames, unitM3] = await Promise.all([
    loadTypeNames(stackTypeIds),
    loadTypePackagedVolumes(stackTypeIds, shipTypeIds),
  ]);
  const places = new Map<number, string>();
  const systems = new Map<number, number | null>();
  const byPlace = new Map<number, PickerStack>();
  for (const s of stacks) if (!byPlace.has(s.locationId)) byPlace.set(s.locationId, s);
  await Promise.all(
    [...byPlace].map(async ([id, stack]) => {
      const place = await resolvePlace(
        {
          locationId: id,
          characterId: stack.characterId,
          kind: stack.locationType === 'station' ? 'station' : 'structure',
        },
        undefined,
        { settle: true }
      );
      places.set(id, place.name ?? String(id));
      systems.set(id, place.systemId);
    })
  );
  const hues = pickupHues(stacks.map((s) => s.locationId));
  const rigs = fittedRigCounts(sources);
  return { sources, shipTypeIds, stacks, typeNames, unitM3, places, systems, hues, rigs, skipped };
}

interface MovePlanTabProps {
  /** Leaves the plan: Cancel, and Done on the result. The page returns to its Items tab. */
  onClose: () => void;
  /** The Characters the page's filter names. */
  characterIds: readonly number[];
  activeCharacterId: number | null;
  /** Reports the Characters this tab's read skipped, for the header picker's `missingNames`. */
  onSkippedChange?: (names: readonly string[] | undefined) => void;
}

/**
 * Plan a move: tick what to carry, say where to, see the work list per
 * Character and pickup with a suggested hauler. The Assets page's Move tab
 * mounts it, so its state lasts while the tab is open and starts fresh on re-entry.
 * Volumes and trips are an estimate from hull class; the Route Safety link
 * answers the safety question.
 */
export function MovePlanTab(props: MovePlanTabProps) {
  return <MovePlanTabBody key={idSetKey(props.characterIds)} {...props} />;
}

function MovePlanTabBody({
  onClose,
  characterIds,
  activeCharacterId,
  onSkippedChange,
}: MovePlanTabProps) {
  const { t } = useTranslation();
  // Frozen for this mount: a different Character set remounts the tab (`key` below).
  const [ids] = useState(characterIds);
  const loadIds = useCallback(() => load(ids), [ids]);
  const { status, data: loaded = null } = useAsyncLoad(loadIds);
  const failed = status === 'failed';
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [destSystem, setDestSystem] = useState<number | null>(null);
  const [destStation, setDestStation] = useState<number | null>(null);
  /** A station found by search that holds none of the pilot's assets: its name and system came with the pick. */
  const [searchedStation, setSearchedStation] = useState<{
    id: number;
    name: string;
    systemId: number;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<PlanState | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  /** The pilot's own folding; until they fold something, a long list opens folded. */
  const [folded, setFolded] = useState<ReadonlySet<string> | null>(null);
  /** Folded pickup groups, `characterId:locationId`. */
  const collapsed = useMemo<ReadonlySet<string>>(
    () =>
      folded ??
      new Set(
        loaded && loaded.stacks.length > COLLAPSE_ABOVE
          ? loaded.stacks.map((st) => `${st.characterId}:${st.locationId}`)
          : []
      ),
    [folded, loaded]
  );
  const [planFailed, setPlanFailed] = useState(false);
  /** Ships (itemID) the plan hauls packaged instead of flying. */
  const [packed, setPacked] = useState<ReadonlySet<number>>(new Set());
  /** What the shown plan was worked out from, so packing a ship can re-plan it. */
  const planBase = useRef<Omit<
    Parameters<typeof planMove>[0],
    'packedShipIds' | 'haulerOverride'
  > | null>(null);
  /** The pilot's hauler pick for the shown plan only; never saved, reset with each plan. */
  const [haulerOverride, setHaulerOverride] = useState<HaulerOverride | undefined>();
  const savedHaul = useActiveHaul((st) => st.value);
  const setSavedHaul = useActiveHaul((st) => st.setValue);
  useHydratedStore(useActiveHaul);
  /** The active haul fills the tab instead of the picker or the plan. */
  const [showingHaul, setShowingHaul] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  /** Bumped on every reset so a plan still being worked out for an old session is dropped. */
  const session = useRef(0);
  const hullSource = useRef<HullSourceData>({
    catalogue: null,
    catalogueFailed: false,
    profile: null,
    profileFailed: false,
    skillsKnown: true,
  });
  const hullHolds = useRef(new Map<number, PackHold[]>());
  const focusAfterCommit = useFocusAfterCommit();
  const planHeadingRef = useRef<HTMLHeadingElement>(null);
  const deliverHeadingRef = useRef<HTMLHeadingElement>(null);

  // A new plan's work is dropped when this tab goes away.
  useEffect(
    () => () => {
      session.current += 1;
    },
    []
  );

  const grouped = useMemo(() => {
    const out = new Map<number, Map<number, PickerStack[]>>();
    for (const s of loaded?.stacks ?? []) {
      const byPlace = out.get(s.characterId) ?? new Map<number, PickerStack[]>();
      const stacks = byPlace.get(s.locationId);
      if (stacks) stacks.push(s);
      else byPlace.set(s.locationId, [s]);
      out.set(s.characterId, byPlace);
    }
    if (!loaded) return out;
    const nameOf = (typeId: number) => loaded.typeNames.get(typeId) ?? '';
    for (const byPlace of out.values())
      for (const [locationId, stacks] of byPlace)
        byPlace.set(locationId, sortStacksByVolume(stacks, loaded.unitM3, nameOf));
    return out;
  }, [loaded]);

  const ownStations = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of loaded?.stacks ?? [])
      if (s.locationType === 'station') seen.set(s.locationId, loaded!.places.get(s.locationId)!);
    return [...seen].sort(([, a], [, b]) => a.localeCompare(b));
  }, [loaded]);

  const stationLabels = useMemo(
    () => shortStationLabels(ownStations.map(([, name]) => name)),
    [ownStations]
  );

  const hasDestination = destSystem !== null || destStation !== null;

  /** Pickup locations the destination covers: a station, or every pickup in the picked system. */
  const atDestination = useMemo(
    () => coveredLocations(loaded?.systems, destSystem, destStation),
    [destStation, destSystem, loaded]
  );

  const totals = useMemo(
    () =>
      loaded
        ? pickedTotals(loaded.stacks, selected, loaded.unitM3, atDestination)
        : { stacks: 0, ships: 0, m3: 0, byLocation: new Map<number, number>() },
    [loaded, selected, atDestination]
  );

  const toggle = (keys: readonly string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  /** Ticks at the destination are kept but ignored, so changing it back restores them. */
  function chooseDestination(
    system: number | null,
    station: number | null,
    searched: { id: number; name: string; systemId: number } | null = null
  ) {
    setDestSystem(system);
    setDestStation(station);
    setSearchedStation(searched);
  }

  /**
   * The haulers the pilot's skills size, and whether sizing was possible.
   * `sizing` is `unavailable` when the data it needs is missing for good (the
   * ship data never downloaded, the pilot's skills unread), and `loading` when
   * it is merely not in yet; "no hauler you can fly" would misreport either as
   * the pilot's skills.
   */
  async function loadHulls(): Promise<{
    hulls: MoveHull[];
    sizing: PlanState['haulerSizing'];
  }> {
    const { catalogue, catalogueFailed, profile, profileFailed, skillsKnown } = hullSource.current;
    if (!loaded) return { hulls: [], sizing: undefined };
    if (catalogueFailed || profileFailed || !skillsKnown) {
      return { hulls: [], sizing: 'unavailable' };
    }
    if (!catalogue || !profile) return { hulls: [], sizing: 'loading' };
    const haulers =
      buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes).find(
        (c) => c.name === HAULER_CLASS
      )?.hulls ?? [];
    const todo = haulers.filter((h) => !hullHolds.current.has(h.typeId));
    let sizingFailures = 0;
    await mapWithConcurrencyLimit(todo, HULL_CONCURRENCY, async (hull) => {
      try {
        hullHolds.current.set(hull.typeId, await hullPackHolds(hull.typeId, profile));
      } catch {
        // Not cached: a transient failure should be retried next time.
        sizingFailures += 1;
      }
    });
    const owned = new Set(
      loaded.sources.flatMap((s) => s.assets.filter((a) => a.is_singleton).map((a) => a.type_id))
    );
    const sized = haulers.filter((h) => (hullHolds.current.get(h.typeId)?.length ?? 0) > 0);
    // From the bundled ship tree, so no ESI call per hauler; a hull it lacks counts as flyable.
    const tree = await loadShipTree().catch(() => null);
    const required = new Map(tree?.ships.map((ship) => [ship.typeID, ship.required]));
    const flyable = sized.map((h) =>
      (required.get(h.typeId) ?? []).every(
        (r) => (profile.skillLevels.get(r.skillTypeID) ?? 0) >= r.level
      )
    );
    const hulls = sized.map((h, i) => ({
      typeId: h.typeId,
      name: h.name,
      hullClass: h.group,
      capacityM3: hullHolds.current.get(h.typeId)!.reduce((sum, x) => sum + x.capacityM3, 0),
      holds: hullHolds.current.get(h.typeId)!,
      owned: owned.has(h.typeId),
      canFly: flyable[i],
    }));
    return { hulls, sizing: sizingFailures > 0 && hulls.length === 0 ? 'unavailable' : undefined };
  }

  async function showPlan() {
    if (!loaded || !hasDestination) return;
    setWorking(true);
    setPlanFailed(false);
    const mine = session.current;
    try {
      const destinationSystem =
        searchedStation !== null
          ? searchedStation.systemId
          : destStation !== null
            ? await resolvePlace(
                { locationId: destStation, characterId: null, kind: 'station' },
                undefined,
                {
                  name: false,
                }
              )
                .then((place) => place.systemId)
                .catch(() => null)
            : destSystem;
      const { hulls, sizing } = await loadHulls();
      const base = {
        destinationLocationIds: atDestination,
        characters: selectedPlanCharacters(loaded.sources, loaded.shipTypeIds, selected),
        unitM3: loaded.unitM3,
        shipTypeIds: loaded.shipTypeIds,
        hulls,
      };
      const plan = planMove(base);
      if (mine === session.current) {
        planBase.current = base;
        setPacked(new Set());
        setHaulerOverride(undefined);
        setResult({
          plan,
          destinationSystem,
          destinationStation:
            destStation !== null
              ? (loaded.places.get(destStation) ?? searchedStation?.name ?? null)
              : null,
          pickupSystems: loaded.systems,
          haulerSizing: sizing,
        });
        focusAfterCommit(planHeadingRef);
      }
    } catch {
      if (mine === session.current) setPlanFailed(true);
    } finally {
      if (mine === session.current) setWorking(false);
    }
  }

  /** Works the shown plan out again for a changed ship choice or hauler. */
  function replan(nextPacked: ReadonlySet<number>, nextOverride: HaulerOverride | undefined) {
    const base = planBase.current;
    if (!base) return;
    setPacked(nextPacked);
    setHaulerOverride(nextOverride);
    setResult((r) =>
      r
        ? {
            ...r,
            plan: planMove({ ...base, packedShipIds: nextPacked, haulerOverride: nextOverride }),
          }
        : r
    );
  }

  /** Hauls this ship packaged instead of flying it, and re-plans around its volume. */
  const packShip = (itemId: number) => replan(new Set(packed).add(itemId), haulerOverride);

  /** Flies this packed ship after all, and re-plans without its volume. */
  function unpackShip(itemId: number) {
    const next = new Set(packed);
    next.delete(itemId);
    replan(next, haulerOverride);
  }

  /** Saves the shown plan's route as the active haul and opens it. */
  async function commitRoute() {
    if (!loaded || !result) return;
    setRouting(true);
    setRouteFailed(false);
    const mine = session.current;
    try {
      const systemId = result.destinationSystem;
      const stationId = destStation ?? searchedStation?.id ?? null;
      const destinationName =
        result.destinationStation ??
        (systemId === null ? null : (await lookupSolarSystem(systemId).catch(() => null))?.name) ??
        '';
      const stationIds = new Map<number, number>();
      for (const st of loaded.stacks)
        if (st.locationType === 'station') stationIds.set(st.locationId, st.locationId);
      const haul = await buildActiveHaul({
        plan: result.plan,
        destination: { systemId, stationId, name: destinationName },
        places: loaded.places,
        systems: loaded.systems,
        stationIds,
        name: (typeId) => loaded.typeNames.get(typeId) ?? `#${typeId}`,
      });
      if (mine !== session.current) return;
      if (!haul) {
        setRouteFailed(true);
        return;
      }
      await setSavedHaul(haul);
      if (mine === session.current) setShowingHaul(true);
    } catch {
      if (mine === session.current) setRouteFailed(true);
    } finally {
      if (mine === session.current) setRouting(false);
    }
  }

  /** Show my route: asks first when a haul is already saved, since this replaces it. */
  function showRoute() {
    if (savedHaul) setReplacing(true);
    else void commitRoute();
  }

  // Who the read left out is the header picker's to say (its dot and "Not included" note).
  useReportSkipped(loaded ? loaded.skipped.map((c) => c.name) : undefined, onSkippedChange);
  const name = (typeId: number) => loaded?.typeNames.get(typeId) ?? `#${typeId}`;
  const placeLabel = (id: number) => loaded?.places.get(id) ?? String(id);
  const hueOf = (id: number) => loaded?.hues.get(id) ?? 0;
  const segments = splitSegments([...totals.byLocation].map(([key, m3]) => ({ key, m3 })));
  const pickedWhat = [
    totals.stacks > 0 && t('assets.movePlan.pickedStacks', { count: totals.stacks }),
    totals.ships > 0 && t('assets.movePlan.pickedShips', { count: totals.ships }),
  ]
    .filter(Boolean)
    .join(' + ');

  return (
    <section
      aria-label={t('assets.movePlan.title')}
      className="min-h-0 flex-1 scroll-pb-32 overflow-y-auto rounded-xs max-sm:scroll-pt-48 border border-line bg-panel p-3"
    >
      <div className="flex min-h-full flex-col gap-3 text-sm">
        <HullSource characterId={activeCharacterId} intoRef={hullSource} />
        <LiveStatus>
          {failed ? t('assets.movePlan.failed') : planFailed ? t('assets.movePlan.planFailed') : ''}
        </LiveStatus>
        {savedHaul && !showingHaul && (
          <div>
            <Button size="sm" onClick={() => setShowingHaul(true)}>
              {t('assets.movePlan.resumeHaul')}
            </Button>
          </div>
        )}
        {showingHaul && savedHaul ? (
          <ActiveHaulView
            haul={savedHaul}
            onBack={() => setShowingHaul(false)}
            onClear={async () => {
              await setSavedHaul(null);
              setShowingHaul(false);
            }}
          />
        ) : failed ? (
          <p className="text-text-dim">{t('assets.movePlan.failed')}</p>
        ) : !loaded ? (
          <Spinner size="sm" label={t('assets.movePlan.loading')} />
        ) : result ? (
          <PlanResult
            state={result}
            compareOpen={compareOpen}
            onToggleCompare={() => setCompareOpen((v) => !v)}
            haulerOverride={haulerOverride}
            onPickHauler={(next) => replan(packed, next)}
            headingRef={planHeadingRef}
            onBack={() => {
              setResult(null);
              focusAfterCommit(deliverHeadingRef);
            }}
            onDone={onClose}
            onShowRoute={showRoute}
            routing={routing}
            routeFailed={routeFailed}
            onPackShip={packShip}
            onUnpackShip={unpackShip}
            rigsOf={(itemId) => loaded.rigs.get(itemId) ?? 0}
            canPack={(typeId) => loaded.unitM3.has(typeId)}
            name={name}
            placeLabel={placeLabel}
            hueOf={hueOf}
          />
        ) : (
          <>
            {/* Pinned on a phone so the destination stays in reach while the list scrolls. */}
            <section
              aria-label={t('assets.movePlan.whereTo')}
              className="sticky -top-3 z-20 -mx-3 bg-panel px-3 pt-3 pb-1 sm:static sm:mx-0 sm:p-0"
            >
              <div className="flex flex-col gap-2 rounded-xs border border-accent-dim bg-accent/10 p-3">
                <h3
                  ref={deliverHeadingRef}
                  tabIndex={-1}
                  className="text-xs font-semibold tracking-wide text-text-dim uppercase focus:outline-none"
                >
                  {t('assets.movePlan.deliverTo')}
                </h3>
                <SolarSystemPicker
                  value={destSystem}
                  places
                  onChange={(id, station) =>
                    station
                      ? chooseDestination(null, station.id, {
                          id: station.id,
                          name: station.name,
                          systemId: id,
                        })
                      : chooseDestination(id, null)
                  }
                  ariaLabel={t('assets.movePlan.destinationSystem')}
                  placeholder={t('assets.movePlan.destinationSystem')}
                  triggerLabel={
                    destStation !== null
                      ? (stationLabels[ownStations.findIndex(([id]) => id === destStation)] ??
                        searchedStation?.name ??
                        placeLabel(destStation))
                      : undefined
                  }
                />
                {ownStations.length > 0 && (
                  <div
                    role="group"
                    aria-label={t('assets.movePlan.destinationStation')}
                    className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-1 sm:flex-wrap sm:overflow-visible"
                  >
                    <span className="shrink-0 text-xs text-text-dim">
                      {t('assets.movePlan.yourStations')}
                    </span>
                    {ownStations.map(([id, fullName], i) => (
                      <FilterChip
                        key={id}
                        label={stationLabels[i]}
                        tooltip={stationLabels[i] !== fullName ? fullName : undefined}
                        selected={destStation === id}
                        onToggle={() =>
                          destStation === id
                            ? chooseDestination(null, null)
                            : chooseDestination(null, id)
                        }
                        className="shrink-0"
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section aria-label={t('assets.movePlan.whatToMove')} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{t('assets.movePlan.whatToMove')}</h3>
                {collapsed.size > 0 && (
                  <span className="text-xs text-text-dim">
                    {t('assets.movePlan.locationFolded')}
                  </span>
                )}
              </div>
              {loaded.stacks.length === 0 &&
                (loaded.sources.length === 0 && loaded.skipped.length > 0 ? (
                  <p className="text-text-dim">{t('assets.skippedAllHint')}</p>
                ) : (
                  <p className="text-text-dim">{t('assets.movePlan.noItems')}</p>
                ))}
              <PickerList
                grouped={grouped}
                characterName={(id) => loaded.sources.find((s) => s.characterId === id)?.name ?? ''}
                placeLabel={placeLabel}
                typeName={name}
                unitM3={loaded.unitM3}
                hueOf={hueOf}
                selected={selected}
                onToggle={toggle}
                collapsed={collapsed}
                onToggleCollapsed={(groupKey) =>
                  setFolded(() => {
                    const next = new Set(collapsed);
                    if (next.has(groupKey)) next.delete(groupKey);
                    else next.add(groupKey);
                    return next;
                  })
                }
                atDestination={atDestination}
              />
            </section>
            {planFailed && <p className="text-text-dim">{t('assets.movePlan.planFailed')}</p>}
            {/* Sticky to the tab body's own scroller, so the totals stay in reach. */}
            <div className="sticky -bottom-3 mt-auto -mx-3 -mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line bg-panel px-3 pt-2 pb-2">
              <div className="flex min-w-0 basis-full flex-col gap-1.5 sm:flex-1 sm:basis-0">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  {segments.map((s) => (
                    <i
                      key={s.key}
                      className="block h-full"
                      style={{ width: `${s.share * 100}%`, background: pickupHueVar(hueOf(s.key)) }}
                    />
                  ))}
                </div>
                <span className="text-xs tabular-nums" aria-live="polite">
                  {totals.stacks + totals.ships === 0
                    ? t('assets.movePlan.pickedNothing')
                    : t('assets.movePlan.pickedSummary', {
                        what: pickedWhat,
                        volume: formatCubicMetres(totals.m3),
                      })}
                </span>
                {totals.stacks + totals.ships > 0 && !hasDestination && (
                  <span className="text-xs text-text-dim">
                    {t('assets.movePlan.pickDestination')}
                  </span>
                )}
              </div>
              <Button variant="ghost" className="max-sm:flex-1" onClick={onClose}>
                {t('assets.movePlan.cancel')}
              </Button>
              <Button
                variant="primary"
                className="max-sm:flex-1"
                disabled={totals.stacks + totals.ships === 0 || !hasDestination || working}
                loading={working}
                onClick={() => void showPlan()}
              >
                {t('assets.movePlan.showPlan')}
              </Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={replacing}
        title={t('assets.movePlan.replaceHaulTitle')}
        body={t('assets.movePlan.replaceHaulBody')}
        actionLabel={t('assets.movePlan.replaceHaul')}
        cancelLabel={t('assets.movePlan.cancel')}
        onConfirm={async () => {
          setReplacing(false);
          await commitRoute();
        }}
        onClose={() => setReplacing(false)}
      />
    </section>
  );
}

/** Pickup locations a destination covers: one station, or every pickup in the picked system. */
function coveredLocations(
  systems: ReadonlyMap<number, number | null> | undefined,
  system: number | null,
  station: number | null
): Set<number> {
  const ids = new Set<number>();
  if (station !== null) ids.add(station);
  else if (system !== null) for (const [id, sys] of systems ?? []) if (sys === system) ids.add(id);
  return ids;
}

interface HullSourceData {
  catalogue: FittingCatalogue | null;
  catalogueFailed: boolean;
  profile: PilotProfile | null;
  profileFailed: boolean;
  /** False when the pilot's skills could not be read, so `profile` assumes none and "can fly" means nothing. */
  skillsKnown: boolean;
}

/**
 * Loads the fitting catalogue and pilot profile only while the Move tab is open,
 * so the Assets page does not pull the fitting data on every visit.
 */
function HullSource({
  characterId,
  intoRef,
}: {
  characterId: number | null;
  intoRef: { current: HullSourceData };
}) {
  const catalogue = useFittingCatalogue();
  const catalogueFailed = useFittingCatalogueFailed();
  const { profile, failed: profileFailed, skillsKnown } = usePilotProfile(characterId);
  useEffect(() => {
    intoRef.current = { catalogue, catalogueFailed, profile, profileFailed, skillsKnown };
  }, [intoRef, catalogue, catalogueFailed, profile, profileFailed, skillsKnown]);
  return null;
}
