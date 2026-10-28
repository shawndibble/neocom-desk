/**
 * NPC standings loaders for the Standings table and info modal. The rules live
 * in `@/engine/standings` (see its index); this folder reads the data they need.
 *
 * Skills
 *   loadStandingSkills(characterId): Promise<StandingSkills | null>
 *     { social: SocialSkillLevels, brokerRelationsLevel }; null = skills unknown
 *
 * Chain (pure, synchronous)
 *   buildChain(target, standings, corporationFactions, skills): StandingChain
 *     target: { kind: 'faction' | 'corporation', id } | { kind: 'agent', id, corporationId }
 *   loadCorporationFactions(): Promise<ReadonlyMap<corporationId, factionId>>
 *     from the baked NPC-corporation file, falling back to LP stores and station owners
 *   corporationsOfFaction(corporationFactions, factionId): number[]
 *
 * Agents (from the baked basic-agent file; storyline/FW/research agents are absent)
 *   chainForAgent(standings, agentId, skills): Promise<{ agent: NpcAgent, chain } | null>
 *   agentsOfCorporation(corporationId, standings, skills): Promise<KnownAgent[]>
 *     { agent: NpcAgent, divisionName, base, effective }, best effective first
 *
 * Standings list (existing)
 *   loadCharacterStandingsResult(characterId) in '@/features/character/standings'
 *
 * Factions
 *   loadFactions(): Promise<UniverseFaction[] | null>   cached ESI /universe/factions
 *
 * Stations (from the shipped stations.json; no per-station reprocessing take is
 * shipped, so price at DEFAULT_STATION_TAKE_PCT)
 *   corporationStationFacts(corporationId, stations): StationFacts
 *   factionStationFacts(factionId, stations): StationFacts
 *     { stations, stationCount, systemIds, tradeHubs }
 *   stations come from loadNpcStations() in '@/sde/loadMarketSde'
 *
 * Jumps (Route Safety basis; link with JumpsLink in '@/features/route/JumpsLink')
 *   loadNearestStation(characterId, corporationId): Promise<NearestNpcStation | null>
 *   jumpsFromCurrent(characterId, systemIds): Promise<Map<systemId, jumps>>
 *     in '@/features/route/jumpsFromCurrent': for an agent's or a capital's system
 */
export {
  agentsOfCorporation,
  chainForAgent,
  type AgentChain,
  type KnownAgent,
} from './agentStandings';
export { buildChain, type ChainTarget } from './buildChain';
export { corporationsOfFaction, loadCorporationFactions } from './corporationFactions';
export { loadFactions } from './factions';
export { loadStandingSkills, type StandingSkills } from './standingSkills';
export { corporationStationFacts, factionStationFacts, type StationFacts } from './stationFacts';
export { loadNearestStation } from './stationJumps';
