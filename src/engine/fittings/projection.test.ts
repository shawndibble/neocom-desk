import { describe, expect, it } from 'vitest';
import { combineProjections, projectsNothing } from './projection';

const logi = {
  buffs: [],
  effects: [{ typeId: 26913, effectId: -86, attributes: { [-45]: 42.5 } }],
};
const booster = {
  buffs: [{ id: 12, value: 25 }],
  effects: [],
};

describe('combineProjections', () => {
  it('lands each source as many times as there are of it', () => {
    const combined = combineProjections([
      { projection: logi, count: 2 },
      { projection: booster, count: 1 },
    ]);
    expect(combined.effects).toHaveLength(2);
    expect(combined.buffs).toEqual([{ id: 12, value: 25 }]);
  });

  it('hands a burst over once however many boosters carry it — only the strongest counts in game', () => {
    expect(combineProjections([{ projection: booster, count: 3 }]).buffs).toEqual([
      { id: 12, value: 25 },
    ]);
  });

  it('is nothing at all for no sources, or a count of zero', () => {
    expect(combineProjections([])).toEqual({ buffs: [], effects: [] });
    expect(combineProjections([{ projection: logi, count: 0 }])).toEqual({
      buffs: [],
      effects: [],
    });
  });
});

describe('projectsNothing', () => {
  it('is true with no buff and no effect, or nothing at all', () => {
    expect(projectsNothing({ buffs: [], effects: [] })).toBe(true);
    expect(projectsNothing(undefined)).toBe(true);
    expect(projectsNothing(logi)).toBe(false);
    expect(projectsNothing(booster)).toBe(false);
  });
});
