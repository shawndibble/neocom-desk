/**
 * The info modal's view models for an NPC faction, corporation or agent: all
 * the decisions (which rows, which numbers, which sentence applies) as pure
 * functions over loaded data, so the components only lay them out. The rules
 * are in `@/engine/standings`; the loaders in `@/features/standings`.
 */
import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  AGENT_LEVELS,
  AGENT_LEVEL_STANDING,
  NO_SOCIAL_SKILLS,
  agentAccess,
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

// --- Your standing ---

export interface StandingRow {
  link: ChainLink;
  name: string;
  /** The link the game uses: shown bold, and only where there is more than one to choose from. */
  highest: boolean;
}

export type StandingNote =
  /** Agents use the highest of the chain. */
  | { kind: 'highest'; name: string }
  /** A link at -2.0 or lower: level 2+ agents are closed whatever the others say. */
  | { kind: 'blocked'; name: string; effective: number };

export interface StandingModel {
  rows: StandingRow[];
  /** The pilot's skills are known, so a tooltip can say what they add to the base. */
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

// --- Agent access ---

export interface AccessSegment {
  level: AgentLevel;
  /** The standing the level needs; null for level 1. */
  needs: number | null;
  open: boolean;
  /** The agent's own level (an agent's modal outlines it). */
  own: boolean;
}

export type AccessVerdict =
  /** A faction or corporation: what the next level up takes. */
  | { kind: 'next'; level: AgentLevel; needs: number; short: number }
  | { kind: 'all' }
  /** A link at -2.0 or lower closes level 2 and up. */
  | { kind: 'blocked' }
  /** One agent: whether you can use it. */
  | {
      kind: 'agent';
      level: AgentLevel;
      open: boolean;
      needs: number | null;
      /** The best standing in the chain. */
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

// --- At their stations ---

export interface StationFeeRow {
  kind: 'broker' | 'reprocessing';
  /** The Trade Hub it is priced at ("Jita 4-4"); null for a corporation-wide figure. */
  place: string | null;
  atZeroPct: number;
  atYoursPct: number;
  /** `atZeroPct - atYoursPct`: positive saves, negative costs. */
  savingPct: number;
}

export interface StationsModel {
  rows: StationFeeRow[];
  /** Broker Relations level the broker rows used; null when there is no broker row. */
  brokerRelationsLevel: number | null;
}

export interface StationsInput {
  kind: 'corporation' | 'faction';
  id: number;
  /** The NPC station snapshot. */
  stations: readonly NpcStationEntry[];
  chain: StandingChain;
  standings: readonly CharacterStandingEntry[];
  /** Null when the pilot's skills are unknown: no broker row, standings read as base. */
  skills: StandingSkills | null;
}

/** The most common take among the stations; a tie goes to the lower take (the kinder figure to quote). */
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

/**
 * Broker fee (base standings, the pilot's real Broker Relations) and
 * reprocessing tax (effective standing of the station-owner corporation) at
 * the stations the faction or corporation owns. A corporation quotes the
 * Trade Hub it owns, if any; a faction one pair per hub, since its
 * corporations' standings differ. A corporation's reprocessing figure uses
 * its hub station's take where it owns a hub, else the take most of its
 * stations share. Nothing for one that owns no station the snapshot knows.
 */
export function stationsModel(input: StationsInput): StationsModel {
  const { chain, standings, skills } = input;
  const social = skills?.social ?? NO_SOCIAL_SKILLS;
  // Through `standingsFromEsi`, so the base is the base whichever way ESI's number reads.
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
      // A Trade Hub's station is always in the snapshot it was found in.
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

// --- Where ---

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
  // Not every headquarters is in the station snapshot (Doomheim's is not): no row then.
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

// --- Agents / Corporations you know ---

export interface KnownAgentRow {
  agentId: number;
  name: string;
  level: number;
  divisionName: string | undefined;
  effective: number;
  /** Where the agent sits and how far; null when its station is not in the snapshot. */
  place: { systemId: number; jumps: number | null } | null;
}

/** `known` is best first already (`agentsOfCorporation`); the rows keep that order. */
export function knownAgentRows(
  known: readonly KnownAgent[],
  stations: readonly NpcStationEntry[],
  jumps: ReadonlyMap<number, number>
): KnownAgentRow[] {
  const systemOf = new Map(stations.map((station) => [station.id, station.systemId]));
  return known.map(({ agent, divisionName, effective }) => {
    const systemId = systemOf.get(agent.stationId);
    return {
      agentId: agent.id,
      name: agent.name,
      level: agent.level,
      divisionName,
      effective,
      place: systemId === undefined ? null : { systemId, jumps: jumps.get(systemId) ?? null },
    };
  });
}

export interface KnownCorporationRow {
  corporationId: number;
  name: string;
  effective: number;
}

/** The faction's corporations the pilot holds a standing with, best effective standing first. */
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

// --- Loyalty points ---

export interface LoyaltyModel {
  balance: number;
  /** An LP store the corporation runs: the page to link to exists. */
  hasStore: boolean;
}

/** `null` for a corporation with no LP store and none held: there is nothing to say about it. */
export function loyaltyModel(
  corporationId: number,
  balances: ReadonlyMap<number, number>,
  storeCorporations: readonly LpCorporationEntry[]
): LoyaltyModel | null {
  const balance = balances.get(corporationId) ?? 0;
  const hasStore = storeCorporations.some((corporation) => corporation.id === corporationId);
  return hasStore || balance > 0 ? { balance, hasStore } : null;
}
