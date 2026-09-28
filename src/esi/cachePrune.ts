/**
 * Age-based pruning of per-id `esiCache` rows.
 *
 * Most keys are one row per Character (`skills`, `assets`, `mail:headers`) —
 * bounded, refreshed on every visit, and the user's main data. Those are never
 * touched here. A family of keys is instead one row *per id the app ever
 * looked up*: every name, type, structure, public profile, mail body, market
 * price, market history series. Nothing ever deleted those, so the table grew
 * for the life of the install — storage-quota pressure, and eviction under
 * pressure would take the refresh tokens in the same database with it.
 *
 * The rule: an allowlisted per-id row whose `fetchedAt` is older than a
 * generous multiple of its staleness window is dropped. Any reader of these
 * keys refetches on a miss, so a pruned row costs at most one lookup if it is
 * ever wanted again. Scope decision:
 * docs/context/decisions/20260928-182530-esicache-retention-age-prune-per-id-rows.md.
 *
 * Cost shape: ages come from `esiCacheMeta` (value-free, see
 * `@/db/esiCacheMeta`), scanned in primary-key pages — a cached value is
 * never deserialized to learn its age. Deletes go in small chunks, each in
 * its own short transaction that re-checks the row's meta first, so a row
 * refreshed between the scan and the delete survives. The DBCore middleware
 * mirrors every delete onto meta.
 */
import { db, type EsiCacheMetaRecord } from '@/db';

const DAY_MS = 24 * 60 * 60_000;

/** Rows `STALE_AFTER.static` (24 h) would already refetch: 30x that. */
export const STATIC_RETENTION_MS = 30 * DAY_MS;
/** Market rows, stale after 5-15 minutes: a week is still generous. */
export const MARKET_RETENTION_MS = 7 * DAY_MS;
/** A run at most this often. */
export const PRUNE_MIN_INTERVAL_MS = DAY_MS;

/** When the last run started. Device-local — not a `sync.` key. */
export const PRUNE_LAST_RUN_KEY = 'esiCache.pruneLastRun';
/**
 * When this device first ran the prune, written once. Rows lacking meta were
 * written before `esiCacheMeta` existed, so before this — once it is older
 * than a rule's window, a meta-less row under that rule is too.
 */
export const PRUNE_FIRST_RUN_KEY = 'esiCache.pruneFirstRun';

interface Reference {
  /** The same Character's list row that can still point at this id. */
  listKey: string;
  /** The id field on that list's entries. */
  idField: string;
}

export interface PruneRule {
  /** Anchored; group 1 is the id when `referencedBy` is set. */
  pattern: RegExp;
  maxAgeMs: number;
  /** Rows still reachable from a cached list are kept regardless of age. */
  referencedBy?: readonly Reference[];
}

/**
 * The allowlist. A key matching nothing here is never pruned. Deliberately
 * absent: every single-row-per-Character key, anything under `corp:` (its own
 * purge path), and PI's `planet:`/`planet-info:`/`schematic:` — the
 * alt-colony view reads those cache-only, and they are bounded by colonies.
 */
export const PRUNE_RULES: readonly PruneRule[] = [
  ...[
    'name',
    'type',
    'group',
    'affiliation',
    'public-character',
    'public-corporation',
    'public-alliance',
    'public-employment',
    'station',
    'system',
    'universeType',
    'type-volume',
    'corp-name',
    'loyalty-store-offers',
    'bpc-region',
    'bpc-blueprint-location:v2',
    'contract-location',
    'public-contract-items',
  ].map((prefix) => ({ pattern: new RegExp(`^${prefix}:\\d+$`), maxAgeMs: STATIC_RETENTION_MS })),
  {
    pattern: /^structure:\d+(?::forbidden|:roster-forbidden)?$/,
    maxAgeMs: STATIC_RETENTION_MS,
  },
  { pattern: /^route:\d+:\d+:[a-z]+$/, maxAgeMs: STATIC_RETENTION_MS },
  {
    pattern: /^mail:(\d+)$/,
    maxAgeMs: STATIC_RETENTION_MS,
    referencedBy: [{ listKey: 'mail:headers', idField: 'mail_id' }],
  },
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
  /** Found by key alone (no meta at scan time). */
  metaless: boolean;
}

