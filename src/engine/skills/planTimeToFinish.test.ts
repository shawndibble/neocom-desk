import { describe, expect, it } from 'vitest';
import { planTimeToFinish, rankClosest, type CharacterTimingInput } from './planTimeToFinish';
import type { EngineSkill, PlanEntry } from '@/engine/types';

const SKILLS = new Map<number, EngineSkill>([
  [1, { typeID: 1, name: 'A', rank: 1, primary: 'intelligence', secondary: 'memory', prereqs: [] }],
]);
const ENTRIES: PlanEntry[] = [{ skillTypeID: 1, targetLevel: 3 } as PlanEntry];
const NOW = new Date('2026-01-01T00:00:00Z');

function ready(
  overrides: Partial<Extract<CharacterTimingInput, { kind: 'ready' }>> = {}
): CharacterTimingInput {
  return {
    kind: 'ready',
    trained: new Map(),
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
    boosters: [],
    cloneState: 'omega',
    ...overrides,
  };
}

describe('planTimeToFinish', () => {
  it('reports a finished plan as complete, not as zero seconds', () => {
    const trained = new Map([[1, { level: 3, sp: 256_000 }]]);
    expect(planTimeToFinish(ENTRIES, SKILLS, ready({ trained }), NOW)).toEqual({
      kind: 'complete',
    });
  });

  it('times an untrained Character on the whole plan', () => {
    const result = planTimeToFinish(ENTRIES, SKILLS, ready(), NOW);
    expect(result.kind).toBe('training');
    if (result.kind === 'training') {
      expect(result.seconds).toBeGreaterThan(0);
      expect(result.remainingSp).toBe(8000);
    }
  });

  it('counts banked SP toward a part-trained skill', () => {
    const fresh = planTimeToFinish(ENTRIES, SKILLS, ready(), NOW);
    const trained = new Map([[1, { level: 1, sp: 250 }]]);
    const partial = planTimeToFinish(ENTRIES, SKILLS, ready({ trained }), NOW);
    if (fresh.kind !== 'training' || partial.kind !== 'training') throw new Error('expected both');
    expect(partial.seconds).toBeLessThan(fresh.seconds);
    expect(partial.remainingSp).toBe(7750);
  });

  it('is faster with better attributes and implants', () => {
    const base = planTimeToFinish(ENTRIES, SKILLS, ready(), NOW);
    const fast = planTimeToFinish(
      ENTRIES,
      SKILLS,
      ready({
        attributes: { intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17 },
        implants: { intelligence: 5, memory: 5 },
      }),
      NOW
    );
    if (base.kind !== 'training' || fast.kind !== 'training') throw new Error('expected both');
    expect(fast.seconds).toBeLessThan(base.seconds);
  });

  it('passes an unreadable Character through, never as nothing missing', () => {
    expect(
      planTimeToFinish(ENTRIES, SKILLS, { kind: 'unavailable', reason: 'skills-failed' }, NOW)
    ).toEqual({ kind: 'unavailable', reason: 'skills-failed' });
  });
});

describe('rankClosest', () => {
  it('orders training rows nearest first and groups the rest', () => {
    const ranking = rankClosest(
      new Map([
        [1, { kind: 'training', seconds: 500, remainingSp: 10 }],
        [2, { kind: 'complete' }],
        [3, { kind: 'training', seconds: 100, remainingSp: 20 }],
        [4, { kind: 'unavailable', reason: 'skills-permission' }],
      ])
    );
    expect(ranking.rows.map((r) => r.characterId)).toEqual([3, 1]);
    expect(ranking.complete).toEqual([2]);
    expect(ranking.unavailable).toEqual([{ characterId: 4, reason: 'skills-permission' }]);
  });
});
