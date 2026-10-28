/**
 * `public/data/agents.json` read as lookups: an agent by id, a corporation's
 * agents, a division's name. ESI has no agent list and says nothing of an
 * agent's level, division or station, so the Contacts standings view and the
 * NPC agent card read them here.
 *
 * Only the basic (level 1-5 mission) agents are in the file, so an agent id
 * that `agentById` does not know may be a storyline, faction warfare or
 * research agent rather than an unknown one. Indexed once per session.
 */
import { loadAgentsFile } from './loadSde';
import type { AgentsFile } from './types';
import { memoizeAsync } from '@/lib/memoizeAsync';

export interface NpcAgent {
  /** The agent's character id (3,000,000 to 3,999,999). */
  id: number;
  name: string;
  /** 1-5. */
  level: number;
  divisionId: number;
  corporationId: number;
  /** The NPC station the agent sits in. */
  stationId: number;
  isLocator: boolean;
}

export interface AgentIndex {
  agentById(agentId: number): NpcAgent | undefined;
  /** The corporation's agents, ordered by id; empty for a corporation with none. */
  agentsByCorporation(corporationId: number): readonly NpcAgent[];
  /** "Security", "Distribution", "Mining"; undefined for a division no baked agent works in. */
  divisionName(divisionId: number): string | undefined;
}

const NO_AGENTS: readonly NpcAgent[] = [];

export function buildAgentIndex(file: AgentsFile): AgentIndex {
  const byId = new Map<number, NpcAgent>();
  const byCorporation = new Map<number, NpcAgent[]>();
  for (const [id, name, level, divisionId, corporationId, stationId, isLocator] of file.agents) {
    const agent: NpcAgent = {
      id,
      name,
      level,
      divisionId,
      corporationId,
      stationId,
      isLocator: isLocator === 1,
    };
    byId.set(id, agent);
    const corporationAgents = byCorporation.get(corporationId);
    if (corporationAgents) corporationAgents.push(agent);
    else byCorporation.set(corporationId, [agent]);
  }
  return {
    agentById: (agentId) => byId.get(agentId),
    agentsByCorporation: (corporationId) => byCorporation.get(corporationId) ?? NO_AGENTS,
    divisionName: (divisionId) => file.divisions[divisionId],
  };
}

/**
 * The agent index, fetched on first use and memoized for the session. Rejects
 * when the file cannot be read (offline on a first visit: it is not precached);
 * a failure is not memoized, so a later call retries.
 */
export const loadAgents = memoizeAsync(async () => buildAgentIndex(await loadAgentsFile()));
