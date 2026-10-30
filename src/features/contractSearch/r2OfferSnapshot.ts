/**
 * Reads the Public Contract Offers snapshot from Cloudflare R2 (ADR 0019, issue
 * #3746): a small `index.json` that names, per item type, the content-addressed
 * objects holding that type's offers, and the objects themselves. A consumer
 * reads the index, then only the types it uses — instead of the ~40-75 MB the
 * whole snapshot adds up to.
 *
 * A reader that needs every type (Below market, a search naming no type) or
 * every blueprint type (BPC Sourcing) reads the index's bundle shards instead:
 * the same rows in a handful of big objects, where thousands of small reads
 * took minutes. An index published before the shards existed falls back to the
 * per-type objects.
 *
 * Reading the objects the index names is what rules out a half-old, half-new
 * snapshot: an object's name carries its content hash, so it never changes, and
 * a newer publish names different objects.
 *
 * Everything here reports "unavailable" as `null`, never as a throw. R2 is the
 * only store (issue #4270), so the caller shows its "unavailable" state.
 */
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { CHUNK_READ_CONCURRENCY } from './r2Snapshot';
import { HOUR_MS } from '@/lib/age';

export const R2_SNAPSHOT_ORIGIN = 'https://data.neocomdesk.com';
const INDEX_URL = `${R2_SNAPSHOT_ORIGIN}/contract-offers/index.json`;
const INDEX_CACHE_KEY = 'contractOffersR2Index';
/** How often the backend republishes; the index is re-read once its window lapses. */
const INDEX_STALE_AFTER_MS = HOUR_MS;
const READ_TIMEOUT_MS = 20_000;
/** What the writer names an object (`functions/src/contractOfferObjects.ts`); anything else is not fetched. */
const OBJECT_NAME = /^contract-offers\/types\/[\w.-]+\.json$/;
const BUNDLE_NAME = /^contract-offers\/bundles\/[\w.-]+\.json$/;

/** `contract-offers/index.json` as `functions/src/contractOfferObjects.ts` writes it. */
export interface R2OfferIndex {
  lastSyncedAt: number;
  types: Record<string, { count: number; cheapest: number | null; objects: string[] }>;
  regionIds: number[];
  /** Every row in a few shards: blueprint types apart from the rest. */
  bundles?: { blueprints: string[]; others: string[] };
}

function isIndexEntry(value: unknown): value is R2OfferIndex['types'][string] {
  if (typeof value !== 'object' || value === null) return false;
  const { count, cheapest, objects } = value as Record<string, unknown>;
  return (
    typeof count === 'number' &&
    (cheapest === null || typeof cheapest === 'number') &&
    Array.isArray(objects) &&
    objects.length > 0 &&
    objects.every((name) => typeof name === 'string' && OBJECT_NAME.test(name))
  );
}

function parseBundles(raw: unknown): R2OfferIndex['bundles'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { blueprints, others } = raw as Record<string, unknown>;
  const valid = (names: unknown): names is string[] =>
    Array.isArray(names) &&
    names.every((name) => typeof name === 'string' && BUNDLE_NAME.test(name));
  return valid(blueprints) && valid(others) ? { blueprints, others } : undefined;
}

/**
 * The index, or `null` when it is not the shape the writer produces. Bad
 * bundles are dropped rather than failing the index: the per-type objects
 * still answer every read.
 */
export function parseR2OfferIndex(raw: unknown): R2OfferIndex | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, types, regionIds } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (typeof types !== 'object' || types === null) return null;
  const entries = Object.entries(types);
  if (!entries.every(([key, entry]) => /^\d+$/.test(key) && isIndexEntry(entry))) return null;
  if (!Array.isArray(regionIds) || !regionIds.every((id) => typeof id === 'number')) return null;
  const index: R2OfferIndex = { lastSyncedAt, types: types as R2OfferIndex['types'], regionIds };
  const bundles = parseBundles((raw as Record<string, unknown>).bundles);
  if (bundles) index.bundles = bundles;
  return index;
}

/** The fields every consumer reads unguarded; a row without them would throw in a render. */
function isOfferRow(value: unknown): value is PublicContractOfferRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.typeId === 'number' && typeof row.contractId === 'number';
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function fetchIndex(): Promise<R2OfferIndex | null> {
  try {
    return parseR2OfferIndex(await fetchJson(INDEX_URL));
  } catch {
    return null;
  }
}

