/**
 * Reads for the Widget Kinds that came after the old board: net worth, profit,
 * mining yield, loyalty points, best clone, wallet journal and location.
 *
 * Like `loaders.ts`, each closes over nothing but its arguments (a
 * `useRouteSnapshot` contract). Overview is in the signed-in shell chunk, so
 * anything heavy (the mining price snapshot, the clone attribute sheet, SDE
 * names) is behind `import()`: only the types come in statically, and
 * `app/bootImportGraph.test.ts` fails the build if a static import reaches
 * `@/sync`, Firebase or recharts from here.
 */
import { db } from '@/db';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { characterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { ESI_REGISTRY, requiredScopesForEndpoints } from '@/esi/registry';
import { layerValues, type LayerValues } from '@/engine/netWorth/series';
import type { HistoryCoverage } from '@/engine/omegaCoverage';
import type { PlexQuote } from '@/features/market/plexPrice';
import type { BelowMarketSummaryContract } from '@/features/contractSearch/belowMarketSummary';
import type { SurveySummary } from '@/engine/survey/series';
import type { RouteKillSystem } from '@/engine/route/routeKillTrend';
import type { RaidWindow } from '@/engine/corp/sovereignty';
import { parseInstant } from '@/engine/esiInstant';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import { summarizeProductionRun } from '@/features/industry/productionRunSummary';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterLoyaltyPoints, splitEverMarks } from '@/features/character/loyalty';
import { hasWalletScope, loadWalletJournalWithStatus } from '@/features/character/wallet';
import type { SovRaidsWidgetData } from './sovRaidsLoader';

export type { ClonesWidgetData } from '@/features/character/cloneVerdictLoad';
export type { JumpTimersWidgetData } from '@/features/character/jumpTimers';
export type { SovRaidsWidgetData };
export type { MercenaryDensWidgetData } from '@/features/character/mercenaryDens';

// --- Wallet journal ------------------------------------------------------------

export interface JournalData {
  result: CachedResult<WalletJournalEntry[]> | null;
  needsReauth: boolean;
}

/**
 * The wallet journal (about 30 days at most: that is all ESI keeps). The grant
 * is checked first so a missing permission never provokes a live 403 and the
 * app-wide re-auth banner.
 */
export async function loadJournalPanel(characterId: number): Promise<JournalData> {
  if (!(await hasWalletScope(characterId))) return { result: null, needsReauth: true };
  const { cached, needsReauth } = await loadWalletJournalWithStatus(characterId);
  return { result: cached, needsReauth };
}

// --- Net worth -----------------------------------------------------------------

export interface NetWorthDay {
  /** The UTC day of the snapshot. */
  day: string;
  layers: LayerValues;
}

/** The days (the newest included) of a Character's snapshots the widget reads: what its change and chart cover. */
export const NET_WORTH_HISTORY_DAYS = 365;

export interface NetWorthCharacter {
  characterId: number;
  /** The UTC day of the Character's newest snapshot. */
  day: string;
  layers: LayerValues;
  /** Holds every permission a snapshot needs, so its figure counts toward a total. */
  covered: boolean;
  /** The snapshots of the last `NET_WORTH_HISTORY_DAYS` days, oldest first (the newest is `day` and `layers`). */
  history: NetWorthDay[];
}

export interface NetWorthWidgetData {
  /** Each Character's latest snapshot; Characters never snapshotted are absent. */
  characters: NetWorthCharacter[];
}

const NET_WORTH_ENDPOINTS = [
  'getCharacterWallet',
  'getCharacterAssets',
  'getCharacterOrders',
] as const;

/**
 * Each Character's newest daily snapshot, straight from Dexie (local, cheap).
 * Deliberately not `useNetWorthData`: that hook's module chain reaches the
 * snapshot recorder, which pulls `@/sync` into whatever imports it.
 */
