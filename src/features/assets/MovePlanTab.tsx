import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, LiveStatus, Spinner } from '@/components/ui';
import { buildHullCatalogue } from '@/engine/fittings/hullCatalogue';
import type { PilotProfile } from '@/engine/fittings/types';
import { planMove, type MoveHull } from '@/engine/assets/movePlan';
import { loadOtherCharactersAssets } from '@/features/character/assets';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
import { loadTypeNames, loadTypePackagedVolumes } from '@/features/character/typeNames';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';
import {
  useFittingCatalogue,
  type FittingCatalogue,
} from '@/features/fittings/useFittingCatalogue';
import { hullCargoHolds } from '@/features/market/haulingCargo';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { formatCubicMetres } from '@/lib/volume';
import { loadGroupCategories, loadShipTree, loadTypes } from '@/sde/loadSde';
import { PickerList } from './MovePlanPicker';
import { PlanResult, type PlanState } from './MovePlanResult';
import {
  fittedRigCounts,
  holdCapacityM3,
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
}

function placeName(stack: PickerStack): Promise<string | null> {
  return stack.locationType === 'station'
    ? loadStationName(stack.locationId)
    : loadStructureName(stack.characterId, stack.locationId);
}

function placeSystem(stack: PickerStack): Promise<number | null> {
  return stack.locationType === 'station'
    ? loadStationSystemId(stack.locationId)
    : loadStructureSystemId(stack.characterId, stack.locationId);
}

async function load(characterIds: readonly number[]): Promise<Loaded> {
  const [sources, types, groupCategories] = await Promise.all([
    loadOtherCharactersAssets(characterIds),
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
    loadTypePackagedVolumes(stackTypeIds),
  ]);
  const places = new Map<number, string>();
  const systems = new Map<number, number | null>();
  const byPlace = new Map<number, PickerStack>();
  for (const s of stacks) if (!byPlace.has(s.locationId)) byPlace.set(s.locationId, s);
  await Promise.all(
    [...byPlace].map(async ([id, stack]) => {
      places.set(id, (await placeName(stack).catch(() => null)) ?? String(id));
      systems.set(id, await placeSystem(stack).catch(() => null));
    })
  );
  const hues = pickupHues(stacks.map((s) => s.locationId));
  const rigs = fittedRigCounts(sources);
  return { sources, shipTypeIds, stacks, typeNames, unitM3, places, systems, hues, rigs };
}

interface MovePlanTabProps {
  /** Leaves the plan: Cancel, and Done on the result. The page returns to its Items tab. */
  onClose: () => void;
  /** The Characters the page's filter names. */
  characterIds: readonly number[];
  activeCharacterId: number | null;
}

/**
 * Plan a move: tick what to carry, say where to, see the work list per
 * Character and pickup with a suggested hauler. The Assets page's Move tab
 * mounts it, so its state lasts while the tab is open and starts fresh on re-entry.
 * Volumes and trips are an estimate from hull class; the Route Safety link
 * answers the safety question.
 */
