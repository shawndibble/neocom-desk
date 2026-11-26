import { captureException } from '@sentry/react';
import { db, type EsiCacheMetaRecord } from '@/db';
import { DAY_MS } from '@/lib/age';

export const STATIC_RETENTION_MS = 30 * DAY_MS;
export const AVOID_ROUTE_RETENTION_MS = 2 * DAY_MS;
export const MAIL_BODY_RETENTION_MS = 7 * DAY_MS;
export const MAIL_DRAFT_RETENTION_MS = 30 * DAY_MS;
export const MARKET_RETENTION_MS = 7 * DAY_MS;
export const PILOT_KILLS_RETENTION_MS = 7 * DAY_MS;
export const SHARE_COPY_RETENTION_MS = 8 * DAY_MS;
export const PRUNE_MIN_INTERVAL_MS = DAY_MS;

export const PRUNE_LAST_RUN_KEY = 'esiCache.pruneLastRun';
export const PRUNE_FIRST_RUN_KEY = 'esiCache.pruneFirstRun';
export const PRUNE_LEGACY_CLEARED_KEY = 'esiCache.pruneLegacyCleared';

interface Reference {
  listKey: string;
  idField: string;
}

export interface PruneRule {
  pattern: RegExp;
  maxAgeMs: number;
  referencedBy?: readonly Reference[];
}

export const PRUNE_RULES: readonly PruneRule[] = [
  ...[
    'name',
    'type',
    'group',
    'affiliation',
    'public-character',
    'public-corporation',
    'public-alliance',
    'public-alliance-history',
    'public-alliance-corporations',
    'public-employment',
    'station',
    'moon',
    'universeType',
    'type-volume',
    'corp-name',
    'loyalty-store-offers',
    'bpc-region',
    'bpc-blueprint-location:v2',
    'contract-location',
    'public-contract-items',
  ].map((prefix) => ({ pattern: new RegExp(`^${prefix}:\\d+$`), maxAgeMs: STATIC_RETENTION_MS })),
  { pattern: /^structure:\d+:(?:forbidden|roster-forbidden)$/, maxAgeMs: STATIC_RETENTION_MS },
  {
    pattern: /^route:\d+:\d+:[a-z-]+(?::p\d+)?:a\d+:[0-9a-z]+$/,
    maxAgeMs: AVOID_ROUTE_RETENTION_MS,
  },
  { pattern: /^route:\d+:\d+:[a-z-]+(?::p\d+)?$/, maxAgeMs: STATIC_RETENTION_MS },
  { pattern: /^mail:(\d+)$/, maxAgeMs: MAIL_BODY_RETENTION_MS },
  {
    pattern: /^calendar:(\d+)$/,
    maxAgeMs: STATIC_RETENTION_MS,
    referencedBy: [
      { listKey: 'calendar', idField: 'event_id' },
      { listKey: 'calendar:seen', idField: 'event_id' },
    ],
  },
  {
    pattern: /^contract-items:(\d+)$/,
    maxAgeMs: STATIC_RETENTION_MS,
    referencedBy: [{ listKey: 'contracts', idField: 'contract_id' }],
  },
  { pattern: /^share:/, maxAgeMs: SHARE_COPY_RETENTION_MS },
  { pattern: /^pilot-kills:\d+$/, maxAgeMs: PILOT_KILLS_RETENTION_MS },
  { pattern: /^pilot-id:.+$/, maxAgeMs: STATIC_RETENTION_MS },
  { pattern: /^marketPrice:/, maxAgeMs: MARKET_RETENTION_MS },
  { pattern: /^market-history:\d+:\d+$/, maxAgeMs: MARKET_RETENTION_MS },
  { pattern: /^structure-market:\d+$/, maxAgeMs: MARKET_RETENTION_MS },
  { pattern: /^marketHistory:/, maxAgeMs: MARKET_RETENTION_MS },
];

export function pruneRuleFor(key: string): PruneRule | undefined {
  return PRUNE_RULES.find((rule) => rule.pattern.test(key));
}

type CacheKey = [characterId: number, key: string];

interface Candidate {
  id: CacheKey;
  rule: PruneRule;
  metaless: boolean;
}

export interface PruneOptions {
  now: number;
  firstRunAt?: number;
  chunkSize?: number;
  scanPageSize?: number;
  beforeChunk?: () => Promise<unknown>;
  onNoLegacyRows?: () => Promise<unknown>;
}

const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const tupleId = ([characterId, key]: CacheKey) => `${characterId}\u0000${key}`;

async function scanMeta(
  now: number,
  pageSize: number,
  candidates: Candidate[],
  seen: Set<string>
): Promise<void> {
  let last: CacheKey | undefined;
  for (;;) {
    const page: EsiCacheMetaRecord[] = await (
      last === undefined ? db.esiCacheMeta.orderBy(':id') : db.esiCacheMeta.where(':id').above(last)
    )
      .limit(pageSize)
      .toArray();
    for (const meta of page) {
      const id: CacheKey = [meta.characterId, meta.key];
      seen.add(tupleId(id));
      const rule = pruneRuleFor(meta.key);
      if (rule && now - meta.fetchedAt > rule.maxAgeMs) {
        candidates.push({ id, rule, metaless: false });
      }
    }
    if (page.length < pageSize) return;
    const tail = page[page.length - 1];
    last = [tail.characterId, tail.key];
    await yieldToMainThread();
  }
}

