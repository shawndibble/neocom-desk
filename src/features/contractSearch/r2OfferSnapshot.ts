import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, type CachedResult } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { CHUNK_READ_CONCURRENCY } from './r2Snapshot';
import { HOUR_MS } from '@/lib/age';

export const R2_SNAPSHOT_ORIGIN = 'https://data.neocomdesk.com';
const INDEX_URL = `${R2_SNAPSHOT_ORIGIN}/contract-offers/index.json`;
const INDEX_CACHE_KEY = 'contractOffersR2Index';
const INDEX_STALE_AFTER_MS = HOUR_MS;
const READ_TIMEOUT_MS = 20_000;
const OBJECT_NAME = /^contract-offers\/types\/[\w.-]+\.json$/;
const BUNDLE_NAME = /^contract-offers\/bundles\/[\w.-]+\.json$/;

export interface R2OfferIndex {
  lastSyncedAt: number;
  types: Record<string, { count: number; cheapest: number | null; objects: string[] }>;
  regionIds: number[];
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
    objects.every(
      (name) => typeof name === 'string' && (OBJECT_NAME.test(name) || BUNDLE_NAME.test(name))
    )
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

const objectMemo = new Map<string, Promise<PublicContractOfferRow[]>>();

function readObject(name: string): Promise<PublicContractOfferRow[]> {
  let pending = objectMemo.get(name);
  if (!pending) {
    pending = fetchJson(`${R2_SNAPSHOT_ORIGIN}/${name}`).then((body) => {
      if (!Array.isArray(body) || !body.every(isOfferRow)) throw new Error(`${name}: bad rows`);
      return body as PublicContractOfferRow[];
    });
    pending.catch(() => objectMemo.delete(name));
    objectMemo.set(name, pending);
  }
  return pending;
}

export function resetR2ObjectMemo(): void {
  objectMemo.clear();
}

export function r2ObjectsForTypes(index: R2OfferIndex, typeIds: Iterable<number>): string[] {
  const names = new Set<string>();
  for (const typeId of typeIds) {
    const entry = index.types[String(typeId)];
    if (entry) for (const name of entry.objects) names.add(name);
  }
  return [...names];
}

async function readObjects(
  index: R2OfferIndex,
  wanted: readonly string[]
): Promise<PublicContractOfferRow[] | null> {
  const named = new Set(Object.values(index.types).flatMap((entry) => entry.objects));
  for (const name of index.bundles?.blueprints ?? []) named.add(name);
  for (const name of index.bundles?.others ?? []) named.add(name);
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

export async function loadR2TypeRows(
  index: R2OfferIndex,
  typeIds: Iterable<number>
): Promise<PublicContractOfferRow[] | null> {
  const wanted = new Set(typeIds);
  const rows = await readObjects(index, r2ObjectsForTypes(index, wanted));
  return rows && rows.filter((row) => wanted.has(row.typeId));
}

export function loadR2AllRows(index: R2OfferIndex): Promise<PublicContractOfferRow[] | null> {
  if (!index.bundles) return loadR2TypeRows(index, Object.keys(index.types).map(Number));
  return readObjects(index, [...index.bundles.blueprints, ...index.bundles.others]);
}

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
