import { describe, it, expect } from 'vitest';
import { alphaCappedEntries, tiersReached } from './tierLadder';

const trained = (levels: Record<number, number>) => (id: number) => levels[id] ?? 0;

const LADDER = [
  [{ skillTypeID: 1, level: 1 }],
  [{ skillTypeID: 1, level: 2 }],
  [
    { skillTypeID: 1, level: 3 },
    { skillTypeID: 2, level: 1 },
  ],
  [{ skillTypeID: 1, level: 4 }],
  [{ skillTypeID: 1, level: 5 }],
];

describe('tiersReached', () => {
  it('is 0 with nothing trained', () => {
    expect(tiersReached(LADDER, trained({}))).toBe(0);
  });

  it('counts tiers fully met, in order', () => {
    expect(tiersReached(LADDER, trained({ 1: 2 }))).toBe(2);
    expect(tiersReached(LADDER, trained({ 1: 5, 2: 1 }))).toBe(5);
  });

  it('stops at the first unmet tier even when a later one is met', () => {
    // Skill 1 at V meets tiers IV and V, but tier III also needs skill 2.
    expect(tiersReached(LADDER, trained({ 1: 5 }))).toBe(2);
  });

  it('stops at an empty tier — an unpublished mastery tier never reads as reached', () => {
    expect(
      tiersReached([[{ skillTypeID: 1, level: 1 }], [], LADDER[2]], trained({ 1: 5, 2: 5 }))
    ).toBe(1);
  });

  it('is 0 for a missing ladder', () => {
    expect(tiersReached(undefined, trained({ 1: 5 }))).toBe(0);
  });
});

describe('alphaCappedEntries', () => {
  const caps = (levels: Record<number, number>) => (id: number) => levels[id] ?? 0;

  it('returns the entries an Alpha clone cannot train to', () => {
    const entries = [
      { skillTypeID: 1, targetLevel: 4 },
      { skillTypeID: 2, targetLevel: 5 },
      { skillTypeID: 3, targetLevel: 1 },
    ];
    expect(alphaCappedEntries(entries, caps({ 1: 4, 2: 4 }))).toEqual([
      { skillTypeID: 2, targetLevel: 5 },
      // No Alpha cap at all: an Alpha clone cannot train it.
      { skillTypeID: 3, targetLevel: 1 },
    ]);
  });
});
