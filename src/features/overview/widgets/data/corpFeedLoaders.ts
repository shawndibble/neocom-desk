/**
 * The Corp overview's reads, loaded behind `import()` from `corpFeeds.ts`.
 *
 * **Gated before they fetch** (`features/corp/corpReadAccess.ts`): no corp call
 * at all unless the roles and grant cover it. CCP role-gates these endpoints
 * server-side, so an ungated read buys a guaranteed 403. Each goes through the
 * corp loaders `/corp` and its sub-pages already use, so the cache rows, the
 * corp-scoped keys and the 403 handling are theirs, not a second copy.
 */
import { diffRoster } from '@/engine/corp/members';
import { resolveNames } from '@/features/character/names';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCorporationId, MASTER_WALLET_DIVISION } from '@/features/corp/boardData';
import { jobTypeIds } from '@/features/corp/boardSources';
import { CorpReadFailed } from '@/features/corp/corpRead';
import { resolveCorpReadAccess, type CorpCapability } from '@/features/corp/corpReadAccess';
import { useDarkThreshold } from '@/features/corp/darkThreshold';
import { walletDivisions } from '@/features/corp/divisions';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import {
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  toMemberActivity,
} from '@/features/corp/members';
import { readPreviousRoster } from '@/features/corp/rosterState';
import { loadObserverFeed } from '@/features/corp/taxBook/esiFeed';
import {
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from '@/features/corp/wallet';
import { isNpcCorporationId } from '@/esi/entityIds';
import { DAY_MS } from '@/lib/age';
import { fetchCorporationStats } from '@/lib/zkillboard';
import { parseInstant } from '@/engine/esiInstant';
import type { CachedResult, StatusResult } from '@/esi/cache';
import type {
  CorpJobsFeed,
  CorpJournalLine,
  CorpKillsFeed,
  CorpMembersFeed,
  CorpMiningFeed,
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
  const access = await gate(characterId, 'canReadWallet');
  if (access === null) return empty;
  const { corporationId } = access;
  const [wallets, divisions, journal] = await Promise.all([
    loadCorporationWallets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
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
  const result = await fetchCorporationStats(corporationId);
  const base = { readable: true, needsReauth: false, fetchedAt: new Date(), fromCache: false };
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
