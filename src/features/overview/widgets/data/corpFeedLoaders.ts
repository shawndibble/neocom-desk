/**
 * The Corp Board's reads, loaded behind `import()` from `corpFeeds.ts`.
 *
 * **Gated before they fetch** (`features/corp/corpReadAccess.ts`): no corp call
 * at all unless the roles and grant cover it. CCP role-gates these endpoints
 * server-side, so an ungated read buys a guaranteed 403. Each goes through the
 * corp loaders `/corp` and its sub-pages already use, so the cache rows, the
 * corp-scoped keys and the 403 handling are theirs, not a second copy.
 */
import { diffRoster } from '@/engine/corp/members';
import { summariseBay } from '@/engine/corp/starbases';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCorporationId, MASTER_WALLET_DIVISION } from '@/features/corp/boardData';
import { jobTypeIds } from '@/features/corp/boardSources';
import { classifyCorpAssets } from '@/engine/corp/assetLedger';
import { loadCorporationAssets, toCorpAssetInputs } from '@/features/corp/assets';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { loadAssetCopyValues } from '@/features/assets/assetCopyValues';
import { getAveragePriceByType } from '@/market/prices';
import { summariseCorpAssets } from './corpAssetsSummary';
import { loadCorporationContracts } from '@/features/corp/contracts';
import { loadCorporationOrders } from '@/features/corp/orders';
import { loadStationBestPrices } from '@/features/market/orderCompetition';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { CorpReadFailed } from '@/features/corp/corpRead';
import { resolveCorpReadAccess, type CorpCapability } from '@/features/corp/corpReadAccess';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { walletDivisions } from '@/features/corp/divisions';
import { loadRoleAudit } from '@/features/corp/roleAudit';
import { loadCorporationCustomsOffices } from '@/features/corp/customsOffices';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import {
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  toMemberActivity,
} from '@/features/corp/members';
import { loadCorporationStarbases, loadStarbaseDetails } from '@/features/corp/starbases';
import { readPreviousRoster } from '@/features/corp/rosterState';
import { loadObserverFeed } from '@/features/corp/taxBook/esiFeed';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { isNpcCorporationId } from '@/esi/entityIds';
import { DAY_MS } from '@/lib/age';
import { fetchCorporationStatsRead } from '@/lib/zkillboard';
import { parseInstant } from '@/engine/esiInstant';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type {
  CorpAssetsFeed,
  CorpCustomsFeed,
  CorpRoleAuditFeed,
  CorpContractsFeed,
  CorpJobsFeed,
  CorpJournalLine,
  CorpKillsFeed,
  CorpMembersFeed,
  CorpMiningFeed,
  CorpStarbaseRow,
  CorpStarbasesFeed,
  CorpOrdersFeed,
  CorpWalletFeed,
} from './corpFeeds';

type Access = { characterId: number; corporationId: number };

/** The corporation and its access when `capability` is open; null when it is not. */
async function gate(characterId: number, capability: CorpCapability): Promise<Access | null> {
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can(capability)) return null;
  return { characterId, corporationId: access.corporationId };
}

const UNREADABLE = { readable: false, needsReauth: false, fetchedAt: null, fromCache: false };

/** The oldest read of those that landed, and whether any came from the saved copy. */
function readAge(results: readonly (StatusResult<unknown> | null)[]) {
  const cached = results
    .map((result) => result?.cached)
    .filter((c): c is CachedResult<unknown> => c !== null && c !== undefined);
  const fetchedAt =
    cached.length === 0
      ? null
      : cached.map((c) => c.fetchedAt).reduce((oldest, at) => (at < oldest ? at : oldest));
  return { fetchedAt, fromCache: cached.some((c) => c.fromCache) };
}

export async function loadCorpWallet(characterId: number): Promise<CorpWalletFeed> {
  const empty: CorpWalletFeed = {
    ...UNREADABLE,
    divisions: [],
    journalDivision: MASTER_WALLET_DIVISION,
    journal: null,
  };
  // Not `gate()`: this loader also needs `canReadDivisions` from the same access.
  const resolved = await resolveCorpReadAccess(characterId);
  if (resolved === null || !resolved.can('canReadWallet')) return empty;
  const { corporationId } = resolved;
  const [wallets, divisions, journal] = await Promise.all([
    loadCorporationWallets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId, resolved.can('canReadDivisions')),
    loadCorporationWalletJournal(characterId, corporationId, MASTER_WALLET_DIVISION),
  ]);
  if (wallets.cached === null) {
    if (wallets.needsReauth) return { ...empty, needsReauth: true };
    // Balances are the data: without them a "0 ISK" would read as a broke corporation.
    throw new CorpReadFailed('wallet');
  }
  const lines: CorpJournalLine[] | null =
    journal.cached === null
      ? null
      : journal.cached.data.flatMap((entry) => {
          const atMs = parseInstant(entry.date);
          // A line with no amount moves no ISK.
          if (atMs === null || entry.amount === undefined) return [];
          return [{ atMs, amount: entry.amount, refType: entry.ref_type }];
        });
  return {
    readable: true,
    needsReauth: false,
    ...readAge([wallets, divisions, journal]),
    // Named by the divisions read when it landed; a missing name degrades one label only.
    divisions: walletDivisions(wallets.cached.data, divisions.cached?.data ?? null),
    journalDivision: MASTER_WALLET_DIVISION,
    journal: lines,
  };
}

