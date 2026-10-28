/**
 * What each block of the NPC info modal reads. One loader per block, so a slow
 * or failed read costs that block alone. Loaders that need the pilot take a
 * Character id; the modal never calls them without one.
 */
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
  type KnownAgentRow,
  type KnownCorporationRow,
  type LoyaltyModel,
  type StationsModel,
  type WhereRow,
} from './npcInfoModel';

/** What a row of the Standings table or a link opens: an agent's id is its character id. */
export type NpcInfoTarget =
  | { kind: 'faction'; id: number }
  | { kind: 'corporation'; id: number }
  | { kind: 'agent'; id: number };

/** A target that owns stations and has agents or corporations under it. */
export type OwnerTarget = Exclude<NpcInfoTarget, { kind: 'agent' }>;

export interface ChainData {
  chain: StandingChain;
  /** The standings ESI reported, for the blocks that look up other entities. */
  standings: readonly CharacterStandingEntry[];
  /** Null when the pilot's skills could not be read: effective then equals base. */
  skills: StandingSkills | null;
  corporationFactions: ReadonlyMap<number, number>;
  /** The agent, when the target is one the baked agent file holds. */
  agent: NpcAgent | null;
  /** The corporation an agent or corporation target belongs to. */
  corporationId: number | null;
  nameOf: (link: ChainLink) => string;
  corporationName: (corporationId: number) => string;
}

/**
 * The chain of standings that govern the target. `null` when there is nothing
 * honest to show: no standings readable (no scope, or ESI and the cache both
 * silent), or an agent the baked file does not hold (a storyline, Faction
 * Warfare or research agent). Rejects when a data file cannot be read.
 */
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

/** Broker fee and reprocessing tax; empty rows for an owner of no station the snapshot knows. */
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

/**
 * The faction's name and description from ESI's faction list; when that could
 * not be read, the name alone from the baked NPC-corporation file. Null when
 * neither knows the id.
 */
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

/** The faction an NPC corporation belongs to (ESI's corporation record rarely says); null when it has none. */
export async function loadCorporationFaction(
  corporationId: number
): Promise<CorporationFaction | null> {
  const [factions, index] = await Promise.all([loadCorporationFactions(), loadNpcCorporations()]);
  const id = factions.get(corporationId);
  return id === undefined ? null : { id, name: index.factionName(id) ?? `#${id}` };
}

export type KnownRows =
  { kind: 'agents'; rows: KnownAgentRow[] } | { kind: 'corporations'; rows: KnownCorporationRow[] };

/** A corporation's agents or a faction's corporations the pilot holds a standing with. */
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
  const jumps = await jumpsFromCurrent(characterId, systemIds);
  return { kind: 'agents', rows: knownAgentRows(known, stations, jumps) };
}

/** `null` for a corporation with neither a store nor points, or when the balances are unreadable. */
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
