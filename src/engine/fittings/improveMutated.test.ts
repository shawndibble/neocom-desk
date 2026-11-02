import { describe, expect, it } from 'vitest';
import { buildVariationIndex } from '../market/variations';
import { improveCandidates } from './improve';
import { makeoverMoves, rowsBetween } from './improveMakeover';
import { mutatedKept } from './improveMutated';
import type { Fitting, FittingModule } from './types';

// 10: a Tech I low module; 11 and 12 its siblings. Group 59 (Gyrostabilizer) holds 10 to 12 (the pool's one group).
const index = buildVariationIndex(
  {
    10: { parentTypeId: null, metaGroupId: 1 },
    11: { parentTypeId: 10, metaGroupId: 2 },
    12: { parentTypeId: 10, metaGroupId: 2 },
    // A mutated type has no variations of its own.
    900: { parentTypeId: null, metaGroupId: 15 },
  },
  { 1: 'Tech I', 2: 'Tech II', 15: 'Abyssal' }
);
const rackOf = { 10: 'low', 11: 'low', 12: 'low', 900: 'low' };
const pool = {
  groupOf: () => 59,
  typeIdsInGroup: () => [10, 11, 12, 900],
  published: (typeId: number) => typeId !== 900,
};
const rolled = (slotIndex: number, roll: number): FittingModule => ({
  slot: 'low',
  slotIndex,
  typeId: 900,
  state: 'online',
  mutation: { baseTypeId: 10, mutaplasmidTypeId: 1, attributes: { 50: roll } },
});
const plain = (slotIndex: number, typeId = 10): FittingModule => ({
  slot: 'low',
  slotIndex,
  typeId,
  state: 'online',
});
const options = { goal: 'overall', reach: 'rebalance', defense: 'keep', pool } as const;

describe('Improve and a fitted mutated module (#5800)', () => {
  it('proposes no swap on a mutated slot by default, and still swaps its plain neighbour', () => {
    const modules = [plain(0), rolled(1, 20)];
    const candidates = improveCandidates(modules, index, rackOf, options);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.at.some((at) => at.slotIndex === 1))).toBe(false);
    expect(candidates.every((c) => c.fromTypeId === 10)).toBe(true);
  });

  it('keeps two copies of one abyssal type with different rolls as separate candidates once opted in', () => {
    const candidates = improveCandidates(
      [rolled(0, 20), rolled(1, 25), plain(2), plain(3)],
      index,
      rackOf,
      {
        ...options,
        allowMutated: true,
      }
    );
    const fromMutated = candidates.filter((c) => c.fromTypeId === 900);
    const places = fromMutated.map((c) => c.at.map((at) => at.slotIndex).join());
    expect(new Set(places)).toEqual(new Set(['0', '1']));
    expect(fromMutated.every((c) => c.losesRoll === true)).toBe(true);
    // Plain copies still merge into one candidate, and never lose a roll.
    const merged = candidates.filter((c) => c.fromTypeId === 10);
    expect(merged.every((c) => c.at.length === 2 && c.losesRoll === undefined)).toBe(true);
  });

  it('keeps the Makeover off a mutated slot by default and names the lost roll when opted in', () => {
    const modules = [plain(0), rolled(1, 20)];
    const make = (allowMutated: boolean) =>
      makeoverMoves(modules, index, rackOf, {
        goal: 'overall',
        defense: 'keep',
        includeRigs: true,
        allowMutated,
        pool,
      });
    expect(make(false).some((m) => m.at[0].slotIndex === 1)).toBe(false);
    const opted = make(true).filter((m) => m.at[0].slotIndex === 1);
    expect(opted.length).toBeGreaterThan(0);
    expect(opted.every((m) => m.losesRoll === true)).toBe(true);
  });

  it('flags a Makeover row that replaces a mutated module', () => {
    const fit = (modules: FittingModule[]) => ({ modules }) as unknown as Fitting;
    const rows = rowsBetween(fit([plain(0), rolled(1, 20)]), fit([plain(0), plain(1, 11)]));
    expect(rows).toEqual([
      { fromTypeId: 900, toTypeId: 11, at: [{ slot: 'low', slotIndex: 1 }], losesRoll: true },
    ]);
  });

  describe('mutatedKept', () => {
    const modules = [plain(0), rolled(1, 20), rolled(2, 22)];
    it('counts the mutated modules left alone, and those the pilot cannot fly', () => {
      expect(mutatedKept(modules, false)).toEqual({ kept: 2, unflyable: 0 });
      expect(mutatedKept(modules, false, (m) => m.slotIndex !== 2)).toEqual({
        kept: 2,
        unflyable: 1,
      });
    });
    it('is zero when none are fitted, or when swaps are allowed', () => {
      expect(mutatedKept([plain(0)], false).kept).toBe(0);
      expect(mutatedKept(modules, true)).toEqual({ kept: 0, unflyable: 0 });
    });
  });
});
