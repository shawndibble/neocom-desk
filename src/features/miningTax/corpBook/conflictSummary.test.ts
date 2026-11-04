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