export async function loadNetWorthWidget(): Promise<NetWorthWidgetData> {
  const [rows, coveredIds] = await Promise.all([
    db.netWorthSnapshots.toArray(),
    characterIdsWithScopes(requiredScopesForEndpoints(NET_WORTH_ENDPOINTS)),
  ]);
  const covered = new Set(coveredIds);
  const byCharacter = new Map<number, NetWorthSnapshotRow[]>();
  for (const row of rows) {
    const list = byCharacter.get(row.characterId);
    if (list) list.push(row);
    else byCharacter.set(row.characterId, [row]);
  }
  return {
    characters: [...byCharacter.entries()].map(([characterId, list]) => {
      const sorted = list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      const latest = sorted[sorted.length - 1]!;
      const since = new Date(Date.parse(latest.day) - (NET_WORTH_HISTORY_DAYS - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        characterId,
        day: latest.day,
        layers: layerValues(latest),
        covered: covered.has(characterId),
        history: sorted
          .filter((row) => row.day >= since)
          .map((row) => ({ day: row.day, layers: layerValues(row) })),
      };
    }),
  };
}

// --- Realized profit -----------------------------------------------------------

export interface ProfitRunRow {
  runId: string;
  productTypeID: number;
  /** Units the run produced. */
  quantity: number;
  /** Epoch ms the run was logged: the bucket its profit lands in, as the Production Log filters by it. */
  loggedAt: number;
  profit: number;
  status: 'new' | 'open' | 'closed';
}

export interface ProfitWidgetData {
  runs: ProfitRunRow[];
  /** Product names, keyed by type id. */
  names: Map<number, string>;
}

/**
 * The Character's logged runs with their realized profit so far, from the
 * Dexie Production Log. The Trade Hub standing a run's plan would apply is
 * assumed 0 here (the log page resolves it per plan), so a pilot with
 * standings sees slightly less profit than the page, never more.
 */
export async function loadProfitWidget(characterId: number): Promise<ProfitWidgetData> {
  const [runs, saleLinks, orderWatches, losses, corrected] = await Promise.all([
    db.productionRuns.where('characterId').equals(characterId).toArray(),
    db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
    db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
    db.productionLosses.where('characterId').equals(characterId).toArray(),
    loadCorrectedSkills(characterId, Date.now(), { skipQueueWithoutScope: true }).catch(() => null),
  ]);
  const skills = Object.fromEntries(corrected?.effective ?? []);
  const rows = runs.map((run): ProfitRunRow => {
    const summary = summarizeProductionRun(run, saleLinks, orderWatches, skills, undefined, losses);
    return {
      runId: run.id,
      productTypeID: run.productTypeID,
      quantity: run.quantity,
      loggedAt: run.loggedAt,
      profit: summary.profit.profit,
      status: summary.status,
    };
  });
  const typeIds = [...new Set(rows.map((row) => row.productTypeID))];
  const names =
    typeIds.length === 0
      ? new Map<number, string>()
      : await import('@/features/character/typeNames').then((m) => m.loadTypeNames(typeIds));
  return { runs: rows, names };
}

// --- Mining yield --------------------------------------------------------------

export interface MiningYieldDay {
  characterId: number;
  /** EVE/UTC calendar date. */
  date: string;
  /** The day's ore, valued raw at that day's price. */
  isk: number;
  ores: { typeId: number; isk: number; /** Units mined. */ units?: number }[];
}

export interface MiningYieldWidgetData {
  rows: MiningYieldDay[];
  typeNames: Map<number, string>;
  /** Characters whose ledger was read. */
  trackedIds: number[];
  /** Characters whose mining grant lapsed. */
  reauthIds: number[];
  /** The oldest day held at all, in or out of range. */
  oldestSaved: string | null;
  fetchedAt: Date | null;
}

/** Every tracked Character's mining ledger, valued; heavy (prices, SDE), so it loads on demand. */
export async function loadMiningYieldWidget(): Promise<MiningYieldWidgetData> {
  const { loadMiningYieldSnapshot } = await import('@/features/miningTax/yieldSnapshot');
  // No refining data: the widget counts what was mined, and skipping it spares the reprocessing reads.
  const snapshot = await loadMiningYieldSnapshot(false, true);
  const rows = snapshot.rows.map((row) => ({
    characterId: row.characterId,
    date: row.entry.date,
    isk: row.valuation.rawValue,
    ores: row.valuation.lines.map((line) => ({
      typeId: line.typeId,
      isk: line.rawValue,
      units: line.quantity,
    })),
  }));
  return {
    rows,
    typeNames: snapshot.typeNames,
    trackedIds: snapshot.characters.map((c) => c.characterId),
    reauthIds: snapshot.reauthCharacters.map((c) => c.characterId),
    oldestSaved: rows.reduce<string | null>(
      (oldest, row) => (oldest === null || row.date < oldest ? row.date : oldest),
      null
    ),
    fetchedAt: snapshot.fetchedAt,
  };
}

// --- Loyalty points ------------------------------------------------------------

export interface LpWidgetData {
  entries: { corporationId: number; name: string | null; points: number }[];
  /** Paragon's balance, which reads as its own currency and is not counted as LP. */
  everMarks: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

/** Names are only resolved for the largest balances: the widget never draws more. */
const LP_NAMED_ENTRIES = 12;

export async function loadLpWidget(characterId: number): Promise<LpWidgetData> {
  const { cached, needsReauth } = await loadCharacterLoyaltyPoints(characterId);
  const { everMarks, otherLoyalty } = splitEverMarks(cached?.data ?? []);
  const sorted = [...otherLoyalty]
    .filter((entry) => entry.loyalty_points > 0)
    .sort((a, b) => b.loyalty_points - a.loyalty_points);
  const { loadCorporationName } = await import('@/features/loyalty/store');
  const names = await Promise.all(
    sorted
      .slice(0, LP_NAMED_ENTRIES)
      .map((entry) => loadCorporationName(entry.corporation_id).catch(() => null))
  );
  return {
    entries: sorted.map((entry, i) => ({
      corporationId: entry.corporation_id,
      name: names[i] ?? null,
      points: entry.loyalty_points,
    })),
    everMarks,
    needsReauth,
    fetchedAt: cached?.fetchedAt ?? null,
  };
}

// --- Best clone ----------------------------------------------------------------

export function loadClonesWidget(characterId: number) {
  return import('@/features/character/cloneVerdictLoad').then((m) =>
    m.loadCloneVerdictWidget(characterId)
  );
}

export function loadJumpTimersWidget(characterId: number) {
  return import('@/features/character/jumpTimers').then((m) => m.loadJumpTimersWidget(characterId));
}

export function loadMercenaryDensWidget(characterId: number) {
  return import('@/features/character/mercenaryDens').then((m) =>
    m.loadMercenaryDensWidget(characterId)
  );
}

// --- Location and ship ---------------------------------------------------------

export interface LocationWidgetData {
  /** The location grant is missing. */
  needsReauth: boolean;
  /** Null when the location could not be read (offline, or not resolvable). */
  system: { id: number; name: string | null; security: number | null } | null;
  shipTypeId: number | null;
  shipName: string | null;
  /**
   * When ESI last answered for what is shown (the older of the location and ship
   * reads, so a cache hit reports its row's age, not the time of the call); null
   * when none was made (the grant is missing, or nothing could be read).
   */
  fetchedAt: Date | null;
}

/** The earliest of the dates that exist; null when none do (nothing was read). */
function oldestOf(...dates: Array<Date | null>): Date | null {
  const present = dates.filter((date): date is Date => date !== null);
  return present.length === 0 ? null : new Date(Math.min(...present.map((date) => date.getTime())));
}

export async function loadLocationWidget(characterId: number): Promise<LocationWidgetData> {
  const token = await db.tokens.get(characterId);
  const scopes = token?.scopes ?? [];
  if (!scopes.includes(ESI_REGISTRY.getCharacterLocation.scope)) {
    return { needsReauth: true, system: null, shipTypeId: null, shipName: null, fetchedAt: null };
  }
  const [
    { loadCharacterSolarSystemRead },
    { loadCharacterShipTypeRead },
    { loadSystemNameAndSecurity },
  ] = await Promise.all([
    import('@/features/character/location'),
    import('@/features/character/ship'),
    import('@/features/character/systemSecurity'),
  ]);
  const [location, ship] = await Promise.all([
    loadCharacterSolarSystemRead(characterId),
    scopes.includes(ESI_REGISTRY.getCharacterShip.scope)
      ? loadCharacterShipTypeRead(characterId)
      : Promise.resolve({ typeId: null, fetchedAt: null }),
  ]);
  const systemId = location.systemId;
  const shipTypeId = ship.typeId;
  const [system, shipName] = await Promise.all([
    systemId === null ? null : loadSystemNameAndSecurity(systemId).catch(() => null),
    shipTypeId === null
      ? null
      : import('@/features/character/typeNames')
          .then((m) => m.loadTypeNames([shipTypeId]))
          .then((names) => names.get(shipTypeId) ?? null)
          .catch(() => null),
  ]);
  return {
    needsReauth: false,
    system:
      systemId === null
        ? null
        : { id: systemId, name: system?.name ?? null, security: system?.security ?? null },
    shipTypeId,
    shipName,
    // The older of the two reads: the widget is only as current as its stalest half.
    fetchedAt: oldestOf(location.fetchedAt, ship.fetchedAt),
  };
}

// --- Mining survey -------------------------------------------------------------

export interface SurveyWidgetData {
  /** False when this device tracks no survey, or its share link has expired. */
  hasSurvey: boolean;
  /** Where the survey was taken, when its owner said. */
  location: string | null;
  /** The survey read as a series of scans; null while there is nothing to read. */
  summary: SurveySummary | null;
  fetchedAt: Date | null;
}

const NO_SURVEY: SurveyWidgetData = {
  hasSurvey: false,
  location: null,
  summary: null,
  fetchedAt: null,
};

/**
 * The survey this device is tracking, summarised: what is left of each ore and when the field runs out. A survey is a Firestore
 * share link and its prices are a market read, at the Survey page's own price
 * hub (`useSurveyPriceHub`), so all of it is behind `import()`. A failed read throws, which keeps the last good figure on show.
 */
export async function loadSurveyWidget(): Promise<SurveyWidgetData> {
  const { useCurrentSurveyId, useSurveyPriceHub } = await import('@/features/survey/surveyPref');
  await useCurrentSurveyId.getState().hydrate();
  const id = useCurrentSurveyId.getState().value;
  if (id === null) return NO_SURVEY;
  const { loadSurvey } = await import('@/features/survey/surveyStore');
  const survey = await loadSurvey(id);
  if (!survey.ok) {
    if (survey.reason === 'failed') throw new Error('Survey could not be read');
    return NO_SURVEY;
  }
  const [
    { DEFAULT_TRADE_HUB, getTradeHub },
    { loadOrePrices },
    { countedScans, summarizeSurvey },
    { priceScans },
  ] = await Promise.all([
    import('@/market/hubs'),
    import('@/features/survey/orePrices'),
    import('@/engine/survey/series'),
    import('@/engine/survey/pricing'),
  ]);
  await useSurveyPriceHub.getState().hydrate();
  const hub = getTradeHub(useSurveyPriceHub.getState().value) ?? DEFAULT_TRADE_HUB;
  const scans = countedScans(survey.scans, survey.ignored);
  const { prices } = await loadOrePrices(
    scans.flatMap((s) => s.rocks.map((r) => r.ore)),
    hub
  );
  return {
    hasSurvey: true,
    location: survey.info?.location?.name ?? null,
    summary: summarizeSurvey(priceScans(scans, prices), prices),
    fetchedAt: new Date(),
  };
}

// --- Hauling ---------------------------------------------------------------------

export interface HaulingWidgetRoute {
  from: string;
  to: string;
  item: string;
  profit: number;
  /** Stargate jumps between the two hubs; null where no route is known. */
  jumps: number | null;
}

export interface HaulingWidgetData {
  /** False until the Hauling tab has finished a scan on this device. */
  hasScan: boolean;
  /** Best first. */
  routes: HaulingWidgetRoute[];
  /** When the scan these routes came from finished. */
  fetchedAt: Date | null;
}

const NO_SCAN: HaulingWidgetData = { hasScan: false, routes: [], fetchedAt: null };

/**
 * The best hauls from the last scan the Hauling tab ran. Only a stored summary
 * is read, never a market call: a scan costs hundreds of requests and the
 * Overview must not start one on every load. The jump counts come from the
 * local stargate graph. The age shown is the scan's own, so a stale answer is
 * plainly stale; a fresh scan comes from the Hauling tab.
 */
export async function loadHaulingWidget(): Promise<HaulingWidgetData> {
  const [{ useHaulingSummary }, { getTradeHub }, { findLocalJumps }] = await Promise.all([
    import('@/features/market/haulingSummary'),
    import('@/market/hubs'),
    import('@/features/route/localRoute'),
  ]);
  await useHaulingSummary.getState().hydrate();
  const summary = useHaulingSummary.getState().value;
  if (summary === null) return NO_SCAN;
  const routes = await Promise.all(
    summary.lanes.map(async (lane) => {
      const from = getTradeHub(lane.fromHub);
      const to = getTradeHub(lane.toHub);
      if (!from || !to) return [];
      const jumps = await findLocalJumps(from.systemId, to.systemId);
      return [
        {
          from: from.systemName,
          to: to.systemName,
          item: lane.item,
          profit: lane.profit,
          jumps: jumps.kind === 'known' ? jumps.jumps : null,
        },
      ];
    })
  );
  return { hasScan: true, routes: routes.flat(), fetchedAt: new Date(summary.fetchedAt) };
}

// --- Below-market contracts -------------------------------------------------------

export type BelowMarketWidgetContract = Omit<BelowMarketSummaryContract, 'systemId'> & {
  /** Stargate jumps from the Character's Current System; null when unknown. */
  jumps: number | null;
};

export interface BelowMarketWidgetData {
  /** False until Item search's Below market view has run on this device. */
  hasView: boolean;
  /** Every contract below market in that view. */
  count: number;
  /** Best profit first. */
  contracts: BelowMarketWidgetContract[];
  /** When the contract snapshot behind it was published. */
  fetchedAt: Date | null;
}

const NO_BELOW_MARKET_VIEW: BelowMarketWidgetData = {
  hasView: false,
  count: 0,
  contracts: [],
  fetchedAt: null,
};

/**
 * Reads the stored summary only (see `belowMarketSummary.ts`). Jumps: the
 * header Character's Current System over the local stargate graph.
 */
export async function loadBelowMarketWidget(characterId: number): Promise<BelowMarketWidgetData> {
  const { useBelowMarketSummary } = await import('@/features/contractSearch/belowMarketSummary');
  await useBelowMarketSummary.getState().hydrate();
  const summary = useBelowMarketSummary.getState().value;
  if (summary === null) return NO_BELOW_MARKET_VIEW;
  const [{ loadCurrentSystemId }, { loadJumpBasis }, { localJumpDistances }] = await Promise.all([
    import('@/features/route/currentSystem'),
    import('@/features/route/jumpBasis'),
    import('@/features/route/localRoute'),
  ]);
  // An unreadable graph leaves jumps unknown; the contracts still show.
  const [origin, basis] = await Promise.all([
    loadCurrentSystemId(characterId).catch(() => null),
    loadJumpBasis().catch(() => null),
  ]);
  const distances =
    origin === null || basis === null
      ? null
      : await localJumpDistances(origin, basis.rules, basis.network).catch(() => null);
  const jumps = distances?.kind === 'known' ? distances.jumps : null;
  return {
    hasView: true,
    count: summary.count,
    contracts: summary.contracts.map(({ systemId, ...contract }) => ({
      ...contract,
      jumps: systemId === null || jumps === null ? null : (jumps.get(systemId) ?? null),
    })),
    fetchedAt: new Date(summary.fetchedAt),
  };
}

// --- Route safety --------------------------------------------------------------

export interface RouteSafetyWidgetData {
  /** False when Route Safety has drawn no route on this device yet. */
  hasRoute: boolean;
  /** Route Safety, opened on the saved route. */
  href: string | null;
  /** The saved route's systems in flight order, each with its kills over 24 hours. */
  systems: RouteKillSystem[];
  /** Raidable skyhooks (public list) in the route's systems; empty when the list could not be read. */
  raidable: RouteRaidableSkyhook[];
  fetchedAt: Date | null;
}

/** One skyhook raid window in a system of the saved route (issue #4784). The public list carries no silo size. */
export interface RouteRaidableSkyhook {
  key: string;
  systemId: number;
  name: string;
  /** Jumps along the route from its first system. */
  jumps: number;
  window: RaidWindow;
}

const NO_ROUTE: RouteSafetyWidgetData = {
  hasRoute: false,
  href: null,
  systems: [],
  raidable: [],
  fetchedAt: null,
};

/**
 * The route Route Safety last drew, with each system's player kills over the
 * last day. No trip is planned here: the tab saved the systems it drew
 * (`travel/savedRoute`). Kills are one zKillboard read per region, cached and
 * behind `import()`. A read that got no system at all throws, which keeps the
 * last good figure on show rather than drawing a route of unknowns.
 */
export async function loadRouteSafetyWidget(): Promise<RouteSafetyWidgetData> {
  const { useSavedRoute } = await import('@/features/travel/savedRoute');
  await useSavedRoute.getState().hydrate();
  const route = useSavedRoute.getState().value;
  if (route === null) return NO_ROUTE;
  const [{ loadRouteKills24h }, { loadSolarSystemsById }, { routeStopsHref }] = await Promise.all([
    import('@/features/travel/routeKills24h'),
    import('@/sde/solarSystems'),
    import('@/features/route/routeSafetyLink'),
  ]);
  const [kills, names, raidList] = await Promise.all([
    loadRouteKills24h(route.systems),
    loadSolarSystemsById().catch(() => null),
    // Supplementary: an unread list costs the rows, never the widget.
    import('./sovRaidsLoader').then((m) => m.loadRaidableList()).catch(() => null),
  ]);
  const systems = route.systems.map((systemId) => ({
    systemId,
    name: names?.get(systemId)?.name ?? `#${systemId}`,
    kills: kills.get(systemId) ?? null,
  }));
  if (systems.every((system) => system.kills === null)) {
    throw new Error('Route kills could not be read');
  }
  const routeIndex = new Map<number, number>();
  route.systems.forEach((systemId, i) => {
    if (!routeIndex.has(systemId)) routeIndex.set(systemId, i);
  });
  const raidable = (raidList?.data.skyhooks ?? []).flatMap((hook): RouteRaidableSkyhook[] => {
    const jumps = routeIndex.get(hook.solar_system_id);
    const startMs = parseInstant(hook.theft_vulnerability?.start);
    const endMs = parseInstant(hook.theft_vulnerability?.end);
    if (jumps === undefined || startMs === null || endMs === null) return [];
    return [
      {
        key: `${hook.solar_system_id}:${hook.planet_id}`,
        systemId: hook.solar_system_id,
        name: names?.get(hook.solar_system_id)?.name ?? `#${hook.solar_system_id}`,
        jumps,
        window: { startMs, endMs },
      },
    ];
  });
  return {
    hasRoute: true,
    href: routeStopsHref(route.fromId, route.stops),
    systems,
    raidable,
    fetchedAt: new Date(),
  };
}

// --- Kills and losses ------------------------------------------------------------

/** One kill or loss of a tracked Character, dated and placed. */
export interface KillsEntry {
  characterId: number;
  killmailId: number;
  side: 'kill' | 'loss';
  timeMs: number;
  systemId: number | null;
  /** The hull that died. */
  shipTypeId: number | null;
  /** zKillboard's total value; null when it states none. */
  value: number | null;
}

export interface KillsWidgetData {
  entries: KillsEntry[];
  /** Per Character: how far back the read reaches (ms), null when the whole record is held. */
  reach: Record<number, number | null>;
  /** Characters whose killboard could not be read this time. */
  failedIds: number[];
  trackedIds: number[];
  systemNames: Map<number, string>;
  typeNames: Map<number, string>;
  fetchedAt: Date;
}

/** Newest entries whose ship and system names are resolved; the table lists no more. */
const KILLS_NAMED_ENTRIES = 40;
/** Characters read at once: zKillboard asks callers to go gently. */
const KILLS_FANOUT = 2;

/**
 * Every tracked Character's kills and losses off zKillboard (public: no scope).
 * Reads go through the pilot-list cache, so a refresh inside ten minutes asks
 * zKillboard nothing. A Character that fails is listed in `failedIds`; when
 * every one fails this throws, which keeps the last good figure and shows
 * Retry. zKillboard, the SDE and the type names stay behind `import()`.
 */
export async function loadKillsWidget(): Promise<KillsWidgetData> {
  const trackedIds = (await db.tokens.toArray()).map((token) => token.characterId);
  const { fetchPilotKillmailHistory } = await import('@/lib/zkillboard');
  const { mapWithConcurrencyLimit } = await import('@/lib/concurrency');
  const entries: KillsEntry[] = [];
  const reach: Record<number, number | null> = {};
  const failedIds: number[] = [];
  await mapWithConcurrencyLimit(trackedIds, KILLS_FANOUT, async (characterId) => {
    const result = await fetchPilotKillmailHistory(characterId);
    if (!result.ok) {
      failedIds.push(characterId);
      return;
    }
    reach[characterId] = result.reachesBackTo;
    for (const entry of result.entries) {
      entries.push({
        characterId,
        killmailId: entry.killmailId,
        side: entry.side,
        timeMs: Date.parse(entry.detail?.time ?? ''),
        systemId: entry.detail?.systemId ?? null,
        shipTypeId: entry.detail?.victim.ship_type_id ?? null,
        value: entry.value,
      });
    }
  });
  if (trackedIds.length > 0 && failedIds.length === trackedIds.length) {
    throw new Error('Kills and losses could not be read');
  }
  entries.sort((a, b) => b.timeMs - a.timeMs);
  const named = entries.slice(0, KILLS_NAMED_ENTRIES);
  const typeIds = [...new Set(named.flatMap((e) => (e.shipTypeId === null ? [] : [e.shipTypeId])))];
  const [typeNames, systems] = await Promise.all([
    typeIds.length === 0
      ? new Map<number, string>()
      : import('@/features/character/typeNames')
          .then((m) => m.loadTypeNames(typeIds))
          .catch(() => new Map<number, string>()),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
  ]);
  const systemNames = new Map<number, string>();
  for (const entry of named) {
    const name = entry.systemId === null ? undefined : systems?.get(entry.systemId)?.name;
    if (entry.systemId !== null && name !== undefined) systemNames.set(entry.systemId, name);
  }
  return {
    entries,
    reach,
    failedIds,
    trackedIds,
    systemNames,
    typeNames,
    fetchedAt: new Date(),
  };
}

// --- Omega coverage ----------------------------------------------------------------

/** One journal line, reduced to what net income needs, with the netting already decided. */
export interface OmegaRow {
  characterId: number;
  date: string;
  amount?: number;
  /** Both parties are the pilot's own Characters. */
  internal?: boolean;
  /** `plex_bought` / `plex_sold` for a PLEX market line. */
  refKey?: string;
}

export interface OmegaWidgetData {
  /** Every loaded Character's lines, classified against all wallet-scoped Characters. */
  rows: OmegaRow[];
  /** Per loaded Character: what its local journal truly covers; absent when nothing is held. */
  coverage: Record<number, HistoryCoverage>;
  /** Per loaded Character: when its journal was read (ms). */
  journalFetchedAt: Record<number, number>;
  /** The lowest PLEX sell price and when its book was read; null when it could not be read. */
  plex: PlexQuote | null;
  /** Some journal pages were missing for a loaded Character. */
  truncated: boolean;
  /** Wallet-scoped Characters whose journal did not load. */
  skippedCount: number;
  loadedIds: number[];
}

/**
 * Every wallet-scoped Character's journal (the local history, #3909) and the
 * PLEX price. Classified here against all of them, so a donation from your own
 * alt is internal even when the widget later narrows to one Character. The
 * journal read is heavy and the book is a market read, so both stay behind
 * `import()`. A missing PLEX price is `plex: null`, not an error. Coverage is the
 * archive's truthful reach and gaps (#3909), not just the oldest line held.
 */
export async function loadOmegaWidget(): Promise<OmegaWidgetData> {
  const [
    { loadAllCharactersJournals, loadWalletScopedCharacterIds },
    plexModule,
    netting,
    links,
    archive,
  ] = await Promise.all([
    import('@/features/character/walletJournalAll'),
    import('@/features/market/plexPrice'),
    import('@/engine/journalNetting'),
    import('@/features/character/journalTransactionLink'),
    import('@/features/character/walletArchive'),
  ]);
  const [snapshot, scopedIds, plex] = await Promise.all([
    loadAllCharactersJournals(undefined, { typeNames: false }),
    loadWalletScopedCharacterIds(),
    plexModule.loadPlexQuote().catch(() => null),
  ]);
  if (snapshot.loaded.length === 0 && scopedIds.length > 0) {
    throw new Error('The wallet journal could not be read');
  }
  const trackedIds = new Set(scopedIds);
  for (const c of snapshot.loaded) trackedIds.add(c.characterId);
  const lines = snapshot.loaded.flatMap((c) =>
    c.journal.map((entry) => ({ ...entry, characterId: c.characterId }))
  );
  const linkFor = links.journalTransactionLinks(
    snapshot.loaded.flatMap((c) =>
      c.transactions.map((txn) => ({ ...txn, characterId: c.characterId }))
    )
  );
  const rows = netting.classifyJournal(lines, { trackedIds, linkFor }).map((row) => ({
    characterId: row.characterId as number,
    date: row.date,
    amount: row.amount,
    internal: row.internal,
    refKey: row.refKey,
  }));
  const oldest: Record<number, number> = {};
  for (const row of rows) {
    const at = Date.parse(row.date);
    if (!Number.isFinite(at)) continue;
    const known = oldest[row.characterId];
    if (known === undefined || at < known) oldest[row.characterId] = at;
  }
  const coverage: Record<number, HistoryCoverage> = {};
  await Promise.all(
    snapshot.loaded.map(async ({ characterId }) => {
      const info = await archive.loadWalletArchiveInfo(characterId).catch(() => null);
      // Lines held with no recorded window (older archive): the oldest line is all we know.
      const since = info?.since ?? oldest[characterId];
      if (since !== undefined) coverage[characterId] = { since, gaps: info?.gaps ?? [] };
    })
  );
  return {
    rows,
    coverage,
    journalFetchedAt: Object.fromEntries(
      snapshot.loaded.map((c) => [c.characterId, c.fetchedAt.getTime()])
    ),
    plex,
    truncated: snapshot.loaded.some((c) => c.truncated),
    skippedCount: snapshot.skipped.length,
    loadedIds: snapshot.loaded.map((c) => c.characterId),
  };
}

// --- Trading profit ------------------------------------------------------------------

export interface TradingProfitCharacter {
  characterId: number;
  name: string;
  transactions: WalletTransaction[];
  journal: WalletJournalEntry[];
}

export interface TradingProfitWidgetData {
  /** Every loaded Character's fills and journal; the builder pools or narrows them. */
  characters: TradingProfitCharacter[];
  /** Item names, keyed by type id. */
  names: Map<number, string>;
  /** Some Character's fills stopped at the page cap, so margins near the oldest edge may be missing. */
  truncated: boolean;
  /** Wallet-scoped Characters whose journal did not load. */
  skippedCount: number;
  fetchedAt: Date;
}

/** Every Character's fills and journal (the local history), behind `import()` like the other journal reads. */
export async function loadTradingProfitWidget(): Promise<TradingProfitWidgetData> {
  const { loadAllCharactersJournals, loadWalletScopedCharacterIds } =
    await import('@/features/character/walletJournalAll');
  const [snapshot, scopedIds] = await Promise.all([
    loadAllCharactersJournals(),
    loadWalletScopedCharacterIds(),
  ]);
  if (snapshot.loaded.length === 0 && scopedIds.length > 0) {
    throw new Error('The wallet journal could not be read');
  }
  const reads = snapshot.loaded.map((c) => c.fetchedAt.getTime());
  return {
    characters: snapshot.loaded.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      transactions: c.transactions,
      journal: c.journal,
    })),
    names: snapshot.typeNames,
    truncated: snapshot.loaded.some((c) => c.fillsTruncated),
    skippedCount: snapshot.skipped.length,
    fetchedAt: new Date(reads.length === 0 ? Date.now() : Math.min(...reads)),
  };
}

