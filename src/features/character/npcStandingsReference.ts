/**
 * What the Standings table reads beside the Character's standings: the pilot's
 * social skills, the NPC corporation data (a corporation's faction, names) and
 * the agents data. Each is optional: one that cannot be read leaves its part
 * of the table empty rather than guessed (`NpcStandingsReference`).
 *
 * The corporation to faction map is `loadCorporationFactions`, built from
 * `npcCorporations.json`, which holds every NPC corporation.
 */
import { loadCorporationFactions } from '@/features/standings/corporationFactions';
import { loadStandingSkills } from '@/features/standings/standingSkills';
import { loadAgents } from '@/sde/agents';
import { loadNpcCorporationsFile } from '@/sde/loadSde';
import { buildNpcCorporationIndex } from '@/sde/npcCorporations';
import type { NpcCorporationsFile } from '@/sde/types';
import type { NpcCorporationLookup, NpcStandingsReference } from './npcStandingsRows';

export function npcCorporationLookup(
  file: NpcCorporationsFile,
  factions: ReadonlyMap<number, number>
): NpcCorporationLookup {
  const index = buildNpcCorporationIndex(file);
  return {
    factions,
    corporationName: (id) => index.corporationById(id)?.name,
    factionName: (id) => index.factionName(id),
  };
}

/** `withAgents`: the pilot holds a standing with an agent, so the (large) agents file is worth reading. */
export async function loadNpcStandingsReference(
  characterId: number,
  withAgents: boolean
): Promise<NpcStandingsReference> {
  const [skills, corporations, agents] = await Promise.all([
    loadStandingSkills(characterId).catch(() => null),
    Promise.all([loadNpcCorporationsFile(), loadCorporationFactions()])
      .then(([file, factions]) => npcCorporationLookup(file, factions))
      .catch(() => null),
    withAgents ? loadAgents().catch(() => null) : null,
  ]);
  return { skills: skills?.social ?? null, corporations, agents };
}
