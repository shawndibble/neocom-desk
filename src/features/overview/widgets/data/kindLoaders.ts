import { db } from '@/db';
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
import {
  hasWalletScope,
  loadAllCharactersWalletBalances,
  loadWalletJournalWithStatus,
} from '@/features/character/wallet';
import type { SovRaidsWidgetData } from './sovRaidsLoader';
import { DAY_MS } from '@/lib/age';

export type { ClonesWidgetData } from '@/features/character/cloneVerdictLoad';
export type { JumpTimersWidgetData } from '@/features/character/jumpTimers';
export type { SovRaidsWidgetData };
export type { MercenaryDensWidgetData } from '@/features/character/mercenaryDens';

export interface JournalData {
  result: CachedResult<WalletJournalEntry[]> | null;
  needsReauth: boolean;
}

export async function loadJournalPanel(characterId: number): Promise<JournalData> {
  if (!(await hasWalletScope(characterId))) return { result: null, needsReauth: true };
  const { cached, needsReauth } = await loadWalletJournalWithStatus(characterId);
  return { result: cached, needsReauth };
}

export interface WalletAllCharacter {
  characterId: number;
  name: string;
  balance: number | null;
  needsReauth: boolean;
  fetchedAt: number | null;
  fromCache: boolean;
}

export interface WalletAllData {
  characters: WalletAllCharacter[];
  skippedCount: number;
}

export async function loadWalletAllWidget(): Promise<WalletAllData> {
  const { entries, skipped } = await loadAllCharactersWalletBalances();
  return {
    characters: entries.map((entry) => ({
      characterId: entry.characterId,
      name: entry.characterName,
      balance: entry.balanceResult?.data ?? null,
      needsReauth: entry.needsReauth,
      fetchedAt: entry.balanceResult?.fetchedAt.getTime() ?? null,
      fromCache: entry.balanceResult?.fromCache ?? false,
    })),
    skippedCount: skipped.length,
  };
}

export async function loadJournalAllWidget(): Promise<JournalData> {
  const { loadAllCharactersJournals, loadWalletScopedCharacterIds } =
    await import('@/features/character/walletJournalAll');
  const [snapshot, scopedIds] = await Promise.all([
    loadAllCharactersJournals(undefined, { typeNames: false, fills: false }),
    loadWalletScopedCharacterIds(),
  ]);
  if (snapshot.loaded.length === 0) {
    if (scopedIds.length > 0) throw new Error('The wallet journal could not be read');
    return { result: null, needsReauth: true };
  }
  const reads = snapshot.loaded.map((c) => c.fetchedAt.getTime());
  return {
    result: {
      data: snapshot.loaded.flatMap((c) => c.journal),
      fetchedAt: new Date(Math.min(...reads)),
      fromCache: false,
      truncated: snapshot.loaded.some((c) => c.truncated),
    },
    needsReauth: false,
  };
}

export interface NetWorthDay {
  day: string;
  layers: LayerValues;
}

export const NET_WORTH_HISTORY_DAYS = 365;

export interface NetWorthCharacter {
  characterId: number;
  day: string;
  layers: LayerValues;
  covered: boolean;
  history: NetWorthDay[];
}

export interface NetWorthWidgetData {
  characters: NetWorthCharacter[];
}

const NET_WORTH_ENDPOINTS = [
  'getCharacterWallet',
  'getCharacterAssets',
  'getCharacterOrders',
] as const;

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
      const since = new Date(Date.parse(latest.day) - (NET_WORTH_HISTORY_DAYS - 1) * DAY_MS)
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

export interface ProfitRunRow {
  runId: string;
  productTypeID: number;
  quantity: number;
  loggedAt: number;
  profit: number;
  status: 'new' | 'open' | 'closed';
}

export interface ProfitWidgetData {
  runs: ProfitRunRow[];
  names: Map<number, string>;
}

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

export async function loadAllProfitWidget(): Promise<ProfitWidgetData> {
  const [withRuns, stored] = await Promise.all([
    db.productionRuns.orderBy('characterId').uniqueKeys() as Promise<number[]>,
    db.characters.toArray(),
  ]);
  const storedIds = new Set(stored.map((character) => character.characterId));
  const characterIds = withRuns.filter((id) => storedIds.has(id));
  const reads = await Promise.all(characterIds.map((id) => loadProfitWidget(id)));
  return {
    runs: reads.flatMap((read) => read.runs),
    names: new Map(reads.flatMap((read) => [...read.names])),
  };
}

export interface MiningYieldDay {
  characterId: number;
  date: string;
  isk: number;
  ores: { typeId: number; isk: number; units?: number }[];
}

export interface MiningYieldWidgetData {
  rows: MiningYieldDay[];
  typeNames: Map<number, string>;
  trackedIds: number[];
  reauthIds: number[];
  oldestSaved: string | null;
  fetchedAt: Date | null;
}

