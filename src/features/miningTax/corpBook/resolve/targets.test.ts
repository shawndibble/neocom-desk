import { describe, expect, it } from 'vitest';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import {
  figureNeedsAnswer,
  keptBy,
  keptTarget,
  notPayingHides,
  overdueTarget,
  proofSenders,
  rowTarget,
  uncreditedTarget,
  inReviewTarget,
} from './targets';
import { notPayingDayKey, uncreditedKey } from './notPaying';

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

  it('reads a rejected declaration with its next step, keyed to its Late notice', () => {
    const r = row({
      noticeId: 's1',
      declaration: { state: 'rejected', at: 'x', reason: 'No contract', nextStep: 'Send the ref' },
    });
    expect(keptBy(r)).toBe('declaration');
    const t = keptTarget(r);
    expect(t.problem).toMatchObject({
      by: 'declaration',
      nextStep: 'Send the ref',
      noticeId: 's1',
    });
    expect(t.hideKey).toBe('keptStatement:1:s1:x');
  });

  it('hides an officer answer only: a new answer on a hidden day shows again', () => {
    const first = row({ flagged: rejectedFlag });
    const hidden = new Set([keptTarget(first).hideKey]);
    expect(notPayingHides(hidden, first)).toBe(true);
    const later = row({ flagged: { ...rejectedFlag, at: '2026-11-12T00:00:00Z' } });
    expect(keptTarget(later).hideKey).not.toBe(keptTarget(first).hideKey);
    expect(notPayingHides(hidden, later)).toBe(false);
  });

  it('a day hidden before an officer rejected it shows the kept bill, and the pill stops saying Not paying', () => {
    const hidden = new Set([notPayingDayKey(1, 7, '2026-11-06')]);
    expect(notPayingHides(hidden, row())).toBe(true);
    expect(notPayingHides(hidden, row({ state: 'conflict' }))).toBe(true);
    expect(notPayingHides(hidden, row({ flagged: rejectedFlag }))).toBe(false);
  });

  it('reads Not paying the same for a Late notice day and an uncredited donation day', () => {
    expect(notPayingHides(new Set(['statement:1:s1']), row({ noticeId: 's1' }))).toBe(true);
    const donated = row({ unlinkedDonation: { amount: 5, at: '2026-11-08T00:00:00Z' } });
    expect(
      notPayingHides(
        new Set([uncreditedKey(1, ['2026-11-07T00:00:00Z', '2026-11-08T00:00:00Z'])]),
        donated
      )
    ).toBe(true);
    expect(notPayingHides(new Set([uncreditedKey(1, ['2026-11-09T00:00:00Z'])]), donated)).toBe(
      false
    );
  });

  it('a Late notice whose days are unpaid hides its rejected declaration by the answer, not the notice', () => {
    const o = {
      corporationId: 1,
      corpName: 'Bureau',
      noticeId: 's1',
      characterId: 7,
      periodStart: '2026-10-01',
      period: 'Oct',
    };
    expect(overdueTarget(o).hideKey).toBe('statement:1:s1');
    expect(overdueTarget({ ...o, declaration: { state: 'rejected', at: 'y' } }).hideKey).toBe(
      'keptStatement:1:s1:y'
    );
  });

  it('is gone once the kept day is paid', () => {
    expect(keptBy(row({ state: 'paid', flagged: rejectedFlag }))).toBeUndefined();
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
  it('an uncredited group is answered once a declaration waits on its Late notice, and names every day', () => {
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
      row({ date, noticeId: 's1', declaration: { state: 'waiting', at: 'x' } })
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

  it('a Late notice whose days are unpaid carries its rejected declaration', () => {
    const declaration = { state: 'rejected' as const, at: 'x', nextStep: 'Send the ref' };
    const t = overdueTarget({
      corporationId: 1,
      corpName: 'Bureau',
      noticeId: 's1',
      characterId: 7,
      periodStart: '2026-10-01',
      period: 'Oct',
      declaration,
    });
    expect(t.declaration).toEqual(declaration);
    expect(t.problem.kind).toBe('overdue');
  });

  it('a rejected declaration is the kept item, not also an uncredited one', () => {
    const donation = {
      characterId: 7,
      corporationId: 1,
      corpName: 'Bureau',
      amount: 5,
      at: '2026-11-08T00:00:00Z',
      refId: 3,
      covered: ['2026-11-06'],
    };
    const rejected = row({
      noticeId: 's1',
      declaration: { state: 'rejected', at: 'y', nextStep: 'Send it' },
    });
    expect(uncreditedTarget([donation], [rejected]).answered).toBe(true);
  });

  it('a plain billed day has a Resolve, a paid one none', () => {
    expect(rowTarget(row())?.problem.kind).toBe('billed');
    expect(rowTarget(row({ state: 'paid' }))).toBeUndefined();
  });

  it("only a Late notice's own Characters can be the senders of its proof", () => {
    const book = {
      notices: [{ id: 's1', minerId: 'm1' }] as never,
      miners: [{ id: 'm1', characterIds: [7, 8], mainCharacterId: 7 }],
    };
    expect(proofSenders(book, { characterId: 7, noticeId: 's1' })).toEqual([7, 8]);
    expect(proofSenders(book, { characterId: 9 })).toEqual([9]);
  });

  it('a day with nothing to resolve has no target', () => {
    expect(rowTarget(row({ state: 'dismissed' }))).toBeUndefined();
    expect(rowTarget(row({ state: 'conflict' }))?.problem.kind).toBe('conflict');
  });
});

describe('inReviewTarget (donations the book holds for review)', () => {
  const group = {
    corporationId: 1,
    corpName: 'Bureau',
    donations: [
      {
        id: 'j5_26226487580',
        characterId: 7,
        amount: 26_952_549,
        at: '2026-11-02T22:38:44.000Z',
        refId: 26226487580,
        reason: 'Moon tax 11-01/11-02',
      },
      { id: 'j5_x', characterId: 8, amount: 10_976_509, at: '2026-11-14T18:28:44.000Z' },
    ],
  };

  it('asks the corporation to count them, naming each held payment and its donor', () => {
    const t = inReviewTarget({ ...group, noticeId: 's1' });
    expect(t.problem).toEqual({
      kind: 'uncredited',
      corporationId: 1,
      corpName: 'Bureau',
      characterId: 7,
      amount: 26_952_549 + 10_976_509,
      noticeId: 's1',
      held: [
        { id: 'j5_26226487580', characterId: 7 },
        { id: 'j5_x', characterId: 8 },
      ],
    });
    expect(t.hideKey).toBe(
      uncreditedKey(1, ['2026-11-02T22:38:44.000Z', '2026-11-14T18:28:44.000Z'])
    );
    expect(t.transfers).toEqual([
      {
        amount: 26_952_549,
        at: '2026-11-02T22:38:44.000Z',
        journalRef: 26226487580,
        recipient: 'corporation',
      },
    ]);
    expect(t.donations?.map((d) => d.amount)).toEqual([26_952_549, 10_976_509]);
  });

  it('has no Late notice when the Miner has none unpaid', () => {
    expect('noticeId' in inReviewTarget(group).problem).toBe(false);
  });
});
