/**
 * Which agent levels a chain of standings opens. Sources:
 * docs/research/npc-standings-rules.md section 2.
 * Storyline, R&D and COSMOS agents follow other rules and are not modelled.
 */
import type { ChainLink, StandingChain } from './chain';

export type AgentLevel = 1 | 2 | 3 | 4 | 5;

export const AGENT_LEVELS: readonly AgentLevel[] = [1, 2, 3, 4, 5];

/** The level in an agent file row, when it is one the game has (1-5). */
export function asAgentLevel(level: number): AgentLevel | null {
  return AGENT_LEVELS.find((candidate) => candidate === level) ?? null;
}

/** The standing a level needs; level 1 needs none. */
export const AGENT_LEVEL_STANDING: Readonly<Record<AgentLevel, number | null>> = {
  1: null,
  2: 1,
  3: 3,
  4: 5,
  5: 7,
};

/** A link at or below this blocks every agent of level 2 and up, whatever the others say. */
export const AGENT_BLOCK_STANDING = -2;

/**
 * The link with the best effective standing; the game takes the highest of the
 * faction's, corporation's and agent's. A tie goes to the more specific link.
 */
export function bestLink(chain: StandingChain): ChainLink | null {
  let best: ChainLink | null = null;
  for (const link of chain.links) {
    if (best === null || link.effective >= best.effective) best = link;
  }
  return best;
}

/** The first (most general) link at -2.0 or lower, else null. */
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

/** The highest agent level the chain opens; level 1 is always open. */
export function highestAccessLevel(chain: StandingChain): AgentLevel {
  const best = bestLink(chain);
  if (best === null || blockingLink(chain) !== null) return 1;
  return levelsOpenedBy(best.effective);
}

export interface NextLevel {
  level: AgentLevel;
  /** The standing that level needs. */
  needs: number;
  /** How much more the best standing needs; always above 0. */
  short: number;
}

/** The next level up and what it takes; null at level 5 or while a link blocks. */
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
  /** What the agent's level needs; null for level 1. */
  needs: number | null;
  /** How much more the best standing needs; 0 when open or blocked. */
  short: number;
  /** The link vetoing a level 2+ agent, if one is. */
  blockedBy: ChainLink | null;
}

/** Whether one agent of `agentLevel` is open to the chain, and if not why. */
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
