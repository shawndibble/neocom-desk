import { describe, it, expect } from 'vitest';
import { computeSchedule } from '@/engine/schedule';
import type { Attributes, EngineSkill, PlanStep } from '@/engine/types';

const GUNNERY: EngineSkill = {
  typeID: 100,
  name: 'Gunnery',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
};
const skills = new Map([[100, GUNNERY]]);

function attrs(intelligence: number, memory: number): Attributes {
  return { intelligence, memory, perception: 17, willpower: 17, charisma: 17 };
}

const L1: PlanStep[] = [{ skillTypeID: 100, level: 1 }];

describe('computeSchedule', () => {
  it('returns empty for empty steps', () => {
    expect(computeSchedule([], { attributes: attrs(20, 20) }, skills)).toEqual([]);
  });

  it('computes sp and seconds at a flat rate', () => {
    // rate = 20 + 20/2 = 30 SP/min; L1 = 250 SP -> 500 s
    const [step] = computeSchedule(L1, { attributes: attrs(20, 20) }, skills);
    expect(step).toEqual({ skillTypeID: 100, level: 1, sp: 250, seconds: 500, cumulativeSeconds: 500 });
  });

  it('accumulates cumulativeSeconds across steps', () => {
    // L1: 250 SP -> 500 s; L2: 1415-250 = 1165 SP -> 2330 s
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const result = computeSchedule(steps, { attributes: attrs(20, 20) }, skills);
    expect(result[0].cumulativeSeconds).toBe(500);
    expect(result[1].sp).toBe(1165);
    expect(result[1].seconds).toBe(2330);
    expect(result[1].cumulativeSeconds).toBe(2830);
  });

  it('adds implant bonuses to attributes', () => {
    // int 20+5, mem 10+2 -> rate 25 + 6 = 31 SP/min
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 10), implants: { intelligence: 5, memory: 2 } },
      skills,
    );
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
  });

  it('splits a step when a booster expires mid-step', () => {
    // base rate 20 + 10/2 = 25; boosted +10 int -> 35 SP/min for first 300 s
    // 300 s * 35/60 SP/s = 175 SP; remaining 75 SP at 25/min -> 180 s; total 480 s
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(300_000) }],
        startDate: new Date(0),
      },
      skills,
    );
    expect(step.sp).toBe(250);
    expect(step.seconds).toBeCloseTo(480, 6);
    expect(step.cumulativeSeconds).toBeCloseTo(480, 6);
  });

  it('applies booster expiry across step boundaries', () => {
    // Booster +10 int expires at t=600 s. Rate boosted 35 SP/min, base 25.
    // L1: 250 SP at 35/min -> 3000/7 s (inside booster window).
    // L2: 1165 SP; (600 - 3000/7) s boosted -> 100 SP; 1065 SP at 25/min -> 2556 s.
    // Step 2 total: 3156 - 3000/7 s; cumulative: 3156 s.
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const result = computeSchedule(
      steps,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(600_000) }],
        startDate: new Date(0),
      },
      skills,
    );
    expect(result[0].seconds).toBeCloseTo(3000 / 7, 6);
    expect(result[1].seconds).toBeCloseTo(3156 - 3000 / 7, 6);
    expect(result[1].cumulativeSeconds).toBeCloseTo(3156, 6);
  });

  it('ignores boosters already expired at start', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(0) }],
        startDate: new Date(60_000),
      },
      skills,
    );
    expect(step.seconds).toBeCloseTo(600, 6); // rate 25 -> 250 SP -> 600 s
  });

  it('stacks multiple active boosters', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [
          { bonus: { intelligence: 3 }, expiresAt: new Date(10_000_000) },
          { bonus: { intelligence: 2, memory: 2 }, expiresAt: new Date(10_000_000) },
        ],
        startDate: new Date(0),
      },
      skills,
    );
    // int 25, mem 12 -> rate 31
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
  });

  it('requires startDate when boosters are provided', () => {
    expect(() =>
      computeSchedule(L1, { attributes: attrs(20, 10), boosters: [{ bonus: {}, expiresAt: new Date(1) }] }, skills),
    ).toThrow(/startDate/);
  });

  it('throws on unknown skill in a step', () => {
    expect(() =>
      computeSchedule([{ skillTypeID: 999, level: 1 }], { attributes: attrs(20, 20) }, skills),
    ).toThrow(/999/);
  });
});
