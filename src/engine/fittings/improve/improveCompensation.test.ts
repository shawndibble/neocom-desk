import { describe, expect, it } from 'vitest';
import { compensationSwaps } from './improveCompensation';
import { improveCandidates, type ModulePool } from './improve';
import { buildVariationIndex } from '../../market/variations';
import type { FittingModule } from '../types';

const index = buildVariationIndex(
  {
    10: { parentTypeId: null, metaGroupId: 1 },
    11: { parentTypeId: 10, metaGroupId: 2 },
    12: { parentTypeId: 10, metaGroupId: 4 },
    13: { parentTypeId: 10, metaGroupId: 5 },
    14: { parentTypeId: 10, metaGroupId: 6 },
    15: { parentTypeId: 10, metaGroupId: 2 },
    16: { parentTypeId: 10, metaGroupId: 2 },
    17: { parentTypeId: 10, metaGroupId: 2 },
  },
  { 1: 'Tech I', 2: 'Tech II', 4: 'Faction', 5: 'Officer', 6: 'Deadspace' }
);
const rackOf = {
  10: 'low',
  11: 'low',
  12: 'low',
  13: 'low',
  14: 'low',
  15: 'high',
  16: 'low',
  17: 'low',
};
const pool: ModulePool = {
  groupOf: () => 1,
  typeIdsInGroup: () => [],
  published: (typeId) => typeId !== 16,
  flyable: (_slot, typeId) => typeId !== 17,
};
const low = (slotIndex: number, extra: Partial<FittingModule> = {}): FittingModule =>
  ({ slot: 'low', slotIndex, typeId: 10, state: 'online', ...extra }) as FittingModule;

describe('compensationSwaps', () => {
  it('offers each fitted module’s listed, flyable, same-rack siblings, never Officer or Deadspace', () => {
    expect(compensationSwaps([low(0)], index, rackOf, pool)).toEqual([
      { slot: 'low', slotIndex: 0, fromTypeId: 10, toTypeId: 11 },
      { slot: 'low', slotIndex: 0, fromTypeId: 10, toTypeId: 12 },
    ]);
  });

  it('never swaps a mutated module, which would lose its roll (#5800)', () => {
    const mutated = low(1, {
      mutation: { baseTypeId: 10, mutaplasmidTypeId: 99, attributes: {} },
    } as Partial<FittingModule>);
    const swaps = compensationSwaps([low(0), mutated], index, rackOf, pool);
    expect(swaps.every((swap) => swap.slotIndex === 0)).toBe(true);
  });

  it('never swaps a subsystem', () => {
    const subsystem = { ...low(0), slot: 'subsystem' } as FittingModule;
    expect(compensationSwaps([subsystem], index, rackOf, pool)).toEqual([]);
  });

  it('shares the Officer and Deadspace rule with the candidates', () => {
    const offered = (includeOfficer: boolean) =>
      improveCandidates([low(0)], index, rackOf, {
        reach: 'upgrade',
        includeOfficer,
        pool,
      }).map((c) => c.toTypeId);
    expect(offered(false)).toEqual([11, 12]);
    expect(offered(true)).toEqual([11, 12, 13, 14]);
  });
});
