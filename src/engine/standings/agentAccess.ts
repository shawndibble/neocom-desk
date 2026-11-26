import type { ChainLink, StandingChain } from './chain';

export type AgentLevel = 1 | 2 | 3 | 4 | 5;

export const AGENT_LEVELS: readonly AgentLevel[] = [1, 2, 3, 4, 5];

export function asAgentLevel(level: number): AgentLevel | null {
  return AGENT_LEVELS.find((candidate) => candidate === level) ?? null;
}

export const AGENT_LEVEL_STANDING: Readonly<Record<AgentLevel, number | null>> = {
  1: null,
  2: 1,
  3: 3,
  4: 5,
  5: 7,
};

export const AGENT_BLOCK_STANDING = -2;

export function bestLink(chain: StandingChain): ChainLink | null {
  let best: ChainLink | null = null;
  for (const link of chain.links) {
    if (best === null || link.effective >= best.effective) best = link;
  }
  return best;
}

export function blockingLink(chain: StandingChain): ChainLink | null {
  return chain.links.find((link) => link.effective <= AGENT_BLOCK_STANDING) ?? null;
}

function levelsOpenedBy(standing: number): AgentLevel {
  let highest: AgentLevel = 1;
  for (const level of AGENT_LEVELS) {
    const needs = AGENT_LEVEL_STANDING[level];
    if (needs !== null && standing >= needs) highest = level;
  }
  return highest;
}

export function highestAccessLevel(chain: StandingChain): AgentLevel {
  const best = bestLink(chain);
  if (best === null || blockingLink(chain) !== null) return 1;
  return levelsOpenedBy(best.effective);
}

export interface NextLevel {
  level: AgentLevel;
  needs: number;
  short: number;
}

export function nextLevel(chain: StandingChain): NextLevel | null {
  if (blockingLink(chain) !== null) return null;
  const level = highestAccessLevel(chain);
  if (level === 5) return null;
  const next = (level + 1) as AgentLevel;
  const needs = AGENT_LEVEL_STANDING[next] as number;
  return { level: next, needs, short: needs - (bestLink(chain)?.effective ?? 0) };
}

export interface AgentAccess {
  open: boolean;
  needs: number | null;
  short: number;
  blockedBy: ChainLink | null;
}

export function agentAccess(chain: StandingChain, agentLevel: AgentLevel): AgentAccess {
  const needs = AGENT_LEVEL_STANDING[agentLevel];
  if (needs === null) return { open: true, needs, short: 0, blockedBy: null };
  const blockedBy = blockingLink(chain);
  if (blockedBy !== null) return { open: false, needs, short: 0, blockedBy };
  const best = bestLink(chain)?.effective ?? 0;
  return best >= needs
    ? { open: true, needs, short: 0, blockedBy: null }
    : { open: false, needs, short: needs - best, blockedBy: null };
}
