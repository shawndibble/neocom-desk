import { describe, it, expect } from 'vitest';
import { MAX_SUPPORTED_REMAPS, placeRemaps } from '@/engine/optimizer';
import { evaluateOptimizationBadge, toOptimizationBadge } from './planHeaderStats';
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

// Six distinct attribute-pair skills, one step each, so a remapCount above
// MAX_SUPPORTED_REMAPS places a remap the evaluated (capped) run cannot.
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

  it('reports the exact result, uncapped, when the request is within MAX_SUPPORTED_REMAPS', () => {
    const badge = evaluateOptimizationBadge(STEPS, SKILLS, {
      remapCount: 1,
      currentAttributes: CURRENT,
    });
    const direct = placeRemaps(STEPS, SKILLS, { remapCount: 1, currentAttributes: CURRENT });
    expect(badge).toMatchObject({
      savingsSeconds: direct.savingsSeconds,
      evaluatedRemapCount: 1,
      requestedRemapCount: 1,
      capped: false,
    });
  });

  it('caps evaluation at MAX_SUPPORTED_REMAPS and says so when the plan requests more', () => {
    const badge = evaluateOptimizationBadge(STEPS, SKILLS, {
      remapCount: 6,
      currentAttributes: CURRENT,
    });
    const capped = placeRemaps(STEPS, SKILLS, {
      remapCount: MAX_SUPPORTED_REMAPS,
      currentAttributes: CURRENT,
    });
    expect(badge).toMatchObject({
      savingsSeconds: capped.savingsSeconds,
      evaluatedRemapCount: MAX_SUPPORTED_REMAPS,
      requestedRemapCount: 6,
      capped: true,
    });

    // The badge never claims the (larger) uncapped savings.
    const uncapped = placeRemaps(STEPS, SKILLS, { remapCount: 6, currentAttributes: CURRENT });
    expect(uncapped.savingsSeconds).toBeGreaterThan(capped.savingsSeconds);
  });

  // A plan with no remaps to spend has none to place, so there is no savings
  // figure to report. The badge used to render "Remap savings: None" here,
  // which asserts that remapping cannot help this plan — a verdict the run
  // never reached, and one that contradicts the editor's own "raise Remaps
  // available and optimize again". No chip at all, as for an empty plan.
  it('returns null when the plan has no remaps to spend', () => {
    expect(
      evaluateOptimizationBadge(STEPS, SKILLS, { remapCount: 0, currentAttributes: CURRENT })
    ).toBeNull();
    expect(
      evaluateOptimizationBadge(STEPS, SKILLS, { remapCount: -1, currentAttributes: CURRENT })
    ).toBeNull();
  });
});

describe('toOptimizationBadge', () => {
  it('flags capped only when the request exceeds what was evaluated', () => {
    expect(toOptimizationBadge(120, 2, 2)).toEqual({
      savingsSeconds: 120,
      evaluatedRemapCount: 2,
      requestedRemapCount: 2,
      capped: false,
    });
    expect(toOptimizationBadge(120, 2, 5)).toEqual({
      savingsSeconds: 120,
      evaluatedRemapCount: 2,
      requestedRemapCount: 5,
      capped: true,
    });
  });
});
