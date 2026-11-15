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
  openStatements: [],
  overdue: [],
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
    books: [{ corpName: 'Brass Meridian', summary: s, loaded: { corporationId: CORP } }],
  }) as unknown as CorpBookView;

describe('corpBookAttention', () => {
  it('is empty with no book', () => {
    expect(corpBookAttention(null)).toEqual({ overdue: [], uncredited: [], alsoBilled: [] });
  });

  it("names each book's Overdue Statements and the donations it never credited", () => {
    const overdue = {
      statementId: 's1',
      minerId: 'solo:1',
      code: 'ABC',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      overdueAt: '2026-11-14T00:00:00.000Z',
    };
    const donation = { characterId: 1, amount: 5_000_000, at: '2026-11-01T10:00:00Z' };
    const out = corpBookAttention(
      view([], summary({ overdue: [overdue], uncredited: [donation] }))
    );
    expect(out.overdue).toEqual([{ corporationId: CORP, corpName: 'Brass Meridian', ...overdue }]);
    expect(out.uncredited).toEqual([
      { corporationId: CORP, corpName: 'Brass Meridian', ...donation },
    ]);
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
});
