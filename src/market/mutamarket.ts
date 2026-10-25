/**
 * Abyssal module estimates from MutaMarket — the only price an abyssal
 * (mutated) module has, since no market orders exist for one. Scope decision:
 * docs/context/decisions/20261016-085744-mutamarket-is-the-abyssal-price-source.md.
 *
 * Reaches MutaMarket only via the `mutamarketEstimate` function
 * (`functions/src/mutamarket.ts` says why). Firebase loads with
 * `await import(...)`, so this module is safe on the startup graph.
 *
 * Consumers: call `getAbyssalEstimate` only for an abyssal (mutated) module
 * with an item id. It never throws and never answers 0: anything but
 * `status: 'priced'` has `value: null`, and an unpriced module stays unpriced —
 * leave it out of a total rather than counting it as 0. Show
 * `market.mutamarket.priceFrom` linked to `url` beside a priced value.
 * `importIfMissing` publishes the module on MutaMarket: pass it only on the
 * pilot's explicit ask, never while merely listing assets.
 *
 * Imports run one at a time, lookups a few at once; concurrent asks for one
 * item (same `importIfMissing`) share one. Every answer is cached per item id:
 * in memory and in the `esiCache` table under
 * `GLOBAL_CACHE_CHARACTER_ID`, so a reload inside the TTL does not ask again.
 * `unavailable` (no Firebase config, function not deployed, MutaMarket down)
 * is held in memory only, briefly, so a list of modules doesn't retry each.
 */
import { isSyncConfigured } from '@/app/syncStatus';
import { createSemaphore } from '@/lib/concurrency';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';

export const MUTAMARKET_SITE_URL = 'https://mutamarket.com';

/** A priced estimate: MutaMarket retrains per type every few days. */
export const ABYSSAL_ESTIMATE_TTL_MS = 6 * 60 * 60 * 1000;
/** `no-estimate` / `unknown`: asking again sooner won't change the answer. */
export const ABYSSAL_NO_ESTIMATE_TTL_MS = 24 * 60 * 60 * 1000;
/** `not-imported`: someone may import it meanwhile. */
export const ABYSSAL_NOT_IMPORTED_TTL_MS = 60 * 60 * 1000;
/** `unavailable`, memory only. */
export const ABYSSAL_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;

/**
 * - `priced`: `value` is MutaMarket's model estimate, ISK, > 0.
 * - `no-estimate`: MutaMarket knows the module (or its type) but has no value.
 * - `not-imported`: MutaMarket hasn't seen the module; `importIfMissing` imports it.
 * - `unknown`: MutaMarket doesn't price this type, or couldn't import the item.
 * - `unavailable`: the lookup failed; try again later.
 */
export type AbyssalEstimateStatus =
  'priced' | 'no-estimate' | 'not-imported' | 'unknown' | 'unavailable';

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
  | { status: 'not-imported' }
  | { status: 'unknown' };

export interface MutamarketRequest {
  /** Signs in to Firebase as this Character if no session exists. */
  characterId: number;
  typeId: number;
  itemId: number;
  importIfMissing: boolean;
}

export type MutamarketTransport = (
  request: MutamarketRequest
) => Promise<MutamarketEstimateResponse>;

/** The stored part of an estimate; `fetchedAt` is the cache row's own. */
type StoredEstimate = Pick<AbyssalEstimate, 'value' | 'status' | 'valueUpdatedAt' | 'url'>;

/** Callable timeout: an import behind a short queue can take most of a minute. */
const CALL_TIMEOUT_MS = 120_000;

