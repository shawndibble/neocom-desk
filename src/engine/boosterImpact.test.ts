import { describe, it, expect } from 'vitest';
import { boostedStepIndices } from './boosterImpact';
import type { Booster, EngineSkill, ScheduledStep } from './types';

const START = new Date('2026-08-30T00:00:00Z');
const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);

const skills = new Map<number, EngineSkill>([
  [
    1,
    {
      typeID: 1,
      name: 'Int/Mem',
      rank: 1,
      primary: 'intelligence',
      secondary: 'memory',
      prereqs: [],
    },
  ],
  [
    2,
    {
      typeID: 2,
      name: 'Per/Wil',
      rank: 1,
      primary: 'perception',
      secondary: 'willpower',
      prereqs: [],
    },
  ],
]);

/** Three 100s steps back to back: starts at 0, 100, 200. */
const steps = (typeIDs: number[]): ScheduledStep[] =>
  typeIDs.map((skillTypeID, i) => ({
    skillTypeID,
    level: 1,
    sp: 250,
    seconds: 100,
    cumulativeSeconds: (i + 1) * 100,
  }));

describe('boostedStepIndices', () => {
  it('marks only the steps that start before the Booster lapses', () => {
    const boosters: Booster[] = [{ bonus: { intelligence: 10 }, expiresAt: after(150) }];
    expect(boostedStepIndices(steps([1, 1, 1]), skills, boosters, START)).toEqual(new Set([0, 1]));
  });

  it('ignores a skill whose attributes the Booster does not touch', () => {
    // A Booster on intelligence/memory does nothing for a perception skill,
    // even though that skill trains inside the window.
    const boosters: Booster[] = [{ bonus: { intelligence: 10 }, expiresAt: after(1000) }];
    expect(boostedStepIndices(steps([1, 2, 1]), skills, boosters, START)).toEqual(new Set([0, 2]));
  });

  it('counts a Booster touching only the secondary attribute', () => {
    const boosters: Booster[] = [{ bonus: { memory: 4 }, expiresAt: after(1000) }];
    expect(boostedStepIndices(steps([1]), skills, boosters, START)).toEqual(new Set([0]));
  });

  it('ignores a zero bonus, which changes no rate', () => {
    const boosters: Booster[] = [{ bonus: { intelligence: 0 }, expiresAt: after(1000) }];
    expect(boostedStepIndices(steps([1]), skills, boosters, START)).toEqual(new Set());
  });

  it('returns nothing for a Booster that already expired', () => {
    const boosters: Booster[] = [{ bonus: { intelligence: 10 }, expiresAt: after(-1) }];
    expect(boostedStepIndices(steps([1, 1]), skills, boosters, START)).toEqual(new Set());
  });

  it('excludes a step starting exactly at expiry, matching computeSchedule', () => {
    // computeSchedule adds the bonus while `elapsed < offset`, strictly. A step
    // beginning at the instant of expiry gets no benefit.
    const boosters: Booster[] = [{ bonus: { intelligence: 10 }, expiresAt: after(100) }];
    expect(boostedStepIndices(steps([1, 1]), skills, boosters, START)).toEqual(new Set([0]));
  });

  it('unions several Boosters covering different attributes and windows', () => {
    const boosters: Booster[] = [
      { bonus: { intelligence: 10 }, expiresAt: after(50) },
      { bonus: { perception: 5 }, expiresAt: after(1000) },
    ];
    expect(boostedStepIndices(steps([1, 2, 1]), skills, boosters, START)).toEqual(new Set([0, 1]));
  });

  it('returns nothing when there are no Boosters', () => {
    expect(boostedStepIndices(steps([1, 2]), skills, [], START)).toEqual(new Set());
  });

  it('skips a step whose skill is missing from the catalog rather than throwing', () => {
    const boosters: Booster[] = [{ bonus: { intelligence: 10 }, expiresAt: after(1000) }];
    expect(boostedStepIndices(steps([99]), skills, boosters, START)).toEqual(new Set());
  });
});
