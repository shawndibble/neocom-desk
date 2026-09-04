import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  DataAgeBadge,
  EmptyState,
  IconButton,
  InfoTooltip,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  StatChip,
  Tabs,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { ExtractorTimeline } from '@/features/pi/ExtractorTimeline';
import { PlanPanel } from '@/features/pi/PlanPanel';
import { loadPiRosterSnapshot, type PiRosterSnapshot } from '@/features/pi/roster';
import { loadPlanetName, loadSchematicName } from '@/features/pi/names';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  extractorExpiryMs,
  extractorProgramsFromPins,
  factorySchematicId,
  groupFactoryPins,
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
    pinTypeNames: new Map(),
    productNames: new Map(),
    schematicNames: new Map(),
    loadedAt,
  };
  if (signal.cancelled || planets.length === 0) return empty;

  const [details, planetNameEntries] = await Promise.all([
    loadAllColonyDetails(
      characterId,
      planets.map((planet) => planet.planet_id)
    ),
    Promise.all(planets.map((planet) => loadPlanetName(planet.planet_id))),
  ]);
  const planetNames = new Map<number, string>();
  planets.forEach((planet, i) => {
    const name = planetNameEntries[i];
    if (name) planetNames.set(planet.planet_id, name);
  });

  if (signal.cancelled) return { ...empty, details, planetNames };

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
    ...new Set(allPins.map(factorySchematicId).filter((id): id is number => id !== undefined)),
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

