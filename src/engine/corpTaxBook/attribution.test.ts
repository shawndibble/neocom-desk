import { describe, it, expect } from 'vitest';
import { CONFLICT_RESOLVE_DAYS, resolveBookShare, splitAcrossBooks } from './attribution';

const ORE_A = 45490;
const ORE_B = 45491;

describe('splitAcrossBooks', () => {
  it('gives each book in the system its observed quantity; ore no book claims is Unattributed', () => {
    expect(
      splitAcrossBooks(
        [
          { typeId: ORE_A, quantity: 1000 },
          { typeId: ORE_B, quantity: 300 },
        ],
        [
          { bookId: 'corpX', oreLines: [{ typeId: ORE_A, quantity: 600 }] },
          {
            bookId: 'corpY',
            oreLines: [
              { typeId: ORE_A, quantity: 300 },
              { typeId: ORE_B, quantity: 100 },
            ],
          },
        ]
      )
    ).toEqual({
      byBook: new Map([
        ['corpX', [{ typeId: ORE_A, quantity: 600 }]],
        [
          'corpY',
          [
            { typeId: ORE_A, quantity: 300 },
            { typeId: ORE_B, quantity: 100 },
          ],
        ],
      ]),
      unattributed: [
        { typeId: ORE_A, quantity: 100 },
        { typeId: ORE_B, quantity: 200 },
      ],
    });
  });

  it('splits by observed quantity when the books claim more than the personal ledger shows', () => {
    const { byBook, unattributed } = splitAcrossBooks(
      [{ typeId: ORE_A, quantity: 1000 }],
      [
        { bookId: 'corpX', oreLines: [{ typeId: ORE_A, quantity: 900 }] },
        { bookId: 'corpY', oreLines: [{ typeId: ORE_A, quantity: 300 }] },
      ]
    );
    expect(byBook.get('corpX')).toEqual([{ typeId: ORE_A, quantity: 750 }]);
    expect(byBook.get('corpY')).toEqual([{ typeId: ORE_A, quantity: 250 }]);
    expect(unattributed).toEqual([]);
  });

  it('never loses or invents a unit to rounding', () => {
    const { byBook } = splitAcrossBooks(
      [{ typeId: ORE_A, quantity: 100 }],
      [
        { bookId: 'a', oreLines: [{ typeId: ORE_A, quantity: 100 }] },
        { bookId: 'b', oreLines: [{ typeId: ORE_A, quantity: 100 }] },
        { bookId: 'c', oreLines: [{ typeId: ORE_A, quantity: 100 }] },
      ]
    );
    const total = [...byBook.values()].flat().reduce((sum, l) => sum + l.quantity, 0);
    expect(total).toBe(100);
  });

  it('leaves the whole entry Unattributed with no books', () => {
    expect(splitAcrossBooks([{ typeId: ORE_A, quantity: 10 }], [])).toEqual({
      byBook: new Map(),
      unattributed: [{ typeId: ORE_A, quantity: 10 }],
    });
  });
});

describe('resolveBookShare', () => {
  it('takes the corp’s share from Unattributed first, with no conflict', () => {
    expect(
      resolveBookShare({
        share: [{ typeId: ORE_A, quantity: 500 }],
        free: [{ typeId: ORE_A, quantity: 800 }],
        now: '2026-07-20T00:00:00Z',
      })
    ).toEqual({
      fromFree: [{ typeId: ORE_A, quantity: 500 }],
      freeLeft: [{ typeId: ORE_A, quantity: 300 }],
      conflict: [],
      conflictOwed: false,
    });
  });

  it('what Unattributed cannot cover, because the member gave it to another Payee, is a visible conflict — not owed', () => {
    expect(
      resolveBookShare({
        share: [{ typeId: ORE_A, quantity: 500 }],
        free: [{ typeId: ORE_A, quantity: 200 }],
        conflictSince: '2026-07-15T00:00:00Z',
        now: '2026-07-20T00:00:00Z',
      })
    ).toEqual({
      fromFree: [{ typeId: ORE_A, quantity: 200 }],
      freeLeft: [],
      conflict: [{ typeId: ORE_A, quantity: 300 }],
      conflictOwed: false,
      conflictResolvesAt: '2026-07-29T00:00:00.000Z',
    });
  });

  it('returns the free ore it left, so the next book in the system cannot claim it again', () => {
    const first = resolveBookShare({
      share: [{ typeId: ORE_A, quantity: 500 }],
      free: [{ typeId: ORE_A, quantity: 800 }],
      now: '2026-07-20T00:00:00Z',
    });
    expect(first.freeLeft).toEqual([{ typeId: ORE_A, quantity: 300 }]);
    const second = resolveBookShare({
      share: [{ typeId: ORE_A, quantity: 400 }],
      free: first.freeLeft,
      now: '2026-07-20T00:00:00Z',
    });
    expect(second.conflict).toEqual([{ typeId: ORE_A, quantity: 100 }]);
  });

  it('the conflict resolves to the corp 14 days after it was raised', () => {
    expect(CONFLICT_RESOLVE_DAYS).toBe(14);
    const result = resolveBookShare({
      share: [{ typeId: ORE_A, quantity: 500 }],
      free: [],
      conflictSince: '2026-07-15T00:00:00Z',
      now: '2026-07-29T00:00:00Z',
    });
    expect(result).toMatchObject({
      conflict: [{ typeId: ORE_A, quantity: 500 }],
      conflictOwed: true,
    });
  });

  it('a conflict not yet raised starts its clock now', () => {
    expect(
      resolveBookShare({
        share: [{ typeId: ORE_A, quantity: 1 }],
        free: [],
        now: '2026-07-20T00:00:00Z',
      })
    ).toMatchObject({ conflictOwed: false, conflictResolvesAt: '2026-08-03T00:00:00.000Z' });
  });
});
