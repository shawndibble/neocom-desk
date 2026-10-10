import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  CachedEmptyState,
  EmptyState,
  IconButton,
  Panel,
  SegmentedControl,
  Spinner,
  STAT_CHIP_TONE_TEXT_CLASS,
  Tooltip,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { GrantBanner } from '@/app/GrantNote';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { loadCharacterClones, loadImplantDescriptions } from '@/features/character/clones';
import { ItemInfoLink } from '@/features/entities';
import { loadCharacterSpSummary } from '@/features/character/characterSp';
import { getLastKnownSpSummary, type CharacterSpSummary } from '@/stores/characterSp';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadSystemNameAndSecurity, loadSystemSecurity } from '@/features/character/systemSecurity';
import { SecurityStatus } from '@/components/SecurityStatus';
import { IskAmount } from '@/components/ui';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import { cooldownProgress, sumImplantValue } from '@/engine/implantValue';
import { loadCharacterImplantsWithStatus } from '@/features/skills/data';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CachedResult } from '@/esi/cache';
import type { CharacterClones, JumpClone, SkillQueueEntry } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import {
  cloneJumpCooldown,
  cloneJumpCooldownHours,
  INFOMORPH_SYNCHRONIZING_SKILL_ID,
} from '@/engine/cloneJump';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { clonesCsvColumns } from '@/features/character/clonesCsv';
import {
  CloneVerdictCard,
  type CloneVerdictCardState,
} from '@/features/character/CloneVerdictCard';
import {
  loadCloneTrainingData,
  WORN_CLONE_ID,
  type CloneTrainingData,
} from '@/features/character/cloneTraining';
import {
  CLONES_SORTS,
  sortClones,
  useClonesSort,
  type ClonesSort,
} from '@/features/character/clonesSort';
import { cloneVerdict, MIN_JUMP_GAIN_SECONDS, type CloneRow } from '@/engine/cloneVerdict';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { isQueuePaused } from '@/features/skills/queueStatus';

/** Stable identity, so the fallback doesn't invalidate the column memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_CLONES: readonly JumpClone[] = [];
const NO_SYSTEMS: ReadonlyMap<number, number | null> = new Map();
const NO_SECURITIES: ReadonlyMap<number, number> = new Map();
const NO_IDS: readonly number[] = [];
/** Touch-sized on a phone, compact beside a pointer. */
/** 44px tap box on a phone; stacked wrapped links must not overlap, so no negative margins here. */
const TOUCH_LINK = 'inline-flex min-h-11 items-center md:min-h-0';

