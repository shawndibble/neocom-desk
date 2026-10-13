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
import { ESI_REGISTRY, requiredScopesForEndpoints } from '@/esi/registry';
import { layerValues, type LayerValues } from '@/engine/netWorth/series';
import type { SurveySummary } from '@/engine/survey/series';
import type { RouteKillSystem } from '@/engine/route/routeKillTrend';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import type { WalletJournalEntry } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import { summarizeProductionRun } from '@/features/industry/productionRunSummary';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterLoyaltyPoints, splitEverMarks } from '@/features/character/loyalty';
import { hasWalletScope, loadWalletJournalWithStatus } from '@/features/character/wallet';

export type { ClonesWidgetData } from '@/features/character/cloneVerdictLoad';
export type { JumpTimersWidgetData } from '@/features/character/jumpTimers';

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
  const [rows, tokens] = await Promise.all([db.netWorthSnapshots.toArray(), db.tokens.toArray()]);
  const required = requiredScopesForEndpoints(NET_WORTH_ENDPOINTS);
  const covered = new Set(
    tokens
      .filter((token) => required.every((scope) => token.scopes.includes(scope)))
      .map((token) => token.characterId)
  );
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

// --- Location and ship ---------------------------------------------------------

export interface LocationWidgetData {
  /** The location grant is missing. */
  needsReauth: boolean;
  /** Null when the location could not be read (offline, or not resolvable). */
  system: { id: number; name: string | null; security: number | null } | null;
  shipTypeId: number | null;
  shipName: string | null;
}

export async function loadLocationWidget(characterId: number): Promise<LocationWidgetData> {
  const token = await db.tokens.get(characterId);
  const scopes = token?.scopes ?? [];
  if (!scopes.includes(ESI_REGISTRY.getCharacterLocation.scope)) {
    return { needsReauth: true, system: null, shipTypeId: null, shipName: null };
  }
  const [
    { loadCharacterSolarSystemId },
    { loadCharacterShipTypeId },
    { loadSystemNameAndSecurity },
  ] = await Promise.all([
    import('@/features/character/location'),
    import('@/features/character/ship'),
    import('@/features/character/systemSecurity'),
  ]);
  const [systemId, shipTypeId] = await Promise.all([
    loadCharacterSolarSystemId(characterId),
    scopes.includes(ESI_REGISTRY.getCharacterShip.scope)
      ? loadCharacterShipTypeId(characterId)
      : Promise.resolve(null),
  ]);
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
 * share link and its prices are a market read, so all of it is behind
 * `import()`. A failed read throws, which keeps the last good figure on show.
 */
export async function loadSurveyWidget(): Promise<SurveyWidgetData> {
  const { useCurrentSurveyId } = await import('@/features/survey/surveyPref');
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
    { useMarketHub },
    { DEFAULT_TRADE_HUB, getTradeHub },
    { loadOrePrices },
    { countedScans, summarizeSurvey },
    { priceScans },
  ] = await Promise.all([
    import('@/features/market/hub'),
    import('@/market/hubs'),
    import('@/features/survey/orePrices'),
    import('@/engine/survey/series'),
    import('@/engine/survey/pricing'),
  ]);
  await useMarketHub.getState().hydrate();
  const hub = getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
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

// --- Route safety --------------------------------------------------------------

export interface RouteSafetyWidgetData {
  /** False when Route Safety has drawn no route on this device yet. */
  hasRoute: boolean;
  /** Route Safety, opened on the saved route. */
  href: string | null;
  /** The saved route's systems in flight order, each with its kills over 24 hours. */
  systems: RouteKillSystem[];
  fetchedAt: Date | null;
}

const NO_ROUTE: RouteSafetyWidgetData = {
  hasRoute: false,
  href: null,
  systems: [],
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
  const [kills, names] = await Promise.all([
    loadRouteKills24h(route.systems),
    loadSolarSystemsById().catch(() => null),
  ]);
  const systems = route.systems.map((systemId) => ({
    systemId,
    name: names?.get(systemId)?.name ?? `#${systemId}`,
    kills: kills.get(systemId) ?? null,
  }));
  if (systems.every((system) => system.kills === null)) {
    throw new Error('Route kills could not be read');
  }
  return {
    hasRoute: true,
    href: routeStopsHref(route.fromId, route.stops),
    systems,
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
