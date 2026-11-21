import { describe, expect, it } from 'vitest';
import type { BookRowView, BookSummary } from '@/engine/corpTaxBook/personal';
import { corpBookAttention } from './corpAttention';
import type { CorpBookView } from './corpBookView';

const CORP = 98000001;

const summary = (over: Partial<BookSummary> = {}): BookSummary => ({
  corporationId: CORP,
  corpName: 'Brass Meridian',
  startDate: '2026-10-01',
  credit: 0,
  account: { paidThrough: null, owes: null },
  miners: [],
  notices: [],
  uncredited: [],
  hubId: 'jita',
  oreForm: 'compressed',
  ...over,
});

const row = (over: Partial<BookRowView>): BookRowView =>
  ({
    id: 'r1',
    corporationId: CORP,
    corpName: 'Brass Meridian',
    state: 'billed',
    ...over,
  }) as BookRowView;

const view = (rows: BookRowView[], s: BookSummary): CorpBookView =>
  ({
    overlay: { rows },
    books: [
      {
        corpName: 'Brass Meridian',
        summary: s,
        loaded: { corporationId: CORP, characterIds: [], notices: [] },
      },
    ],
  }) as unknown as CorpBookView;

describe('corpBookAttention', () => {
  it('is empty with no book', () => {
    expect(corpBookAttention(null)).toEqual({
      overdue: [],
      uncredited: [],
      inReview: [],
      alsoBilled: [],
    });
  });

  it("names each book's unpaid Late notices and the donations it never credited", () => {
    const overdue = {
      noticeId: 'n1',
      minerId: 'solo:1',
      code: 'ABC',
      issuedAt: '2026-11-01T00:00:00.000Z',
      from: '2026-10-01',
      through: '2026-10-31',
      remaining: 100,
    };
    const donation = {
      characterId: 1,
      amount: 5_000_000,
      at: '2026-11-01T10:00:00Z',
      covered: ['2026-10-30'],
    };
    const out = corpBookAttention(
      view([], summary({ notices: [overdue], uncredited: [donation] }))
    );
    expect(out.overdue).toEqual([{ corporationId: CORP, corpName: 'Brass Meridian', ...overdue }]);
    expect(out.uncredited).toEqual([
      { corporationId: CORP, corpName: 'Brass Meridian', ...donation },
    ]);
  });

  describe('donations the book holds for review without counting them (#6207)', () => {
    const held = (id: string, at: string, characterId = 1, amount = 26_952_549) => ({
      id,
      characterId,
      amount,
      at,
    });
    const withHeld = (inReview: ReturnType<typeof held>[], s = summary()) =>
      ({
        overlay: { rows: [] },
        books: [
          {
            corpName: 'Brass Meridian',
            summary: s,
            loaded: {
              corporationId: CORP,
              startDate: '2026-11-01',
              characterIds: [1, 2],
              notices: [],
              miners: [],
              inReview,
            },
          },
        ],
      }) as unknown as CorpBookView;

    it('lists them once per book, from the book start on, for the Characters in view', () => {
      const out = corpBookAttention(
        withHeld([
          held('j5_2', '2026-11-14T18:28:44.000Z', 1, 10_976_509),
          held('j5_1', '2026-11-02T22:38:44.000Z'),
          // Paid before the book bills from: it paid no mining the book bills.
          held('j5_0', '2026-10-21T17:38:23.000Z'),
          held('j5_9', '2026-11-03T00:00:00.000Z', 2),
        ]),
        new Set([1])
      );
      expect(out.inReview).toEqual([
        {
          corporationId: CORP,
          corpName: 'Brass Meridian',
          donations: [
            held('j5_1', '2026-11-02T22:38:44.000Z'),
            held('j5_2', '2026-11-14T18:28:44.000Z', 1, 10_976_509),
          ],
        },
      ]);
      expect(
        corpBookAttention(withHeld([held('j5_0', '2026-10-21T17:38:23.000Z')])).inReview
      ).toEqual([]);
    });

    // Counted at once, each to its own Miner: never tied to one Late notice a waiting
    // declaration could block.
    it('names no Late notice, even when the donor Miner has one unpaid', () => {
      const out = corpBookAttention(
        withHeld(
          [held('j5_1', '2026-11-02T22:38:44.000Z')],
          summary({
            notices: [
              {
                noticeId: 'n1',
                minerId: 'solo:1',
                code: 'n1',
                issuedAt: '2026-11-08T00:00:00Z',
                from: '2026-11-01',
                through: '2026-11-07',
                remaining: 100,
              },
            ],
          })
        )
      );
      expect(out.inReview[0]).not.toHaveProperty('noticeId');
    });
  });

  it('names the Payees whose unpaid ore a book bills too, once per book, with the first day', () => {
    const overlap = (payeeIds: string[], paid = false) => ({ payeeIds, ore: [], paid });
    const out = corpBookAttention(
      view(
        [
          row({ id: 'a', date: '2026-10-17', overlap: overlap(['p1']) }),
          row({ id: 'b', date: '2026-10-16', overlap: overlap(['p2']) }),
          row({ id: 'c', overlap: overlap(['p3'], true) }),
          row({ id: 'd', state: 'conflict', overlap: overlap(['p4']) }),
        ],
        summary()
      )
    );
    expect(out.alsoBilled).toEqual([
      { corporationId: CORP, corpName: 'Brass Meridian', payeeIds: ['p1', 'p2'], rowId: 'a' },
    ]);
  });

  describe('with a Character filter', () => {
    const overdue = (noticeId: string) => ({
      noticeId,
      minerId: 'solo:1',
      code: noticeId,
      issuedAt: '2026-11-01T00:00:00.000Z',
      from: '2026-10-01',
      through: '2026-10-31',
      remaining: 100,
    });
    const notice = (id: string, characterIds: number[]) => ({ id, characterIds });
    const filteredView = (rows: BookRowView[], s: BookSummary): CorpBookView =>
      ({
        overlay: { rows },
        books: [
          {
            corpName: 'Brass Meridian',
            summary: s,
            loaded: {
              corporationId: CORP,
              characterIds: [1, 2],
              notices: [notice('s1', [1]), notice('s2', [2, 1]), notice('s3', [])],
            },
          },
        ],
      }) as unknown as CorpBookView;
    const overlap = (payeeIds: string[]) => ({ payeeIds, ore: [], paid: false });
    const books = filteredView(
      [
        row({ id: 'a', characterId: 1, overlap: overlap(['p1']) }),
        row({ id: 'b', characterId: 2, overlap: overlap(['p2']) }),
      ],
      summary({
        notices: [overdue('s1'), overdue('s2'), overdue('s3')],
        uncredited: [
          { characterId: 1, amount: 1, at: '2026-11-01T10:00:00Z', covered: [] },
          { characterId: 2, amount: 2, at: '2026-11-01T10:00:00Z', covered: [] },
        ],
      })
    );

    it('keeps only what the Characters in view mined, paid or are billed for', () => {
      const out = corpBookAttention(books, new Set([2]));
      expect(out.overdue.map((o) => [o.noticeId, o.declarerId])).toEqual([['s2', 2]]);
      expect(out.uncredited.map((u) => u.characterId)).toEqual([2]);
      expect(out.alsoBilled).toEqual([
        { corporationId: CORP, corpName: 'Brass Meridian', payeeIds: ['p2'], rowId: 'b' },
      ]);
    });

    it('keeps everything, with the first tracked declarer, for all Characters', () => {
      const out = corpBookAttention(books, 'all');
      expect(out.overdue.map((o) => [o.noticeId, o.declarerId])).toEqual([
        ['s1', 1],
        ['s2', 2],
        ['s3', undefined],
      ]);
      expect(out.uncredited).toHaveLength(2);
      expect(out.alsoBilled[0].payeeIds).toEqual(['p1', 'p2']);
    });
  });
});