interface Snapshot {
  clonesResult: CachedResult<CharacterClones> | null;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  clonesNeedsReauth: boolean;
  /** Effective level of Infomorph Synchronizing; 0 when unknown/untrained. */
  infomorphLevel: number;
  /** Implants of the clone the Character is wearing; the Skills > Trained read, now loaded here too. */
  wornImplants: CachedResult<number[]> | null;
  /** The read-implants grant is missing (401/403): a banner above the table, never in place of it. */
  implantsNeedsReauth: boolean;
  /** The active training queue. */
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  /** What the training verdict needs; null when the attribute sheet can't be read. */
  training: CloneTrainingData | null;
  /** The Character's current solar system; null when unresolved (missing grant, offline, uncached). */
  characterSystemId: number | null;
  /** Solar system of each clone location, keyed by `location_id`; null when it can't be resolved. */
  systemIds: Map<number, number | null>;
  /** Name of the Character's current system; null when unresolved. */
  characterSystemName: string | null;
  /** Security status of every system above, keyed by solar system id; absent when unresolved. */
  securities: Map<number, number>;
  implantNames: Map<number, string>;
  /** Markup-stripped implant descriptions for the name tooltips; absent ids get no tooltip. */
  implantDescriptions: Map<number, string>;
  /** Jump-clone and home-clone location names, keyed by `location_id`. */
  locationNames: Map<number, string>;
  /** Total/unallocated SP for the shared Character-overview header. */
  sp: CharacterSpSummary;
  /** Captured in the loader, not at render: `Date.now()` is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

async function loadClonesSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [
    { cached: clonesResult, needsReauth: clonesNeedsReauth },
    corrected,
    sp,
    { cached: wornImplants, needsReauth: implantsNeedsReauth },
    characterSystemId,
  ] = await Promise.all([
    loadCharacterClones(characterId),
    loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }),
    loadCharacterSpSummary(characterId, Date.now()),
    loadCharacterImplantsWithStatus(characterId),
    loadCharacterSolarSystemId(characterId),
  ]);
  const loadedAt = Date.now();
  // Effective (issue #1236: min of queue-corrected trained and active), not
  // raw trained_skill_level — the cooldown should never read shorter than
  // what the character's clone can actually use right now.
  const infomorphLevel = corrected.effective.get(INFOMORPH_SYNCHRONIZING_SKILL_ID) ?? 0;

  const clones = clonesResult?.data.jump_clones ?? [];
  const homeLocation = clonesResult?.data.home_location;

  // Already superseded: skip the name resolves, their results would be discarded.
  const implantTypeIds = signal.cancelled
    ? []
    : [...new Set([...clones.flatMap((c) => c.implants), ...(wornImplants?.data ?? [])])];
  const [implantNames, implantDescriptions] = await Promise.all([
    loadTypeNames(implantTypeIds),
    loadImplantDescriptions(implantTypeIds),
  ]);

  // Ids to resolve for one location type: every jump clone of that type, plus
  // the home clone's location if it happens to be that type too.
  function idsForType(type: 'station' | 'structure'): number[] {
    if (signal.cancelled) return [];
    return [
      ...new Set([
        ...clones.filter((c) => c.location_type === type).map((c) => c.location_id),
        ...(homeLocation?.location_type === type && homeLocation.location_id !== undefined
          ? [homeLocation.location_id]
          : []),
      ]),
    ];
  }
  const stationIds = idsForType('station');
  const structureIds = idsForType('structure');
  const [stationSystems, structureSystems] = await Promise.all([
    Promise.all(stationIds.map((id) => loadStationSystemId(id))),
    Promise.all(structureIds.map((id) => loadStructureSystemId(characterId, id))),
  ]);
  const systemIds = new Map<number, number | null>();
  stationIds.forEach((id, i) => systemIds.set(id, stationSystems[i] ?? null));
  structureIds.forEach((id, i) => systemIds.set(id, structureSystems[i] ?? null));
  const [resolvedStations, resolvedStructures] = await Promise.all([
    // Every id here is an NPC station by `location_type`, and those come out
    // of the SDE snapshot rather than ESI (issue #655) — a map lookup per id,
    // so there is nothing worth capping. Only an unreadable snapshot puts a
    // request back behind each id; see `loadAssetsSnapshot` for the same note.
    Promise.all(stationIds.map((id) => loadStationName(id))),
    // A 403 here means the structure is outside this character's ACL, not a
    // revoked scope — loadStructureName already narrows that so it never
    // signals a re-auth failure; the clone just renders with an id fallback.
    Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
  ]);
  const securityIds = signal.cancelled
    ? []
    : [
        ...new Set(
          [...systemIds.values(), characterSystemId].filter((id): id is number => id !== null)
        ),
      ];
  const [characterSystem, securityList] = await Promise.all([
    characterSystemId === null || signal.cancelled
      ? null
      : loadSystemNameAndSecurity(characterSystemId),
    Promise.all(securityIds.map((id) => loadSystemSecurity(id))),
  ]);
  const securities = new Map<number, number>();
  securityIds.forEach((id, i) => {
    const security = securityList[i];
    if (security !== null && security !== undefined) securities.set(id, security);
  });
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });
  structureIds.forEach((id, i) => {
    const name = resolvedStructures[i];
    if (name) locationNames.set(id, name);
  });

  // The verdict needs the worn implants and the queue; either missing is its own one-line state.
  const training =
    corrected.queueResult && wornImplants && !signal.cancelled
      ? await loadCloneTrainingData(characterId, loadedAt, {
          jumpClones: clones,
          wornImplantIds: wornImplants.data,
          queue: corrected.queueResult.data,
        }).catch(() => null)
      : null;

  return {
    clonesResult,
    clonesNeedsReauth,
    infomorphLevel,
    wornImplants,
    implantsNeedsReauth,
    queueResult: corrected.queueResult,
    training,
    characterSystemId,
    systemIds,
    characterSystemName: characterSystem?.name ?? null,
    securities,
    implantNames,
    implantDescriptions,
    locationNames,
    sp,
    loadedAt,
  };
}

/** An implant name linking to Show Info, with its description in a hover/focus tooltip when it has one. */
function ImplantLink({
  typeId,
  name,
  description,
  className,
}: {
  typeId: number;
  name: string;
  description?: string;
  className?: string;
}) {
  const link = (
    <ItemInfoLink typeId={typeId} className={className}>
      {name}
    </ItemInfoLink>
  );
  return description ? <Tooltip content={description}>{link}</Tooltip> : link;
}

type PriceMap = ReadonlyMap<number, number | null>;

/** One clone's facts: where, how far, what it wears and what that is worth. */
function CloneCard({
  heading,
  place,
  security,
  jumps,
  implantIds,
  implantNames,
  implantDescriptions,
  prices,
  training,
  current = false,
}: {
  heading: ReactNode;
  place: string;
  security: number | undefined;
  jumps: ReactNode;
  implantIds: readonly number[];
  implantNames: ReadonlyMap<number, string>;
  implantDescriptions: ReadonlyMap<number, string>;
  /** Undefined until the price read settles. */
  prices: PriceMap | undefined;
  /** Queue time in this clone; absent when there is no verdict. */
  training?: { row: CloneRow | undefined; best: boolean };
  /** The clone the Character is wearing now: set apart from the jump clones. */
  current?: boolean;
}) {
  const { t } = useTranslation();
  const value = prices ? sumImplantValue(implantIds, prices) : null;
  const delta = training?.row?.deltaSeconds ?? null;
  return (
    <li
      className={`space-y-1.5 rounded-xs border p-3 text-sm ${
        current ? 'border-accent/60 bg-accent/5 md:col-span-2' : 'border-line bg-panel-2'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="[overflow-wrap:anywhere]">{heading}</span>
        {/* Place, security and jumps are one phrase: they wrap together, never apart. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="text-text-dim [overflow-wrap:anywhere]">{place}</span>
          {security !== undefined && <SecurityStatus security={security} />}
          {jumps}
        </span>
      </div>
      {training?.row?.totalSeconds != null && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="tabular-nums">
            {t('clones.verdict.rowQueue', { duration: formatDuration(training.row.totalSeconds) })}
          </span>
          {delta !== null && Math.abs(delta) >= MIN_JUMP_GAIN_SECONDS && (
            <span className={delta < 0 ? 'text-success' : 'text-text-dim'}>
              {t(delta < 0 ? 'clones.verdict.rowSooner' : 'clones.verdict.rowLonger', {
                duration: formatDuration(Math.abs(delta)),
              })}
            </span>
          )}
          {training.best && (
            <span className="rounded-xs border border-success/60 px-1.5 text-[0.6875rem] font-semibold tracking-wide text-success uppercase">
              {t('clones.verdict.badge')}
            </span>
          )}
        </p>
      )}
      {implantIds.length === 0 ? (
        <p className="text-text-dim">{t('clones.noImplants')}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-3 gap-y-0">
            {implantIds.map((id) => (
              <li key={id}>
                <ImplantLink
                  typeId={id}
                  name={implantNames.get(id) ?? `Type #${id}`}
                  description={implantDescriptions.get(id)}
                  className={TOUCH_LINK}
                />
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-dim">
            <span>{t('clones.implantCount', { count: implantIds.length })}</span>
            {value && (
              <span>
                {value.unpriced < implantIds.length && <IskAmount value={value.total} />}
                {value.unpriced > 0 && ` ${t('clones.unpriced', { count: value.unpriced })}`}
              </span>
            )}
          </p>
        </>
      )}
    </li>
  );
}

