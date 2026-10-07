import { describe, expect, it } from 'vitest';
import { ownedAtStation, subtractOwned } from './appraisalOwned';

const asset = (
  type_id: number,
  quantity: number,
  location_id: number,
  location_type: 'station' | 'item' = 'station'
) => ({ type_id, quantity, location_id, location_type });

describe('ownedAtStation', () => {
  it('sums quantities per type across Characters at one station', () => {
    const owned = ownedAtStation([[asset(34, 100, 1), asset(35, 5, 1)], [asset(34, 50, 1)]], 1);
    expect(owned.get(34)).toBe(150);
    expect(owned.get(35)).toBe(5);
  });

  it('ignores other stations and container contents', () => {
    const owned = ownedAtStation([[asset(34, 100, 2), asset(34, 7, 1, 'item')]], 1);
    expect(owned.size).toBe(0);
  });
});

describe('subtractOwned', () => {
  const items = [
    { typeId: 34, quantity: 100 },
    { typeId: 35, quantity: 10 },
    { typeId: 36, quantity: 5 },
  ];

  it('subtracts a partial holding', () => {
    expect(subtractOwned(items, new Map([[34, 40]]))[0]).toEqual({
      typeId: 34,
      quantity: 100,
      owned: 40,
      need: 60,
    });
  });

  it('caps owned at the wanted quantity when fully covered', () => {
    const [, covered] = subtractOwned(items, new Map([[35, 99]]));
    expect(covered).toMatchObject({ owned: 10, need: 0 });
  });

  it('leaves need equal to quantity when nothing is owned', () => {
    const [, , none] = subtractOwned(items, new Map());
    expect(none).toMatchObject({ owned: 0, need: 5 });
  });
});