export async function loadCorpJobs(characterId: number): Promise<CorpJobsFeed> {
  const empty: CorpJobsFeed = {
    ...UNREADABLE,
    jobs: [],
    typeNames: new Map(),
    installerNames: new Map(),
  };
  const access = await gate(characterId, 'canReadIndustry');
  if (access === null) return empty;
  const result = await loadCorporationIndustryJobs(characterId, access.corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('industry jobs');
  }
  const jobs = result.cached.data;
  const [typeNames, installerNames] = await Promise.all([
    loadTypeNames(jobTypeIds(jobs)),
    resolveNames([...new Set(jobs.map((job) => job.installer_id))]),
  ]);
  return {
    readable: true,
    needsReauth: false,
    ...readAge([result]),
    jobs,
    typeNames,
    installerNames,
  };
}

export async function loadCorpCustoms(characterId: number): Promise<CorpCustomsFeed> {
  const empty: CorpCustomsFeed = {
    ...UNREADABLE,
    offices: [],
    typeNames: new Map(),
    systemNames: new Map(),
  };
  const access = await gate(characterId, 'canReadCustomsOffices');
  if (access === null) return empty;
  const result = await loadCorporationCustomsOffices(characterId, access.corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('customs offices');
  }
  const offices = result.cached.data;
  const typeIds = [
    ...new Set(offices.flatMap((office) => (office.type_id === undefined ? [] : [office.type_id]))),
  ];
  const [typeNames, systems] = await Promise.all([
    typeIds.length === 0 ? new Map<number, string>() : loadTypeNames(typeIds),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
  ]);
  const systemNames = new Map<number, string>();
  for (const office of offices) {
    const name = systems?.get(office.system_id)?.name;
    if (name !== undefined) systemNames.set(office.system_id, name);
  }
  return {
    readable: true,
    needsReauth: false,
    ...readAge([result]),
    offices,
    typeNames,
    systemNames,
  };
}

/**
 * The page's own corp asset read (`loadCorporationAssets`, same cache row) with
 * the page's own price and copy-value inputs, reduced to the widget's counts.
 */
export async function loadCorpAssets(characterId: number): Promise<CorpAssetsFeed> {
  const empty: CorpAssetsFeed = {
    ...UNREADABLE,
    corporationId: null,
    summary: null,
    truncated: false,
  };
  // Not `gate()`: this loader also needs `canReadBlueprints` from the same access.
  const resolved = await resolveCorpReadAccess(characterId);
  if (resolved === null || !resolved.can('canReadAssets')) return empty;
  const { corporationId } = resolved;
  const result = await loadCorporationAssets(characterId, corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...empty, needsReauth: true };
    // No assets read means no counts: a zero would read as "all clear".
    throw new CorpReadFailed('assets');
  }
  const assets = result.cached.data;
  const canReadBlueprints = resolved.can('canReadBlueprints');
  const [prices, copyValues] = await Promise.all([
    // A failed price read leaves counts without values, as the page does.
    getAveragePriceByType().catch(() => new Map<number, number>()),
    loadAssetCopyValues(characterId, assets, async () =>
      canReadBlueprints
        ? ((await loadCorporationBlueprints(characterId, corporationId)).cached?.data ?? null)
        : null
    ),
  ]);
  const { items } = classifyCorpAssets(toCorpAssetInputs(assets));
  return {
    readable: true,
    needsReauth: false,
    ...readAge([result]),
    corporationId,
    summary: summariseCorpAssets(items, { prices, copyValues }),
    truncated: result.cached.truncated,
  };
}

