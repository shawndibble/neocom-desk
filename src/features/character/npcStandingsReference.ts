import { loadCorporationFactions } from '@/features/standings/corporationFactions';
import { loadStandingSkills } from '@/features/standings/standingSkills';
import { loadJumpsFromCurrent } from '@/features/standings/stationJumps';
import { loadAgents } from '@/sde/agents';
import { loadNpcStations } from '@/sde/loadMarketSde';
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

export async function loadNpcStandingsReference(
  characterId: number,
  withAgents: boolean
): Promise<NpcStandingsReference> {
  const [skills, corporations, agents, stations, jumps] = await Promise.all([
    loadStandingSkills(characterId).catch(() => null),
    Promise.all([loadNpcCorporationsFile(), loadCorporationFactions()])
      .then(([file, factions]) => npcCorporationLookup(file, factions))
      .catch(() => null),
    withAgents ? loadAgents().catch(() => null) : null,
    loadNpcStations().catch(() => null),
    loadJumpsFromCurrent(characterId),
  ]);
  return { skills: skills?.social ?? null, corporations, agents, stations, jumps };
}
