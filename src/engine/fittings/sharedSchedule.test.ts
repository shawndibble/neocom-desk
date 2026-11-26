import { describe, expect, it } from 'vitest';
import { splitSharedSchedule } from './sharedSchedule';

const step = (skillTypeID: number, level: number, seconds: number) => ({
  skillTypeID,
  level,
  seconds,
});
const P = 1;
const X = 2;
const Y = 3;

describe('splitSharedSchedule', () => {
  it('counts a shared prerequisite once, under the group that trains first', () => {
    const combined = [step(P, 1, 10), step(P, 2, 20), step(X, 1, 5), step(Y, 1, 7)];
    const solo = [
      [step(P, 1, 10), step(P, 2, 20), step(X, 1, 5)],
      [step(P, 1, 10), step(P, 2, 20), step(Y, 1, 7)],
    ];
    const groups = [[{ skillTypeID: Y, targetLevel: 1 }], [{ skillTypeID: X, targetLevel: 1 }]];
    const split = splitSharedSchedule(groups, combined, [solo[1], solo[0]]);
    expect(split[1]).toEqual([step(P, 1, 10), step(P, 2, 20), step(X, 1, 5)]);
    expect(split[0]).toEqual([step(Y, 1, 7)]);
    const total = split.flat().reduce((sum, s) => sum + s.seconds, 0);
    expect(total).toBe(42);
  });

  it('keeps a prerequisite only one group needs with that group', () => {
    const combined = [step(X, 1, 5), step(P, 1, 10), step(Y, 1, 7)];
    const groups = [[{ skillTypeID: X, targetLevel: 1 }], [{ skillTypeID: Y, targetLevel: 1 }]];
    const split = splitSharedSchedule(groups, combined, [
      [step(X, 1, 5)],
      [step(P, 1, 10), step(Y, 1, 7)],
    ]);
    expect(split).toEqual([[step(X, 1, 5)], [step(P, 1, 10), step(Y, 1, 7)]]);
  });
});
