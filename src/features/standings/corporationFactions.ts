import { loadNpcCorporationsFile } from '@/sde/loadSde';
import type { NpcCorporationEntry } from '@/sde/types';
import { memoizeAsync } from '@/lib/memoizeAsync';

export function corporationFactionMap(
  npcCorporations: readonly NpcCorporationEntry[]
): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const corporation of npcCorporations) {
    if (corporation.factionId !== undefined) map.set(corporation.id, corporation.factionId);
  }
  return map;
}

export const loadCorporationFactions = memoizeAsync(async () =>
  corporationFactionMap((await loadNpcCorporationsFile()).corporations)
);

export function corporationsOfFaction(
  corporationFactions: ReadonlyMap<number, number>,
  factionId: number
): number[] {
  return [...corporationFactions].filter(([, faction]) => faction === factionId).map(([id]) => id);
}