export async function loadCorpRoleAudit(characterId: number): Promise<CorpRoleAuditFeed> {
  const empty: CorpRoleAuditFeed = { ...UNREADABLE, audit: null };
  const access = await gate(characterId, 'canReadRoleAudit');
  if (access === null) return empty;
  const result = await loadRoleAudit(characterId, access.corporationId, { withTitles: false });
  if ('needsReauth' in result) return { ...empty, needsReauth: true };
  const { data } = result;
  return {
    readable: true,
    needsReauth: false,
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    audit: data,
  };
}

export async function loadCorpMembers(characterId: number): Promise<CorpMembersFeed> {
  const loadedAt = Date.now();
  const empty: CorpMembersFeed = {
    ...UNREADABLE,
    members: [],
    diff: null,
    names: new Map(),
    darkAfterDays: useDarkThreshold.getState().value,
    loadedAt,
  };
  const access = await gate(characterId, 'canReadMembers');
  if (access === null) return empty;
  const { corporationId } = access;
  const [tracking, ids, baseline] = await Promise.all([
    loadCorporationMemberTracking(characterId, corporationId),
    loadCorporationMemberIds(characterId, corporationId),
    readPreviousRoster(characterId, corporationId),
    useDarkThreshold.getState().hydrate(),
  ]);
  if (tracking.cached === null) {
    if (tracking.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('member tracking');
  }
  const members = toMemberActivity(tracking.cached.data);
  const memberIds = ids.cached?.data ?? null;
  // Read, never recorded: `/corp/members` records it, so each change is announced there exactly once.
  const diff = memberIds === null ? null : diffRoster(baseline, memberIds);
  const darkAfterDays = useDarkThreshold.getState().value;
  const darkBefore = loadedAt - darkAfterDays * DAY_MS;
  const named = new Set<number>([...(diff?.joined ?? []), ...(diff?.left ?? [])]);
  for (const member of members) {
    const last = Math.max(member.logonMs ?? 0, member.logoffMs ?? 0);
    if (last < darkBefore) named.add(member.characterId);
  }
  return {
    readable: true,
    needsReauth: false,
    ...readAge([tracking, ids]),
    members,
    diff,
    names: named.size === 0 ? new Map() : await resolveNames([...named]),
    darkAfterDays,
    loadedAt,
  };
}

export async function loadCorpMining(characterId: number): Promise<CorpMiningFeed> {
  const empty: CorpMiningFeed = {
    ...UNREADABLE,
    rows: [],
    refineryCount: 0,
    truncated: false,
    typeNames: new Map(),
    minerNames: new Map(),
  };
  const access = await gate(characterId, 'canReadMiningLedger');
  if (access === null) return empty;
  const feed = await loadObserverFeed(characterId, access.corporationId);
  if (feed === 'needs-reauth') return { ...empty, needsReauth: true };
  if (feed === 'unavailable') throw new CorpReadFailed('mining ledger');
  // No refinery this Character can read is an answer, not an outage: an empty ledger.
  if (feed === 'no-refineries') return { ...empty, readable: true, fetchedAt: new Date() };
  const [typeNames, minerNames] = await Promise.all([
    loadTypeNames([...new Set(feed.rows.map((row) => row.typeId))]),
    resolveNames([...new Set(feed.rows.map((row) => row.characterId))]),
  ]);
  // The oldest response behind the rows; a reduce, since a big ledger is too many arguments for Math.min.
  const oldest = feed.rows.reduce((min, row) => {
    const at = Date.parse(row.cachedAt);
    return Number.isFinite(at) && at < min ? at : min;
  }, Number.POSITIVE_INFINITY);
  return {
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(Number.isFinite(oldest) ? oldest : Date.now()),
    fromCache: false,
    rows: feed.rows,
    refineryCount: feed.structureIds.length,
    truncated: feed.truncated,
    typeNames,
    minerNames,
  };
}

export async function loadCorpStarbases(characterId: number): Promise<CorpStarbasesFeed> {
  const empty: CorpStarbasesFeed = {
    ...UNREADABLE,
    starbases: [],
    typeNames: new Map(),
    systemNames: new Map(),
  };
  const access = await gate(characterId, 'canReadStarbases');
  if (access === null) return empty;
  const { corporationId } = access;
  const list = await loadCorporationStarbases(characterId, corporationId);
  if (list.cached === null) {
    if (list.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('starbases');
  }
  const towers = list.cached.data;
  // Fuel and strontium live on the per-tower call. An online tower burns fuel and a reinforced one
  // holds its strontium bay; an offline, onlining or unanchoring one has nothing worth the read.
  const readable = towers.filter(
    (tower) => tower.state === 'online' || tower.state === 'reinforced'
  );
  const [details, typeNames, systems] = await Promise.all([
    loadStarbaseDetails(characterId, corporationId, readable),
    loadTypeNames([...new Set(towers.map((tower) => tower.type_id))]),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
  ]);
  // Same static-data names as the Customs offices widget.
  const systemNames = new Map<number, string>();
  for (const tower of towers) {
    const name = systems?.get(tower.system_id)?.name;
    if (name !== undefined) systemNames.set(tower.system_id, name);
  }
  const starbases = towers.map((tower): CorpStarbaseRow => {
    const read = details.get(tower.starbase_id)?.cached;
    return {
      starbaseId: tower.starbase_id,
      systemId: tower.system_id,
      typeId: tower.type_id,
      state: tower.state ?? 'unknown',
      reinforcedUntilMs: parseInstant(tower.reinforced_until),
      unanchorsAtMs: parseInstant(tower.unanchor_at),
      bay: read ? summariseBay(read.data.fuels) : null,
      // Each bay's own read time: a detail that fell back to an old cached row must not drag the others.
      bayReadAtMs: read ? read.fetchedAt.getTime() : null,
    };
  });
  return {
    readable: true,
    needsReauth: false,
    ...readAge([list, ...details.values()]),
    starbases,
    typeNames,
    systemNames,
  };
}

export async function loadCorpContracts(characterId: number): Promise<CorpContractsFeed> {
  const empty: CorpContractsFeed = { ...UNREADABLE, contracts: [], names: new Map() };
  const access = await gate(characterId, 'canReadContracts');
  if (access === null) return empty;
  const result = await loadCorporationContracts(characterId, access.corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('contracts');
  }
  const contracts = result.cached.data;
  const open = contracts.filter((c) => c.status === 'outstanding' || c.status === 'in_progress');
  const names = await resolveNames([
    ...new Set(open.flatMap((c) => [c.issuer_id, c.assignee_id]).filter((id) => id > 0)),
  ]);
  return { readable: true, needsReauth: false, ...readAge([result]), contracts, names };
}

export async function loadCorpOrders(characterId: number): Promise<CorpOrdersFeed> {
  const empty: CorpOrdersFeed = {
    ...UNREADABLE,
    orders: [],
    typeNames: new Map(),
    stationNames: new Map(),
    stationPrices: new Map(),
    issuerNames: new Map(),
  };
  const access = await gate(characterId, 'canReadOrders');
  if (access === null) return empty;
  const result = await loadCorporationOrders(characterId, access.corporationId);
  if (result.cached === null) {
    if (result.needsReauth) return { ...empty, needsReauth: true };
    throw new CorpReadFailed('market orders');
  }
  const orders = result.cached.data;
  const typesByStation = new Map<number, Set<number>>();
  for (const order of orders) {
    const set = typesByStation.get(order.location_id) ?? new Set<number>();
    set.add(order.type_id);
    typesByStation.set(order.location_id, set);
  }
  const [typeNames, issuerNames, stationPrices, stations] = await Promise.all([
    loadTypeNames([...new Set(orders.map((o) => o.type_id))]),
    resolveNames([...new Set(orders.map((o) => o.issued_by ?? 0).filter((id) => id > 0))]),
    loadStationBestPrices(
      [...typesByStation].map(([stationId, ids]) => ({ stationId, typeIds: [...ids] }))
    ),
    // Offline first visit: the station file may be missing. Names then read as a structure.
    loadNpcStations().catch(() => []),
  ]);
  return {
    readable: true,
    needsReauth: false,
    ...readAge([result]),
    orders,
    typeNames,
    stationNames: new Map(stations.map((s) => [s.id, s.name])),
    stationPrices,
    issuerNames,
  };
}

/**
 * Not a corp-ESI read (no role, no scope): the corporation id is public, and
 * the totals are the ones the Public info Corporation tab shows, through the
 * same cached `fetchCorporationStats`, so widget and modal never disagree.
 */
export async function loadCorpKills(characterId: number): Promise<CorpKillsFeed> {
  const none: CorpKillsFeed = { ...UNREADABLE, corporationId: null, stats: null, failed: null };
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return none;
  // The modal skips the killboard for an NPC corporation, so there is nothing to show.
  if (isNpcCorporationId(corporationId)) return { ...none, corporationId };
  const { result, fetchedAt, fromCache } = await fetchCorporationStatsRead(corporationId);
  const base = { readable: true, needsReauth: false, fetchedAt, fromCache };
  if (result.kind === 'failed') {
    return { ...base, corporationId, stats: null, failed: result.reason };
  }
  return {
    ...base,
    corporationId,
    stats: result.kind === 'stats' ? result.stats : null,
    failed: null,
  };
}
