import { useCallback, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  InfoTooltip,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  StatChip,
  Tabs,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { ExtractorTimeline } from '@/features/pi/ExtractorTimeline';
import { PlanPanel } from '@/features/pi/PlanPanel';
import { loadPiRosterSnapshot, type PiRosterSnapshot } from '@/features/pi/roster';
import { loadPlanetName, loadSchematicName } from '@/features/pi/names';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  extractorExpiryMs,
  extractorProgramsFromPins,
  hasUnverifiedExtractors,
  pinRole,
} from '@/features/pi/adapters';
import {
  colonyAttention,
  colonyStatus,
  extractorState,
  sortColoniesByAttention,
} from '@/engine/pi/colonyStatus';
import {
  extractorCycleYields,
  fractionOfPeak,
  hasYieldBaseline,
  programTotalYield,
  yieldBankedBy,
} from '@/engine/pi/extraction';
import type { ColonyAttention, ColonyStatus, ExtractorYieldProgram } from '@/engine/pi/types';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type { CharacterPlanet, CharacterPlanetDetail, PlanetPin } from '@/esi/endpoints';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { formatDuration } from '@/lib/duration';

const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_DETAILS: ReadonlyMap<number, StatusResult<CharacterPlanetDetail>> = new Map();
const EMPTY_STATUS: ColonyStatus = { idle: false, soonestExpiryMs: null };

interface ActiveColonies {
  planetsResult: CachedResult<CharacterPlanet[]> | null;
  /** 403 (scope never granted) means "log in again", not "offline". */
  planetsNeedsReauth: boolean;
  details: Map<number, StatusResult<CharacterPlanetDetail>>;
  planetNames: Map<number, string>;
  systemNames: Map<number, string>;
  pinTypeNames: Map<number, string>;
  productNames: Map<number, string>;
  schematicNames: Map<number, string>;
  /** Captured in the loader, not at render: Date.now() is impure and React forbids it in render/useMemo. */
  loadedAt: number;
}

interface Snapshot extends ActiveColonies {
  /** Every Character's programs, read cache-only — see `features/pi/roster.ts`. */
  roster: PiRosterSnapshot;
}

