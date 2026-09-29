/**
 * The Overview's corp reads, loaded behind `import()` from `boardData.ts`.
 *
 * **Gated before it fetches**, like the Calendar's moon read
 * (`features/character/calendarMoonChunks.ts`): corporation, then roles, then
 * scopes, and no corp call at all unless every step passes. CCP role-gates
 * these endpoints server-side, and the board loads every card on every visit,
 * so a pilot with no corp role must never make a request that can only 403.
 */
import { db } from '@/db';
import { corpCapabilities, type CorpCapabilities } from '@/engine/corpRoles';
import { buildCorpBoard } from '@/engine/corp/board';
import { ESI_REGISTRY } from '@/esi/registry';
import { loadCorporationId, loadCorporationStructures } from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { corpWideRoles, loadCharacterRoles } from '@/features/corp/roles';
import { loadMoonChunks } from '@/features/character/calendarMoonChunks';
import type { MoonChunksBoardData, StructuresBoardData } from './boardData';

/** CCP caches the corp endpoints for about an hour — the Corp page's own window. */
const CORP_CACHE_WINDOW_MS = 3_600_000;

type Capability = keyof CorpCapabilities;

/** The corporation this Character may read `capability` for, or null. */
async function readableCorporation(
  characterId: number,
  capability: Capability
): Promise<number | null> {
  const granted = new Set((await db.tokens.get(characterId))?.scopes ?? []);
  if (!granted.has(ESI_REGISTRY.getCharacterRoles.scope)) return null;
  if (!CORP_SCOPES_FOR_CAPABILITY[capability].every((scope) => granted.has(scope))) return null;
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null) return null;
  const roles = await loadCharacterRoles(characterId);
  if (roles.needsReauth || roles.cached === null) return null;
  return corpCapabilities(corpWideRoles(roles.cached.data))[capability] ? corporationId : null;
}

const UNREADABLE_STRUCTURES: StructuresBoardData = {
  items: null,
  structureCount: 0,
  needsReauth: false,
  fetchedAt: null,
};

export async function loadStructuresBoardData(characterId: number): Promise<StructuresBoardData> {
  const corporationId = await readableCorporation(characterId, 'canReadStructures');
  if (corporationId === null) return UNREADABLE_STRUCTURES;
  const result = await loadCorporationStructures(characterId, corporationId);
  if (result.cached === null) return { ...UNREADABLE_STRUCTURES, needsReauth: result.needsReauth };
  const structures = result.cached.data;
  return {
    items: buildCorpBoard({
      nowMs: Date.now(),
      staleWindowMs: CORP_CACHE_WINDOW_MS,
      structures: toBoardStructures(structures),
    }),
    structureCount: structures.length,
    needsReauth: result.needsReauth,
    fetchedAt: result.cached.fetchedAt,
  };
}

/** The Calendar's moon read, as-is: it already gates, names refineries and picks arrival or decay. */
export async function loadMoonChunksBoardData(characterId: number): Promise<MoonChunksBoardData> {
  const loadedAt = Date.now();
  const { result, sources } = await loadMoonChunks(characterId, loadedAt);
  return {
    chunks: sources ?? null,
    needsReauth: result.needsReauth,
    fetchedAt: result.cached?.fetchedAt ?? null,
    loadedAt,
  };
}
