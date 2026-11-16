import { describe, expect, it } from 'vitest';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import {
  figureNeedsAnswer,
  keptBy,
  keptTarget,
  overdueTarget,
  rowTarget,
  uncreditedTarget,
} from './targets';

const row = (over: Partial<BookRowView> = {}) =>
  ({
    id: '1:7:2026-11-06',
    corporationId: 1,
    corpName: 'Bureau',
    characterId: 7,
    date: '2026-11-06',
    state: 'billed',
    recordKey: '7:1000:2026-11-06',
    oreLines: [{ typeId: 1, quantity: 9 }],
    billed: 100,
    ...over,
  }) as BookRowView;

const rejectedFlag = {
  state: 'rejected' as const,
  kind: 'quantity' as const,
  at: '2026-11-10T00:00:00Z',
  reason: 'The book is right',
  nextStep: 'Pay it, or re-mine the shortfall',
};

describe('what an officer kept', () => {
  // The member reads the officer's next step word for word, with Resolve again.
  it('reads a rejected dispute on a billed day with the next step, word for word', () => {
    const r = row({ flagged: rejectedFlag });
    expect(keptBy(r)).toBe('dispute');
    expect(keptTarget(r).problem).toMatchObject({
      kind: 'kept',
      by: 'dispute',
      nextStep: 'Pay it, or re-mine the shortfall',
      reason: 'The book is right',
    });
  });

  it('reads a rejected declaration with its next step, keyed to its Statement', () => {
    const r = row({
      statementId: 's1',
      declaration: { state: 'rejected', at: 'x', reason: 'No contract', nextStep: 'Send the ref' },
    });
    expect(keptBy(r)).toBe('declaration');
    const t = keptTarget(r);
    expect(t.problem).toMatchObject({
      by: 'declaration',
      nextStep: 'Send the ref',
      statementId: 's1',
    });
    expect(t.hideKey).toBe('statement:1:s1');
  });

  // The kept warning must go once the member pays the day.
  it('is gone once the kept day is paid, but not while a mark leaves the book owing', () => {
    expect(keptBy(row({ state: 'paid', flagged: rejectedFlag }))).toBeUndefined();
    expect(keptBy(row({ state: 'paid', bookOwed: 50, flagged: rejectedFlag }))).toBe('dispute');
  });
});

describe('figure items', () => {
  it('appear only when the book bills more than the member record, with something to dispute', () => {
    const more = row({
      personalOreLines: [{ typeId: 1, quantity: 5 }],
      dispute: { quantity: true, rate: false, bookQuantity: 9, personalQuantity: 5 } as never,
    });
    expect(figureNeedsAnswer(more)).toBe(true);
    const less = row({
      oreLines: [{ typeId: 1, quantity: 5 }],
      personalOreLines: [{ typeId: 1, quantity: 9 }],
      dispute: { quantity: true, rate: false, bookQuantity: 5, personalQuantity: 9 } as never,
    });
    expect(figureNeedsAnswer(less)).toBe(false);
  });
});

describe('targets', () => {
  it('an uncredited group is answered once a declaration waits on its Statement, and names every day', () => {
    const donation = {
      characterId: 7,
      corporationId: 1,
      corpName: 'Bureau',
      amount: 5,
      at: '2026-11-08T00:00:00Z',
      refId: 3,
      covered: ['2026-11-07', '2026-11-06'],
    };
    const days = ['2026-11-06', '2026-11-07'].map((date) =>
      row({ date, statementId: 's1', declaration: { state: 'waiting', at: 'x' } })
    );
    const t = uncreditedTarget([donation], days);
    expect(t.answered).toBe(true);
    expect(t.problem).toMatchObject({ days: ['2026-11-06', '2026-11-07'] });
    const fresh = uncreditedTarget(
      [donation],
      days.map((d) => ({ ...d, declaration: undefined }) as BookRowView)
    );
    expect(fresh.answered).toBe(false);
  });

  it('an Overdue Statement carries its rejected declaration', () => {
    const declaration = { state: 'rejected' as const, at: 'x', nextStep: 'Send the ref' };
    const t = overdueTarget({
      corporationId: 1,
      corpName: 'Bureau',
      statementId: 's1',
      characterId: 7,
      periodStart: '2026-10-01',
      period: 'Oct',
      declaration,
    });
    expect(t.declaration).toEqual(declaration);
    expect(t.problem.kind).toBe('overdue');
  });

  it('a day with nothing to resolve has no target', () => {
    expect(rowTarget(row())).toBeUndefined();
    expect(rowTarget(row({ state: 'conflict' }))?.problem.kind).toBe('conflict');
  });
});
