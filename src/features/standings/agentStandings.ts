import type { CharacterStandingEntry } from '@/engine/market/standings';
import type { SocialSkillLevels, StandingChain } from '@/engine/standings';
import { loadAgents, type NpcAgent } from '@/sde/agents';
import { buildChain } from './buildChain';
import { loadCorporationFactions } from './corporationFactions';

export interface AgentChain {
  agent: NpcAgent;
  chain: StandingChain;
}

/**
 * An agent and the chain of standings that govern it, its corporation taken
 * from the agent file. `null` when the agent is not in that file, which holds
 * only basic agents: a storyline, Faction Warfare or research agent has no
 * chain here. Rejects when the agent or corporation files cannot be read.
 */
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
  /** "Security", "Distribution", "Mining"; undefined for a division the file does not name. */
  divisionName: string | undefined;
  /** The standing ESI reports toward the agent. */
  base: number;
  /** With the pilot's social skills. */
  effective: number;
}

/**
 * The corporation's agents the pilot holds a standing row with, best effective
 * standing first (ties by agent id). Rejects when the agent or corporation
 * files cannot be read.
 */
export async function agentsOfCorporation(
  corporationId: number,
  standings: readonly CharacterStandingEntry[],
  skills: SocialSkillLevels
): Promise<KnownAgent[]> {
  const [agents, corporationFactions] = await Promise.all([
    loadAgents(),
    loadCorporationFactions(),
  ]);
  const known = agents
    .agentsByCorporation(corporationId)
    .filter((agent) => standings.some((entry) => entry.from_id === agent.id))
    .map((agent): KnownAgent => {
      const target = { kind: 'agent', id: agent.id, corporationId } as const;
      const { base, effective } = buildChain(
        target,
        standings,
        corporationFactions,
        skills
      ).links.at(-1)!;
      return { agent, divisionName: agents.divisionName(agent.divisionId), base, effective };
    });
  return known.sort((a, b) => b.effective - a.effective || a.agent.id - b.agent.id);
}
