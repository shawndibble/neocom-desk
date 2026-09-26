import { describe, expect, it } from 'vitest';
import { packCheck, racksWithSlots, skillsKey, unpackCheck } from './hullFitKey';

describe('skillsKey', () => {
  it('is the same for the same skills however they were inserted', () => {
    const a = new Map([
      [3300, 5],
      [3301, 4],
    ]);
    const b = new Map([
      [3301, 4],
      [3300, 5],
    ]);
    expect(skillsKey(a)).toBe(skillsKey(b));
  });

  it('differs when a level differs', () => {
    expect(skillsKey(new Map([[3300, 5]]))).not.toBe(skillsKey(new Map([[3300, 4]])));
  });

  it('differs when a skill differs', () => {
    expect(skillsKey(new Map([[3300, 5]]))).not.toBe(skillsKey(new Map([[3301, 5]])));
  });

  it('is stable text for an empty profile', () => {
    expect(skillsKey(new Map())).toBe(skillsKey(new Map()));
    expect(skillsKey(new Map())).not.toBe(skillsKey(new Map([[1, 1]])));
  });
});

describe('racksWithSlots', () => {
  it('keeps the racks the hull has slots in, and always the drone bay', () => {
    const racks = racksWithSlots({ high: 5, medium: 0, low: 4, rig: 3, subsystem: 0 });
    expect([...racks].sort()).toEqual(['drone', 'high', 'low', 'rig']);
  });
});

describe('packCheck', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('round-trips %i', (bits) => {
    expect(packCheck(unpackCheck(bits))).toBe(bits);
  });
});
