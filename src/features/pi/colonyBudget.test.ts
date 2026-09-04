import { describe, it, expect } from 'vitest';
import { piFixture } from '@/sde/__fixtures__/pi';
import { colonyBudget } from './colonyBudget';

const pi = piFixture();

describe('colonyBudget', () => {
  it('reads the row for the trained level', () => {
    expect(colonyBudget(4, pi)).toEqual({
      level: 4,
      assumed: false,
      budget: { cpu: 21_315, powergrid: 17_000 },
    });
  });

  it('falls back to untrained when there is no skill data, and says so', () => {
    // Same numbers as a confident level 0, but flagged: the meter may not
    // read as measured when the app has never loaded this character's skills.
    expect(colonyBudget(null, pi)).toEqual({
      level: 0,
      assumed: true,
      budget: { cpu: 1_675, powergrid: 6_000 },
    });
  });

  it('keeps a confident zero distinct from no data', () => {
    expect(colonyBudget(0, pi).assumed).toBe(false);
  });

  it('clamps a level past the table rather than coming back with nothing', () => {
    expect(colonyBudget(9, pi).level).toBe(5);
    expect(colonyBudget(-2, pi).level).toBe(0);
  });
});
