/**
 * What the Standings table reads beside the Character's standings: the pilot's
 * social skills, the NPC corporation data (a corporation's faction, names) and
 * the agents data. Each is optional: one that cannot be read leaves its part
 * of the table empty rather than guessed (`NpcStandingsReference`).
 *
 * The corporation to faction map comes from `npcCorporations.json`, which holds
 * every NPC corporation; `loadCorporationFactions` (LP stores and stations)
 * misses about a third of the ones that have a faction.
 */
import { loadStandingSkills } from '@/features/standings/standingSkills';
import { loadAgents } from '@/sde/agents';
import { loadNpcCorporationsFile } from '@/sde/loadSde';
import { buildNpcCorporationIndex } from '@/sde/npcCorporations';
import type { NpcCorporationsFile } from '@/sde/types';
import type { NpcCorporationLookup, NpcStandingsReference } from './npcStandingsRows';

export function npcCorporationLookup(file: NpcCorporationsFile): NpcCorporationLookup {
  const index = buildNpcCorporationIndex(file);
  const factions = new Map<number, number>();
  for (const corporation of file.corporations) {
    if (corporation.factionId !== undefined) factions.set(corporation.id, corporation.factionId);
  }
  return {
    factions,
    corporationName: (id) => index.corporationById(id)?.name,
    factionName: (id) => index.factionName(id),
  };
}

export async function loadNpcStandingsReference(
  characterId: number
): Promise<NpcStandingsReference> {
  const [skills, corporations, agents] = await Promise.all([
    loadStandingSkills(characterId).catch(() => null),
    loadNpcCorporationsFile()
      .then(npcCorporationLookup)
      .catch(() => null),
    loadAgents().catch(() => null),
  ]);
  return { skills: skills?.social ?? null, corporations, agents };
}
