/**
 * Which faction an NPC corporation belongs to. ESI's corporation endpoint does
 * not say, so this reads the baked NPC-corporation file, which holds every NPC
 * corporation. Callers only use `loadCorporationFactions`.
 */
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

/**
 * Memoized for the session (a failure is not, so a later call retries); rejects
 * when the NPC-corporation file cannot be read, so a view can show
 * "unavailable" rather than guess.
 */
export const loadCorporationFactions = memoizeAsync(async () =>
  corporationFactionMap((await loadNpcCorporationsFile()).corporations)
);

export function corporationsOfFaction(
  corporationFactions: ReadonlyMap<number, number>,
  factionId: number
): number[] {
  return [...corporationFactions].filter(([, faction]) => faction === factionId).map(([id]) => id);
}
