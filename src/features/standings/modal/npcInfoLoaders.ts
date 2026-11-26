import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  NO_SOCIAL_SKILLS,
  isCriminalFaction,
  type ChainLink,
  type StandingChain,
} from '@/engine/standings';
import { loadCharacterStandingsResult } from '@/features/character/standings';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { loadAgents, type NpcAgent } from '@/sde/agents';
import { loadLpCorporations, loadNpcStations } from '@/sde/loadMarketSde';
import { loadNpcCorporations } from '@/sde/npcCorporations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { agentsOfCorporation, chainForAgent } from '../agentStandings';
import { buildChain } from '../buildChain';
import { loadCorporationFactions } from '../corporationFactions';
import { loadFactions } from '../factions';
import { loadNearestStation } from '../stationJumps';
import { loadStandingSkills, type StandingSkills } from '../standingSkills';
import {
  agentWhereRows,
  corporationWhereRows,
  factionWhereRows,
  knownAgentRows,
  knownCorporationRows,
  loyaltyModel,
  stationsModel,
  type AgentSystem,
  type KnownAgentRow,
  type KnownCorporationRow,
  type LoyaltyModel,
  type StationsModel,
  type WhereRow,
} from './npcInfoModel';

export type NpcInfoTarget =
  | { kind: 'faction'; id: number }
  | { kind: 'corporation'; id: number }
  | { kind: 'agent'; id: number };

export type OwnerTarget = Exclude<NpcInfoTarget, { kind: 'agent' }>;

export interface ChainData {
  chain: StandingChain;
  standings: readonly CharacterStandingEntry[];
  skills: StandingSkills | null;
  corporationFactions: ReadonlyMap<number, number>;
  agent: NpcAgent | null;
  corporationId: number | null;
  nameOf: (link: ChainLink) => string;
  corporationName: (corporationId: number) => string;
}

export async function loadChainData(
  characterId: number,
  target: NpcInfoTarget
): Promise<ChainData | null> {
  const [result, skills, corporationFactions, index] = await Promise.all([
    loadCharacterStandingsResult(characterId),
    loadStandingSkills(characterId).catch(() => null),
    loadCorporationFactions(),
    loadNpcCorporations(),
  ]);
  if (!result.available) return null;
  const social = skills?.social ?? NO_SOCIAL_SKILLS;
  let agent: NpcAgent | null = null;
  let chain: StandingChain;
  if (target.kind === 'agent') {
    const found = await chainForAgent(result.entries, target.id, social);
    if (!found) return null;
    ({ agent, chain } = found);
  } else {
    chain = buildChain(target, result.entries, corporationFactions, social);
  }
  const corporationName = (id: number) => index.corporationById(id)?.name ?? `#${id}`;
  return {
    chain,
    standings: result.entries,
    skills,
    corporationFactions,
    agent,
    corporationId: target.kind === 'corporation' ? target.id : (agent?.corporationId ?? null),
    nameOf: (link) =>
      link.kind === 'agent'
        ? (agent?.name ?? `#${link.id}`)
        : link.kind === 'faction'
          ? (index.factionName(link.id) ?? `#${link.id}`)
          : corporationName(link.id),
    corporationName,
  };
}

export async function loadStationsModel(
  target: OwnerTarget,
  data: ChainData
): Promise<StationsModel> {
  return stationsModel({
    kind: target.kind,
    id: target.id,
    stations: await loadNpcStations(),
    chain: data.chain,
    standings: data.standings,
    skills: data.skills,
  });
}

