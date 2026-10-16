/**
 * Abyssal module estimates from MutaMarket — the only price an abyssal
 * (mutated) module has, since no market orders exist for one. Scope decision:
 * docs/context/decisions/20261016-085744-mutamarket-is-the-abyssal-price-source.md.
 *
 * Reaches MutaMarket only through the `mutamarketEstimate` Cloud Function
 * (`functions/src/mutamarket.ts`): MutaMarket sends no CORS headers and wants
 * a contact User-Agent, which page JS can't set. Firebase is loaded with
 * `await import(...)`, so this module is safe on the startup graph.
 *
 * Consumers: call `getAbyssalEstimate` only for an item that is abyssal
 * (`isAbyssalType`) and has an item id. It never throws and never answers 0:
 * anything but `status: 'priced'` has `value: null`, and an unpriced module
 * stays unpriced — leave it out of a total rather than counting it as 0.
 * Show `market.mutamarket.priceFrom` linked to `url` beside a priced value.
 *
 * Lookups run one at a time (MutaMarket's import is seconds per module and
 * must not be looped), concurrent asks for one item share a lookup, and every
 * answer is cached per item id: in memory and in the `esiCache` table under
 * `GLOBAL_CACHE_CHARACTER_ID`, so a reload inside the TTL does not ask again.
 * `unavailable` (no Firebase config, function not deployed, MutaMarket down)
 * is held in memory only, briefly, so a list of modules doesn't retry each.
 */
import { isSyncConfigured } from '@/app/syncStatus';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';

export const MUTAMARKET_SITE_URL = 'https://mutamarket.com';

/** A priced estimate: MutaMarket retrains per type every few days. */
export const ABYSSAL_ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
/** `no-estimate` / `unknown`: asking again sooner won't change the answer. */
export const ABYSSAL_NO_ESTIMATE_TTL_MS = 24 * 60 * 60 * 1000;
/** `unavailable`, memory only. */
export const ABYSSAL_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;

/**
 * - `priced`: `value` is MutaMarket's model estimate, ISK, > 0.
 * - `no-estimate`: MutaMarket knows the module but its model gives no value.
 * - `unknown`: MutaMarket doesn't price this type, or couldn't import the item.
 * - `unavailable`: the lookup failed; try again later.
 */
export type AbyssalEstimateStatus = 'priced' | 'no-estimate' | 'unknown' | 'unavailable';

export interface AbyssalEstimate {
  /** ISK; null unless `status` is `priced`. Never 0. */
  value: number | null;
  status: AbyssalEstimateStatus;
  source: 'mutamarket';
  /** Epoch ms this answer was fetched (or, for `unavailable`, tried). */
  fetchedAt: number;
  /** When MutaMarket last ran its model for the module, as MutaMarket sends it. */
  valueUpdatedAt: string | null;
  /** The module's MutaMarket page when known, else MutaMarket's home page. */
  url: string;
}

/** The callable's answer — mirrors `MutamarketEstimate` in functions/src/mutamarket.ts. */
export type MutamarketEstimateResponse =
  | { status: 'priced'; value: number; valueUpdatedAt: string | null; url: string | null }
  | { status: 'no-estimate'; url: string | null }
  | { status: 'unknown' };

export type MutamarketTransport = (input: {
  typeId: number;
  itemId: number;
}) => Promise<MutamarketEstimateResponse>;

/** The stored part of an estimate; `fetchedAt` is the cache row's own. */
type StoredEstimate = Pick<AbyssalEstimate, 'value' | 'status' | 'valueUpdatedAt' | 'url'>;

/** Callable timeout: an import behind a short queue can take most of a minute. */
const CALL_TIMEOUT_MS = 120_000;

async function callableTransport(input: {
  typeId: number;
  itemId: number;
}): Promise<MutamarketEstimateResponse> {
  if (!isSyncConfigured()) throw new Error('Firebase is not configured');
  const [{ httpsCallable }, { getSyncFunctions }] = await Promise.all([
    import('firebase/functions'),
    import('@/sync/firebaseApp'),
  ]);
  const call = httpsCallable<typeof input, MutamarketEstimateResponse>(
    getSyncFunctions(),
    'mutamarketEstimate',
    { timeout: CALL_TIMEOUT_MS }
  );
  return (await call(input)).data;
}

let transport: MutamarketTransport = callableTransport;
let now: () => number = () => Date.now();

/** Test seam: swap the callable (and clock) out. `null` restores the defaults. */
export function configureMutamarket(
  options: { transport?: MutamarketTransport; clock?: () => number } | null
): void {
  transport = options?.transport ?? callableTransport;
  now = options?.clock ?? (() => Date.now());
}

