/**
 * The Overview's corp reads, loaded behind `import()` from `boardData.ts`.
 *
 * **Gated before it fetches** (`features/corp/corpReadAccess.ts`, the same
 * gate the Calendar's moon read uses): no corp call at all unless the roles
 * and grant cover it. CCP role-gates these endpoints server-side, and the
 * board loads every card on every visit, so a pilot with no corp role must
 * never make a request that can only 403.
 */
import { loadCorporationStructures } from '@/features/corp/boardData';
import { toBoardStructures } from '@/features/corp/boardSources';
import { resolveCorpReadAccess } from '@/features/corp/corpReadAccess';
import { loadMoonChunks } from '@/features/character/calendarMoonChunks';
import type { MoonChunksBoardData, StructuresBoardData } from './boardData';

const UNREADABLE_STRUCTURES: StructuresBoardData = {
  structures: null,
  structureCount: 0,
  needsReauth: false,
  fetchedAt: null,
};

export async function loadStructuresBoardData(characterId: number): Promise<StructuresBoardData> {
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can('canReadStructures')) return UNREADABLE_STRUCTURES;
  const result = await loadCorporationStructures(characterId, access.corporationId);
  if (result.cached === null) return { ...UNREADABLE_STRUCTURES, needsReauth: result.needsReauth };
  const structures = result.cached.data;
  return {
    structures: toBoardStructures(structures),
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