/**
 * The index, cache-through like the other loaders (global key, 30-minute
 * window, a lapsed copy served while the next read runs). `null` when R2 is
 * unreachable and nothing is cached, or the index is missing or invalid.
 */
export async function loadR2OfferIndex(): Promise<CachedResult<R2OfferIndex> | null> {
  try {
    return await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, INDEX_CACHE_KEY, fetchIndex, {
      staleAfterMs: INDEX_STALE_AFTER_MS,
      allowStaleServe: true,
    });
  } catch {
    return null;
  }
}

/** Objects already read, by name. Names are content hashes, so an entry never goes stale; it only stops being named. */
const objectMemo = new Map<string, Promise<PublicContractOfferRow[]>>();

function readObject(name: string): Promise<PublicContractOfferRow[]> {
  let pending = objectMemo.get(name);
  if (!pending) {
    pending = fetchJson(`${R2_SNAPSHOT_ORIGIN}/${name}`).then((body) => {
      if (!Array.isArray(body) || !body.every(isOfferRow)) throw new Error(`${name}: bad rows`);
      return body as PublicContractOfferRow[];
    });
    // A failed read must not poison the memo for the retry.
    pending.catch(() => objectMemo.delete(name));
    objectMemo.set(name, pending);
  }
  return pending;
}

/** Test seam: the memo outlives a test's own state. */
export function resetR2ObjectMemo(): void {
  objectMemo.clear();
}

/** The object names the index gives these types, in type order. Types it does not list contribute nothing. */
export function r2ObjectsForTypes(index: R2OfferIndex, typeIds: Iterable<number>): string[] {
  const names: string[] = [];
  for (const typeId of typeIds) {
    const entry = index.types[String(typeId)];
    if (entry) names.push(...entry.objects);
  }
  return names;
}

/**
 * The rows of these objects, in order. `null` when any read fails, so the
 * caller falls back whole rather than serving a type with rows missing.
 */
async function readObjects(
  index: R2OfferIndex,
  wanted: readonly string[]
): Promise<PublicContractOfferRow[] | null> {
  const named = new Set(Object.values(index.types).flatMap((entry) => entry.objects));
  for (const name of index.bundles?.blueprints ?? []) named.add(name);
  for (const name of index.bundles?.others ?? []) named.add(name);
  // Objects of an older publish can never be asked for again.
  for (const name of objectMemo.keys()) if (!named.has(name)) objectMemo.delete(name);

  const byName = new Map<string, PublicContractOfferRow[]>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < wanted.length) {
      const name = wanted[next];
      next += 1;
      byName.set(name, await readObject(name));
    }
  }
  try {
    await Promise.all(
      Array.from({ length: Math.min(CHUNK_READ_CONCURRENCY, wanted.length) }, worker)
    );
  } catch {
    return null;
  }
  return wanted.flatMap((name) => byName.get(name) ?? []);
}

/** The offers of just these types, from only the objects the index names; `null` when a read failed. */
export function loadR2TypeRows(
  index: R2OfferIndex,
  typeIds: Iterable<number>
): Promise<PublicContractOfferRow[] | null> {
  return readObjects(index, r2ObjectsForTypes(index, typeIds));
}

/** Every offer: the bundle shards when the index names them, else every type's objects. */
export function loadR2AllRows(index: R2OfferIndex): Promise<PublicContractOfferRow[] | null> {
  if (!index.bundles) return loadR2TypeRows(index, Object.keys(index.types).map(Number));
  return readObjects(index, [...index.bundles.blueprints, ...index.bundles.others]);
}

/**
 * The offers of these blueprint types: the blueprints shards narrowed to them
 * when the index names shards, else just their own objects.
 */
export async function loadR2BlueprintRows(
  index: R2OfferIndex,
  typeIds: Iterable<number>
): Promise<PublicContractOfferRow[] | null> {
  if (!index.bundles) return loadR2TypeRows(index, typeIds);
  const rows = await readObjects(index, index.bundles.blueprints);
  if (!rows) return null;
  const wanted = new Set(typeIds);
  return rows.filter((row) => wanted.has(row.typeId));
}
