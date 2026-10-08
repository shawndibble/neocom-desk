import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  Caret,
  Checkbox,
  Disclosure,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { buildHullCatalogue } from '@/engine/fittings/hullCatalogue';
import type { PilotProfile } from '@/engine/fittings/types';
import { planMove, type MoveHull, type MovePlan } from '@/engine/assets/movePlan';
import {
  CharacterScopeReadout,
  type CharacterScopeReadoutProps,
} from '@/features/character/CharacterScopeReadout';
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
import { routeToHref } from '@/features/travel/routeSafetyLink';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { formatCubicMetres } from '@/lib/volume';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import {
  holdCapacityM3,
  pickerStacks,
  selectedPlanCharacters,
  type MovePlanSource,
  type PickerStack,
} from './movePlanInput';

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
  const byPlace = new Map<number, PickerStack>();
  for (const s of stacks) if (!byPlace.has(s.locationId)) byPlace.set(s.locationId, s);
  await Promise.all(
    [...byPlace].map(async ([id, stack]) => {
      places.set(id, (await placeName(stack).catch(() => null)) ?? String(id));
    })
  );
  return { sources, shipTypeIds, stacks, typeNames, unitM3, places };
}

interface PlanState {
  plan: MovePlan;
  destinationSystem: number | null;
  /** System of each pickup location, for the Route Safety link's start. */
  pickupSystems: Map<number, number | null>;
}

interface MovePlanModalProps {
  open: boolean;
  onClose: () => void;
  /** The Characters the page's filter names. */
  characterIds: readonly number[];
  activeCharacterId: number | null;
  filterControl?: ReactNode;
}

/**
 * Plan a move: tick what to carry, say where to, see the work list per
 * Character and pickup with a suggested hauler. Modal state only — no route.
 * Volumes and trips are an estimate from hull class; the Route Safety link
 * answers the safety question.
 */
