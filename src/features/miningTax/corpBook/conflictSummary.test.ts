import { describe, expect, it } from 'vitest';
import type { ClosedDayPlan } from '@/engine/corpTaxBook/closedDayFix';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { conflictSiblings, summarizeConflicts } from './conflictSummary';

const view = (over: Partial<BookRowView>): BookRowView =>
  ({
    id: 'v',
    state: 'conflict',
    billed: 0,
    characterId: 1,
    date: '2026-10-28',
    solarSystemId: 30003838,
    ...over,
  }) as BookRowView;
const row = (v: BookRowView, corpName = 'Brass') =>
  ({ key: v.id, corp: { kind: 'row', corpName, view: v } }) as unknown as DisplayRow;

describe('summarizeConflicts', () => {
  it('counts a closed day whose records differ from the book and was already paid', () => {
    const paid = row(view({ id: 'p', state: 'paid', billed: 400, corporationId: 7 }));
    const plan = {
      characterId: 1,
      date: '2026-10-28',
      solarSystemId: 30003838,
      state: 'conflict',
      books: [{ corporationId: 7 }],
    } as unknown as ClosedDayPlan;
    expect(summarizeConflicts([paid], new Set(), [plan])).toMatchObject({
      days: 1,
      amount: 400,
      closed: 1,
    });
    expect(summarizeConflicts([paid], new Set(), [])).toBeNull();
  });

  it('is null with no Conflict in view', () => {
    expect(summarizeConflicts([row(view({ state: 'billed', billed: 500 }))])).toBeNull();
  });

  it('sums what every Conflict would bill, counts days, and leads with the first to resolve', () => {
    const late = row(
      view({ id: 'late', billed: 300, date: '2026-10-30', resolvesAt: '2026-11-20' }),
      'Ashfall'
    );
    const soon = row(view({ id: 'soon', billed: 200, resolvesAt: '2026-11-12' }), 'Brass');
    const sameDay = row(view({ id: 'same', billed: 100, resolvesAt: '2026-11-13' }), 'Other');
    const undated = row(view({ id: 'undated', billed: 50, date: '2026-10-29', resolvesAt: '' }));
    const out = summarizeConflicts([
      undated,
      late,
      row(view({ state: 'billed', billed: 999 })),
      soon,
      sameDay,
    ]);
    expect(out).toMatchObject({ days: 3, amount: 650, firstCorpName: 'Brass' });
    expect(out?.first).toBe(soon);
  });

  it('leaves out the days the member chose not to pay', () => {
    const hidden = row(view({ id: 'h', billed: 300, corporationId: 1, characterId: 1 }));
    const shown = row(view({ id: 's', billed: 200, date: '2026-10-29', corporationId: 1 }));
    const out = summarizeConflicts([hidden, shown], new Set(['day:1:1:2026-10-28']));
    expect(out).toMatchObject({ days: 1, amount: 200 });
    expect(summarizeConflicts([hidden], new Set(['day:1:1:2026-10-28']))).toBeNull();
  });

  it('counts a day sent to the corporation, and one whose ore it waived, as waiting', () => {
    const sent = row(
      view({
        id: 'sent',
        billed: 300,
        flagged: { kind: 'payee', state: 'sent', at: '2026-11-01T10:00:00Z' },
      })
    );
    const waived = row(
      view({
        id: 'waived',
        billed: 400,
        date: '2026-10-29',
        flagged: {
          kind: 'payee',
          state: 'dismissed',
          at: '2026-11-02T10:00:00Z',
          reason: 'Fair enough',
        },
      })
    );
    expect(summarizeConflicts([sent, waived])).toMatchObject({
      days: 2,
      waiting: 2,
      amount: 700,
    });
  });

  it('does not count a day the corporation handed back, so it still reads as a warning', () => {
    const rejected = row(
      view({
        id: 'rejected',
        billed: 250,
        flagged: {
          kind: 'payee',
          state: 'rejected',
          at: '2026-11-02T10:00:00Z',
          reason: 'Book stands',
        },
      })
    );
    expect(summarizeConflicts([rejected])).toMatchObject({ days: 1, waiting: 0, amount: 250 });
  });

  it('leads with a day the member can still act on, and reports when it resolves', () => {
    const sent = row(
      view({
        id: 'sent',
        billed: 300,
        resolvesAt: '2026-11-10T00:00:00Z',
        flagged: { kind: 'payee', state: 'sent', at: '2026-11-01T10:00:00Z' },
      })
    );
    const open = row(
      view({ id: 'open', billed: 100, date: '2026-10-31', resolvesAt: '2026-11-14T00:00:00Z' })
    );
    const out = summarizeConflicts([sent, open]);
    expect(out).toMatchObject({ days: 2, waiting: 1, firstResolvesOn: '2026-11-14' });
    expect(out?.first).toBe(open);
  });

  it('only calls a day waiting once every book contesting it has been answered', () => {
    const answered = row(
      view({
        id: 'a',
        billed: 300,
        flagged: { kind: 'payee', state: 'sent', at: '2026-11-01T10:00:00Z' },
      })
    );
    const open = row(view({ id: 'b', billed: 200 }), 'Other');
    expect(summarizeConflicts([answered, open])).toMatchObject({ days: 1, waiting: 0 });
  });
});

describe('conflictSiblings', () => {
  it("lists the day's other Conflict lines, of any book, and nothing else", () => {
    const self = view({ id: 'self', corporationId: 1 });
    const otherBook = view({ id: 'b', corporationId: 2 });
    const otherRefinery = view({ id: 'r', corporationId: 1 });
    const otherDay = view({ id: 'd', corporationId: 2, date: '2026-10-29' });
    const billed = view({ id: 'x', corporationId: 2, state: 'billed' });
    expect(
      conflictSiblings([self, otherBook, otherRefinery, otherDay, billed], self).map((r) => r.id)
    ).toEqual(['b', 'r']);
  });
});
