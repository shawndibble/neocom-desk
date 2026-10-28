import { describe, it, expect } from 'vitest';
import type { ChainLink, StandingChain } from './chain';
import {
  AGENT_BLOCK_STANDING,
  AGENT_LEVEL_STANDING,
  agentAccess,
  asAgentLevel,
  blockingLink,
  bestLink,
  highestAccessLevel,
  nextLevel,
} from './agentAccess';

const link = (kind: ChainLink['kind'], id: number, effective: number): ChainLink => ({
  kind,
  id,
  base: effective,
  effective,
});
/** A chain of faction, corporation and (optional) agent effective standings. */
const chainOf = (faction: number, corporation: number, agent?: number): StandingChain => ({
  criminal: false,
  links: [
    link('faction', 1, faction),
    link('corporation', 2, corporation),
    ...(agent === undefined ? [] : [link('agent', 3, agent)]),
  ],
});

describe('thresholds', () => {
  it('are none for level 1 and 1, 3, 5, 7 for levels 2 to 5', () => {
    expect(AGENT_LEVEL_STANDING).toEqual({ 1: null, 2: 1, 3: 3, 4: 5, 5: 7 });
  });
  it('veto at -2.0', () => {
    expect(AGENT_BLOCK_STANDING).toBe(-2);
  });
});

describe('bestLink', () => {
  it('is the highest effective standing in the chain', () => {
    expect(bestLink(chainOf(1, 4, 2))?.kind).toBe('corporation');
  });
  it('goes to the more specific link on a tie', () => {
    expect(bestLink(chainOf(4, 4, 4))?.kind).toBe('agent');
    expect(bestLink(chainOf(4, 4))?.kind).toBe('corporation');
  });
  it('is null for an empty chain', () => {
    expect(bestLink({ criminal: false, links: [] })).toBeNull();
  });
});

describe('blockingLink', () => {
  it.each([
    [-1.99, false],
    [-2, true],
    [-2.01, true],
    [-10, true],
  ])('a link at %s blocks: %s', (standing, blocks) => {
    expect(blockingLink(chainOf(5, standing))?.kind ?? null).toBe(blocks ? 'corporation' : null);
  });
  it('returns the first (most general) blocking link', () => {
    expect(blockingLink(chainOf(-5, -5, -5))?.kind).toBe('faction');
  });
});

describe('highestAccessLevel', () => {
  it.each([
    [0, 1],
    [0.99, 1],
    [1, 2],
    [2.99, 2],
    [3, 3],
    [4.99, 3],
    [5, 4],
    [6.99, 4],
    [7, 5],
    [10, 5],
  ])('best standing %s opens level %s', (standing, level) => {
    expect(highestAccessLevel(chainOf(0, standing))).toBe(level);
  });

  it('uses the best link, wherever it sits', () => {
    expect(highestAccessLevel(chainOf(7.5, 0, 0))).toBe(5);
    expect(highestAccessLevel(chainOf(0, 0, 3.2))).toBe(3);
  });

  it('is at least 1 for a chain with no links or only bad ones', () => {
    expect(highestAccessLevel({ criminal: false, links: [] })).toBe(1);
    expect(highestAccessLevel(chainOf(-9, -9))).toBe(1);
  });

  it('stays 1 when any link vetoes, however high the others are', () => {
    expect(highestAccessLevel(chainOf(9, -2))).toBe(1);
    expect(highestAccessLevel(chainOf(-2, 9, 9))).toBe(1);
  });

  it('is not vetoed just below -2', () => {
    expect(highestAccessLevel(chainOf(9, -1.99))).toBe(5);
  });
});

describe('nextLevel', () => {
  it('names the level above, the standing it needs and how much is missing', () => {
    expect(nextLevel(chainOf(0, 6.06))).toEqual({
      level: 5,
      needs: 7,
      short: expect.closeTo(0.94, 10),
    });
    expect(nextLevel(chainOf(0, 0))).toEqual({ level: 2, needs: 1, short: 1 });
  });
  it('is the next level when exactly at a threshold, short by the next gap', () => {
    expect(nextLevel(chainOf(3, 0))).toEqual({ level: 4, needs: 5, short: 2 });
  });
  it('is null at level 5', () => {
    expect(nextLevel(chainOf(7, 0))).toBeNull();
  });
  it('is null while a link vetoes: nothing to aim at until it clears', () => {
    expect(nextLevel(chainOf(2, -2))).toBeNull();
  });
  it('is level 2 for a chain with no links', () => {
    expect(nextLevel({ criminal: false, links: [] })).toEqual({ level: 2, needs: 1, short: 1 });
  });
});

describe('agentAccess', () => {
  it('opens level 1 for everyone, even a vetoed chain', () => {
    expect(agentAccess(chainOf(-9, -9, -9), 1)).toEqual({
      open: true,
      needs: null,
      short: 0,
      blockedBy: null,
    });
  });

  it('opens a level the best standing reaches', () => {
    expect(agentAccess(chainOf(0, 3, 0), 3)).toEqual({
      open: true,
      needs: 3,
      short: 0,
      blockedBy: null,
    });
  });

  it('says what is missing for a level it does not reach', () => {
    const access = agentAccess(chainOf(1, 2.5), 4);
    expect(access).toMatchObject({ open: false, needs: 5, blockedBy: null });
    expect(access.short).toBeCloseTo(2.5, 10);
  });

  it('names the veto, and counts nothing short, when a link is at -2.0 or lower', () => {
    const chain = chainOf(9, -2);
    expect(agentAccess(chain, 2)).toMatchObject({
      open: false,
      needs: 1,
      blockedBy: chain.links[1],
    });
  });

  it('opens the exact threshold: 1.0 for level 2, 7.0 for level 5', () => {
    expect(agentAccess(chainOf(1, 0), 2).open).toBe(true);
    expect(agentAccess(chainOf(7, 0), 5).open).toBe(true);
    expect(agentAccess(chainOf(6.99, 0), 5).open).toBe(false);
  });

  it('is closed with no links above level 1', () => {
    expect(agentAccess({ criminal: false, links: [] }, 2)).toMatchObject({ open: false, short: 1 });
  });
});

describe('asAgentLevel', () => {
  it('accepts 1 to 5 only', () => {
    expect([0, 1, 5, 6].map(asAgentLevel)).toEqual([null, 1, 5, null]);
  });
});
