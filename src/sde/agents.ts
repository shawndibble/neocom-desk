import { loadAgentsFile } from './loadSde';
import type { AgentsFile } from './types';
import { memoizeAsync } from '@/lib/memoizeAsync';

export interface NpcAgent {
  id: number;
  name: string;
  level: number;
  divisionId: number;
  corporationId: number;
  stationId: number;
  isLocator: boolean;
}

export interface AgentIndex {
  agentById(agentId: number): NpcAgent | undefined;
  agentsByCorporation(corporationId: number): readonly NpcAgent[];
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

export const loadAgents = memoizeAsync(async () => buildAgentIndex(await loadAgentsFile()));