export function MovePlanModal({
  open,
  onClose,
  characterIds,
  activeCharacterId,
  filterControl,
}: MovePlanModalProps) {
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
  /** Bumped on every reset so a plan still being worked out for an old session is dropped. */
  const session = useRef(0);
  const hullSource = useRef<HullSourceData>({ catalogue: null, profile: null });
  const hullCapacity = useRef(new Map<number, number | null>());
  const idsKey = characterIds.join(',');

  useEffect(() => {
    if (!open) return;
    let live = true;
    /* eslint-disable react-hooks/set-state-in-effect -- reset for a new open or Character set */
    setLoaded(null);
    setFailed(false);
    setSelected(new Set());
    setResult(null);
    setDestSystem(null);
    setDestStation(null);
    setCompareOpen(false);
    setCollapsed(new Set());
    setPlanFailed(false);
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
  }, [open, idsKey]);

  const grouped = useMemo(() => {
    const out = new Map<number, Map<number, PickerStack[]>>();
    for (const s of loaded?.stacks ?? []) {
      const byPlace = out.get(s.characterId) ?? new Map<number, PickerStack[]>();
      byPlace.set(s.locationId, [...(byPlace.get(s.locationId) ?? []), s]);
      out.set(s.characterId, byPlace);
    }
    return out;
  }, [loaded]);

  const ownStations = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of loaded?.stacks ?? [])
      if (s.locationType === 'station') seen.set(s.locationId, loaded!.places.get(s.locationId)!);
    return [...seen].sort(([, a], [, b]) => a.localeCompare(b));
  }, [loaded]);

  const toggle = (keys: readonly string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const hasDestination = destSystem !== null || destStation !== null;

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
    return haulers.flatMap((h) => {
      const capacityM3 = hullCapacity.current.get(h.typeId);
      return capacityM3
        ? [
            {
              typeId: h.typeId,
              name: h.name,
              hullClass: h.group,
              capacityM3,
              owned: owned.has(h.typeId),
            },
          ]
        : [];
    });
  }

  async function showPlan() {
    if (!loaded || !hasDestination) return;
    setWorking(true);
    setPlanFailed(false);
    const mine = session.current;
    try {
      const chosen = loaded.stacks.filter((s) => selected.has(s.key));
      const destinationSystem =
        destStation !== null
          ? await loadStationSystemId(destStation).catch(() => null)
          : destSystem;
      const pickupSystems = new Map<number, number | null>();
      await Promise.all(
        [...new Map(chosen.map((s) => [s.locationId, s]))].map(async ([id, stack]) => {
          pickupSystems.set(id, await placeSystem(stack).catch(() => null));
        })
      );
      const destinationIds = new Set<number>();
      if (destStation !== null) destinationIds.add(destStation);
      else
        for (const [id, system] of pickupSystems)
          if (system !== null && system === destinationSystem) destinationIds.add(id);

      const hulls = await loadHulls();
      const plan = planMove({
        destinationLocationIds: destinationIds,
        characters: selectedPlanCharacters(loaded.sources, loaded.shipTypeIds, selected),
        unitM3: loaded.unitM3,
        shipTypeIds: loaded.shipTypeIds,
        hulls,
      });
      if (mine === session.current) setResult({ plan, destinationSystem, pickupSystems });
    } catch {
      if (mine === session.current) setPlanFailed(true);
    } finally {
      if (mine === session.current) setWorking(false);
    }
  }

  const name = (typeId: number) => loaded?.typeNames.get(typeId) ?? `#${typeId}`;
  const placeLabel = (id: number) => loaded?.places.get(id) ?? String(id);

  return (
    <Modal open={open} onClose={onClose} title={t('assets.movePlan.title')} placement="sheet-full">
      <div className="flex min-h-full flex-col gap-3 text-sm">
        {open && <HullSource characterId={activeCharacterId} intoRef={hullSource} />}
        {filterControl}
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
            onBack={() => setResult(null)}
            onDone={onClose}
            name={name}
            placeLabel={placeLabel}
          />
        ) : (
          <>
            <section aria-label={t('assets.movePlan.whereTo')} className="flex flex-col gap-2">
              <h3 className="font-medium">{t('assets.movePlan.whereTo')}</h3>
              <SolarSystemPicker
                value={destSystem}
                onChange={(id) => {
                  setDestSystem(id);
                  setDestStation(null);
                }}
                ariaLabel={t('assets.movePlan.destinationSystem')}
                placeholder={t('assets.movePlan.destinationSystem')}
              />
              {ownStations.length > 0 && (
                <Select
                  value={destStation === null ? '' : String(destStation)}
                  onValueChange={(v) => {
                    setDestStation(Number(v));
                    setDestSystem(null);
                  }}
                >
                  <SelectTrigger aria-label={t('assets.movePlan.destinationStation')}>
                    <SelectValue placeholder={t('assets.movePlan.destinationStation')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownStations.map(([id, label]) => (
                      <SelectItem key={id} value={String(id)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </section>
            <section aria-label={t('assets.movePlan.whatToMove')} className="flex flex-col gap-2">
              <h3 className="font-medium">{t('assets.movePlan.whatToMove')}</h3>
              {loaded.stacks.length === 0 && (
                <p className="text-text-dim">{t('assets.movePlan.noItems')}</p>
              )}
              {/* Bounded: the destination above and the action bar below stay on
                  screen however many stacks there are. */}
              <div className="max-h-[min(24rem,45dvh)] overflow-y-auto overscroll-contain rounded-xs border border-line">
                {[...grouped].map(([characterId, byPlace]) => {
                  const characterName = loaded.sources.find(
                    (s) => s.characterId === characterId
                  )?.name;
                  const characterKeys = [...byPlace.values()].flatMap((stacks) =>
                    stacks.map((s) => s.key)
                  );
                  return (
                    <div key={characterId} className="flex flex-col">
                      <div
                        className={`${tappableRowClassName} sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-panel-2 px-2 font-medium`}
                      >
                        <GroupCheckbox
                          keys={characterKeys}
                          selected={selected}
                          onToggle={toggle}
                          label={t('assets.movePlan.selectAllFor', { character: characterName })}
                        />
                        {characterName}
                      </div>
                      {[...byPlace].map(([locationId, stacks]) => {
                        const keys = stacks.map((s) => s.key);
                        const groupKey = `${characterId}:${locationId}`;
                        const isOpen = !collapsed.has(groupKey);
                        const picked = keys.filter((k) => selected.has(k)).length;
                        return (
                          <div key={locationId} className="flex flex-col border-b border-line">
                            <div className="flex items-center gap-1 px-2 text-text-dim">
                              <GroupCheckbox
                                keys={keys}
                                selected={selected}
                                onToggle={toggle}
                                label={t('assets.movePlan.selectAllAt', {
                                  place: placeLabel(locationId),
                                })}
                              />
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() =>
                                  setCollapsed((prev) => {
                                    const next = new Set(prev);
                                    if (isOpen) next.add(groupKey);
                                    else next.delete(groupKey);
                                    return next;
                                  })
                                }
                                className={`${tappableRowClassName} ${rowInteractiveClassName} ${focusRingInsetClassName} flex min-w-0 flex-1 items-center gap-1.5 text-left`}
                              >
                                <Caret expanded={isOpen} />
                                <span className="min-w-0 flex-1 truncate">
                                  {placeLabel(locationId)}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums">
                                  {t('assets.movePlan.groupCount', {
                                    picked,
                                    count: keys.length,
                                  })}
                                </span>
                              </button>
                            </div>
                            {isOpen &&
                              stacks.map((s) => (
                                <label
                                  key={s.key}
                                  className={`${tappableRowClassName} flex items-center gap-2 pr-2 pl-8`}
                                >
                                  <Checkbox
                                    checked={selected.has(s.key)}
                                    onChange={(e) => toggle([s.key], e.target.checked)}
                                  />
                                  <span className="min-w-0 flex-1 truncate">{name(s.typeId)}</span>
                                  <span className="text-text-dim tabular-nums">
                                    × {s.quantity.toLocaleString()}
                                  </span>
                                </label>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
            {planFailed && <p className="text-text-dim">{t('assets.movePlan.planFailed')}</p>}
            {/* Sticky rather than a Modal footer prop: the sheet's body is the
                scroller (same bar FilterBar's sheet uses). */}
            <div className="sticky bottom-0 mt-auto -mx-3 -mb-[calc(0.75rem_+_env(safe-area-inset-bottom))] flex items-center gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
              <span className="min-w-0 flex-1 text-xs text-text-dim" aria-live="polite">
                {t('assets.movePlan.picked', { count: selected.size })}
              </span>
              <Button variant="ghost" onClick={onClose}>
                {t('assets.movePlan.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={selected.size === 0 || !hasDestination || working}
                loading={working}
                onClick={() => void showPlan()}
              >
                {t('assets.movePlan.showPlan')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Select-all box for a group: ticked when every key is, mixed when some are. */
function GroupCheckbox({
  keys,
  selected,
  onToggle,
  label,
}: {
  keys: readonly string[];
  selected: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
  label: string;
}) {
  const count = keys.filter((k) => selected.has(k)).length;
  const all = keys.length > 0 && count === keys.length;
  return (
    <label className={`${tappableRowClassName} flex items-center`}>
      <Checkbox
        ref={(el) => {
          if (el) el.indeterminate = count > 0 && !all;
        }}
        checked={all}
        onChange={(e) => onToggle(keys, e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

interface HullSourceData {
  catalogue: FittingCatalogue | null;
  profile: PilotProfile | null;
}

/**
 * Loads the fitting catalogue and pilot profile only while the modal is open,
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

function PlanResult({
  state,
  scope,
  compareOpen,
  onToggleCompare,
  onBack,
  onDone,
  name,
  placeLabel,
}: {
  state: PlanState;
  scope: CharacterScopeReadoutProps;
  compareOpen: boolean;
  onToggleCompare: () => void;
  onBack: () => void;
  onDone: () => void;
  name: (typeId: number) => string;
  placeLabel: (id: number) => string;
}) {
  const { t } = useTranslation();
  const { plan, destinationSystem, pickupSystems } = state;
  if (plan.perCharacter.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium">{t('assets.movePlan.nothingToMove')}</p>
        <p className="text-text-dim">{t('assets.movePlan.nothingToMoveHint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>
            {t('assets.movePlan.back')}
          </Button>
          <Button variant="primary" onClick={onBack}>
            {t('assets.movePlan.chooseDestination')}
          </Button>
        </div>
      </div>
    );
  }
  const { totals } = plan;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t('assets.movePlan.edit')}
        </Button>
        <CharacterScopeReadout {...scope} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <Stat label={t('assets.movePlan.stacks')} value={totals.stacks.toLocaleString()} />
        <Stat
          label={t('assets.movePlan.volume')}
          value={`${formatCubicMetres(totals.totalM3)} m³`}
        />
        <Stat label={t('assets.movePlan.characters')} value={String(totals.characters)} />
        <Stat label={t('assets.movePlan.ships')} value={String(totals.shipsToFly)} />
        <Stat
          label={t('assets.movePlan.trips')}
          value={totals.trips === null ? '—' : String(totals.trips)}
        />
      </dl>
      {plan.suggested ? (
        <div>
          <p>
            {t('assets.movePlan.suggested', {
              hull: plan.suggested.hull.name,
              count: plan.suggested.trips,
            })}
          </p>
          <Disclosure
            label={t('assets.movePlan.compare')}
            expanded={compareOpen}
            onToggle={onToggleCompare}
          >
            <ul className="text-text-dim">
              {plan.comparison.map((o) => (
                <li key={o.hull.typeId}>
                  {o.hull.name} · {t('assets.movePlan.tripCount', { count: o.trips })}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : (
        totals.totalM3 > 0 && <p className="text-text-dim">{t('assets.movePlan.noHauler')}</p>
      )}
      {plan.perCharacter.map((c) => (
        <section key={c.characterId} className="flex flex-col gap-2">
          <h3 className="font-medium">{c.name}</h3>
          {c.pickups.map((p) => (
            <div key={p.locationId} className="flex flex-col gap-1">
              <h4 className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{placeLabel(p.locationId)}</span>
                <span className="text-text-dim">{formatCubicMetres(p.totalM3)} m³</span>
                {destinationSystem !== null && (
                  <Link
                    className={inlineLinkClassName}
                    to={routeToHref(destinationSystem, pickupSystems.get(p.locationId) ?? null)}
                  >
                    {t('assets.movePlan.routeSafety')}
                  </Link>
                )}
              </h4>
              <ul className="text-xs text-text-dim">
                {p.lines.map((l) => (
                  <li key={l.typeId}>
                    {l.quantity.toLocaleString()} × {name(l.typeId)}
                    {l.m3 !== null && ` — ${formatCubicMetres(l.m3)} m³`}
                  </li>
                ))}
                {p.unknownVolume.map((u) => (
                  <li key={`unknown-${u.typeId}`}>
                    {u.quantity.toLocaleString()} × {name(u.typeId)} —{' '}
                    {t('assets.movePlan.volumeUnknown')}
                  </li>
                ))}
                {p.ships.map((s) => (
                  <li key={s.itemId}>
                    {name(s.typeId)} — {t('assets.movePlan.flyIt')}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t('assets.movePlan.back')}
        </Button>
        <Button variant="primary" onClick={onDone}>
          {t('assets.movePlan.done')}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-text-dim">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
