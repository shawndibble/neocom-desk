import { describe, expect, it } from 'vitest';
import { buildShipsWithMastery } from './shipCatalog';
import type { MasteryMap } from '@/sde/types';
import type { TypeMap } from '@/sde/types';

describe('buildShipsWithMastery', () => {
  it('names and sorts ships that carry mastery data', () => {
    const types: TypeMap = {
      '587': { name: 'Rifter', groupID: 25, volume: 27289 },
      '582': { name: 'Merlin', groupID: 25, volume: 16739 },
    };
    const masteries: MasteryMap = { '587': [[], [], [], [], []], '582': [[], [], [], [], []] };

    expect(buildShipsWithMastery(types, masteries)).toEqual([
      { typeID: 582, name: 'Merlin' },
      { typeID: 587, name: 'Rifter' },
    ]);
  });

  it('skips a mastery entry whose typeID is missing from types.json', () => {
    const types: TypeMap = { '587': { name: 'Rifter', groupID: 25, volume: 27289 } };
    const masteries: MasteryMap = { '587': [[]], '9999': [[]] };

    expect(buildShipsWithMastery(types, masteries)).toEqual([{ typeID: 587, name: 'Rifter' }]);
  });

  it('returns an empty list when no ship carries mastery data', () => {
    expect(buildShipsWithMastery({}, {})).toEqual([]);
  });
});
