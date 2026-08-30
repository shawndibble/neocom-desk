import { describe, it, expect } from 'vitest';
import { bestAttributes } from '@/engine/optimizer/bestAttributes';
import { optimizeAtMarkers } from '@/engine/optimizer/optimizeAtMarkers';
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

const levels = (skillTypeID: number, upTo: number): PlanStep[] =>
  Array.from({ length: upTo }, (_, i) => ({ skillTypeID, level: i + 1 }));

// Two-phase fixture: int/mem then per/wil, 8000 SP each phase.
const TWO_PHASE_SKILLS = skillMap(
  skill(1, 'intelligence', 'memory'),
  skill(2, 'perception', 'willpower')
);
const TWO_PHASE_STEPS = [...levels(1, 3), ...levels(2, 3)];

describe('optimizeAtMarkers', () => {
  it('handles an empty plan', () => {
    const result = optimizeAtMarkers([], skillMap(), {
      markers: [0],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toEqual([]);
    expect(result.totalSeconds).toBe(0);
    expect(result.currentSeconds).toBe(0);
    expect(result.savingsSeconds).toBe(0);
  });

  it('with no markers, trains the whole plan on the current attributes', () => {
    const result = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      startIndex: 0,
      endIndex: 5,
      remap: false,
    });
    expect(result.segments[0].attributes).toEqual(CURRENT);
    // 8000 SP at 30 + 8000 SP at 30 SP/min.
    expect(result.totalSeconds).toBeCloseTo(2 * (8000 / 30) * 60, 6);
    expect(result.totalSeconds).toBe(result.currentSeconds);
    expect(result.savingsSeconds).toBe(0);
  });

  it('one mid-plan marker: current-attributes prefix, then the best spread for the tail', () => {
    const result = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [3],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 2, remap: false });
    expect(result.segments[0].attributes).toEqual(CURRENT);
    // Prefix on current attributes: 8000 SP at 20 + 20/2 = 30 SP/min.
    expect(result.segments[0].seconds).toBeCloseTo((8000 / 30) * 60, 6);
    expect(result.segments[1]).toMatchObject({ startIndex: 3, endIndex: 5, remap: true });
    expect(result.segments[1].attributes.perception).toBe(27);
    expect(result.segments[1].attributes.willpower).toBe(21);
    expect(result.segments[1].seconds).toBeCloseTo((8000 / 37.5) * 60, 6);
    expect(result.totalSeconds).toBeCloseTo((8000 / 30 + 8000 / 37.5) * 60, 6);
    expect(result.savingsSeconds).toBeCloseTo(result.currentSeconds - result.totalSeconds, 6);
  });

  it('a marker at 0 replaces the current-attributes prefix with a remapped first segment', () => {
    const result = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [0],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 5, remap: true });
    const whole = bestAttributes(TWO_PHASE_STEPS, TWO_PHASE_SKILLS);
    expect(result.segments[0].attributes).toEqual(whole.attributes);
    expect(result.totalSeconds).toBeCloseTo(whole.seconds, 6);
  });

  it('two markers: each marker segment gets its own best spread', () => {
    const skills = skillMap(
      skill(1, 'intelligence', 'memory'),
      skill(2, 'perception', 'willpower'),
      skill(3, 'charisma', 'willpower')
    );
    const steps = [...levels(1, 3), ...levels(2, 3), ...levels(3, 3)];
    const result = optimizeAtMarkers(steps, skills, {
      markers: [3, 6],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 2, remap: false });
    expect(result.segments[1]).toMatchObject({ startIndex: 3, endIndex: 5, remap: true });
    expect(result.segments[1].attributes.perception).toBe(27);
    expect(result.segments[2]).toMatchObject({ startIndex: 6, endIndex: 8, remap: true });
    expect(result.segments[2].attributes.charisma).toBe(27);
    const segSum = result.segments.reduce((acc, s) => acc + s.seconds, 0);
    expect(result.totalSeconds).toBeCloseTo(segSum, 6);
    expect(result.savingsSeconds).toBeCloseTo(result.currentSeconds - result.totalSeconds, 6);
  });

  it('clamps out-of-range markers and drops the empty segments they leave', () => {
    const result = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [-5, 99],
      currentAttributes: CURRENT,
    });
    // -5 clamps to 0 (remap at the very start); 99 clamps to steps.length,
    // an empty segment, which is dropped.
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 5, remap: true });
  });

  it('ignores duplicate markers and sorts unordered ones', () => {
    const result = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [3, 3, 3],
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(2);

    const sorted = optimizeAtMarkers(TWO_PHASE_STEPS, TWO_PHASE_SKILLS, {
      markers: [4, 2],
      currentAttributes: CURRENT,
    });
    expect(sorted.segments.map((s) => s.startIndex)).toEqual([0, 2, 4]);
  });

  it('applies implants to both the current baseline and the remapped segments', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const result = optimizeAtMarkers(levels(1, 3), skills, {
      markers: [0],
      currentAttributes: CURRENT,
      implants: { perception: 3, willpower: 3 },
    });
    expect(result.segments).toHaveLength(1);
    // 8000 SP at (27+3) + (21+3)/2 = 42 SP/min.
    expect(result.totalSeconds).toBeCloseTo((8000 / 42) * 60, 6);
    // Baseline: (20+3) + (20+3)/2 = 34.5 SP/min.
    expect(result.currentSeconds).toBeCloseTo((8000 / 34.5) * 60, 6);
  });
});
