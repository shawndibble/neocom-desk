/**
 * The Planetary widget on All characters: each Character's board (`loadPlanetaryBoard`)
 * regrouped as one, so the batches are the account's errands: one trip per time an extractor
 * runs dry, whichever Character owns the colony. Pure, so it is tested apart from the reads.
 */
import { groupColoniesIntoBatches } from '@/engine/pi/colonyBatches';
import type { BoardColony, PlanetaryBoardData } from './boardData';

export interface CharacterPlanetaryBoard {
  characterId: number;
  name: string;
  data: PlanetaryBoardData;
}

export function mergePlanetaryBoards(
  boards: readonly CharacterPlanetaryBoard[]
): PlanetaryBoardData {
  const colonies: BoardColony[] = boards.flatMap(({ characterId, name, data }) =>
    data.batches.flatMap((batch) =>
      batch.colonies.map((colony) => ({ ...colony, ownerId: characterId, ownerName: name }))
    )
  );
  const loadedAt = Math.max(0, ...boards.map(({ data }) => data.loadedAt));
  const reads = boards.flatMap(({ data }) => (data.fetchedAt ? [data.fetchedAt.getTime()] : []));
  return {
    batches: groupColoniesIntoBatches(colonies, (colony) => colony.status, loadedAt),
    colonyCount: boards.reduce((sum, { data }) => sum + data.colonyCount, 0),
    programCount: boards.reduce((sum, { data }) => sum + data.programCount, 0),
    needsReauth: boards.length > 0 && boards.every(({ data }) => data.needsReauth),
    fetchedAt: reads.length > 0 ? new Date(Math.min(...reads)) : null,
    loadedAt,
  };
}
