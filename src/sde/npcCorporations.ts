import { loadNpcCorporationsFile } from './loadSde';
import type { NpcCorporationEntry, NpcCorporationsFile } from './types';
import { memoizeAsync } from '@/lib/memoizeAsync';

export interface NpcCorporationIndex {
  corporationById(corporationId: number): NpcCorporationEntry | undefined;
  factionName(factionId: number): string | undefined;
}

export function buildNpcCorporationIndex(file: NpcCorporationsFile): NpcCorporationIndex {
  const corporations = new Map(
    file.corporations.map((corporation) => [corporation.id, corporation])
  );
  const factions = new Map(file.factions.map((faction) => [faction.id, faction.name]));
  return {
    corporationById: (corporationId) => corporations.get(corporationId),
    factionName: (factionId) => factions.get(factionId),
  };
}

export const loadNpcCorporations = memoizeAsync(async () =>
  buildNpcCorporationIndex(await loadNpcCorporationsFile())
);
