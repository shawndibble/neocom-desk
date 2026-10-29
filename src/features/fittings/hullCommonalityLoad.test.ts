import { describe, expect, it } from 'vitest';
import type { WorkbenchGameData } from '@/engine/fittings/workbenchFitCheck';
import { loadHullCommonality } from './hullCommonalityLoad';

const gameData = async () => ({}) as WorkbenchGameData;

describe('loadHullCommonality', () => {
  it('is null when the fits cannot be read, a hull has none, or the game data fails', async () => {
    expect(
      await loadHullCommonality(1, {}, { workbenchFits: async () => ({ ok: false }), gameData })
    ).toBeNull();
    expect(
      await loadHullCommonality(
        1,
        {},
        { workbenchFits: async () => ({ ok: true, fits: [] }), gameData }
      )
    ).toBeNull();
    const fit = { id: 'a', name: 'PvE', authorId: null, authorName: '', dateAdded: 1, eft: '' };
    expect(
      await loadHullCommonality(
        1,
        {},
        {
          workbenchFits: async () => ({ ok: true, fits: [fit] }),
          gameData: async () => {
            throw new Error('offline');
          },
        }
      )
    ).toBeNull();
  });
});