const STATE_TONE: Record<'active' | 'expiring-soon' | 'expired', StatChipTone> = {
  active: 'success',
  'expiring-soon': 'warning',
  expired: 'danger',
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

/** The pin type's own name (e.g. "Storm Extractor Control Unit"), falling back to its numeric type id. */
function pinTypeName(pin: PlanetPin, pinTypeNames: ReadonlyMap<number, string>): string {
  return pinTypeNames.get(pin.type_id) ?? `Type #${pin.type_id}`;
}

/**
 * A `panel-2`-filled header + body, styled like `Panel` but never rendering
 * one: `Panel`'s own doc comment says "don't nest them — use `panel-2`
 * fills inside", and a colony's role cards nest inside the colony's own
 * outer `Panel`.
 */
function RoleCard({
  title,
  actions,
  padded = true,
  className = '',
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xs border border-line ${className}`}>
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
        <h3 className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {title}
        </h3>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      <div className={padded ? 'p-3' : ''}>{children}</div>
    </div>
  );
}

/** A label/value pair inside a card body — the hero card's Expires/Banked/Reset now row. */
function CardStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
        {label}
      </div>
      <div className={`text-sm font-medium tabular-nums ${accent ? 'text-accent' : 'text-text'}`}>
        {value}
      </div>
    </div>
  );
}

interface ExtractionCardProps {
  pin: PlanetPin;
  pinTypeNames: ReadonlyMap<number, string>;
  productNames: ReadonlyMap<number, string>;
  program: ExtractorYieldProgram | undefined;
  loadedAt: number;
}

/**
 * One extractor pin's live telemetry: product, status, a banked-share
 * progress bar, and the Expires/Banked/Reset now stats already computed by
 * `engine/pi/extraction` for the old table's columns — same numbers, read as
 * a card instead of a row. Bordered/tinted in accent (docs/DESIGN.md's
 * accent = interactive/live-data convention) since this is the one card with
 * genuine per-cycle telemetry; Production and Infrastructure below never get
 * this treatment.
 */
function ExtractionCard({
  pin,
  pinTypeNames,
  productNames,
  program,
  loadedAt,
}: ExtractionCardProps) {
  const { t } = useTranslation();
  const productId = pin.extractor_details?.product_type_id;
  const productName =
    productId !== undefined
      ? (productNames.get(productId) ?? t('pi.unknownProduct'))
      : t('pi.unknownProduct');

  const expiryMs = extractorExpiryMs(pin);
  const state = expiryMs === null ? null : extractorState(expiryMs, loadedAt);
  const total = program ? programTotalYield(program) : 0;
  const banked = program && total > 0 ? yieldBankedBy(program, loadedAt) : null;
  const percent = banked === null ? null : Math.round((banked / total) * 100);

  return (
    <RoleCard
      title={
        <>
          <Icon.Extraction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {productName}
        </>
      }
      actions={
        <StatChip
          label={t('pi.extraction.statusLabel')}
          value={state === null ? t('pi.programDataUnavailable') : t(`pi.state.${state}`)}
          tone={state === null ? 'default' : STATE_TONE[state]}
        />
      }
      className="border-accent-dim bg-gradient-to-b from-accent/10 to-transparent"
    >
      <p className="mb-2 text-xs text-text-dim">{pinTypeName(pin, pinTypeNames)}</p>
      <div
        role="progressbar"
        aria-label={t('pi.extraction.progressLabel', { product: productName })}
        aria-valuenow={percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-panel-2"
      >
        <div className="h-full bg-accent" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <CardStat
          label={t('pi.extraction.expiresLabel')}
          value={
            expiryMs === null
              ? '—'
              : expiryMs <= loadedAt
                ? t('pi.expired')
                : t('pi.expiresIn', { duration: formatDuration((expiryMs - loadedAt) / 1000) })
          }
        />
        <CardStat
          label={t('pi.yield.bankedColumn')}
          value={
            banked === null
              ? '—'
              : t('pi.yield.bankedValue', { amount: Math.round(banked).toLocaleString(), percent })
          }
        />
        <CardStat
          label={t('pi.yield.resetGainColumn')}
          value={
            program
              ? t('pi.yield.resetGainValue', {
                  amount: Math.round(resetGainPerDay(program, loadedAt)).toLocaleString(),
                })
              : '—'
          }
          accent
        />
      </div>
    </RoleCard>
  );
}

/**
 * The extractor pin `colonyAttention` already ranked the colony on — soonest
 * `expiry_time` among pins with one — or null for a colony with no
 * extractors (or none whose expiry parsed). Drives the summary row's track
 * and expiry cells; ties broken by pin order.
 */
function soonestExtractorPin(pins: readonly PlanetPin[]): PlanetPin | null {
  let best: PlanetPin | null = null;
  let bestMs = Infinity;
  for (const pin of pins) {
    if (pinRole(pin) !== 'extractor') continue;
    const expiryMs = extractorExpiryMs(pin);
    if (expiryMs !== null && expiryMs < bestMs) {
      best = pin;
      bestMs = expiryMs;
    }
  }
  return best;
}

interface ColonyRowProps {
  planet: CharacterPlanet;
  detail: CharacterPlanetDetail | null;
  status: ColonyStatus;
  expanded: boolean;
  onToggle: () => void;
  planetNames: ReadonlyMap<number, string>;
  pinTypeNames: ReadonlyMap<number, string>;
  productNames: ReadonlyMap<number, string>;
  schematicNames: ReadonlyMap<number, string>;
  loadedAt: number;
}

/**
 * One line per colony — status, soonest-extractor countdown, primary
 * product, pin count — that expands in place into the same
 * extraction/production/infrastructure cards the old per-colony panel always
 * rendered. Collapsed by default and single-open (`PlanetaryIndustry` owns
 * `expandedPlanetId`): a character with several colonies used to mean that
 * many full pin tables stacked on load, most of them mostly dashes.
 *
 * `<h3><button>` is the APG disclosure/accordion shape — the heading keeps
 * the row locatable by its planet name (`getByRole('heading')`) without
 * making it a second focusable element nested in the button. The status
 * pill's tooltip is dropped from the row for the same reason (a
 * `StatChip[tooltip]` renders a nested `<button>`) and repeated, tooltip and
 * all, in the expanded region's meta line instead.
 */
function ColonyRow({
  planet,
  detail,
  status,
  expanded,
  onToggle,
  planetNames,
  pinTypeNames,
  productNames,
  schematicNames,
  loadedAt,
}: ColonyRowProps) {
  const { t } = useTranslation();
  // No cached detail at all, or an extractor pin the adapter had to drop for
  // missing data: either way, computing "healthy" from what's left would be
  // exactly the confident-wrong-number the staleness rule exists to avoid.
  const attention: EffectiveAttention =
    detail === null || hasUnverifiedExtractors(detail.pins)
      ? 'unknown'
      : colonyAttention(status, loadedAt);

  // `detail` in the deps array, not `detail?.pins` — the latter is a fresh
  // array reference every render even when the underlying data hasn't
  // changed, which would defeat every memo below.
  const pins = useMemo(() => detail?.pins ?? [], [detail]);

  // Keyed by pin so a card can find its own program without re-parsing ESI
  // timestamps per render. Only programs with a complete install-time
  // baseline go in: a pin missing one renders its Banked/Reset now stats as
  // an em dash, never a zero.
  const yieldProgramsByPin = useMemo(() => {
    const map = new Map<number, ExtractorYieldProgram>();
    for (const program of extractorProgramsFromPins(pins)) {
      if (hasYieldBaseline(program)) map.set(program.pinId, program);
    }
    return map;
  }, [pins]);

  // A colony has no fixed extractor count — zero, one, or (in principle)
  // several — so this maps rather than assuming "the" extractor.
  const extractorPins = useMemo(() => pins.filter((pin) => pinRole(pin) === 'extractor'), [pins]);
  const factoryGroups = useMemo(() => groupFactoryPins(pins), [pins]);
  const infrastructurePins = useMemo(() => pins.filter((pin) => pinRole(pin) === 'other'), [pins]);

  const soonestPin = useMemo(() => soonestExtractorPin(pins), [pins]);
  const soonestProgram = soonestPin ? yieldProgramsByPin.get(soonestPin.pin_id) : undefined;
  const soonestProductId = soonestPin?.extractor_details?.product_type_id;
  const soonestProductName =
    soonestProductId !== undefined
      ? (productNames.get(soonestProductId) ?? t('pi.unknownProduct'))
      : t('pi.unknownProduct');
  const soonestExpiryMs = soonestPin ? extractorExpiryMs(soonestPin) : null;
  const soonestTotal = soonestProgram ? programTotalYield(soonestProgram) : 0;
  const soonestBanked =
    soonestProgram && soonestTotal > 0 ? yieldBankedBy(soonestProgram, loadedAt) : null;
  const soonestPercent =
    soonestBanked === null ? null : Math.round((soonestBanked / soonestTotal) * 100);

  const planetName =
    planetNames.get(planet.planet_id) ?? t('pi.planetLabel', { id: planet.planet_id });

  const totalFactoryPins = factoryGroups.reduce((sum, group) => sum + group.count, 0);
  const primaryGroup = factoryGroups[0];
  const productLabel =
    primaryGroup === undefined
      ? '—'
      : factoryGroups.length === 1
        ? t('pi.summary.productCount', {
            name:
              primaryGroup.schematicId !== undefined
                ? (schematicNames.get(primaryGroup.schematicId) ?? t('pi.unknownSchematic'))
                : t('pi.unknownSchematic'),
            count: primaryGroup.count,
          })
        : t('pi.production.facilitiesRunning', { count: totalFactoryPins });

  const expiryLabel =
    soonestPin === null || soonestExpiryMs === null
      ? '—'
      : soonestExpiryMs <= loadedAt
        ? t('pi.expired')
        : t('pi.summary.expiryLine', {
            product: soonestProductName,
            duration: formatDuration((soonestExpiryMs - loadedAt) / 1000),
          });

  const rowId = `pi-colony-${planet.planet_id}`;
  const buttonId = `${rowId}-trigger`;
  const regionId = `${rowId}-region`;

  return (
    <div className="border-b border-line last:border-b-0">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={onToggle}
          className="flex w-full flex-col gap-2 px-3 py-2.5 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5"
        >
          <span className="truncate font-medium sm:w-32 sm:shrink-0">{planetName}</span>
          <StatChip
            label={t('pi.attentionLabel')}
            value={t(`pi.attention.${attention}`)}
            tone={ATTENTION_TONE[attention]}
            className="shrink-0 self-start sm:self-auto"
          />
          <span
            aria-hidden="true"
            className="h-1.5 w-full min-w-16 flex-1 overflow-hidden rounded-full bg-panel-2"
          >
            {/* No fill at all when the banked share is unknown (no yield
                baseline) — a 0%-wide fill would read as "this program has
                produced nothing", the same confident-wrong-number
                `ExtractionCard` avoids by em-dashing Banked instead of
                zeroing it. */}
            {soonestPercent !== null && (
              <span className="block h-full bg-accent" style={{ width: `${soonestPercent}%` }} />
            )}
          </span>
          <span className="w-full truncate text-xs text-text-dim tabular-nums sm:w-44 sm:shrink-0">
            {expiryLabel}
          </span>
          <span className="w-full truncate text-xs text-text-dim sm:w-40 sm:shrink-0">
            {productLabel}
          </span>
          <span className="shrink-0 text-xs text-text-faint tabular-nums">
            {t('pi.pinCount', { count: planet.num_pins })}
          </span>
          <Caret expanded={expanded} />
        </button>
      </h3>
      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-line bg-panel-2 p-3"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <span>{t(`pi.planetType.${planet.planet_type}`)}</span>
            <span>{t('pi.upgradeLevel', { level: planet.upgrade_level })}</span>
            {/* Not a second Status chip: the row above already reads
                "Unknown"/"Decayed" once, and repeating the value here would
                make it ambiguous which chip a `getByText` means. Only the
                explanation these two attentions need is worth surfacing
                again — labeled text beside the "?", not a bare icon. */}
            {(attention === 'unknown' || attention === 'decayed') && (
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold tracking-widest uppercase">
                {t('pi.attentionLabel')}
                <InfoTooltip
                  label={t('common.aboutLabel', { label: t('pi.attentionLabel') })}
                  content={
                    attention === 'unknown'
                      ? t('pi.attentionUnknownTooltip')
                      : t('pi.yield.decayedTooltip')
                  }
                />
              </span>
            )}
            <StatChip
              label={t('pi.lastUpdate')}
              value={new Date(planet.last_update).toLocaleString()}
              tooltip={t('pi.lastUpdateTooltip')}
            />
          </div>
          {detail && detail.pins.length > 0 ? (
            <div className="space-y-3">
              {extractorPins.map((pin) => (
                <ExtractionCard
                  key={pin.pin_id}
                  pin={pin}
                  pinTypeNames={pinTypeNames}
                  productNames={productNames}
                  program={yieldProgramsByPin.get(pin.pin_id)}
                  loadedAt={loadedAt}
                />
              ))}
              {factoryGroups.length > 0 && (
                <RoleCard title={t('pi.production.title')} padded={false}>
                  {factoryGroups.map((group) => (
                    <div
                      key={String(group.schematicId)}
                      className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0"
                    >
                      <Icon.Industry
                        size={Icon.ICON_SIZE.sm}
                        className="shrink-0 text-text-dim"
                        aria-hidden="true"
                      />
                      <span className="flex-1 font-medium">
                        {group.schematicId !== undefined
                          ? (schematicNames.get(group.schematicId) ?? t('pi.unknownSchematic'))
                          : t('pi.unknownSchematic')}
                      </span>
                      <span className="text-xs text-text-dim">
                        {t('pi.production.facilitiesRunning', { count: group.count })}
                      </span>
                    </div>
                  ))}
                </RoleCard>
              )}
              {infrastructurePins.length > 0 && (
                <RoleCard title={t('pi.infrastructure.title')}>
                  <div className="flex flex-wrap gap-2">
                    {infrastructurePins.map((pin) => (
                      <span
                        key={pin.pin_id}
                        className="inline-flex items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2.5 py-1 text-xs text-text-dim"
                      >
                        <Icon.Container size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                        {pinTypeName(pin, pinTypeNames)}
                      </span>
                    ))}
                  </div>
                </RoleCard>
              )}
            </div>
          ) : (
            <EmptyState title={t('pi.noPinsTitle')} className="py-6" />
          )}
        </div>
      )}
    </div>
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
  // Single-open accordion: at most one colony's drilldown is on screen at a
  // time, matching the summary row's whole reason for existing — several
  // colonies used to mean that many full pin tables stacked on load.
  const [expandedPlanetId, setExpandedPlanetId] = useState<number | null>(null);

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
              <Panel
                title={t('pi.colonies.panelTitle', { count: sortedPlanets.length })}
                padded={false}
              >
                {sortedPlanets.map((planet) => (
                  <ColonyRow
                    key={planet.planet_id}
                    planet={planet}
                    detail={details.get(planet.planet_id)?.cached?.data ?? null}
                    status={statusByPlanet.get(planet.planet_id) ?? EMPTY_STATUS}
                    expanded={expandedPlanetId === planet.planet_id}
                    onToggle={() =>
                      setExpandedPlanetId((current) =>
                        current === planet.planet_id ? null : planet.planet_id
                      )
                    }
                    planetNames={planetNames}
                    pinTypeNames={pinTypeNames}
                    productNames={productNames}
                    schematicNames={schematicNames}
                    loadedAt={loadedAt}
                  />
                ))}
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
