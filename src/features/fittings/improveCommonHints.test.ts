import { describe, expect, it } from 'vitest';
import type { JobCommonality } from '@/engine/fittings/hullCommonality';
import type { FittingModule } from '@/engine/fittings/types';
import { cautionLines, communityHintsOf, hintLine } from './improveCommonHints';
import type { FittingCatalogue } from './useFittingCatalogue';

// Types: 1 and 2 are Ballistic Controls (group 367), 3 a Shield Extender (38, in "Large Shield Extenders"), 4 a propulsion module (46).
const catalogue = {
  types: {
    '24698': { name: 'Drake', groupID: 419 },
    '1': { name: 'Ballistic Control System I', groupID: 367 },
    '2': { name: 'Ballistic Control System II', groupID: 367 },
    '3': { name: 'Large Shield Extender II', groupID: 38 },
    '4': { name: '10MN Afterburner II', groupID: 46 },
  },
  typeIdsByGroup: new Map([
    [367, [1, 2]],
    [38, [3]],
    [46, [4]],
  ]),
  marketTypes: [
    { typeId: 1, marketGroupId: 10 },
    { typeId: 2, marketGroupId: 10 },
    { typeId: 3, marketGroupId: 20 },
    { typeId: 4, marketGroupId: 30 },
  ],
  groupsById: new Map([
    [10, { id: 10, name: 'Ballistic Control Systems', parentId: null }],
    [20, { id: 20, name: 'Large Shield Extenders', parentId: 21 }],
    [21, { id: 21, name: 'Shield Extenders', parentId: null }],
    [30, { id: 30, name: 'Afterburners', parentId: null }],
  ]),
} as unknown as FittingCatalogue;

const commonality: JobCommonality = {
  fits: 20,
  groupShare: new Map([
    [367, 0.98],
    [38, 0.55],
    [46, 0.76],
  ]),
  propulsion: { afterburner: 0.5, mwd: 0.2, mjd: 0 },
};
const mod = (typeId: number): FittingModule =>
  ({ slot: 'low', slotIndex: 0, typeId, state: 'active' }) as FittingModule;
const t = ((key: string, o: Record<string, unknown>) =>
  `${key}|${JSON.stringify(o)}`) as unknown as Parameters<typeof hintLine>[0];

describe('community hints', () => {
  const hints = communityHintsOf(
    commonality,
    'pve',
    catalogue,
    24698,
    [mod(2), mod(3)],
    [{ fromTypeId: 2, toTypeId: 3, at: [{}] }]
  );

  it('names a target group on at least half the fits, by its market group, one level up for a size tier', () => {
    expect(hintLine(t, hints, { toTypeId: 1 })).toContain('"group":"Ballistic Control Systems"');
    expect(hintLine(t, hints, { toTypeId: 1 })).toContain('"percent":98');
    expect(hintLine(t, hints, { toTypeId: 1 })).toContain('"hull":"Drake"');
    expect(hintLine(t, hints, { toTypeId: 3 })).toContain('"group":"Shield Extenders"');
  });

  it('says nothing for the mixed propulsion group, an unknown type or no data', () => {
    expect(hintLine(t, hints, { toTypeId: 4 })).toBeNull();
    expect(hintLine(t, hints, { toTypeId: 99 })).toBeNull();
    expect(hintLine(t, undefined, { toTypeId: 1 })).toBeNull();
  });

  it('cautions about a group at least 80% of fits keep that the Makeover removes', () => {
    expect(cautionLines(t, hints)).toHaveLength(1);
    expect(cautionLines(t, hints)[0]).toContain('"group":"Ballistic Control Systems"');
    expect(cautionLines(t, undefined)).toEqual([]);
  });
});
