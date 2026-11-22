import { describe, expect, it } from 'vitest';
import {
  divisionsPrimaryFirst,
  otherDivisions,
  primaryDivisionOf,
  readUncounted,
  uncountedToShow,
} from './uncounted';

describe('otherDivisions', () => {
  it('is every wallet division the book does not read', () => {
    expect(otherDivisions([1])).toEqual([2, 3, 4, 5, 6, 7]);
    expect(otherDivisions([1, 3, 7])).toEqual([2, 4, 5, 6]);
  });
});

describe('uncountedToShow', () => {
  const noted = (refId: number, division: number) => ({
    id: `j${division}_${refId}`,
    refId,
    division,
    characterId: 7,
    amount: 5_000_000,
    at: '2026-10-10T00:00:00.000Z',
  });
  const stored = { donations: [noted(1, 2), noted(2, 3)] };

  it('drops a donation once its division is one the book reads', () => {
    expect(uncountedToShow(stored, [1, 3]).map((u) => u.id)).toEqual(['j2_1']);
  });

  it('is nothing without a stored list', () => {
    expect(uncountedToShow(undefined, [1])).toEqual([]);
  });
});

describe('readUncounted', () => {
  it('keeps well-formed entries and drops garbage', () => {
    expect(
      readUncounted({
        donations: [
          {
            id: 'j2_1',
            refId: 1,
            division: 2,
            characterId: 7,
            amount: 5,
            at: '2026-10-10T00:00:00Z',
          },
          {
            id: 'j9_1',
            refId: 1,
            division: 9,
            characterId: 7,
            amount: 5,
            at: '2026-10-10T00:00:00Z',
          },
          { id: 'x', division: 2 },
          'nope',
        ],
      }).donations.map((u) => u.id)
    ).toEqual(['j2_1']);
    expect(readUncounted(undefined).donations).toEqual([]);
  });
});

describe('primaryDivisionOf', () => {
  it('is the chosen primary when the book reads it', () => {
    expect(primaryDivisionOf([1, 3], 3)).toBe(3);
  });

  it('falls back to the first division when none was chosen, or the chosen one is no longer read', () => {
    expect(primaryDivisionOf([2, 3], undefined)).toBe(2);
    expect(primaryDivisionOf([2, 3], 5)).toBe(2);
  });

  it('is the Master Wallet for a book with no divisions', () => {
    expect(primaryDivisionOf([], undefined)).toBe(1);
  });

  it('lists the primary first and the rest in order', () => {
    expect(divisionsPrimaryFirst([1, 2, 4], 4)).toEqual([4, 1, 2]);
    expect(divisionsPrimaryFirst([1, 2, 4], undefined)).toEqual([1, 2, 4]);
  });
});
