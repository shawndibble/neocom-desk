/**
 * Row model for the Contacts page's Standings tab (issue #2859): the
 * Character's faction / corporation / agent standings, each with what it
 * belongs to, the standing the game applies (with the pilot's skills), the
 * agent levels it opens, and the ones the app applies to broker fees flagged.
 * Pure: names, standings and the reference data come in already loaded. The
 * rules are in `@/engine/standings`.
 *
 * Only Trade Hub owners are flagged: every other NPC station uses its own
 * owner, which is not enumerable up front. Agents are never a fee input.
 * The match is by id alone, as `resolveOwnerStandings` does.
 *
 * Nothing here guesses. An agent the agents data leaves out (storyline,
 * faction warfare, research...) has no known corporation or level, so it has
 * no Belongs to, no Access and no With skills. Skills that could not be read
 * leave With skills empty and Access on base standings.
 */
import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  NO_SOCIAL_SKILLS,
  agentAccess,
  highestAccessLevel,
  type AgentAccess,
  type AgentLevel,
  type ChainKind,
  type SocialSkillLevels,
} from '@/engine/standings';
import { buildChain, type ChainTarget } from '@/features/standings/buildChain';
import { TRADE_HUBS } from '@/market/hubs';
import type { NpcAgent } from '@/sde/agents';

export type NpcStandingKind = 'faction' | 'corp' | 'agent';

export const NPC_STANDING_KINDS: readonly NpcStandingKind[] = ['faction', 'corp', 'agent'];

/** What a row belongs to: a corporation's faction, an agent's corporation with its level and division. */
export interface NpcBelongsTo {
  name: string;
  /** Agents only. */
  level?: AgentLevel;
  /** Agents only; absent for a division no baked agent works in. */
  division?: string;
}

export interface NpcStandingRow {
  id: number;
  name: string;
  kind: NpcStandingKind;
  /** The standing ESI reports (assumed base: `ESI_STANDINGS_ARE_BASE`). */
  base: number;
  /** With the pilot's skills; null when skills or the row's chain are unknown. */
  effective: number | null;
  belongsTo: NpcBelongsTo | null;
  /** The highest agent level the chain's best standing opens; null when the chain is unknown. */
  accessLevel: AgentLevel | null;
  /** Agent rows only: whether this agent is open now; null for the rest and for an agent with no known level. */
  agentAccess: AgentAccess | null;
  usedForFees: boolean;
}

/** The NPC corporation data a row reads. */
export interface NpcCorporationLookup {
  /** Corporation id to faction id; a corporation without a faction is absent. */
  factions: ReadonlyMap<number, number>;
  corporationName(corporationId: number): string | undefined;
  factionName(factionId: number): string | undefined;
}

/** Everything a row reads beside the standings and names; each part is null when it could not be read. */
export interface NpcStandingsReference {
  /** The pilot's social skills; null when unknown. */
  skills: SocialSkillLevels | null;
  corporations: NpcCorporationLookup | null;
  agents: {
    agentById(agentId: number): NpcAgent | undefined;
    divisionName(divisionId: number): string | undefined;
  } | null;
}

export const NO_NPC_STANDINGS_REFERENCE: NpcStandingsReference = {
  skills: null,
  corporations: null,
  agents: null,
};

const KIND: Record<CharacterStandingEntry['from_type'], NpcStandingKind> = {
  faction: 'faction',
  npc_corp: 'corp',
  agent: 'agent',
};

const CHAIN_KIND: Record<NpcStandingKind, ChainKind> = {
  faction: 'faction',
  corp: 'corporation',
  agent: 'agent',
};

const NO_FACTIONS: ReadonlyMap<number, number> = new Map();

/** Owner corporation and faction ids of every Trade Hub. */
export function feeOwnerIds(): ReadonlySet<number> {
  return new Set(TRADE_HUBS.flatMap((hub) => [hub.ownerCorporationId, hub.ownerFactionId]));
}

