import { describe, expect, it } from 'vitest';
import { hullNamesFrom } from './hullNames';

const GROUPS = [
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 61, name: 'Frigates', parentId: 4, hasTypes: false },
  { id: 77, name: 'Minmatar', parentId: 61, hasTypes: true },
  { id: 9, name: 'Ship Equipment', parentId: null, hasTypes: false },
  { id: 615, name: 'Damage Controls', parentId: 9, hasTypes: true },
];

const type = (typeId: number, name: string, marketGroupId: number) => ({
  typeId,
  name,
  marketGroupId,
  volume: 1,
});

describe('hullNamesFrom', () => {
  it('keeps only types filed somewhere under the Ships root, lower-cased', () => {
    const names = hullNamesFrom(
      [type(587, 'Rifter', 77), type(2048, 'Damage Control II', 615)],
      GROUPS
    );
    expect([...names]).toEqual(['rifter']);
  });

  it('skips a type whose market group is unknown', () => {
    expect(hullNamesFrom([type(1, 'Orphan', 99999)], GROUPS).size).toBe(0);
  });
});
