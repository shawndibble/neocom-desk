import { db } from '@/db';
import { getUniverseStructure, type UniverseStructure } from '@/esi/endpoints';
import { EsiError, isCredentialFailure } from '@/esi/client';
import { isCachePurgePending } from '@/esi/cachePurge';
import {
  conditionalFetch,
  loadWithCache,
  readCached,
  readCachedEntries,
  writeCached,
  GLOBAL_CACHE_CHARACTER_ID,
  STRUCTURE_CACHE_KEY_PREFIX,
  STALE_AFTER,
} from '@/esi/cache';

function cacheKey(structureId: number): string {
  return `${STRUCTURE_CACHE_KEY_PREFIX}${structureId}`;
}

function forbiddenKey(structureId: number): string {
  return `${cacheKey(structureId)}:forbidden`;
}

function rosterForbiddenKey(structureId: number): string {
  return `${cacheKey(structureId)}:roster-forbidden`;
}

const FORBIDDEN_MEMO_MS = STALE_AFTER.static;

function isMemoFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < FORBIDDEN_MEMO_MS;
}

async function readMemo(
  characterId: number,
  structureId: number
): Promise<{ forbidden: boolean; name: UniverseStructure | undefined }> {
  const nameKey = cacheKey(structureId);
  const refusalKey = forbiddenKey(structureId);
  const rows = await readCachedEntries<UniverseStructure | boolean>(characterId, [
    nameKey,
    refusalKey,
  ]);
  const refusal = rows.get(refusalKey);
  return {
    forbidden: refusal !== undefined && isMemoFresh(refusal.fetchedAt),
    name: rows.get(nameKey)?.value as UniverseStructure | undefined,
  };
}

async function loadOwnStructure(
  characterId: number,
  structureId: number
): Promise<{ structure: UniverseStructure | null; forbidden: boolean }> {
  const memo = await readMemo(characterId, structureId);
  if (memo.forbidden) return { structure: memo.name ?? null, forbidden: true };

  let forbidden = false;
  const { fetchLive, conditional } = conditionalFetch(async (options) => {
    try {
      return await getUniverseStructure(characterId, structureId, options);
    } catch (err) {
      if (err instanceof EsiError && err.status === 403) {
        forbidden = true;
        await writeCached(characterId, forbiddenKey(structureId), true, Date.now());
      }
      throw err;
    }
  });
  const result = await loadWithCache(characterId, cacheKey(structureId), fetchLive, {
    conditional,
    detectAuthFailure: isCredentialFailure,
    staleAfterMs: STALE_AFTER.static,
  });
  return { structure: result?.data ?? null, forbidden };
}

async function resolveViaRoster(
  askingCharacterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  const memo = await readCachedEntries<boolean>(GLOBAL_CACHE_CHARACTER_ID, [
    rosterForbiddenKey(structureId),
  ]);
  const refusal = memo.get(rosterForbiddenKey(structureId));
  if (refusal !== undefined && isMemoFresh(refusal.fetchedAt)) return null;

  const others = (await db.characters.toArray())
    .map((character) => character.characterId)
    .filter((characterId) => characterId !== askingCharacterId);

  let everyOtherConfirmedForbidden = others.length > 0;
  for (const characterId of others) {
    const { structure, forbidden } = await loadOwnStructure(characterId, structureId);
    if (structure) return structure;
    if (!forbidden) everyOtherConfirmedForbidden = false;
  }

  if (everyOtherConfirmedForbidden) {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, rosterForbiddenKey(structureId), true, Date.now());
  }
  return null;
}

export async function loadVisibleStructure(
  characterId: number,
  structureId: number
): Promise<{ name: string; systemId: number } | null> {
  const { structure, forbidden } = await loadOwnStructure(characterId, structureId);
  return structure && !forbidden
    ? { name: structure.name, systemId: structure.solar_system_id }
    : null;
}

export async function loadStructureAccess(
  characterId: number,
  structureId: number
): Promise<'visible' | 'refused' | 'unknown'> {
  const { structure, forbidden } = await loadOwnStructure(characterId, structureId);
  if (forbidden) return 'refused';
  return structure ? 'visible' : 'unknown';
}

async function loadStructure(
  characterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  const shared = await readCached<UniverseStructure>(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(structureId)
  );
  if (shared) return shared;

  const own = await loadOwnStructure(characterId, structureId);
  const structure =
    own.structure ?? (own.forbidden ? await resolveViaRoster(characterId, structureId) : null);

  if (structure) {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(structureId), structure, Date.now());
  }
  return structure;
}

export async function loadStructureInfo(
  characterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  return loadStructure(characterId, structureId);
}

export async function readCachedStructureNames(
  structureIds: readonly number[]
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (const [id, { name }] of await readCachedStructures(structureIds)) names.set(id, name);
  return names;
}

export async function readCachedStructures(
  structureIds: readonly number[]
): Promise<Map<number, { name: string; systemId: number | null }>> {
  const unique = [...new Set(structureIds)];
  const structures = new Map<number, { name: string; systemId: number | null }>();
  if (unique.length === 0) return structures;
  const rows = await readCachedEntries<UniverseStructure>(
    GLOBAL_CACHE_CHARACTER_ID,
    unique.map(cacheKey)
  );
  for (const id of unique) {
    const value = rows.get(cacheKey(id))?.value;
    if (!value?.name) continue;
    const systemId = typeof value.solar_system_id === 'number' ? value.solar_system_id : null;
    structures.set(id, { name: value.name, systemId });
  }
  return structures;
}

export interface CachedStructure {
  id: number;
  name: string;
}

export async function listCachedStructures(): Promise<CachedStructure[]> {
  if (await isCachePurgePending(GLOBAL_CACHE_CHARACTER_ID)) return [];
  const rows = await db.esiCache
    .where('[characterId+key]')
    .between(
      [GLOBAL_CACHE_CHARACTER_ID, STRUCTURE_CACHE_KEY_PREFIX],
      [GLOBAL_CACHE_CHARACTER_ID, STRUCTURE_CACHE_KEY_PREFIX + String.fromCharCode(0xffff)],
      true,
      true
    )
    .toArray();
  const structures: CachedStructure[] = [];
  for (const row of rows) {
    const id = /^structure:(\d+)$/.exec(row.key)?.[1];
    const name = (row.value as Partial<UniverseStructure> | undefined)?.name;
    if (id !== undefined && typeof name === 'string' && name !== '') {
      structures.push({ id: Number(id), name });
    }
  }
  return structures;
}

export async function loadStructureNameNoRoster(
  characterId: number,
  structureId: number
): Promise<string | null> {
  const shared = await readCached<UniverseStructure>(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(structureId)
  );
  if (shared) return shared.name;
  const { structure } = await loadOwnStructure(characterId, structureId);
  if (structure) {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(structureId), structure, Date.now());
  }
  return structure?.name ?? null;
}

export async function loadStructureName(
  characterId: number,
  structureId: number
): Promise<string | null> {
  return (await loadStructure(characterId, structureId))?.name ?? null;
}

export async function loadStructureSystemId(
  characterId: number,
  structureId: number
): Promise<number | null> {
  return (await loadStructure(characterId, structureId))?.solar_system_id ?? null;
}

export async function loadStructureSummary(
  characterId: number,
  structureId: number
): Promise<{ name: string; systemId: number; typeId: number } | null> {
  const structure = await loadStructure(characterId, structureId);
  if (!structure || structure.type_id === undefined) return null;
  return {
    name: structure.name,
    systemId: structure.solar_system_id,
    typeId: structure.type_id,
  };
}