export async function loadWhereRows(
  characterId: number | null,
  target: NpcInfoTarget
): Promise<WhereRow[]> {
  const jumpsTo = async (systemId: number) =>
    characterId === null
      ? null
      : ((await jumpsFromCurrent(characterId, [systemId])).get(systemId) ?? null);

  if (target.kind === 'corporation') {
    const [index, stations] = await Promise.all([loadNpcCorporations(), loadNpcStations()]);
    return corporationWhereRows({
      corporation: index.corporationById(target.id),
      stations,
      nearest:
        characterId === null
          ? null
          : await loadNearestStation(characterId, target.id).catch(() => null),
    });
  }
  if (target.kind === 'faction') {
    const [factions, index] = await Promise.all([loadFactions(), loadNpcCorporations()]);
    const faction = factions?.find((candidate) => candidate.faction_id === target.id);
    const capitalId = faction?.solar_system_id;
    const militiaId = faction?.militia_corporation_id;
    return factionWhereRows({
      faction,
      capitalName:
        capitalId === undefined ? null : ((await lookupSolarSystem(capitalId))?.name ?? null),
      capitalJumps: capitalId === undefined ? null : await jumpsTo(capitalId),
      militiaName:
        militiaId === undefined ? null : (index.corporationById(militiaId)?.name ?? null),
    });
  }
  const [agents, stations] = await Promise.all([loadAgents(), loadNpcStations()]);
  const agent = agents.agentById(target.id);
  if (!agent) return [];
  const station = stations.find((candidate) => candidate.id === agent.stationId);
  return agentWhereRows({
    level: agent.level,
    divisionName: agents.divisionName(agent.divisionId),
    station,
    jumps: station ? await jumpsTo(station.systemId) : null,
  });
}

export interface FactionFacts {
  name: string;
  description: string;
}

export async function loadFactionFacts(factionId: number): Promise<FactionFacts | null> {
  const [factions, index] = await Promise.all([
    loadFactions(),
    loadNpcCorporations().catch(() => null),
  ]);
  const faction = factions?.find((candidate) => candidate.faction_id === factionId);
  if (faction) return { name: faction.name, description: faction.description };
  const name = index?.factionName(factionId);
  return name === undefined ? null : { name, description: '' };
}

export interface CorporationFaction {
  id: number;
  name: string;
}

export async function loadCorporationFaction(
  corporationId: number
): Promise<CorporationFaction | null> {
  const [factions, index] = await Promise.all([loadCorporationFactions(), loadNpcCorporations()]);
  const id = factions.get(corporationId);
  return id === undefined ? null : { id, name: index.factionName(id) ?? `#${id}` };
}

export type KnownRows =
  { kind: 'agents'; rows: KnownAgentRow[] } | { kind: 'corporations'; rows: KnownCorporationRow[] };

async function loadAgentSystems(systemIds: readonly number[]): Promise<Map<number, AgentSystem>> {
  const found = await Promise.all(systemIds.map((id) => lookupSolarSystem(id)));
  const systems = new Map<number, AgentSystem>();
  for (const system of found) {
    if (system) systems.set(system.id, { name: system.name, security: system.security });
  }
  return systems;
}

export async function loadKnownRows(
  characterId: number,
  target: OwnerTarget,
  data: ChainData
): Promise<KnownRows> {
  if (target.kind === 'faction') {
    return {
      kind: 'corporations',
      rows: knownCorporationRows({
        factionId: target.id,
        corporationFactions: data.corporationFactions,
        standings: data.standings,
        social: data.skills?.social ?? NO_SOCIAL_SKILLS,
        criminal: isCriminalFaction(target.id),
        nameOf: data.corporationName,
      }),
    };
  }
  const [known, stations] = await Promise.all([
    agentsOfCorporation(target.id, data.standings, data.skills?.social ?? NO_SOCIAL_SKILLS),
    loadNpcStations(),
  ]);
  const stationSystems = new Map(stations.map((station) => [station.id, station.systemId]));
  const systemIds = [
    ...new Set(known.flatMap(({ agent }) => stationSystems.get(agent.stationId) ?? [])),
  ];
  const [jumps, systems] = await Promise.all([
    jumpsFromCurrent(characterId, systemIds),
    loadAgentSystems(systemIds),
  ]);
  return {
    kind: 'agents',
    rows: knownAgentRows(known, stations, jumps, systems, data.skills !== null),
  };
}

export async function loadLoyalty(
  characterId: number,
  corporationId: number
): Promise<LoyaltyModel | null> {
  const [balances, stores] = await Promise.all([
    loadCharacterLoyaltyPoints(characterId),
    loadLpCorporations().catch(() => []),
  ]);
  if (!balances.cached) return null;
  return loyaltyModel(
    corporationId,
    new Map(balances.cached.data.map((entry) => [entry.corporation_id, entry.loyalty_points])),
    stores
  );
}
