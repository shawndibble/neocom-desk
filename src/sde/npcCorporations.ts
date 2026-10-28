/**
 * `public/data/npcCorporations.json` read as lookups. ESI's corporation
 * response has no `faction_id` or headquarters for an NPC corporation, and the
 * LP store list covers only the ones with a store; this is every one.
 * Indexed once per session.
 */
import { loadNpcCorporationsFile } from './loadSde';
import type { NpcCorporationEntry, NpcCorporationsFile } from './types';
import { memoizeAsync } from '@/lib/memoizeAsync';

export interface NpcCorporationIndex {
  corporationById(corporationId: number): NpcCorporationEntry | undefined;
  /** The faction's name; undefined for an id that is not a faction. */
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

/**
 * The NPC corporation index, fetched on first use and memoized for the
 * session; a failure is not memoized, so a later call retries.
 */
export const loadNpcCorporations = memoizeAsync(async () =>
  buildNpcCorporationIndex(await loadNpcCorporationsFile())
);