// --- Skyhook raids ---------------------------------------------------------------

/** The read, behind `import()`; its builder is the kind's `loadBuild` (`worldModels.ts`). */
export async function loadSovRaidsWidget(characterId: number): Promise<SovRaidsWidgetData> {
  const { loadSovRaids } = await import('./sovRaidsLoader');
  return loadSovRaids(characterId);
}

// --- Market Trend ------------------------------------------------------------------

/** Most lines the chart draws; the Quickbar's first items fill them. */
export const MARKET_TREND_MAX_ITEMS = 6;

export interface MarketTrendItem {
  typeId: number;
  name: string;
  /** Every daily row ESI has, oldest first; empty for a type with no market or a failed read. */
  points: MarketHistoryPoint[];
  /** Where the item's Price History opens: the pilot's hub, or the region of a global market such as PLEX. */
  to: string;
  fromCache: boolean;
}

export interface MarketTrendWidgetData {
  hubName: string;
  items: MarketTrendItem[];
  /** Quickbar items past the cap, not drawn. */
  omitted: number;
  fetchedAt: Date | null;
}

/** The first Quickbar items' daily history at the pilot's Market hub (a global-market item at its own region). */
export async function loadMarketTrendWidget(characterId: number): Promise<MarketTrendWidgetData> {
  const [{ loadPriceHistory }, { loadGlobalMarketOverrides }, { MARKET_HUB_SETTING_KEY }, hubs] =
    await Promise.all([
      import('@/features/market/priceHistory'),
      import('@/features/market/orderBookView'),
      import('@/features/market/hub'),
      import('@/market/hubs'),
    ]);
  const stored = (await db.settings.get(MARKET_HUB_SETTING_KEY))?.value;
  const hub =
    (typeof stored === 'string' ? hubs.getTradeHub(stored as never) : undefined) ??
    hubs.DEFAULT_TRADE_HUB;
  const bar = (await db.quickbars.get(String(characterId)))?.items ?? [];
  const picked = bar.slice(0, MARKET_TREND_MAX_ITEMS);
  const overrides = await loadGlobalMarketOverrides();
  const items = await Promise.all(
    picked.map(async (item): Promise<MarketTrendItem> => {
      const global = overrides.get(item.typeId);
      const regionId = global?.regionId ?? hub.regionId;
      const to = global
        ? `/market/browser?type=${item.typeId}&region=${global.regionId}`
        : `/market/browser?type=${item.typeId}&hub=${hub.id}`;
      // A type with no market (ESI 400) or a failed read is a row of unknowns, not a failed widget.
      const result = await loadPriceHistory(regionId, item.typeId).catch(() => null);
      return {
        typeId: item.typeId,
        name: item.name,
        points: result?.points ?? [],
        to,
        fromCache: result?.fromCache ?? false,
      };
    })
  );
  return {
    hubName: hub.systemName,
    items,
    omitted: Math.max(0, bar.length - picked.length),
    fetchedAt: items.length === 0 ? null : new Date(),
  };
}
