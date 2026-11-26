import { postUniverseNames, type UniverseName } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { chunk } from '@/lib/chunk';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCachedMany,
} from '@/esi/cache';

const NAMES_BATCH = 1000;

function cacheKey(id: number): string {
  return `name:${id}`;
}

function categoryKey(id: number): string {
  return `category:${id}`;
}

export type NameCategory = UniverseName['category'];

export async function resolveCategories(
  ids: readonly number[]
): Promise<Map<number, NameCategory>> {
  const unique = [...new Set(ids)];
  const map = new Map<number, NameCategory>();
  if (unique.length === 0) return map;
  const cached = await readCachedEntries<NameCategory>(
    GLOBAL_CACHE_CHARACTER_ID,
    unique.map(categoryKey)
  );
  const unknown: number[] = [];
  for (const id of unique) {
    const row = cached.get(categoryKey(id));
    if (row === undefined) unknown.push(id);
    else map.set(id, row.value);
  }
  if (unknown.length > 0) {
    for (const [id, category] of await fetchCategories(unknown)) map.set(id, category);
  }
  return map;
}

async function fetchCategories(ids: readonly number[]): Promise<Map<number, NameCategory>> {
  const out = new Map<number, NameCategory>();
  for (const [id, entry] of await fetchEntries(ids)) out.set(id, entry.category);
  return out;
}

export async function resolveNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;

  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, unique.map(cacheKey));
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) {
      unknown.push(id);
      continue;
    }
    map.set(id, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.static) lapsed.push(id);
  }

  if (unknown.length > 0) {
    for (const [id, name] of await fetchNames([...unknown, ...lapsed])) map.set(id, name);
    return map;
  }
  if (lapsed.length > 0) void fetchNames(lapsed);
  return map;
}

export async function readCachedNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, unique.map(cacheKey));
  const map = new Map<number, string>();
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row !== undefined) map.set(id, row.value);
  }
  return map;
}

export async function seedCachedNames(names: Readonly<Record<number, string>>): Promise<void> {
  await writeCachedMany(
    GLOBAL_CACHE_CHARACTER_ID,
    Object.entries(names).map(([id, name]) => [cacheKey(Number(id)), name] as const),
    Date.now()
  );
}

async function fetchNames(ids: readonly number[]): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  for (const [id, entry] of await fetchEntries(ids)) resolved.set(id, entry.name);
  return resolved;
}

const REFUSED_TTL_MS = 15 * 60_000;
const refusedIds = new Map<number, number>();

function isRefused(id: number): boolean {
  const at = refusedIds.get(id);
  if (at === undefined) return false;
  if (Date.now() - at < REFUSED_TTL_MS) return true;
  refusedIds.delete(id);
  return false;
}

export function clearRefusedNameIds(): void {
  refusedIds.clear();
}

const MAX_BISECT_404S = 20;

async function fetchEntries(ids: readonly number[]): Promise<Map<number, UniverseName>> {
  const resolved = new Map<number, UniverseName>();
  const askable = ids.filter((id) => !isRefused(id));
  const allowance = { left: MAX_BISECT_404S };
  for (const batch of chunk(askable, NAMES_BATCH)) {
    await fetchBatch(batch, resolved, allowance);
  }
  return resolved;
}

async function fetchBatch(
  batch: readonly number[],
  resolved: Map<number, UniverseName>,
  allowance: { left: number }
): Promise<void> {
  if (batch.length === 0 || allowance.left <= 0) return;
  try {
    const entries = await postUniverseNames([...batch]);
    const fetchedAt = Date.now();
    for (const entry of entries) resolved.set(entry.id, entry);
    await writeCachedMany(
      GLOBAL_CACHE_CHARACTER_ID,
      entries.flatMap((entry) => [
        [cacheKey(entry.id), entry.name] as const,
        [categoryKey(entry.id), entry.category] as const,
      ]),
      fetchedAt
    );
  } catch (error) {
    if (!(error instanceof EsiError) || error.status !== 404) return;
    allowance.left -= 1;
    if (batch.length === 1) {
      refusedIds.set(batch[0], Date.now());
      return;
    }
    const middle = Math.ceil(batch.length / 2);
    await fetchBatch(batch.slice(0, middle), resolved, allowance);
    await fetchBatch(batch.slice(middle), resolved, allowance);
  }
}