const memory = new Map<number, { estimate: AbyssalEstimate; expiresAt: number }>();
const inFlight = new Map<number, Promise<AbyssalEstimate>>();
/** Serializes calls to the function: one lookup at a time. */
let queueTail: Promise<unknown> = Promise.resolve();

export function abyssalEstimateCacheKey(itemId: number): string {
  return `mutamarket:${itemId}`;
}

function safeUrl(url: unknown): string {
  return typeof url === 'string' && url.startsWith(`${MUTAMARKET_SITE_URL}/`)
    ? url
    : MUTAMARKET_SITE_URL;
}

/** The function's answer, re-checked: a malformed or non-positive value is no estimate. */
export function toStoredEstimate(response: unknown): StoredEstimate {
  const r = (typeof response === 'object' && response !== null ? response : {}) as Record<
    string,
    unknown
  >;
  const url = safeUrl(r.url);
  if (r.status === 'priced' && typeof r.value === 'number' && Number.isFinite(r.value)) {
    if (r.value > 0) {
      return {
        status: 'priced',
        value: r.value,
        valueUpdatedAt: typeof r.valueUpdatedAt === 'string' ? r.valueUpdatedAt : null,
        url,
      };
    }
  }
  if (r.status === 'priced' || r.status === 'no-estimate') {
    return { status: 'no-estimate', value: null, valueUpdatedAt: null, url };
  }
  return { status: 'unknown', value: null, valueUpdatedAt: null, url };
}

function ttlFor(status: AbyssalEstimateStatus): number {
  if (status === 'priced') return ABYSSAL_ESTIMATE_TTL_MS;
  if (status === 'unavailable') return ABYSSAL_UNAVAILABLE_RETRY_MS;
  return ABYSSAL_NO_ESTIMATE_TTL_MS;
}

function remember(itemId: number, estimate: AbyssalEstimate): AbyssalEstimate {
  memory.set(itemId, { estimate, expiresAt: estimate.fetchedAt + ttlFor(estimate.status) });
  return estimate;
}

async function readPersisted(itemId: number): Promise<AbyssalEstimate | null> {
  try {
    const rows = await readCachedEntries<StoredEstimate>(GLOBAL_CACHE_CHARACTER_ID, [
      abyssalEstimateCacheKey(itemId),
    ]);
    const row = rows.get(abyssalEstimateCacheKey(itemId));
    if (!row || row.value.status === 'unavailable') return null;
    const stored = toStoredEstimate(row.value);
    if (row.fetchedAt + ttlFor(stored.status) <= now()) return null;
    return { ...stored, source: 'mutamarket', fetchedAt: row.fetchedAt };
  } catch {
    return null;
  }
}

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const turn = queueTail.then(run);
  queueTail = turn.catch(() => undefined);
  return turn;
}

async function lookup(typeId: number, itemId: number): Promise<AbyssalEstimate> {
  const persisted = await readPersisted(itemId);
  if (persisted) return remember(itemId, persisted);

  let stored: StoredEstimate;
  try {
    stored = toStoredEstimate(await enqueue(() => transport({ typeId, itemId })));
  } catch {
    return remember(itemId, {
      status: 'unavailable',
      value: null,
      valueUpdatedAt: null,
      url: MUTAMARKET_SITE_URL,
      source: 'mutamarket',
      fetchedAt: now(),
    });
  }
  const fetchedAt = now();
  void writeCachedMany(
    GLOBAL_CACHE_CHARACTER_ID,
    [[abyssalEstimateCacheKey(itemId), stored]],
    fetchedAt
  ).catch(() => {});
  return remember(itemId, { ...stored, source: 'mutamarket', fetchedAt });
}

/**
 * MutaMarket's estimate for one abyssal module, by its type id and item id.
 * Never throws; `value` is null for anything but `status: 'priced'`.
 */
export function getAbyssalEstimate(typeId: number, itemId: number): Promise<AbyssalEstimate> {
  const valid =
    Number.isSafeInteger(typeId) && typeId > 0 && Number.isSafeInteger(itemId) && itemId > 0;
  if (!valid) {
    return Promise.resolve({
      status: 'unknown',
      value: null,
      valueUpdatedAt: null,
      url: MUTAMARKET_SITE_URL,
      source: 'mutamarket',
      fetchedAt: now(),
    });
  }
  const cached = memory.get(itemId);
  if (cached && cached.expiresAt > now()) return Promise.resolve(cached.estimate);
  const running = inFlight.get(itemId);
  if (running) return running;
  const run = lookup(typeId, itemId).finally(() => inFlight.delete(itemId));
  inFlight.set(itemId, run);
  return run;
}

/** Test-only: production relies on TTL expiry. Leaves persisted rows alone. */
export function clearAbyssalEstimateMemory(): void {
  memory.clear();
  inFlight.clear();
  queueTail = Promise.resolve();
}
