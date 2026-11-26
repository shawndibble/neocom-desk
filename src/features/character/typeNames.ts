import { EsiError } from '@/esi/client';
import { getUniverseType, postUniverseNames } from '@/esi/endpoints';
import { loadTypes } from '@/sde/loadSde';
import { knownPackagedVolumeOf } from '@/sde/marketTypes';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  readCachedEntries,
  writeCachedMany,
} from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { chunk } from '@/lib/chunk';

const NAMES_BATCH_LIMIT = 1000;

function cacheKey(typeId: number): string {
  return `type:${typeId}`;
}

async function resolveViaEsi(typeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, typeIds.map(cacheKey));
  const now = Date.now();
  const unknown: number[] = [];
  const lapsed: number[] = [];
  for (const id of typeIds) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) {
      unknown.push(id);
      continue;
    }
    map.set(id, row.value);
    if (now - row.fetchedAt >= STALE_AFTER.static) lapsed.push(id);
  }
  if (unknown.length === 0) {
    if (lapsed.length > 0) void fetchFromEsi(lapsed).catch(() => {});
    return map;
  }
  for (const [id, name] of await fetchFromEsi([...unknown, ...lapsed])) map.set(id, name);
  return map;
}

async function cacheNames(
  rows: ReadonlyArray<readonly [string, string]>,
  fetchedAt: number
): Promise<void> {
  try {
    await writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, rows, fetchedAt);
  } catch {}
}

async function fetchFromEsi(typeIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const ids of chunk(typeIds, NAMES_BATCH_LIMIT)) {
    let unresolved = ids;
    try {
      const resolved = await postUniverseNames(ids);
      const fetchedAt = Date.now();
      const types = resolved.filter((entry) => entry.category === 'inventory_type');
      for (const entry of types) map.set(entry.id, entry.name);
      await cacheNames(
        types.map((entry) => [cacheKey(entry.id), entry.name] as const),
        fetchedAt
      );
      unresolved = ids.filter((id) => !map.has(id));
    } catch (err) {
      if (err instanceof EsiError && err.status === 404) {
        const fetchedAt = Date.now();
        const perId: Array<readonly [string, string]> = [];
        await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
          try {
            const { data } = await getUniverseType(id);
            if (!data) return;
            map.set(id, data.name);
            perId.push([cacheKey(id), data.name]);
          } catch {}
        });
        await cacheNames(perId, fetchedAt);
        unresolved = ids.filter((id) => !map.has(id));
      }
    }
    const cached = await readCachedEntries<string>(
      GLOBAL_CACHE_CHARACTER_ID,
      unresolved.map(cacheKey)
    );
    for (const id of unresolved) {
      const row = cached.get(cacheKey(id));
      if (row !== undefined) map.set(id, row.value);
    }
  }
  return map;
}

export async function readCachedTypeNames(
  typeIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(typeIds)];
  const types = await loadTypes();
  const map = new Map<number, string>();
  const notInSde: number[] = [];
  for (const id of unique) {
    const name = types[String(id)]?.name;
    if (name) map.set(id, name);
    else notInSde.push(id);
  }
  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, notInSde.map(cacheKey));
  for (const id of notInSde) {
    const name = cached.get(cacheKey(id))?.value;
    if (name) map.set(id, name);
  }
  return map;
}

export async function loadTypeName(typeId: number): Promise<string> {
  const names = await loadTypeNames([typeId]);
  return names.get(typeId) ?? `Type #${typeId}`;
}

export async function loadTypeNames(typeIds: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(typeIds)];
  const types = await loadTypes();
  const map = new Map<number, string>();
  const missing: number[] = [];
  for (const id of unique) {
    const name = types[String(id)]?.name;
    if (name) map.set(id, name);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const resolved = await resolveViaEsi(missing);
    for (const [id, name] of resolved) map.set(id, name);
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, `Type #${id}`);
  }
  return map;
}

export async function loadTypePackagedVolumes(
  typeIds: readonly number[],
  shipTypeIds: ReadonlySet<number> = new Set()
): Promise<Map<number, number>> {
  const market = await loadMarketTypesById().catch(() => null);
  const types = await loadTypes().catch(() => null);
  const map = new Map<number, number>();
  for (const id of typeIds) {
    const known = knownPackagedVolumeOf(market?.get(id));
    if (known !== null && known > 0) {
      map.set(id, known);
      continue;
    }
    if (shipTypeIds.has(id)) continue;
    const type = types?.[String(id)];
    const volume = type?.packagedVolume ?? type?.volume;
    if (volume !== undefined) map.set(id, volume);
  }
  return map;
}

export async function loadTypeVolumes(typeIds: readonly number[]): Promise<Map<number, number>> {
  try {
    const types = await loadTypes();
    const map = new Map<number, number>();
    for (const id of typeIds) {
      const volume = types[String(id)]?.volume;
      if (volume !== undefined) map.set(id, volume);
    }
    return map;
  } catch {
    return new Map();
  }
}
