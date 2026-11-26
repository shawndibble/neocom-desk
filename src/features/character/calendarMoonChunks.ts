import type { CorporationStructure } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import {
  loadCorporationMiningExtractions,
  loadCorporationStructures,
} from '@/features/corp/boardData';
import { structureName, toBoardExtractions } from '@/features/corp/boardSources';
import { resolveCorpReadAccess } from '@/features/corp/corpReadAccess';
import type { BoardClockSource } from '@/engine/character/board';
import type { BoardExtractionSource } from '@/engine/corp/board';
import { toMoonChunkSources } from './calendarBoardSources';

export interface MoonChunkRead {
  result: StatusResult<unknown[]>;
  sources: BoardClockSource[] | undefined;
  extractions?: BoardExtractionSource[];
  failed?: boolean;
}

const NOT_READABLE: MoonChunkRead = {
  result: { cached: null, needsReauth: false },
  sources: undefined,
};

export async function loadMoonChunks(characterId: number, nowMs: number): Promise<MoonChunkRead> {
  const access = await resolveCorpReadAccess(characterId);
  if (access === null || !access.can('canReadMoonExtractions')) return NOT_READABLE;
  const { corporationId } = access;

  const canNameRefineries = access.can('canReadStructures');
  const [extractions, structures] = await Promise.all([
    loadCorporationMiningExtractions(characterId, corporationId),
    canNameRefineries ? loadCorporationStructures(characterId, corporationId) : undefined,
  ]);
  if (extractions.cached === null) {
    return { result: extractions, sources: undefined, failed: !extractions.needsReauth };
  }

  const names = new Map<number, string>(
    (structures?.cached?.data ?? []).map((structure: CorporationStructure) => [
      structure.structure_id,
      structureName(structure),
    ])
  );
  const board = toBoardExtractions(extractions.cached.data, names);
  return {
    result: extractions,
    sources: toMoonChunkSources(board, nowMs),
    extractions: board,
  };
}
