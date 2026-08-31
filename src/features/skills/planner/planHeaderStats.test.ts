import { describe, it, expect } from 'vitest';
import { placeRemaps } from '@/engine/optimizer';
import {
  evaluateOptimizationBadge,
  projectedFinish,
  REMAP_EVALUATION_CAP,
} from './planHeaderStats';
import type { AttributeName, Attributes, EngineSkill, PlanStep } from '@/engine/types';

const skill = (
  typeID: number,
  primary: AttributeName,
  secondary: AttributeName,
  rank = 1
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank, primary, secondary, prereqs: [] });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const CURRENT: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

// Six distinct attribute-pair skills, one step each, so remapCount=6 places
// a remap for every step and remapCount=5 (the cap) cannot.
const PAIRS: [AttributeName, AttributeName][] = [
  ['intelligence', 'memory'],
  ['perception', 'willpower'],
  ['charisma', 'willpower'],
  ['intelligence', 'perception'],
  ['memory', 'charisma'],
  ['perception', 'charisma'],
];
const SKILLS = skillMap(...PAIRS.map(([p, s], i) => skill(i + 1, p, s)));
const STEPS: PlanStep[] = PAIRS.map((_, i) => ({ skillTypeID: i + 1, level: 1 }));

describe('evaluateOptimizationBadge', () => {
  it('returns null for an empty plan', () => {
    expect(
      evaluateOptimizationBadge([], SKILLS, { remapCount: 2, currentAttributes: CURRENT })
    ).toBeNull();
  });

  it('reports the exact result, uncapped, when the request is within the cap', () => {
    const badge = evaluateOptimizationBadge(STEPS, SKILLS, {
      remapCount: 3,
      currentAttributes: CURRENT,
    });
    const direct = placeRemaps(STEPS, SKILLS, { remapCount: 3, currentAttributes: CURRENT });
    expect(badge).toMatchObject({
      savingsSeconds: direct.savingsSeconds,
      evaluatedRemapCount: 3,
      requestedRemapCount: 3,
      capped: false,
    });
  });

  it('caps evaluation at REMAP_EVALUATION_CAP and says so when the plan requests more', () => {
    const badge = evaluateOptimizationBadge(STEPS, SKILLS, {
      remapCount: 6,
      currentAttributes: CURRENT,
    });
    const capped = placeRemaps(STEPS, SKILLS, {
      remapCount: REMAP_EVALUATION_CAP,
      currentAttributes: CURRENT,
    });
    expect(badge).toMatchObject({
      savingsSeconds: capped.savingsSeconds,
      evaluatedRemapCount: REMAP_EVALUATION_CAP,
      requestedRemapCount: 6,
      capped: true,
    });

    // The badge never claims the (larger) uncapped savings.
    const uncapped = placeRemaps(STEPS, SKILLS, { remapCount: 6, currentAttributes: CURRENT });
    expect(uncapped.savingsSeconds).toBeGreaterThan(capped.savingsSeconds);
  });

  it('never reports a negative evaluated count for a negative or zero request', () => {
    const badge = evaluateOptimizationBadge(STEPS, SKILLS, {
      remapCount: 0,
      currentAttributes: CURRENT,
    });
    expect(badge).toMatchObject({ evaluatedRemapCount: 0, requestedRemapCount: 0, capped: false });
  });
});

describe('projectedFinish', () => {
  const NOW = new Date('2026-08-31T00:00:00Z');

  it('returns null for a zero-length plan', () => {
    expect(projectedFinish(0, NOW)).toBeNull();
  });

  it('adds the training seconds to now', () => {
    expect(projectedFinish(3600, NOW)).toEqual(new Date('2026-08-31T01:00:00Z'));
  });
});