export interface PruneOptions {
  now: number;
  /** When set, meta-less rows are eligible under rules this is older than. */
  firstRunAt?: number;
  chunkSize?: number;
  scanPageSize?: number;
  /** Awaited before each delete chunk: the yield point (and a test seam). */
  beforeChunk?: () => Promise<unknown>;
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

/** Key-only: `primaryKeys()` walks a key cursor, never a value. */
async function scanMetaless(
  now: number,
  firstRunAt: number,
  seen: Set<string>,
  candidates: Candidate[]
): Promise<void> {
  const age = now - firstRunAt;
  if (!PRUNE_RULES.some((rule) => age > rule.maxAgeMs)) return;
  const ids = (await db.esiCache.toCollection().primaryKeys()) as CacheKey[];
  for (const id of ids) {
    if (seen.has(tupleId(id))) continue;
    const rule = pruneRuleFor(id[1]);
    if (rule && age > rule.maxAgeMs) candidates.push({ id, rule, metaless: true });
  }
}

/**
 * Drops candidates a same-Character list still points at. Reads those list
 * rows' values — bounded (a header page, a contract list), and only for a
 * Character that has a referenced candidate at all.
 */
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

/**
 * One chunk, in one short transaction: re-read the chunk's meta and delete
 * only rows still past their window (or still meta-less). A row refreshed
 * since the scan has fresh meta by now and is left alone. Dexie calls only
 * inside — a native-promise hop could let the transaction auto-commit.
 */
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

/** One prune pass. Returns how many rows it deleted. */
export async function pruneEsiCache(options: PruneOptions): Promise<number> {
  const { now, firstRunAt, chunkSize = 200, scanPageSize = 500 } = options;
  const beforeChunk = options.beforeChunk ?? yieldToMainThread;

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  await scanMeta(now, scanPageSize, candidates, seen);
  if (firstRunAt !== undefined) await scanMetaless(now, firstRunAt, seen, candidates);

  const doomed = await withoutReferenced(candidates);
  let deleted = 0;
  for (let i = 0; i < doomed.length; i += chunkSize) {
    await beforeChunk();
    deleted += await deleteChunk(doomed.slice(i, i + chunkSize), now);
  }
  return deleted;
}

/**
 * Claims today's run: read-compare-write in one transaction, so two tabs
 * booting together cannot both run. Stamped at the start, so a run that
 * throws does not retry on every boot. Resolves to the first-run stamp, or
 * `null` when a run already happened inside the interval.
 */
function claimRun(now: number): Promise<number | null> {
  return db.transaction('rw', db.settings, async () => {
    const last = (await db.settings.get(PRUNE_LAST_RUN_KEY))?.value;
    if (typeof last === 'number' && now - last < PRUNE_MIN_INTERVAL_MS) return null;
    await db.settings.put({ key: PRUNE_LAST_RUN_KEY, value: now });
    const first = (await db.settings.get(PRUNE_FIRST_RUN_KEY))?.value;
    if (typeof first === 'number') return first;
    await db.settings.put({ key: PRUNE_FIRST_RUN_KEY, value: now });
    return now;
  });
}

/**
 * The scheduled entry point: at most once per `PRUNE_MIN_INTERVAL_MS`, and
 * never offline — a row pruned there could not be refetched. Resolves to the
 * number of rows deleted, or `null` when it did not run.
 */
export async function runDailyEsiCachePrune(): Promise<number | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const now = Date.now();
  const firstRunAt = await claimRun(now);
  if (firstRunAt === null) return null;
  return pruneEsiCache({ now, firstRunAt });
}
