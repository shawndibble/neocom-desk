import { describe, expect, it, vi } from 'vitest';
import type { PilotProfile } from '@/engine/fittings/types';

vi.mock('@/sde/loadSde', () => ({ loadSkills: async () => [{ typeID: 3300 }, { typeID: 3301 }] }));

const { pilotUnder, statsOptions, useProjectedSources } = await import('./statsConditions');
const { useActiveCharacter } = await import('@/stores/activeCharacter');

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

describe('useProjectedSources', () => {
  it('lets go of every source when the active Character changes — they were that pilot’s own saved Fittings', () => {
    useActiveCharacter.setState({ activeCharacterId: 1 });
    const source = {
      id: 'a',
      name: 'Booster',
      count: 1,
      projection: { buffs: [{ id: 12, value: 25 }], effects: [] },
    };
    useProjectedSources.getState().setSources([source]);
    // A re-render of the same Character keeps them.
    useActiveCharacter.setState({ activeCharacterId: 1 });
    expect(useProjectedSources.getState().sources).toEqual([source]);
    useActiveCharacter.setState({ activeCharacterId: 2 });
    expect(useProjectedSources.getState().sources).toEqual([]);
  });
});
