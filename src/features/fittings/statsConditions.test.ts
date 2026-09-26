import { describe, expect, it, vi } from 'vitest';
import type { PilotProfile } from '@/engine/fittings/types';

vi.mock('@/sde/loadSde', () => ({ loadSkills: async () => [{ typeID: 3300 }, { typeID: 3301 }] }));

const { pilotUnder, statsOptions } = await import('./statsConditions');

const pilot: PilotProfile = {
  skillLevels: new Map([[3300, 3]]),
  implantTypeIds: [],
  boosterTypeIds: [],
};

describe('statsOptions', () => {
  it('hands the engine only the conditions in force', () => {
    expect(statsOptions({ weatherTypeId: null, overheatAll: false })).toEqual({});
    const projected = { buffs: [{ id: 12, value: 25 }], effects: [] };
    expect(statsOptions({ weatherTypeId: 47390, overheatAll: true, projected })).toEqual({
      weatherTypeId: 47390,
      overheatAll: true,
      incoming: projected,
    });
  });
});

describe('pilotUnder', () => {
  it('is the pilot itself, synchronously, with no overrides', () => {
    expect(pilotUnder(pilot, { weatherTypeId: null, overheatAll: false })).toBe(pilot);
  });

  it('loads the skill list only for All V', async () => {
    const allV = await pilotUnder(pilot, {
      weatherTypeId: null,
      overheatAll: false,
      skills: { base: 'allV', levels: {} },
    });
    expect([...allV.skillLevels]).toEqual([
      [3300, 5],
      [3301, 5],
    ]);
  });
});