/** Clones: jump clones, their locations and implants, plus the current jump cooldown. */
export function Clones() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadClonesSnapshot,
    undefined,
    { cacheKey: 'clones' }
  );

  const clonesResult = data?.clonesResult ?? null;
  const clonesNeedsReauth = data?.clonesNeedsReauth ?? false;
  const infomorphLevel = data?.infomorphLevel ?? 0;
  const implantNames = data?.implantNames ?? NO_NAMES;
  const implantDescriptions = data?.implantDescriptions ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const implantsNeedsReauth = data?.implantsNeedsReauth ?? false;
  const characterSystemId = data?.characterSystemId ?? null;
  const systemIds = data?.systemIds ?? NO_SYSTEMS;
  const securities = data?.securities ?? NO_SECURITIES;
  const characterSystemName = data?.characterSystemName ?? null;
  const wornIds = data?.wornImplants?.data ?? NO_IDS;
  // Falls back to the last SP another tab already loaded for this character,
  // not straight to "—": this tab's own read is still in flight the instant
  // it mounts, and the shared header must not blank out a number the user
  // just saw on Overview or Employment History a moment ago.
  const sp = data?.sp ?? getLastKnownSpSummary(activeCharacterId);
  const loadedAt = data?.loadedAt ?? 0;

  const clones = useMemo(() => clonesResult?.data.jump_clones ?? NO_CLONES, [clonesResult]);
  const lastCloneJumpDate = clonesResult?.data.last_clone_jump_date ?? null;
  const homeLocation = clonesResult?.data.home_location;
  const lastStationChangeDate = clonesResult?.data.last_station_change_date ?? null;

  const cooldown = useMemo(
    () => cloneJumpCooldown(lastCloneJumpDate, infomorphLevel, new Date(loadedAt)),
    [lastCloneJumpDate, infomorphLevel, loadedAt]
  );

  // Jumps away from where the Character is now, on the saved route preference
  // (the Travel route rule). Filled in after the first paint: a progressive
  // enhancement, so a slow graph never holds the clones back.
  const basis = useJumpBasis();
  const [jumpsAway, setJumpsAway] = useState<{
    key: string;
    byLocation: ReadonlyMap<number, JumpsAwayResult>;
  } | null>(null);
  const jumpsKey = `${basis.key}:${characterSystemId}:${loadedAt}`;
  useEffect(() => {
    if (!basis.hydrated || loadedAt === 0) return;
    let cancelled = false;
    void Promise.all(
      [...systemIds].map(async ([locationId, systemId]): Promise<[number, JumpsAwayResult]> => {
        if (characterSystemId === null) {
          return [locationId, { kind: 'unknown', reason: 'noLocation' }];
        }
        if (systemId === null) return [locationId, { kind: 'unknown', reason: 'noRoute' }];
        return [locationId, await jumpsBetween(characterSystemId, systemId, basis)];
      })
    ).then((entries) => {
      if (!cancelled) setJumpsAway({ key: jumpsKey, byLocation: new Map(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [basis, characterSystemId, systemIds, loadedAt, jumpsKey]);
  const jumpsByLocation = jumpsAway?.key === jumpsKey ? jumpsAway.byLocation : undefined;

  // Implant values at the market hub: lowest sell there, else lowest in its
  // region. Another progressive enhancement: the list shows before any price.
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const priceIds = useMemo(
    () => [...new Set([...clones.flatMap((c) => c.implants), ...wornIds])].sort((a, b) => a - b),
    [clones, wornIds]
  );
  const priceKey = `${hub.id}:${priceIds.join(',')}`;
  const [priced, setPriced] = useState<{ key: string; prices: PriceMap } | null>(null);
  useEffect(() => {
    if (!hubHydrated || priceIds.length === 0) return;
    let cancelled = false;
    void Promise.all([getHubPrices(hub, priceIds), getRegionSellPrices(hub.regionId, priceIds)])
      .then(([hubAgg, region]) => {
        if (cancelled) return;
        const prices = new Map<number, number | null>();
        for (const id of priceIds)
          prices.set(id, hubAgg.get(id)?.sellMin ?? region.get(id) ?? null);
        setPriced({ key: priceKey, prices });
      })
      .catch(() => {
        // A failed read leaves every implant unpriced rather than an endless wait.
        if (!cancelled) setPriced({ key: priceKey, prices: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated, priceIds, priceKey]);
  const prices = priced?.key === priceKey ? priced.prices : undefined;
  const wornValue = prices ? sumImplantValue(wornIds, prices) : null;

  const cooldownHours = cloneJumpCooldownHours(infomorphLevel);
  const cooldownFraction = cooldownProgress(lastCloneJumpDate, cooldownHours, new Date(loadedAt));

  // Empty (no element at all) when there is no last jump and no reduction to state.
  const cooldownNote = [
    lastCloneJumpDate &&
      t('clones.lastJump', {
        date: formatTimestamp(new Date(lastCloneJumpDate), timeZone),
      }),
    infomorphLevel > 0 && t('clones.infomorphReduction', { hours: Math.min(infomorphLevel, 24) }),
  ]
    .filter(Boolean)
    .join(' · ');
  const cooldownTone: StatChipTone = cooldown.onCooldown ? 'warning' : 'success';

  const homeJumps =
    homeLocation?.location_id === undefined
      ? undefined
      : jumpsByLocation?.get(homeLocation.location_id);

  const homeLocationName =
    homeLocation?.location_id === undefined
      ? null
      : (locationNames.get(homeLocation.location_id) ??
        t(
          homeLocation.location_type === 'structure'
            ? 'clones.structureLabel'
            : 'clones.stationLabel',
          { id: homeLocation.location_id }
        ));

  const locationLabel = (clone: JumpClone) =>
    locationNames.get(clone.location_id) ??
    t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
      id: clone.location_id,
    });
  const securityOf = (locationId: number | undefined) => {
    const systemId = locationId === undefined ? null : (systemIds.get(locationId) ?? null);
    return systemId === null ? undefined : securities.get(systemId);
  };
  const homeSecurity = securityOf(homeLocation?.location_id);
  const hasWorn = data?.wornImplants != null;
  // The summary cards need loaded clones data; every other state lives in the list panel.
  const showSummary = !(loading && !data) && !clonesNeedsReauth && !error && clonesResult !== null;

  // Which clone is best for the active queue (the engine does the numbers).
  const sort = useClonesSort((state) => state.value);
  const setSort = useClonesSort((state) => state.setValue);
  const hydrateSort = useClonesSort((state) => state.hydrate);
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useCloneStates((state) => state.hydrated);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    void hydrateSort();
    void hydrateCloneStates();
  }, [hydrateSort, hydrateCloneStates]);
  const training = data?.training ?? null;
  const readyAt = cooldown.onCooldown ? cooldown.readyAt : null;
  const verdictResult = useMemo(() => {
    if (!training || training.paused || !cloneStatesHydrated || activeCharacterId === null) {
      return null;
    }
    return cloneVerdict({
      queue: training.queue,
      baseAttributes: training.baseAttributes,
      clones: training.clones,
      wornCloneId: WORN_CLONE_ID,
      cloneState: cloneStateFor(cloneStates, activeCharacterId),
      now: new Date(loadedAt),
      cooldownReadyAt: readyAt,
    });
  }, [training, cloneStates, cloneStatesHydrated, activeCharacterId, loadedAt, readyAt]);
  const cloneLabel = (clone: JumpClone) => clone.name?.trim() || locationLabel(clone);
  const verdictCard: CloneVerdictCardState | null = (() => {
    if (!data) return null;
    const note = (message: string): CloneVerdictCardState => ({ kind: 'note', message });
    if (data.wornImplants === null) return note(t('clones.verdict.noteImplants'));
    if (data.queueResult === null) return note(t('clones.verdict.noteQueue'));
    // The queue's own state outranks an unreadable sheet: an empty queue needs no attributes.
    if (isQueuePaused(data.queueResult.data)) return note(t('clones.verdict.notePaused'));
    if (data.queueResult.data.length === 0) return note(t('clones.verdict.noteEmpty'));
    if (training === null) return note(t('clones.verdict.noteAttributes'));
    if (training.paused) return note(t('clones.verdict.notePaused'));
    if (!verdictResult) return null;
    const { verdict } = verdictResult;
    if (verdict.kind === 'none') return note(t('clones.verdict.noteEmpty'));
    if (verdict.kind === 'stay') {
      const rival = clones.find((c) => c.jump_clone_id === verdict.closest?.cloneId);
      return {
        kind: 'stay',
        stay: verdict.stay,
        cooldownReadyAt: readyAt,
        closest:
          verdict.closest && rival
            ? { label: cloneLabel(rival), extraSeconds: verdict.closest.extraSeconds }
            : null,
      };
    }
    const target = clones.find((c) => c.jump_clone_id === verdict.cloneId);
    if (!target) return null;
    const route = jumpsByLocation?.get(target.location_id);
    if (!route) return note(t('clones.verdict.noteRouting'));
    if (route.kind === 'unknown') return note(t('clones.verdict.noteRoute'));
    return {
      kind: 'jump',
      label: cloneLabel(target),
      savedSeconds: verdict.savedSeconds,
      attributes: verdict.attributes,
      stay: verdict.stay,
      best: verdict.best,
      cooldownReadyAt: verdict.cooldownReadyAt,
      route: {
        locationId: target.location_id,
        placeName: locationLabel(target),
        jumps: route.jumps,
      },
    };
  })();
  const showTraining = verdictCard !== null && verdictCard.kind !== 'note';
  const rowOf = (id: string | number) => verdictResult?.rows.find((r) => r.cloneId === id);
  const sortedClones = sortClones(
    clones.map((clone) => {
      const implantValue = prices ? sumImplantValue(clone.implants, prices) : null;
      return {
        clone,
        id: clone.jump_clone_id,
        locationId: clone.location_id,
        deltaSeconds: showTraining ? (rowOf(clone.jump_clone_id)?.deltaSeconds ?? null) : null,
        value:
          implantValue &&
          (implantValue.unpriced < clone.implants.length || clone.implants.length === 0)
            ? implantValue.total
            : null,
      };
    }),
    sort,
    jumpsByLocation
  ).map((x) => x.clone);
  const bestCloneId = showTraining ? (verdictResult?.bestCloneId ?? null) : null;
  const csvColumns = useMemo(
    () => clonesCsvColumns(t, { locationNames, implantNames }),
    [t, locationNames, implantNames]
  );
  const clonesExport = useTableExport({
    surface: 'clones',
    // Nothing behind the re-login banner, same as the table.
    rows: clonesNeedsReauth ? NO_CLONES : clones,
    columns: csvColumns,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={activeCharacterId}
        totalSp={sp.totalSp}
        unallocatedSp={sp.unallocatedSp}
      />
      <OverviewSubNav />

      {showSummary && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4 text-sm">
            <Panel className="h-full">
              <section aria-label={t('clones.cooldown')} className="space-y-1">
                <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('clones.cooldownShared')}
                </h3>
                {/* The header above names it; the value wraps rather than sitting in a nowrap chip. */}
                <p
                  className={`font-medium tabular-nums ${STAT_CHIP_TONE_TEXT_CLASS[cooldownTone]}`}
                >
                  {cooldown.onCooldown && cooldown.readyAt
                    ? t('clones.cooldownOnCooldownValue', {
                        date: formatTimestamp(cooldown.readyAt, timeZone),
                        duration: formatDuration((cooldown.readyAt.getTime() - loadedAt) / 1000),
                      })
                    : t('clones.cooldownReadyValue')}
                </p>
                <div
                  role="progressbar"
                  aria-label={t('clones.cooldown')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(cooldownFraction * 100)}
                  className="h-1.5 overflow-hidden rounded-full bg-line"
                >
                  <div
                    className={cooldown.onCooldown ? 'h-full bg-warning' : 'h-full bg-success'}
                    style={{ width: `${cooldownFraction * 100}%` }}
                  />
                </div>
                {cooldownNote && <p className="text-xs text-text-dim">{cooldownNote}</p>}
              </section>
            </Panel>
            <Panel className="h-full">
              <section aria-label={t('clones.youAreIn')} className="space-y-1">
                <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('clones.youAreIn')}
                </h3>
                <p>
                  {characterSystemName ?? t('clones.unknownPlace')}{' '}
                  {characterSystemId !== null && securities.has(characterSystemId) && (
                    <SecurityStatus security={securities.get(characterSystemId) ?? 0} />
                  )}
                </p>
                {hasWorn && (
                  <p className="text-xs text-text-dim">
                    {t('clones.implantCount', { count: wornIds.length })}
                    {wornValue && wornValue.unpriced < wornIds.length && (
                      <>
                        {' · '}
                        <IskAmount value={wornValue.total} /> {t('clones.atRisk')}
                        {wornValue.unpriced > 0 &&
                          ` · ${t('clones.unpriced', { count: wornValue.unpriced })}`}
                      </>
                    )}
                  </p>
                )}
              </section>
            </Panel>
            {homeLocationName && (
              <Panel className="h-full">
                <section aria-label={t('clones.respawn')} className="space-y-1">
                  <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('clones.respawn')}
                  </h3>
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="[overflow-wrap:anywhere]">{homeLocationName}</span>
                    {homeSecurity !== undefined && <SecurityStatus security={homeSecurity} />}
                    <JumpsAwayText
                      result={homeJumps}
                      t={t}
                      locationId={homeLocation?.location_id}
                      linkClassName={TOUCH_LINK}
                    />
                  </p>
                  {lastStationChangeDate && (
                    <p className="text-xs text-text-dim">
                      {t('clones.lastStationChange', {
                        date: formatTimestamp(new Date(lastStationChangeDate), timeZone),
                      })}
                    </p>
                  )}
                </section>
              </Panel>
            )}
          </div>
          {verdictCard && (
            <CloneVerdictCard
              state={verdictCard}
              names={training?.skillNames ?? NO_NAMES}
              timeZone={timeZone}
            />
          )}
        </>
      )}

      {/*
        The summary cards above the list carry no title or toolbar of their
        own. Data age, Refresh and Export ride on the clone list's toolbar
        below, and that one panel wraps every branch so the toolbar — the only
        way back from a failed or empty load — is there in all of them.
      */}
      <Panel
        title={t('clones.title')}
        actions={
          <span className="flex items-center gap-2">
            {clonesResult && <DataAgeBadge date={clonesResult.fetchedAt} />}
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('clones.refresh')}
              onClick={refresh}
              disabled={loading}
            />
            <TableActionsMenu name={t('clones.title')} tableExport={clonesExport} />
          </span>
        }
        padded={false}
      >
        {loading && !data ? (
          <div className="flex justify-center py-16">
            <Spinner label={t('common.loading')} />
          </div>
        ) : clonesNeedsReauth ? (
          <div className="p-3">
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterClones']}
              title={t('clones.reauthTitle')}
              hint={t('clones.reauthHint')}
              actionLabel={t('clones.reauthAction')}
            />
          </div>
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : !clonesResult ? (
          <EmptyState title={t('clones.emptyTitle')} hint={t('clones.emptyHint')} />
        ) : (
          <>
            {implantsNeedsReauth && (
              <div className="border-b border-line p-3">
                <GrantBanner
                  characterId={activeCharacterId}
                  endpoints={['getCharacterImplants']}
                  title={t('clones.implantsReauthTitle')}
                  hint={t('clones.implantsReauthHint')}
                  actionLabel={t('clones.reauthAction')}
                />
              </div>
            )}
            {clonesResult.fromCache && (
              <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                {t('common.offlineTitle')}
              </p>
            )}
            {clones.length > 1 && (
              <div className="overflow-x-auto border-b border-line px-3 py-2">
                <SegmentedControl<ClonesSort>
                  label={t('clones.sort.label')}
                  value={sort}
                  onChange={(next) => void setSort(next)}
                  options={CLONES_SORTS.map((value) => ({
                    value,
                    label: t(`clones.sort.${value}`),
                    // Only a note card means "no verdict"; null is still loading.
                    ...(value === 'training' && verdictCard?.kind === 'note'
                      ? { disabled: true, disabledReason: verdictCard.message }
                      : {}),
                  }))}
                />
              </div>
            )}
            {(clones.length > 0 || hasWorn) && (
              <ul aria-label={t('clones.title')} className="grid gap-3 p-3 md:grid-cols-2">
                {hasWorn && (
                  <CloneCard
                    current
                    heading={<span className="font-semibold">{t('clones.wearingNow')}</span>}
                    place={characterSystemName ?? t('clones.unknownPlace')}
                    security={
                      characterSystemId === null ? undefined : securities.get(characterSystemId)
                    }
                    jumps={null}
                    implantIds={wornIds}
                    implantNames={implantNames}
                    implantDescriptions={implantDescriptions}
                    prices={prices}
                    training={
                      showTraining
                        ? { row: rowOf(WORN_CLONE_ID), best: bestCloneId === WORN_CLONE_ID }
                        : undefined
                    }
                  />
                )}
                {sortedClones.map((clone) => {
                  const name = clone.name?.trim() || undefined;
                  return (
                    <CloneCard
                      key={clone.jump_clone_id}
                      heading={
                        name === undefined ? (
                          <span className="text-text-dim">{t('clones.unnamed')}</span>
                        ) : (
                          <span className="text-text">{name}</span>
                        )
                      }
                      place={locationLabel(clone)}
                      security={securityOf(clone.location_id)}
                      jumps={
                        <JumpsAwayText
                          result={jumpsByLocation?.get(clone.location_id)}
                          t={t}
                          locationId={clone.location_id}
                          linkClassName={TOUCH_LINK}
                        />
                      }
                      implantIds={clone.implants}
                      implantNames={implantNames}
                      implantDescriptions={implantDescriptions}
                      prices={prices}
                      training={
                        showTraining
                          ? {
                              row: rowOf(clone.jump_clone_id),
                              best: bestCloneId === clone.jump_clone_id,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </ul>
            )}
            {clones.length === 0 && (
              <CachedEmptyState
                result={clonesResult}
                title={t('clones.emptyTitle')}
                hint={t('clones.emptyHint')}
                fetchedTitle={t('clones.emptyFetchedTitle')}
              />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