async function callableTransport({
  characterId,
  ...input
}: MutamarketRequest): Promise<MutamarketEstimateResponse> {
  if (!isSyncConfigured()) throw new Error('Firebase is not configured');
  const [{ httpsCallable }, { getSyncFunctions }, { ensureAnySession }] = await Promise.all([
    import('firebase/functions'),
    import('@/sync/firebaseApp'),
    import('@/sync/syncAuth'),
  ]);
  await ensureAnySession(characterId);
  const call = httpsCallable<typeof input, MutamarketEstimateResponse>(
    getSyncFunctions(characterId),
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
const inFlight = new Map<string, Promise<AbyssalEstimate>>();
const LOOKUP_CONCURRENCY = 4;
let lookupSlots = createSemaphore(LOOKUP_CONCURRENCY);
let importSlots = createSemaphore(1);

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
  if (
    r.status === 'priced' &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    r.value > 0
  ) {
    return {
      status: 'priced',
      value: r.value,
      valueUpdatedAt: typeof r.valueUpdatedAt === 'string' ? r.valueUpdatedAt : null,
      url,
    };
  }
  if (r.status === 'priced' || r.status === 'no-estimate') {
    return { status: 'no-estimate', value: null, valueUpdatedAt: null, url };
  }
  const status = r.status === 'not-imported' ? 'not-imported' : 'unknown';
  return { status, value: null, valueUpdatedAt: null, url };
}

function ttlFor(status: AbyssalEstimateStatus): number {
  if (status === 'priced') return ABYSSAL_ESTIMATE_TTL_MS;
  if (status === 'unavailable') return ABYSSAL_UNAVAILABLE_RETRY_MS;
  if (status === 'not-imported') return ABYSSAL_NOT_IMPORTED_TTL_MS;
  return ABYSSAL_NO_ESTIMATE_TTL_MS;
}

function unpriced(status: 'unknown' | 'unavailable'): AbyssalEstimate {
  return {
    status,
    value: null,
    valueUpdatedAt: null,
    url: MUTAMARKET_SITE_URL,
    source: 'mutamarket',
    fetchedAt: now(),
  };
}

/** A cached `not-imported` or `unavailable` doesn't answer the pilot's import click. */
function answers(estimate: AbyssalEstimate, importIfMissing: boolean): boolean {
  return !(
    importIfMissing &&
    (estimate.status === 'not-imported' || estimate.status === 'unavailable')
  );
}

type EstimateListener = (itemId: number, estimate: AbyssalEstimate) => void;
const listeners = new Set<EstimateListener>();

/**
 * Hear every answer as it lands, whoever asked — so a list (Assets) picks up
 * an estimate the pilot asked for elsewhere (Item Detail's import). Returns
 * the unsubscribe.
 */
export function onAbyssalEstimate(listener: EstimateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remember(itemId: number, estimate: AbyssalEstimate): AbyssalEstimate {
  memory.set(itemId, { estimate, expiresAt: estimate.fetchedAt + ttlFor(estimate.status) });
  for (const listener of listeners) listener(itemId, estimate);
  return estimate;
}

async function readPersisted(itemId: number): Promise<AbyssalEstimate | null> {
  try {
    const key = abyssalEstimateCacheKey(itemId);
    const row = (await readCachedEntries<StoredEstimate>(GLOBAL_CACHE_CHARACTER_ID, [key])).get(
      key
    );
    if (!row) return null;
    const stored = toStoredEstimate(row.value);
    if (row.fetchedAt + ttlFor(stored.status) <= now()) return null;
    return { ...stored, source: 'mutamarket', fetchedAt: row.fetchedAt };
  } catch {
    return null;
  }
}

async function throttled<T>(importIfMissing: boolean, run: () => Promise<T>): Promise<T> {
  const release = await (importIfMissing ? importSlots : lookupSlots).acquire();
  try {
    return await run();
  } finally {
    release();
  }
}

async function lookup(request: MutamarketRequest): Promise<AbyssalEstimate> {
  const { itemId, importIfMissing } = request;
  const persisted = await readPersisted(itemId);
  if (persisted && answers(persisted, importIfMissing)) return remember(itemId, persisted);

  let stored: StoredEstimate;
  try {
    stored = toStoredEstimate(await throttled(importIfMissing, () => transport(request)));
  } catch {
    return remember(itemId, unpriced('unavailable'));
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
export function getAbyssalEstimate(
  typeId: number,
  itemId: number,
  options: { characterId: number; importIfMissing?: boolean }
): Promise<AbyssalEstimate> {
  const valid =
    Number.isSafeInteger(typeId) && typeId > 0 && Number.isSafeInteger(itemId) && itemId > 0;
  if (!valid) return Promise.resolve(unpriced('unknown'));
  const importIfMissing = options.importIfMissing === true;
  const cached = memory.get(itemId);
  if (cached && cached.expiresAt <= now()) memory.delete(itemId);
  else if (cached && answers(cached.estimate, importIfMissing)) {
    return Promise.resolve(cached.estimate);
  }
  const flightKey = `${itemId}:${importIfMissing}`;
  const running = inFlight.get(flightKey);
  if (running) return running;
  const run = lookup({ characterId: options.characterId, typeId, itemId, importIfMissing }).finally(
    () => inFlight.delete(flightKey)
  );
  inFlight.set(flightKey, run);
  return run;
}

/**
 * Answers already held (memory, then the persisted cache); never calls
 * MutaMarket, never returns `unavailable`. `includeExpired`: past-TTL rows too,
 * so a total doesn't swing with whether the pilot looked recently.
 */
export async function readCachedAbyssalEstimates(
  itemIds: readonly number[],
  options: { includeExpired?: boolean } = {}
): Promise<Map<number, AbyssalEstimate>> {
  const found = new Map<number, AbyssalEstimate>();
  const missing: number[] = [];
  for (const itemId of new Set(itemIds)) {
    const held = memory.get(itemId);
    if (held && held.expiresAt > now() && held.estimate.status !== 'unavailable') {
      found.set(itemId, held.estimate);
    } else missing.push(itemId);
  }
  if (missing.length === 0) return found;
  try {
    const rows = await readCachedEntries<StoredEstimate>(
      GLOBAL_CACHE_CHARACTER_ID,
      missing.map(abyssalEstimateCacheKey)
    );
    for (const itemId of missing) {
      const row = rows.get(abyssalEstimateCacheKey(itemId));
      if (!row) continue;
      const stored = toStoredEstimate(row.value);
      if (!options.includeExpired && row.fetchedAt + ttlFor(stored.status) <= now()) continue;
      found.set(itemId, { ...stored, source: 'mutamarket', fetchedAt: row.fetchedAt });
    }
  } catch {
    // A cache that can't be read holds nothing.
  }
  return found;
}

/** Test-only: production relies on TTL expiry. Leaves persisted rows alone. */
export function clearAbyssalEstimateMemory(): void {
  memory.clear();
  inFlight.clear();
  lookupSlots = createSemaphore(LOOKUP_CONCURRENCY);
  importSlots = createSemaphore(1);
}
