import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  AGENT_LEVELS,
  AGENT_LEVEL_STANDING,
  NO_SOCIAL_SKILLS,
  agentAccess,
  asAgentLevel,
  bestLink,
  blockingLink,
  brokerFeeComparison,
  nextLevel,
  reprocessingTaxPct,
  standingsFromEsi,
  type AgentLevel,
  type ChainLink,
  type SocialSkillLevels,
  type StandingChain,
} from '@/engine/standings';
import type { UniverseFaction } from '@/esi/endpoints';
import type { NearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import { stationReprocessingTake } from '@/sde/npcStations';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';
import type { NpcCorporationEntry } from '@/sde/types';
import type { KnownAgent } from '../agentStandings';
import { corporationsOfFaction } from '../corporationFactions';
import type { StandingSkills } from '../standingSkills';
import { corporationStationFacts, factionStationFacts } from '../stationFacts';

export interface StandingRow {
  link: ChainLink;
  name: string;
  highest: boolean;
}

export type StandingNote =
  { kind: 'highest'; name: string } | { kind: 'blocked'; name: string; effective: number };

export interface StandingModel {
  rows: StandingRow[];
  skillsKnown: boolean;
  note: StandingNote | null;
}

export function standingModel(
  chain: StandingChain,
  nameOf: (link: ChainLink) => string,
  skillsKnown: boolean
): StandingModel {
  const best = bestLink(chain);
  const several = chain.links.length > 1;
  const blocking = blockingLink(chain);
  let note: StandingNote | null = null;
  if (blocking) note = { kind: 'blocked', name: nameOf(blocking), effective: blocking.effective };
  else if (several && best) note = { kind: 'highest', name: nameOf(best) };
  return {
    rows: chain.links.map((link) => ({
      link,
      name: nameOf(link),
      highest: several && link === best,
    })),
    skillsKnown,
    note,
  };
}

export interface AccessSegment {
  level: AgentLevel;
  needs: number | null;
  open: boolean;
  own: boolean;
}

export type AccessVerdict =
  | { kind: 'next'; level: AgentLevel; needs: number; short: number }
  | { kind: 'all' }
  | { kind: 'blocked' }
  | {
      kind: 'agent';
      level: AgentLevel;
      open: boolean;
      needs: number | null;
      have: number;
      short: number;
      blockedBy: { name: string; effective: number } | null;
    };

export interface AccessModel {
  segments: AccessSegment[];
  verdict: AccessVerdict;
}

export function accessModel(
  chain: StandingChain,
  agentLevel: AgentLevel | null,
  nameOf: (link: ChainLink) => string
): AccessModel {
  const segments = AGENT_LEVELS.map((level) => ({
    level,
    needs: AGENT_LEVEL_STANDING[level],
    open: agentAccess(chain, level).open,
    own: level === agentLevel,
  }));
  if (agentLevel !== null) {
    const access = agentAccess(chain, agentLevel);
    return {
      segments,
      verdict: {
        kind: 'agent',
        level: agentLevel,
        open: access.open,
        needs: access.needs,
        have: bestLink(chain)?.effective ?? 0,
        short: access.short,
        blockedBy: access.blockedBy
          ? { name: nameOf(access.blockedBy), effective: access.blockedBy.effective }
          : null,
      },
    };
  }
  if (blockingLink(chain) !== null) return { segments, verdict: { kind: 'blocked' } };
  const next = nextLevel(chain);
  return {
    segments,
    verdict: next ? { kind: 'next', ...next } : { kind: 'all' },
  };
}

export interface StationFeeRow {
  kind: 'broker' | 'reprocessing';
  place: string | null;
  atZeroPct: number;
  atYoursPct: number;
  savingPct: number;
}

export interface StationsModel {
  rows: StationFeeRow[];
  brokerRelationsLevel: number | null;
}

export interface StationsInput {
  kind: 'corporation' | 'faction';
  id: number;
  stations: readonly NpcStationEntry[];
  chain: StandingChain;
  standings: readonly CharacterStandingEntry[];
  skills: StandingSkills | null;
}

function usualTake(stations: readonly NpcStationEntry[]): number {
  const counts = new Map<number, number>();
  for (const station of stations) {
    const take = stationReprocessingTake(station);
    counts.set(take, (counts.get(take) ?? 0) + 1);
  }
  return [...counts].sort(
    ([takeA, countA], [takeB, countB]) => countB - countA || takeA - takeB
  )[0]![0];
}

function reprocessingRow(
  takeFraction: number,
  effectiveStanding: number,
  place: string | null
): StationFeeRow {
  const atZeroPct = takeFraction * 100;
  const atYoursPct = reprocessingTaxPct(atZeroPct, effectiveStanding);
  return { kind: 'reprocessing', place, atZeroPct, atYoursPct, savingPct: atZeroPct - atYoursPct };
}

export function stationsModel(input: StationsInput): StationsModel {
  const { chain, standings, skills } = input;
  const social = skills?.social ?? NO_SOCIAL_SKILLS;
  const standingOf = (id: number) => {
    const entry = standings.find((candidate) => candidate.from_id === id);
    return entry
      ? standingsFromEsi(entry.standing, chain.criminal, social)
      : { base: 0, effective: 0 };
  };
  const rows: StationFeeRow[] = [];
  const broker = (place: string, factionBase: number, corporationBase: number) => {
    if (!skills) return;
    const fee = brokerFeeComparison(skills.brokerRelationsLevel, factionBase, corporationBase);
    rows.push({ kind: 'broker', place, ...fee });
  };

  if (input.kind === 'corporation') {
    const facts = corporationStationFacts(input.id, input.stations);
    const hub = facts.tradeHubs[0];
    const corporation = chain.links.find((link) => link.kind === 'corporation');
    if (hub && corporation) {
      const factionBase = chain.links.find((link) => link.kind === 'faction')?.base ?? 0;
      broker(hub.stationLabel, factionBase, corporation.base);
    }
    if (facts.stations.length > 0 && corporation) {
      const hubStation = hub && facts.stations.find((station) => station.id === hub.stationId);
      const take = hubStation ? stationReprocessingTake(hubStation) : usualTake(facts.stations);
      rows.push(reprocessingRow(take, corporation.effective, null));
    }
  } else {
    const facts = factionStationFacts(input.id, input.stations);
    for (const hub of facts.tradeHubs) {
      const owner = standingOf(hub.ownerCorporationId);
      broker(hub.stationLabel, standingOf(input.id).base, owner.base);
      const hubStation = facts.stations.find((station) => station.id === hub.stationId);
      if (!hubStation) continue;
      rows.push(
        reprocessingRow(stationReprocessingTake(hubStation), owner.effective, hub.stationLabel)
      );
    }
  }
  return {
    rows,
    brokerRelationsLevel:
      skills && rows.some((row) => row.kind === 'broker') ? skills.brokerRelationsLevel : null,
  };
}

export type WhereRow =
  | { kind: 'headquarters'; stationId: number; name: string }
  | { kind: 'capital'; systemId: number; name: string | null; jumps: number | null }
  | { kind: 'stations'; stations: number; systems: number }
  | { kind: 'militia'; corporationId: number; name: string | null }
  | { kind: 'nearest'; stationId: number; name: string; systemId: number; jumps: number }
  | { kind: 'station'; stationId: number; name: string; systemId: number; jumps: number | null }
  | { kind: 'agent'; level: number; divisionName: string | undefined };

export function corporationWhereRows(input: {
  corporation: NpcCorporationEntry | undefined;
  stations: readonly NpcStationEntry[];
  nearest: NearestNpcStation | null;
}): WhereRow[] {
  const { corporation, stations, nearest } = input;
  const rows: WhereRow[] = [];
  const headquarters =
    corporation?.hqStationId === undefined
      ? undefined
      : stations.find((station) => station.id === corporation.hqStationId);
  if (headquarters) {
    rows.push({ kind: 'headquarters', stationId: headquarters.id, name: headquarters.name });
  }
  if (corporation) {
    const facts = corporationStationFacts(corporation.id, stations);
    if (facts.stationCount > 0) {
      rows.push({
        kind: 'stations',
        stations: facts.stationCount,
        systems: facts.systemIds.length,
      });
    }
  }
  if (nearest) {
    rows.push({
      kind: 'nearest',
      stationId: nearest.stationId,
      name: nearest.stationName,
      systemId: nearest.systemId,
      jumps: nearest.jumps,
    });
  }
  return rows;
}

export function factionWhereRows(input: {
  faction: UniverseFaction | undefined;
  capitalName: string | null;
  capitalJumps: number | null;
  militiaName: string | null;
}): WhereRow[] {
  const { faction } = input;
  if (!faction) return [];
  const rows: WhereRow[] = [];
  if (faction.solar_system_id !== undefined) {
    rows.push({
      kind: 'capital',
      systemId: faction.solar_system_id,
      name: input.capitalName,
      jumps: input.capitalJumps,
    });
  }
  if (faction.station_count > 0) {
    rows.push({
      kind: 'stations',
      stations: faction.station_count,
      systems: faction.station_system_count,
    });
  }
  if (faction.militia_corporation_id !== undefined) {
    rows.push({
      kind: 'militia',
      corporationId: faction.militia_corporation_id,
      name: input.militiaName,
    });
  }
  return rows;
}

export function agentWhereRows(input: {
  level: number;
  divisionName: string | undefined;
  station: NpcStationEntry | undefined;
  jumps: number | null;
}): WhereRow[] {
  const { station } = input;
  return [
    ...(station
      ? [
          {
            kind: 'station',
            stationId: station.id,
            name: station.name,
            systemId: station.systemId,
            jumps: input.jumps,
          } as const,
        ]
      : []),
    { kind: 'agent', level: input.level, divisionName: input.divisionName },
  ];
}

export interface KnownAgentRow {
  agentId: number;
  name: string;
  level: number;
  divisionName: string | undefined;
  effective: number;
  hasStanding: boolean;
  isLocator: boolean;
  access: { open: boolean; needs: number | null } | null;
  place: {
    systemId: number;
    systemName: string | null;
    security: number | null;
    jumps: number | null;
  } | null;
}

export interface AgentSystem {
  name: string;
  security: number;
}

export function knownAgentRows(
  known: readonly KnownAgent[],
  stations: readonly NpcStationEntry[],
  jumps: ReadonlyMap<number, number>,
  systems: ReadonlyMap<number, AgentSystem>,
  skillsKnown: boolean
): KnownAgentRow[] {
  const systemOf = new Map(stations.map((station) => [station.id, station.systemId]));
  return known.map(({ agent, divisionName, effective, hasStanding, chain }) => {
    const systemId = systemOf.get(agent.stationId);
    const level = asAgentLevel(agent.level);
    const access = skillsKnown && level !== null ? agentAccess(chain, level) : null;
    return {
      agentId: agent.id,
      name: agent.name,
      level: agent.level,
      divisionName,
      effective,
      hasStanding,
      isLocator: agent.isLocator,
      access: access && { open: access.open, needs: access.needs },
      place:
        systemId === undefined
          ? null
          : {
              systemId,
              systemName: systems.get(systemId)?.name ?? null,
              security: systems.get(systemId)?.security ?? null,
              jumps: jumps.get(systemId) ?? null,
            },
    };
  });
}

export interface AgentLevelGroup {
  level: number;
  rows: KnownAgentRow[];
}

export function groupAgentRows(rows: readonly KnownAgentRow[]): AgentLevelGroup[] {
  const byLevel = new Map<number, KnownAgentRow[]>();
  for (const row of rows) {
    const group = byLevel.get(row.level) ?? [];
    group.push(row);
    byLevel.set(row.level, group);
  }
  return [...byLevel]
    .sort(([a], [b]) => b - a)
    .map(([level, group]) => ({
      level,
      rows: group.sort(
        (a, b) =>
          (a.place?.jumps ?? Infinity) - (b.place?.jumps ?? Infinity) ||
          (a.divisionName ?? '').localeCompare(b.divisionName ?? '') ||
          a.name.localeCompare(b.name) ||
          a.agentId - b.agentId
      ),
    }));
}

export interface KnownCorporationRow {
  corporationId: number;
  name: string;
  effective: number;
}

export function knownCorporationRows(input: {
  factionId: number;
  corporationFactions: ReadonlyMap<number, number>;
  standings: readonly CharacterStandingEntry[];
  social: SocialSkillLevels;
  criminal: boolean;
  nameOf: (corporationId: number) => string;
}): KnownCorporationRow[] {
  const rows: KnownCorporationRow[] = [];
  for (const corporationId of corporationsOfFaction(input.corporationFactions, input.factionId)) {
    const entry = input.standings.find((candidate) => candidate.from_id === corporationId);
    if (!entry) continue;
    rows.push({
      corporationId,
      name: input.nameOf(corporationId),
      effective: standingsFromEsi(entry.standing, input.criminal, input.social).effective,
    });
  }
  return rows.sort(
    (a, b) =>
      b.effective - a.effective || a.name.localeCompare(b.name) || a.corporationId - b.corporationId
  );
}

export interface LoyaltyModel {
  balance: number;
  hasStore: boolean;
}

export function loyaltyModel(
  corporationId: number,
  balances: ReadonlyMap<number, number>,
  storeCorporations: readonly LpCorporationEntry[]
): LoyaltyModel | null {
  const balance = balances.get(corporationId) ?? 0;
  const hasStore = storeCorporations.some((corporation) => corporation.id === corporationId);
  return hasStore || balance > 0 ? { balance, hasStore } : null;
}
