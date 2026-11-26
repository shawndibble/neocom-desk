import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { isSyncConfigured } from '@/app/syncStatus';
import { createSemaphore } from '@/lib/concurrency';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';

export const MUTAMARKET_SITE_URL = 'https://mutamarket.com';

export const ABYSSAL_ESTIMATE_TTL_MS = 6 * HOUR_MS;
export const ABYSSAL_NO_ESTIMATE_TTL_MS = DAY_MS;
export const ABYSSAL_NOT_IMPORTED_TTL_MS = HOUR_MS;
export const ABYSSAL_UNAVAILABLE_RETRY_MS = 5 * MINUTE_MS;

export type AbyssalEstimateStatus =
  'priced' | 'no-estimate' | 'not-imported' | 'unknown' | 'unavailable';

export interface AbyssalEstimate {
  value: number | null;
  status: AbyssalEstimateStatus;
  source: 'mutamarket';
  fetchedAt: number;
  valueUpdatedAt: string | null;
  url: string;
}

export type MutamarketEstimateResponse =
  | { status: 'priced'; value: number; valueUpdatedAt: string | null; url: string | null }
  | { status: 'no-estimate'; url: string | null }
  | { status: 'not-imported' }
  | { status: 'unknown' };

export interface MutamarketRequest {
  characterId: number;
  typeId: number;
  itemId: number;
  importIfMissing: boolean;
}

export type MutamarketTransport = (
  request: MutamarketRequest
) => Promise<MutamarketEstimateResponse>;

type StoredEstimate = Pick<AbyssalEstimate, 'value' | 'status' | 'valueUpdatedAt' | 'url'>;

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

function answers(estimate: AbyssalEstimate, importIfMissing: boolean): boolean {
  return !(
    importIfMissing &&
    (estimate.status === 'not-imported' || estimate.status === 'unavailable')
  );
}

type EstimateListener = (itemId: number, estimate: AbyssalEstimate) => void;
const listeners = new Set<EstimateListener>();

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
  } catch {}
  return found;
}

export function clearAbyssalEstimateMemory(): void {
  memory.clear();
  inFlight.clear();
  lookupSlots = createSemaphore(LOOKUP_CONCURRENCY);
  importSlots = createSemaphore(1);
}
