import type { CharacterStandingEntry } from '@/engine/market/standings';
import type { SocialSkillLevels, StandingChain } from '@/engine/standings';
import { loadAgents, type NpcAgent } from '@/sde/agents';
import { buildChain } from './buildChain';
import { loadCorporationFactions } from './corporationFactions';

export interface AgentChain {
  agent: NpcAgent;
  chain: StandingChain;
}

export async function chainForAgent(
  standings: readonly CharacterStandingEntry[],
  agentId: number,
  skills: SocialSkillLevels
): Promise<AgentChain | null> {
  const [agents, corporationFactions] = await Promise.all([
    loadAgents(),
    loadCorporationFactions(),
  ]);
  const agent = agents.agentById(agentId);
  if (!agent) return null;
  const target = { kind: 'agent', id: agent.id, corporationId: agent.corporationId } as const;
  return { agent, chain: buildChain(target, standings, corporationFactions, skills) };
}

export interface KnownAgent {
  agent: NpcAgent;
  divisionName: string | undefined;
  base: number;
  effective: number;
  hasStanding: boolean;
  chain: StandingChain;
}

export async function agentsOfCorporation(
  corporationId: number,
  standings: readonly CharacterStandingEntry[],
  skills: SocialSkillLevels
): Promise<KnownAgent[]> {
  const [agents, corporationFactions] = await Promise.all([
    loadAgents(),
    loadCorporationFactions(),
  ]);
  const known = agents.agentsByCorporation(corporationId).map((agent): KnownAgent => {
    const target = { kind: 'agent', id: agent.id, corporationId } as const;
    const chain = buildChain(target, standings, corporationFactions, skills);
    const { base, effective } = chain.links.at(-1)!;
    return {
      agent,
      divisionName: agents.divisionName(agent.divisionId),
      base,
      effective,
      hasStanding: standings.some((entry) => entry.from_id === agent.id),
      chain,
    };
  });
  return known.sort((a, b) => b.effective - a.effective || a.agent.id - b.agent.id);
}