async function loadActiveColonies(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<ActiveColonies> {
  const { cached: planetsResult, needsReauth: planetsNeedsReauth } =
    await loadCharacterPlanets(characterId);
  const loadedAt = Date.now();
  const planets = planetsResult?.data ?? [];

  const empty: ActiveColonies = {
    planetsResult,
    planetsNeedsReauth,
    details: new Map(),
    planetNames: new Map(),
    systemNames: new Map(),
    pinTypeNames: new Map(),
    productNames: new Map(),
    schematicNames: new Map(),
    loadedAt,
  };
  if (signal.cancelled || planets.length === 0) return empty;

  const [details, planetNameEntries, systemNames] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      planets.map((planet) => planet.planet_id)
    ),
    Promise.all(planets.map((planet) => loadPlanetName(planet.planet_id))),
    resolveNames(planets.map((planet) => planet.solar_system_id)),
  ]);
  const planetNames = new Map<number, string>();
  planets.forEach((planet, i) => {
    const name = planetNameEntries[i];
    if (name) planetNames.set(planet.planet_id, name);
  });

  if (signal.cancelled) return { ...empty, details, planetNames, systemNames };

  const allPins = [...details.values()].flatMap((result) => result.cached?.data.pins ?? []);
  const pinTypeIds = [...new Set(allPins.map((pin) => pin.type_id))];
  const productTypeIds = [
    ...new Set(
      allPins
        .map((pin) => pin.extractor_details?.product_type_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  const schematicIds = [
    ...new Set(
      allPins
        .map((pin) => pin.factory_details?.schematic_id)
        .filter((id): id is number => id !== undefined)
    ),
  ];

  const [pinTypeNames, productNames, schematicNameEntries] = await Promise.all([
    loadTypeNames(pinTypeIds),
    loadTypeNames(productTypeIds),
    Promise.all(schematicIds.map((id) => loadSchematicName(id))),
  ]);
  const schematicNames = new Map<number, string>();
  schematicIds.forEach((id, i) => {
    const name = schematicNameEntries[i];
    if (name) schematicNames.set(id, name);
  });

  return {
    planetsResult,
    planetsNeedsReauth,
    details,
    planetNames,
    systemNames,
    pinTypeNames,
    productNames,
    schematicNames,
    loadedAt,
  };
}

/**
 * The active Character's colonies live, then every Character's programs from
 * Dexie.
 *
 * Order matters and is the whole cache-first story: the live load above has
 * already written the active Character's fresh rows, so the cache-only roster
 * read below picks them up without a second call, and page open costs exactly
 * the ESI traffic it cost before this panel existed. Refresh re-runs this
 * function, so the roster is refreshed by the same gesture.
 */
async function loadPiSnapshot(characterId: number, signal: RouteSnapshotSignal): Promise<Snapshot> {
  const active = await loadActiveColonies(characterId, signal);
  return { ...active, roster: await loadPiRosterSnapshot() };
}

/**
 * `colonyAttention` only ever sees full, successfully-fetched data — it can't
 * tell "verified healthy" from "we have no idea". `unknown` is that missing
 * case: a colony whose detail failed to load, or that has an extractor pin
 * `extractorProgramsFromPins` had to drop for missing data. Route-level only
 * (not in `engine/pi`, which stays pure and never sees fetch outcomes).
 */
type EffectiveAttention = ColonyAttention | 'unknown';

// `decayed` is deliberately not `warning`: it would then be indistinguishable
// at a glance from `expiring-soon`, which is the more urgent call. `accent`
// reads as "worth a look", which is all the flag claims to be.
const ATTENTION_TONE: Record<
  EffectiveAttention,
  'danger' | 'warning' | 'accent' | 'success' | 'default'
> = {
  idle: 'danger',
  'expiring-soon': 'warning',
  decayed: 'accent',
  healthy: 'success',
  unknown: 'default',
};

const STATE_CLASS: Record<'active' | 'expiring-soon' | 'expired', string> = {
  active: 'text-success',
  'expiring-soon': 'text-warning',
  expired: 'text-danger',
};

const DAY_MS = 86_400_000;

/**
 * A day's output a reinstall would recover right now: the gap between a fresh
 * program's opening cycle and this program's current one, scaled to a day.
 *
 * A fresh program's opening cycle depends only on the install-time baseline,
 * never on how long the program runs — CCP's curve enters at cycle 0 either
 * way — so the same `qty_per_cycle`/`cycle_time` reinstalled today opens
 * exactly where this one did. Display-side arithmetic over
 * `engine/pi/extraction`'s exports, not new decay maths; `nowMs` is the
 * loader's `loadedAt`, never `Date.now()`.
 */
function resetGainPerDay(program: ExtractorYieldProgram, nowMs: number): number {
  const peak = extractorCycleYields(program, 1)[0] ?? 0;
  const current = peak * fractionOfPeak(program, nowMs);
  return Math.max(0, (peak - current) * (DAY_MS / program.cycleTimeMs));
}

interface ColonyPanelProps {
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  status: ColonyStatus;
  planetNames: ReadonlyMap<number, string>;
  systemNames: ReadonlyMap<number, string>;
  pinTypeNames: ReadonlyMap<number, string>;
  productNames: ReadonlyMap<number, string>;
  schematicNames: ReadonlyMap<number, string>;
  loadedAt: number;
}

function ColonyPanel({
  planet,
  detail,
  status,
  planetNames,
  systemNames,
  pinTypeNames,
  productNames,
  schematicNames,
  loadedAt,
}: ColonyPanelProps) {
  const { t } = useTranslation();
  // No cached detail at all, or an extractor pin the adapter had to drop for
  // missing data: either way, computing "healthy" from what's left would be
  // exactly the confident-wrong-number the staleness rule exists to avoid.
  const attention: EffectiveAttention =
    detail === null || hasUnverifiedExtractors(detail.pins)
      ? 'unknown'
      : colonyAttention(status, loadedAt);

  // Keyed by pin so a table cell can find its own program without re-parsing
  // ESI timestamps per render. Only programs with a complete install-time
  // baseline go in: a pin missing one is listed with an em dash, never a zero.
  const yieldProgramsByPin = useMemo(() => {
    const map = new Map<number, ExtractorYieldProgram>();
    for (const program of extractorProgramsFromPins(detail?.pins ?? [])) {
      if (hasYieldBaseline(program)) map.set(program.pinId, program);
    }
    return map;
  }, [detail]);

  const columns = useMemo<DataTableColumn<PlanetPin>[]>(
    () => [
      {
        id: 'pin',
        header: t('pi.column.pin'),
        render: (pin) => pinTypeNames.get(pin.type_id) ?? `Type #${pin.type_id}`,
      },
      {
        id: 'role',
        header: t('pi.column.role'),
        render: (pin) => t(`pi.role.${pinRole(pin)}`),
      },
      {
        id: 'detail',
        header: t('pi.column.detail'),
        // Titles the card below `sm` (docs/DESIGN.md §4a): the pin column
        // reads "Extractor Control Unit" on every extractor row, so the
        // product is what actually identifies a card.
        primary: true,
        render: (pin) => {
          const role = pinRole(pin);
          if (role === 'extractor') {
            const productId = pin.extractor_details?.product_type_id;
            return productId !== undefined
              ? (productNames.get(productId) ?? t('pi.unknownProduct'))
              : t('pi.unknownProduct');
          }
          if (role === 'factory') {
            const schematicId = pin.factory_details?.schematic_id;
            return schematicId !== undefined
              ? (schematicNames.get(schematicId) ?? t('pi.unknownSchematic'))
              : t('pi.unknownSchematic');
          }
          return '—';
        },
      },
      {
        id: 'status',
        header: t('pi.column.status'),
        cellClassName: (pin) => {
          const expiryMs = extractorExpiryMs(pin);
          return expiryMs === null ? undefined : STATE_CLASS[extractorState(expiryMs, loadedAt)];
        },
        render: (pin) => {
          if (pinRole(pin) !== 'extractor') return '—';
          const expiryMs = extractorExpiryMs(pin);
          return expiryMs === null
            ? t('pi.programDataUnavailable')
            : t(`pi.state.${extractorState(expiryMs, loadedAt)}`);
        },
      },
      {
        id: 'expires',
        header: t('pi.column.expires'),
        className: 'tabular-nums',
        render: (pin) => {
          const expiryMs = extractorExpiryMs(pin);
          if (expiryMs === null) return '—';
          return expiryMs <= loadedAt
            ? t('pi.expired')
            : t('pi.expiresIn', { duration: formatDuration((expiryMs - loadedAt) / 1000) });
        },
      },
      {
        id: 'banked',
        header: t('pi.yield.bankedColumn'),
        align: 'right',
        className: 'tabular-nums',
        // No self-rendered alignment: `align: 'right'` is the column prop
        // `.dt-stack` already overrides below `sm` (docs/DESIGN.md §4a), and
        // the amount and its percentage are one interpolated string rather
        // than a `justify-end` pair that would hug the card's edge.
        render: (pin) => {
          const program = yieldProgramsByPin.get(pin.pin_id);
          if (!program) return '—';
          const total = programTotalYield(program);
          if (total <= 0) return '—';
          const banked = yieldBankedBy(program, loadedAt);
          return t('pi.yield.bankedValue', {
            amount: Math.round(banked).toLocaleString(),
            percent: Math.round((banked / total) * 100),
          });
        },
      },
      {
        id: 'resetGain',
        header: t('pi.yield.resetGainColumn'),
        align: 'right',
        className: 'tabular-nums',
        render: (pin) => {
          const program = yieldProgramsByPin.get(pin.pin_id);
          if (!program) return '—';
          return t('pi.yield.resetGainValue', {
            amount: Math.round(resetGainPerDay(program, loadedAt)).toLocaleString(),
          });
        },
      },
    ],
    [t, pinTypeNames, productNames, schematicNames, yieldProgramsByPin, loadedAt]
  );

  const planetName =
    planetNames.get(planet.planet_id) ?? t('pi.planetLabel', { id: planet.planet_id });
  const systemName =
    systemNames.get(planet.solar_system_id) ?? t('pi.systemLabel', { id: planet.solar_system_id });

  return (
    <Panel
      title={`${planetName} — ${systemName}`}
      actions={
        <>
          <StatChip
            label={t('pi.attentionLabel')}
            value={t(`pi.attention.${attention}`)}
            tone={ATTENTION_TONE[attention]}
            tooltip={
              attention === 'unknown'
                ? t('pi.attentionUnknownTooltip')
                : attention === 'decayed'
                  ? t('pi.yield.decayedTooltip')
                  : undefined
            }
          />
          <StatChip
            label={t('pi.lastUpdate')}
            value={new Date(planet.last_update).toLocaleString()}
            tooltip={t('pi.lastUpdateTooltip')}
          />
        </>
      }
      padded={false}
    >
      <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2 text-xs text-text-dim">
        <span>{t(`pi.planetType.${planet.planet_type}`)}</span>
        <span>{t('pi.upgradeLevel', { level: planet.upgrade_level })}</span>
        <span>{t('pi.pinCount', { count: planet.num_pins })}</span>
      </div>
      {detail && detail.pins.length > 0 ? (
        <DataTable
          label={t('pi.pinTableLabel', { planet: planetName })}
          columns={columns}
          rows={detail.pins}
          rowKey={(pin) => pin.pin_id}
        />
      ) : (
        <EmptyState title={t('pi.noPinsTitle')} className="py-6" />
      )}
    </Panel>
  );
}

/** Which peer view is showing. `colonies` is the default and needs no URL param. */
type PiTab = 'colonies' | 'plan';

/**
 * Planetary Industry: colony health from extractor expiry — the one PI field
 * ESI keeps current without opening the colony in-client — and the chain
 * planner, as peer tabs rather than two routes.
 *
 * They are one page because the plan's inputs come from the colonies and
 * because a user with no colonies at all should land on the empty state and
 * be able to step straight to a plan: buying P1 needs no extractors, so the
 * planner answers on day one. A second nav entry would also cost a row in the
 * mobile nav sheet, which is the surface that can least afford one.
 *
 * The tab and the planned commodity live in the URL (`?tab=plan&type=2867`)
 * so a plan survives a reload and can be deep-linked into later. Both fall
 * back silently: an unknown tab is `colonies`, and an unknown type is handled
 * by the planner picking its own default rather than rendering nothing.
 */
export function PlanetaryIndustry() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadPiSnapshot);

  const tab: PiTab = searchParams.get('tab') === 'plan' ? 'plan' : 'colonies';
  const typeParam = Number(searchParams.get('type'));
  const plannedTypeId = Number.isInteger(typeParam) && typeParam > 0 ? typeParam : null;

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'plan') params.set('tab', 'plan');
      else params.delete('tab');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setPlannedTypeId = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams);
      params.set('type', String(next));
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const planetsResult = data?.planetsResult ?? null;
  const planetsNeedsReauth = data?.planetsNeedsReauth ?? false;
  const details = data?.details ?? NO_DETAILS;
  const planetNames = data?.planetNames ?? NO_NAMES;
  const systemNames = data?.systemNames ?? NO_NAMES;
  const pinTypeNames = data?.pinTypeNames ?? NO_NAMES;
  const productNames = data?.productNames ?? NO_NAMES;
  const schematicNames = data?.schematicNames ?? NO_NAMES;
  const loadedAt = data?.loadedAt ?? 0;

  const planets = useMemo(() => planetsResult?.data ?? [], [planetsResult]);

  const statusByPlanet = useMemo(() => {
    const map = new Map<number, ColonyStatus>();
    for (const planet of planets) {
      const colonyDetail = details.get(planet.planet_id)?.cached?.data ?? null;
      const programs = colonyDetail ? extractorProgramsFromPins(colonyDetail.pins) : [];
      map.set(planet.planet_id, colonyStatus(programs, loadedAt));
    }
    return map;
  }, [planets, details, loadedAt]);

  const sortedPlanets = useMemo(
    () =>
      sortColoniesByAttention(
        planets,
        (planet) => statusByPlanet.get(planet.planet_id) ?? EMPTY_STATUS,
        loadedAt
      ),
    [planets, statusByPlanet, loadedAt]
  );

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
      <PageHeader
        title={t('pi.title')}
        meta={planetsResult && <DataAgeBadge date={planetsResult.fetchedAt} />}
        actions={
          <>
            <IconButton
              icon={<Icon.Refresh />}
              label={t('pi.refresh')}
              onClick={refresh}
              disabled={loading}
            />
          </>
        }
      />

      <Tabs
        label={t('piPlan.tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'colonies', label: t('piPlan.coloniesTab') },
          { id: 'plan', label: t('piPlan.planTab') },
        ]}
      />

      {tab === 'plan' ? (
        <PlanPanel
          characterId={activeCharacterId}
          typeId={plannedTypeId}
          onTypeIdChange={setPlannedTypeId}
        />
      ) : (
        <>
          {/*
            Above the per-colony panels, and above the branch below rather
            than inside it: the active Character losing the planets scope, or
            simply having no colonies, says nothing about the alts whose
            programs are already cached — and answering "which character do I
            log in next" for exactly that case is what a cross-character panel
            is for. It stays inside the Colonies tab: it is a colony readout,
            and #321 owns that component next.
          */}
          {!loading && data && <ExtractorTimeline snapshot={data.roster} nowMs={loadedAt} />}

          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner label={t('common.loading')} />
            </div>
          ) : planetsNeedsReauth ? (
            <ReauthBanner
              title={t('pi.reauthTitle')}
              hint={t('pi.reauthHint')}
              actionLabel={t('pi.reauthAction')}
              onLogin={() => void beginEveLogin()}
            />
          ) : error ? (
            <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
          ) : !planetsResult || planets.length === 0 ? (
            <EmptyState title={t('pi.emptyTitle')} hint={t('pi.emptyHint')} />
          ) : (
            <>
              <Panel>
                <p className="flex items-start gap-1.5 text-xs text-text-dim">
                  {t('pi.stalenessHint')}
                  <InfoTooltip label={t('pi.stalenessLabel')} content={t('pi.stalenessTooltip')} />
                </p>
              </Panel>
              {planetsResult.fromCache && (
                <p className="text-[0.6875rem] text-warning uppercase">
                  {t('common.offlineTitle')}
                </p>
              )}
              <div className="space-y-3">
                {sortedPlanets.map((planet) => (
                  <ColonyPanel
                    key={planet.planet_id}
                    planet={planet}
                    detail={details.get(planet.planet_id)?.cached?.data ?? null}
                    status={statusByPlanet.get(planet.planet_id) ?? EMPTY_STATUS}
                    planetNames={planetNames}
                    systemNames={systemNames}
                    pinTypeNames={pinTypeNames}
                    productNames={productNames}
                    schematicNames={schematicNames}
                    loadedAt={loadedAt}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