export async function loadMiningYieldWidget(): Promise<MiningYieldWidgetData> {
  const { loadMiningYieldSnapshot } = await import('@/features/miningTax/yieldSnapshot');
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

export interface LpWidgetData {
  entries: { corporationId: number; name: string | null; points: number }[];
  everMarks: number;
  needsReauth: boolean;
  fetchedAt: Date | null;
}

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

export function loadClonesWidget(characterId: number) {
  return import('@/features/character/cloneVerdictLoad').then((m) =>
    m.loadCloneVerdictWidget(characterId)
  );
}

export function loadJumpTimersWidget(characterId: number) {
  return import('@/features/character/jumpTimers').then((m) => m.loadJumpTimersWidget(characterId));
}

export function loadMilitaryCampaignsWidget(characterId: number) {
  return import('@/features/campaigns/militaryCampaignsWidget').then((m) =>
    m.loadMilitaryCampaignsWidget(characterId)
  );
}

export function loadMercenaryDensWidget(characterId: number) {
  return import('@/features/character/mercenaryDens').then((m) =>
    m.loadMercenaryDensWidget(characterId)
  );
}

export interface LocationWidgetData {
  needsReauth: boolean;
  system: { id: number; name: string | null; security: number | null } | null;
  shipTypeId: number | null;
  shipName: string | null;
  fetchedAt: Date | null;
}

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
    fetchedAt: oldestOf(location.fetchedAt, ship.fetchedAt),
  };
}

export interface SurveyWidgetData {
  hasSurvey: boolean;
  location: string | null;
  summary: SurveySummary | null;
  oreTypeIds?: ReadonlyMap<string, number>;
  fetchedAt: Date | null;
}

const NO_SURVEY: SurveyWidgetData = {
  hasSurvey: false,
  location: null,
  summary: null,
  fetchedAt: null,
};

export async function loadSurveyWidget(): Promise<SurveyWidgetData> {
  const { useCurrentSurveyId, migrateSurveyPriceHub } =
    await import('@/features/survey/surveyPref');
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
    { loadTypes, loadOreAndIceTypeIds },
  ] = await Promise.all([
    import('@/market/hubs'),
    import('@/features/survey/orePrices'),
    import('@/engine/survey/series'),
    import('@/engine/survey/pricing'),
    import('@/sde/loadSde'),
  ]);
  await migrateSurveyPriceHub().catch(() => undefined);
  const [{ loadHubFor }, { loadPricePercentFor }] = await Promise.all([
    import('@/features/market/hub'),
    import('@/features/market/pagePricePercents'),
  ]);
  const [hubId, percent] = await Promise.all([loadHubFor('mining'), loadPricePercentFor('mining')]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const scans = countedScans(survey.scans, survey.ignored);
  const { prices } = await loadOrePrices(
    scans.flatMap((s) => s.rocks.map((r) => r.ore)),
    hub,
    percent
  );
  const [types, oreIds] = await Promise.all([loadTypes(), loadOreAndIceTypeIds()]);
  const oreTypeIds = new Map<string, number>();
  for (const id of oreIds) {
    const name = types[String(id)]?.name;
    if (name !== undefined) oreTypeIds.set(name, id);
  }
  return {
    hasSurvey: true,
    location: survey.info?.location?.name ?? null,
    summary: summarizeSurvey(priceScans(scans, prices), prices),
    oreTypeIds,
    fetchedAt: new Date(),
  };
}

export interface HaulingWidgetRoute {
  from: string;
  to: string;
  item: string;
  profit: number;
  jumps: number | null;
}

export interface HaulingWidgetData {
  hasScan: boolean;
  routes: HaulingWidgetRoute[];
  fetchedAt: Date | null;
}

const NO_SCAN: HaulingWidgetData = { hasScan: false, routes: [], fetchedAt: null };

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

export type BelowMarketWidgetContract = Omit<BelowMarketSummaryContract, 'systemId'> & {
  jumps: number | null;
};

export interface BelowMarketWidgetData {
  hasView: boolean;
  count: number;
  contracts: BelowMarketWidgetContract[];
  fetchedAt: Date | null;
}

const NO_BELOW_MARKET_VIEW: BelowMarketWidgetData = {
  hasView: false,
  count: 0,
  contracts: [],
  fetchedAt: null,
};

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

export interface RouteSafetyWidgetData {
  hasRoute: boolean;
  href: string | null;
  systems: RouteKillSystem[];
  raidable: RouteRaidableSkyhook[];
  fetchedAt: Date | null;
}

export interface RouteRaidableSkyhook {
  key: string;
  systemId: number;
  name: string;
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

export interface KillsEntry {
  characterId: number;
  killmailId: number;
  side: 'kill' | 'loss';
  timeMs: number;
  systemId: number | null;
  shipTypeId: number | null;
  value: number | null;
}

export interface KillsWidgetData {
  entries: KillsEntry[];
  reach: Record<number, number | null>;
  failedIds: number[];
  trackedIds: number[];
  systemNames: Map<number, string>;
  typeNames: Map<number, string>;
  fetchedAt: Date;
}

const KILLS_NAMED_ENTRIES = 40;
const KILLS_FANOUT = 2;

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

export interface OmegaRow {
  characterId: number;
  date: string;
  amount?: number;
  internal?: boolean;
  refKey?: string;
}

export interface OmegaWidgetData {
  rows: OmegaRow[];
  coverage: Record<number, HistoryCoverage>;
  journalFetchedAt: Record<number, number>;
  plex: PlexQuote | null;
  truncated: boolean;
  skippedCount: number;
  loadedIds: number[];
}

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

export interface TradingProfitCharacter {
  characterId: number;
  name: string;
  transactions: WalletTransaction[];
  journal: WalletJournalEntry[];
}

export interface TradingProfitWidgetData {
  characters: TradingProfitCharacter[];
  names: Map<number, string>;
  truncated: boolean;
  skippedCount: number;
  fetchedAt: Date;
}

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

export async function loadSovRaidsWidget(characterId: number): Promise<SovRaidsWidgetData> {
  const { loadSovRaids } = await import('./sovRaidsLoader');
  return loadSovRaids(characterId);
}
