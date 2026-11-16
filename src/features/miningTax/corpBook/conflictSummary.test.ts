import { describe, expect, it } from 'vitest';
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
  it('is null with no Conflict in view', () => {
    expect(summarizeConflicts([row(view({ state: 'billed', billed: 500 }))])).toBeNull();
  });

  it('sums what every Conflict would bill, counts days, and leads with the first to resolve', () => {
    const late = row(
      view({ id: 'late', billed: 300, date: '2026-10-30', resolvesAt: '2026-11-20' }),
      'Ashfall'
    );
    const soon = row(view({ id: 'soon', billed: 200, resolvesAt: '2026-11-12' }), 'Brass');
    // A second book on the same day as `soon`: one day, two lines.
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

  // #6206: once the member has acted, the prompt is asking them to review something they
  // cannot move. The officer's answer is what brings it back.
  it('leaves out a day already sent to the corporation, and one whose ore it waived', () => {
    const sent = row(
      view({ id: 'sent', billed: 300, flagged: { state: 'sent', at: '2026-11-01T10:00:00Z' } })
    );
    const waived = row(
      view({
        id: 'waived',
        billed: 400,
        date: '2026-10-29',
        flagged: { state: 'dismissed', at: '2026-11-02T10:00:00Z', reason: 'Fair enough' },
      })
    );
    expect(summarizeConflicts([sent, waived])).toBeNull();
  });

  it('keeps a day the corporation handed back, so the member answers it again', () => {
    const rejected = row(
      view({
        id: 'rejected',
        billed: 250,
        flagged: { state: 'rejected', at: '2026-11-02T10:00:00Z', reason: 'Book stands' },
      })
    );
    expect(summarizeConflicts([rejected])).toMatchObject({ days: 1, amount: 250 });
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