async function scanMetaless(
  now: number,
  firstRunAt: number,
  pageSize: number,
  seen: Set<string>,
  candidates: Candidate[]
): Promise<number | null> {
  const age = now - firstRunAt;
  if (!PRUNE_RULES.some((rule) => age > rule.maxAgeMs)) return null;
  let found = 0;
  let last: CacheKey | undefined;
  for (;;) {
    const page = (await (
      last === undefined ? db.esiCache.orderBy(':id') : db.esiCache.where(':id').above(last)
    )
      .limit(pageSize)
      .primaryKeys()) as CacheKey[];
    for (const id of page) {
      if (seen.has(tupleId(id))) continue;
      const rule = pruneRuleFor(id[1]);
      if (!rule) continue;
      found += 1;
      if (age > rule.maxAgeMs) candidates.push({ id, rule, metaless: true });
    }
    if (page.length < pageSize) return found;
    last = page[page.length - 1];
    await yieldToMainThread();
  }
}

async function withoutReferenced(candidates: Candidate[]): Promise<Candidate[]> {
  const lists = new Map<string, Promise<Set<string>>>();
  const referencedIds = (characterId: number, ref: Reference) => {
    const mapKey = tupleId([characterId, ref.listKey]);
    let ids = lists.get(mapKey);
    if (!ids) {
      ids = db.esiCache.get([characterId, ref.listKey]).then((row) => {
        const value: unknown = row?.value;
        const out = new Set<string>();
        if (Array.isArray(value)) {
          for (const entry of value) {
            const id = (entry as Record<string, unknown> | null)?.[ref.idField];
            if (id !== undefined && id !== null) out.add(String(id));
          }
        }
        return out;
      });
      lists.set(mapKey, ids);
    }
    return ids;
  };

  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const refs = candidate.rule.referencedBy;
    if (!refs) {
      kept.push(candidate);
      continue;
    }
    const [characterId, key] = candidate.id;
    const id = candidate.rule.pattern.exec(key)?.[1];
    let referenced = false;
    for (const ref of refs) {
      if (id !== undefined && (await referencedIds(characterId, ref)).has(id)) referenced = true;
    }
    if (!referenced) kept.push(candidate);
  }
  return kept;
}

function deleteChunk(chunk: readonly Candidate[], now: number): Promise<number> {
  return db.transaction('rw', db.esiCache, db.esiCacheMeta, async () => {
    const metas = await db.esiCacheMeta.bulkGet(chunk.map((candidate) => candidate.id));
    const doomed = chunk
      .filter((candidate, i) => {
        const meta = metas[i];
        if (!meta) return candidate.metaless;
        return now - meta.fetchedAt > candidate.rule.maxAgeMs;
      })
      .map((candidate) => candidate.id);
    if (doomed.length > 0) await db.esiCache.bulkDelete(doomed);
    return doomed.length;
  });
}

export function pruneStaleMailDrafts(now: number): Promise<number> {
  return db.mailDrafts.filter((draft) => now - draft.updatedAt > MAIL_DRAFT_RETENTION_MS).delete();
}

export async function pruneEsiCache(options: PruneOptions): Promise<number> {
  const { now, firstRunAt, chunkSize = 200, scanPageSize = 500 } = options;
  const beforeChunk = options.beforeChunk ?? yieldToMainThread;

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  await scanMeta(now, scanPageSize, candidates, seen);
  if (firstRunAt !== undefined) {
    const legacy = await scanMetaless(now, firstRunAt, scanPageSize, seen, candidates);
    if (legacy === 0) await options.onNoLegacyRows?.();
  }

  const doomed = await withoutReferenced(candidates);
  let deleted = 0;
  for (let i = 0; i < doomed.length; i += chunkSize) {
    await beforeChunk();
    deleted += await deleteChunk(doomed.slice(i, i + chunkSize), now);
  }
  return deleted;
}

function claimRun(now: number): Promise<{ firstRunAt: number | undefined } | null> {
  return db.transaction('rw', db.settings, async () => {
    const last = (await db.settings.get(PRUNE_LAST_RUN_KEY))?.value;
    if (typeof last === 'number' && now - last < PRUNE_MIN_INTERVAL_MS) return null;
    await db.settings.put({ key: PRUNE_LAST_RUN_KEY, value: now });
    if ((await db.settings.get(PRUNE_LEGACY_CLEARED_KEY))?.value === true) {
      return { firstRunAt: undefined };
    }
    const first = (await db.settings.get(PRUNE_FIRST_RUN_KEY))?.value;
    if (typeof first === 'number') return { firstRunAt: first };
    await db.settings.put({ key: PRUNE_FIRST_RUN_KEY, value: now });
    return { firstRunAt: now };
  });
}

export async function runDailyEsiCachePrune(): Promise<number | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const now = Date.now();
  const claim = await claimRun(now);
  if (claim === null) return null;
  await pruneStaleMailDrafts(now).catch((error: unknown) => {
    captureException(error);
    return 0;
  });
  return pruneEsiCache({
    now,
    firstRunAt: claim.firstRunAt,
    onNoLegacyRows: () => db.settings.put({ key: PRUNE_LEGACY_CLEARED_KEY, value: true }),
  });
}
