import type { CharacterStandingEntry } from '@/engine/market/standings';
import {
  NO_SOCIAL_SKILLS,
  agentAccess,
  asAgentLevel,
  highestAccessLevel,
  type AgentAccess,
  type AgentLevel,
  type ChainKind,
  type SocialSkillLevels,
} from '@/engine/standings';
import { nearestStationWhere } from '@/features/loyalty/nearestNpcStation';
import { buildChain, type ChainTarget } from '@/features/standings/buildChain';
import { TRADE_HUBS } from '@/market/hubs';
import type { NpcAgent } from '@/sde/agents';
import { fixed2 } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { NpcStationEntry } from '@/sde/marketTypes';

export type NpcStandingKind = 'faction' | 'corp' | 'agent';

export const NPC_STANDING_KINDS: readonly NpcStandingKind[] = ['faction', 'corp', 'agent'];

export interface NpcBelongsTo {
  name: string;
  level?: AgentLevel;
  division?: string;
}

export interface NpcNearestPlace {
  stationId: number;
  systemId: number;
  jumps: number;
}

export interface NpcStandingRow {
  id: number;
  name: string;
  kind: NpcStandingKind;
  base: number;
  effective: number | null;
  belongsTo: NpcBelongsTo | null;
  accessLevel: AgentLevel | null;
  agentAccess: AgentAccess | null;
  nearest: NpcNearestPlace | null;
  usedForFees: boolean;
}

export interface NpcCorporationLookup {
  factions: ReadonlyMap<number, number>;
  corporationName(corporationId: number): string | undefined;
  factionName(factionId: number): string | undefined;
}

export interface NpcStandingsReference {
  skills: SocialSkillLevels | null;
  corporations: NpcCorporationLookup | null;
  agents: {
    agentById(agentId: number): NpcAgent | undefined;
    divisionName(divisionId: number): string | undefined;
  } | null;
  stations: readonly NpcStationEntry[] | null;
  jumps: ReadonlyMap<number, number> | null;
}

export const NO_NPC_STANDINGS_REFERENCE: NpcStandingsReference = {
  skills: null,
  corporations: null,
  agents: null,
  stations: null,
  jumps: null,
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

export function feeOwnerIds(): ReadonlySet<number> {
  return new Set(TRADE_HUBS.flatMap((hub) => [hub.ownerCorporationId, hub.ownerFactionId]));
}

export function buildNpcStandingRows(
  entries: readonly CharacterStandingEntry[],
  names: ReadonlyMap<number, string>,
  feeOwners: ReadonlySet<number>,
  reference: NpcStandingsReference
): NpcStandingRow[] {
  const { skills, corporations, agents, stations, jumps } = reference;
  const stationById = new Map((stations ?? []).map((station) => [station.id, station]));
  return entries
    .map((entry): NpcStandingRow => {
      const kind = KIND[entry.from_type];
      const agent = kind === 'agent' ? agents?.agentById(entry.from_id) : undefined;
      const agentLevel = agent ? asAgentLevel(agent.level) : null;
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
        base: own?.base ?? entry.standing,
        effective: skills && own ? own.effective : null,
        belongsTo: belongsTo(kind, entry.from_id, agent, reference),
        accessLevel: chain && skills ? highestAccessLevel(chain) : null,
        agentAccess: chain && skills && agentLevel ? agentAccess(chain, agentLevel) : null,
        nearest: nearestPlace(kind, entry.from_id, agent, stations, stationById, jumps),
        usedForFees: kind !== 'agent' && feeOwners.has(entry.from_id),
      };
    })
    .sort((a, b) => b.base - a.base);
}

function nearestPlace(
  kind: NpcStandingKind,
  id: number,
  agent: NpcAgent | undefined,
  stations: readonly NpcStationEntry[] | null,
  stationById: ReadonlyMap<number, NpcStationEntry>,
  jumps: ReadonlyMap<number, number> | null
): NpcNearestPlace | null {
  if (!stations || !jumps) return null;
  if (kind === 'agent') {
    const station = agent && stationById.get(agent.stationId);
    const count = station && jumps.get(station.systemId);
    return station && count !== undefined
      ? { stationId: station.id, systemId: station.systemId, jumps: count }
      : null;
  }
  const nearest = nearestStationWhere(stations, jumps, (station) =>
    kind === 'corp' ? station.ownerCorporationId === id : station.ownerFactionId === id
  );
  return nearest
    ? { stationId: nearest.stationId, systemId: nearest.systemId, jumps: nearest.jumps }
    : null;
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
      level: asAgentLevel(agent.level) ?? undefined,
      division: agents?.divisionName(agent.divisionId),
    };
  }
  return null;
}

export interface NpcStandingsFilter {
  text: string;
  kinds: ReadonlySet<NpcStandingKind>;
  minAccess: number | null;
  feesOnly: boolean;
}

export const EVERY_NPC_STANDING: NpcStandingsFilter = {
  text: '',
  kinds: new Set(NPC_STANDING_KINDS),
  minAccess: null,
  feesOnly: false,
};

export function activeNpcStandingsFilters(
  { kinds, minAccess, feesOnly }: NpcStandingsFilter,
  t: Translate
): ActiveFilter<NpcStandingsFilter>[] {
  const active: ActiveFilter<NpcStandingsFilter>[] = [];
  if (kinds.size !== NPC_STANDING_KINDS.length)
    active.push({
      label: t('contacts.standings.typeFilter'),
      value: summarizeFilterValues(
        NPC_STANDING_KINDS.filter((kind) => kinds.has(kind)).map((kind) =>
          t(`contacts.standingsKind.${kind}`)
        ),
        t
      ),
      clear: (filter) => ({ ...filter, kinds: EVERY_NPC_STANDING.kinds }),
    });
  if (minAccess !== null)
    active.push({
      label: t('contacts.standings.accessFilter'),
      value: t('contacts.standings.accessAtLeastShort', { level: minAccess }),
      clear: (filter) => ({ ...filter, minAccess: null }),
    });
  if (feesOnly)
    active.push({
      label: t('contacts.standings.feesFilter'),
      value: t('contacts.standings.usedForFees'),
      clear: (filter) => ({ ...filter, feesOnly: false }),
    });
  return active;
}

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

export function npcAccessLevel(row: NpcStandingRow): number | null {
  if (row.kind !== 'agent') return row.accessLevel;
  if (!row.agentAccess) return null;
  return row.agentAccess.open ? (row.belongsTo?.level ?? null) : 0;
}

export function npcAccessSortValue(row: NpcStandingRow): number | undefined {
  if (row.kind === 'agent' && row.agentAccess?.open) return row.belongsTo?.level ?? 1;
  return npcAccessLevel(row) ?? undefined;
}

export function npcAgentAccessText(t: Translate, row: NpcStandingRow): string | null {
  const access = row.kind === 'agent' ? row.agentAccess : null;
  if (!access) return null;
  if (access.open) return t('contacts.standings.accessOpen');
  if (access.blockedBy) return t('contacts.standings.accessBlocked');
  return access.needs === null
    ? null
    : t('contacts.standings.accessNeeds', { standing: fixed2(access.needs) });
}