/** Highest base standing first. */
export function buildNpcStandingRows(
  entries: readonly CharacterStandingEntry[],
  names: ReadonlyMap<number, string>,
  feeOwners: ReadonlySet<number>,
  reference: NpcStandingsReference
): NpcStandingRow[] {
  const { skills, corporations, agents } = reference;
  return entries
    .map((entry): NpcStandingRow => {
      const kind = KIND[entry.from_type];
      const agent = kind === 'agent' ? agents?.agentById(entry.from_id) : undefined;
      // A corporation's or agent's faction link needs the corporation data and an
      // agent's corporation needs the agents data. Without them the chain is
      // unknown, never a shorter one that would understate access.
      const target: ChainTarget | null =
        kind === 'faction'
          ? { kind: 'faction', id: entry.from_id }
          : !corporations
            ? null
            : kind === 'corp'
              ? { kind: 'corporation', id: entry.from_id }
              : agent
                ? { kind: 'agent', id: agent.id, corporationId: agent.corporationId }
                : null;
      const chain = target
        ? buildChain(
            target,
            entries,
            corporations?.factions ?? NO_FACTIONS,
            skills ?? NO_SOCIAL_SKILLS
          )
        : null;
      const own = chain?.links.find(
        (link) => link.kind === CHAIN_KIND[kind] && link.id === entry.from_id
      );
      return {
        id: entry.from_id,
        name: names.get(entry.from_id) ?? agent?.name ?? `#${entry.from_id}`,
        kind,
        base: entry.standing,
        effective: skills && own ? own.effective : null,
        belongsTo: belongsTo(kind, entry.from_id, agent, reference),
        accessLevel: chain ? highestAccessLevel(chain) : null,
        agentAccess: chain && agent ? agentAccess(chain, agent.level as AgentLevel) : null,
        usedForFees: kind !== 'agent' && feeOwners.has(entry.from_id),
      };
    })
    .sort((a, b) => b.base - a.base);
}

function belongsTo(
  kind: NpcStandingKind,
  id: number,
  agent: NpcAgent | undefined,
  { corporations, agents }: NpcStandingsReference
): NpcBelongsTo | null {
  if (kind === 'corp') {
    const factionId = corporations?.factions.get(id);
    const name = factionId === undefined ? undefined : corporations?.factionName(factionId);
    return name === undefined ? null : { name };
  }
  if (kind === 'agent' && agent) {
    return {
      name: corporations?.corporationName(agent.corporationId) ?? `#${agent.corporationId}`,
      level: agent.level as AgentLevel,
      division: agents?.divisionName(agent.divisionId),
    };
  }
  return null;
}

export interface NpcStandingsFilter {
  text: string;
  kinds: ReadonlySet<NpcStandingKind>;
  /** Keep rows whose chain opens at least this agent level; null keeps all. */
  minAccess: number | null;
  feesOnly: boolean;
}

export const EVERY_NPC_STANDING: NpcStandingsFilter = {
  text: '',
  kinds: new Set(NPC_STANDING_KINDS),
  minAccess: null,
  feesOnly: false,
};

/** Filters set away from their default; the search text is not counted (it sits outside the funnel). */
export function activeNpcStandingsFilterCount({
  kinds,
  minAccess,
  feesOnly,
}: NpcStandingsFilter): number {
  return (
    (kinds.size === NPC_STANDING_KINDS.length ? 0 : 1) +
    (minAccess === null ? 0 : 1) +
    (feesOnly ? 1 : 0)
  );
}

/** Name, what it belongs to (and an agent's division), or numeric id substring, as `filterContacts` matches. */
export function filterNpcStandingRows(
  rows: readonly NpcStandingRow[],
  { text, kinds, minAccess, feesOnly }: NpcStandingsFilter
): NpcStandingRow[] {
  const needle = text.trim().toLowerCase();
  return rows.filter(
    (row) =>
      kinds.has(row.kind) &&
      (minAccess === null || (row.accessLevel !== null && row.accessLevel >= minAccess)) &&
      (!feesOnly || row.usedForFees) &&
      (needle === '' ||
        [row.name, row.belongsTo?.name, row.belongsTo?.division].some((field) =>
          field?.toLowerCase().includes(needle)
        ) ||
        String(row.id).includes(needle))
  );
}

export function countNpcStandingRows(
  rows: readonly NpcStandingRow[]
): Record<NpcStandingKind, number> {
  const counts = { faction: 0, corp: 0, agent: 0 };
  for (const row of rows) counts[row.kind] += 1;
  return counts;
}