export function MovePlanTab({ onClose, characterIds, activeCharacterId }: MovePlanTabProps) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [destSystem, setDestSystem] = useState<number | null>(null);
  const [destStation, setDestStation] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<PlanState | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  /** Collapsed pickup groups, `characterId:locationId`. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [planFailed, setPlanFailed] = useState(false);
  /** Ships (itemID) the plan hauls packaged instead of flying. */
  const [packed, setPacked] = useState<ReadonlySet<number>>(new Set());
  /** What the shown plan was worked out from, so packing a ship can re-plan it. */
  const planBase = useRef<Omit<Parameters<typeof planMove>[0], 'packedShipIds'> | null>(null);
  /** Bumped on every reset so a plan still being worked out for an old session is dropped. */
  const session = useRef(0);
  const hullSource = useRef<HullSourceData>({ catalogue: null, profile: null });
  const hullCapacity = useRef(new Map<number, number | null>());
  const idsKey = characterIds.join(',');
  const focusAfterCommit = useFocusAfterCommit();
  const planHeadingRef = useRef<HTMLHeadingElement>(null);
  const deliverHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;
    /* eslint-disable react-hooks/set-state-in-effect -- reset for a new Character set */
    setLoaded(null);
    setFailed(false);
    setSelected(new Set());
    setResult(null);
    setDestSystem(null);
    setDestStation(null);
    setCompareOpen(false);
    setCollapsed(new Set());
    setPlanFailed(false);
    setPacked(new Set());
    setWorking(false);
    session.current += 1;
    /* eslint-enable react-hooks/set-state-in-effect */
    load(characterIds).then(
      (data) => {
        if (!live) return;
        // A long list opens folded: the group headers are the overview.
        if (data.stacks.length > COLLAPSE_ABOVE) {
          setCollapsed(new Set(data.stacks.map((st) => `${st.characterId}:${st.locationId}`)));
        }
        setLoaded(data);
      },
      () => {
        if (live) setFailed(true);
      }
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands for characterIds
  }, [idsKey]);

  const grouped = useMemo(() => {
    const out = new Map<number, Map<number, PickerStack[]>>();
    for (const s of loaded?.stacks ?? []) {
      const byPlace = out.get(s.characterId) ?? new Map<number, PickerStack[]>();
      byPlace.set(s.locationId, [...(byPlace.get(s.locationId) ?? []), s]);
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
  function chooseDestination(system: number | null, station: number | null) {
    setDestSystem(system);
    setDestStation(station);
  }

  async function loadHulls(): Promise<MoveHull[]> {
    const { catalogue, profile } = hullSource.current;
    if (!catalogue || !profile || !loaded) return [];
    const haulers =
      buildHullCatalogue([...catalogue.groupsById.values()], catalogue.marketTypes).find(
        (c) => c.name === HAULER_CLASS
      )?.hulls ?? [];
    const todo = haulers.filter((h) => !hullCapacity.current.has(h.typeId));
    await mapWithConcurrencyLimit(todo, HULL_CONCURRENCY, async (hull) => {
      try {
        hullCapacity.current.set(
          hull.typeId,
          holdCapacityM3(await hullCargoHolds(hull.typeId, profile))
        );
      } catch {
        // Not cached: a transient failure should be retried next time.
      }
    });
    const owned = new Set(
      loaded.sources.flatMap((s) => s.assets.filter((a) => a.is_singleton).map((a) => a.type_id))
    );
    const sized = haulers.filter((h) => hullCapacity.current.get(h.typeId));
    // From the bundled ship tree, so no ESI call per hauler; a hull it lacks counts as flyable.
    const tree = await loadShipTree().catch(() => null);
    const required = new Map(tree?.ships.map((ship) => [ship.typeID, ship.required]));
    const flyable = sized.map((h) =>
      (required.get(h.typeId) ?? []).every(
        (r) => (profile.skillLevels.get(r.skillTypeID) ?? 0) >= r.level
      )
    );
    return sized.map((h, i) => ({
      typeId: h.typeId,
      name: h.name,
      hullClass: h.group,
      capacityM3: hullCapacity.current.get(h.typeId)!,
      owned: owned.has(h.typeId),
      canFly: flyable[i],
    }));
  }

  async function showPlan() {
    if (!loaded || !hasDestination) return;
    setWorking(true);
    setPlanFailed(false);
    const mine = session.current;
    try {
      const destinationSystem =
        destStation !== null
          ? await loadStationSystemId(destStation).catch(() => null)
          : destSystem;
      const hulls = await loadHulls();
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
        setResult({
          plan,
          destinationSystem,
          destinationStation:
            destStation !== null ? (loaded.places.get(destStation) ?? null) : null,
          pickupSystems: loaded.systems,
        });
        focusAfterCommit(planHeadingRef);
      }
    } catch {
      if (mine === session.current) setPlanFailed(true);
    } finally {
      if (mine === session.current) setWorking(false);
    }
  }

  /** Hauls this ship packaged instead of flying it, and re-plans around its volume. */
  function packShip(itemId: number) {
    const base = planBase.current;
    if (!base) return;
    const next = new Set(packed).add(itemId);
    setPacked(next);
    setResult((r) => (r ? { ...r, plan: planMove({ ...base, packedShipIds: next }) } : r));
  }

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
        {failed ? (
          <p className="text-text-dim">{t('assets.movePlan.failed')}</p>
        ) : !loaded ? (
          <Spinner size="sm" label={t('assets.movePlan.loading')} />
        ) : result ? (
          <PlanResult
            state={result}
            scope={
              loaded.sources.length === 1
                ? {
                    scope: 'one',
                    characterId: loaded.sources[0].characterId,
                    characterName: loaded.sources[0].name,
                  }
                : { scope: 'all', total: loaded.sources.length }
            }
            compareOpen={compareOpen}
            onToggleCompare={() => setCompareOpen((v) => !v)}
            headingRef={planHeadingRef}
            onBack={() => {
              setResult(null);
              focusAfterCommit(deliverHeadingRef);
            }}
            onDone={onClose}
            onPackShip={packShip}
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
                  onChange={(id) => chooseDestination(id, null)}
                  ariaLabel={t('assets.movePlan.destinationSystem')}
                  placeholder={t('assets.movePlan.destinationSystem')}
                  triggerLabel={
                    destStation !== null
                      ? (stationLabels[ownStations.findIndex(([id]) => id === destStation)] ??
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
              {loaded.stacks.length === 0 && (
                <p className="text-text-dim">{t('assets.movePlan.noItems')}</p>
              )}
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
                  setCollapsed((prev) => {
                    const next = new Set(prev);
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
  profile: PilotProfile | null;
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
  const { profile } = usePilotProfile(characterId);
  useEffect(() => {
    intoRef.current = { catalogue, profile };
  }, [intoRef, catalogue, profile]);
  return null;
}
