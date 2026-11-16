import { describe, expect, it } from 'vitest';
import type { Statement } from './statements';
import type { JournalDonation } from './sync';
import {
  UNCOUNTED_LIMIT,
  noteUncounted,
  otherDivisions,
  readUncounted,
  uncountedToShow,
} from './uncounted';

const donation = (over: Partial<JournalDonation> = {}): JournalDonation => ({
  refId: 1,
  division: 2,
  characterId: 7,
  amount: 5_000_000,
  at: '2026-10-10T00:00:00.000Z',
  ...over,
});

const book = {
  miners: [{ id: 'm1', characterIds: [7, 8], mainCharacterId: 7 }],
  statements: [{ id: 's1', minerId: 'm1', code: 'MT-AB12' }] as unknown as Statement[],
  knownCharacterIds: new Set([9]),
  openBalance: new Map([['m1', 10_000_000]]),
  unbilled: new Set<string>(),
};

describe('otherDivisions', () => {
  it('is every wallet division the book does not read', () => {
    expect(otherDivisions([1])).toEqual([2, 3, 4, 5, 6, 7]);
    expect(otherDivisions([1, 3, 7])).toEqual([2, 4, 5, 6]);
  });
});

describe('noteUncounted (#6207)', () => {
  it('notes a donation from a Miner who owes, into a division the book does not read', () => {
    expect(noteUncounted([donation()], book)).toEqual([
      {
        id: 'j2_1',
        refId: 1,
        division: 2,
        characterId: 7,
        amount: 5_000_000,
        at: '2026-10-10T00:00:00.000Z',
      },
    ]);
  });

  it('notes one carrying a pay code, from anyone', () => {
    expect(noteUncounted([donation({ characterId: 555, reason: 'MT-AB12' })], book)).toHaveLength(
      1
    );
  });

  it('leaves out strangers and Miners who owe nothing: likely not tax', () => {
    expect(noteUncounted([donation({ characterId: 555 })], book)).toEqual([]);
    expect(noteUncounted([donation({ characterId: 9 })], book)).toEqual([]);
    expect(noteUncounted([donation()], { ...book, openBalance: new Map() })).toEqual([]);
    // A Miner with ore not yet billed owes too.
    expect(
      noteUncounted([donation()], { ...book, openBalance: new Map(), unbilled: new Set(['m1']) })
    ).toHaveLength(1);
  });

  it('leaves out a Miner whose debt this sync’s counted donation already paid', () => {
    const paid = donation({ division: 1, refId: 9, amount: 10_000_000, minerId: 'm1' });
    expect(noteUncounted([donation()], book, [paid])).toEqual([]);
    expect(noteUncounted([donation()], book, [{ ...paid, amount: 1 }])).toHaveLength(1);
  });

  it('keeps the newest, up to the limit', () => {
    const many = Array.from({ length: UNCOUNTED_LIMIT + 5 }, (_, i) =>
      donation({ refId: i + 1, at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() })
    );
    const noted = noteUncounted(many, book);
    expect(noted).toHaveLength(UNCOUNTED_LIMIT);
    expect(noted[0].id).toBe(`j2_${UNCOUNTED_LIMIT + 5}`);
  });
});

describe('uncountedToShow', () => {
  const stored = {
    donations: noteUncounted([donation(), donation({ refId: 2, division: 3 })], book),
  };

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
