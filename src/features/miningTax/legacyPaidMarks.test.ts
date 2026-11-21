import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { legacyPaymentLinks, unreadLegacyLinks } from './legacyPaidMarks';

const assignment = (
  id: string,
  date: string,
  over: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord => ({
  id,
  characterId: 7,
  date,
  solarSystemId: 30000142,
  payeeId: 'p1',
  oreLines: [],
  taxPct: 10,
  estimatedValue: 1_000_000,
  taxOwed: 100_000,
  status: 'paid',
  updatedAt: 0,
  ...over,
});

const settled = (paymentId: string, extra: object = {}) => ({
  payment: {
    paymentId,
    paidOn: '2026-10-05',
    method: 'donation' as const,
    amount: 250_000,
    ...extra,
  },
});

describe('legacyPaymentLinks', () => {
  it('reads a Settle-up payment with its transaction as one journal link for the lump sum', () => {
    const links = legacyPaymentLinks([
      assignment(
        'a',
        '2026-10-01',
        settled('pay1', { journalLinks: [{ refId: 41, source: 'auto' }] })
      ),
      assignment(
        'b',
        '2026-10-02',
        settled('pay1', { journalLinks: [{ refId: 41, source: 'auto' }] })
      ),
    ]);
    expect(links).toEqual([
      {
        payeeId: 'p1',
        characterId: 7,
        kind: 'journal',
        refId: 41,
        amount: 250_000,
        paidOn: '2026-10-05',
        source: 'auto',
        from: ['a', 'b'],
      },
    ]);
  });

  it('reads the oldest shape, a bare journalRefId, too', () => {
    const [link] = legacyPaymentLinks([
      assignment('a', '2026-10-01', settled('pay1', { journalRefId: 41 })),
    ]);
    expect(link).toMatchObject({ kind: 'journal', refId: 41, source: 'auto' });
  });

  it('reads a recorded payment with no transaction yet as the recorded sum', () => {
    const [link] = legacyPaymentLinks([assignment('a', '2026-10-01', settled('pay1'))]);
    expect(link).toMatchObject({ kind: 'recorded', refId: 'pay1', amount: 250_000 });
  });

  it('shares the lump sum between installments, and keeps a payment in kind’s figure', () => {
    const links = legacyPaymentLinks([
      assignment(
        'a',
        '2026-10-01',
        settled('pay1', {
          journalLinks: [{ refId: 41, source: 'manual' }],
          contractLinks: [{ refId: 9, source: 'manual' }],
        })
      ),
    ]);
    expect(links.map((l) => [l.kind, l.refId, l.amount])).toEqual([
      ['journal', 41, 125_000],
      ['contract', 9, 125_000],
    ]);
  });

  it('reads a bare “mark paid” as the day’s own tax, on the day it was marked', () => {
    const [link] = legacyPaymentLinks([
      assignment('a', '2026-10-01', { paidAt: Date.parse('2026-10-03T08:00:00Z') }),
    ]);
    expect(link).toMatchObject({
      kind: 'recorded',
      refId: 'mark:a',
      amount: 100_000,
      paidOn: '2026-10-03',
    });
  });

  it('skips what is not a paid mark', () => {
    expect(
      legacyPaymentLinks([
        assignment('a', '2026-10-01', { status: 'outstanding' }),
        assignment('d', '2026-10-01', { status: 'dismissed', payeeId: undefined }),
      ])
    ).toEqual([]);
  });
});

describe('unreadLegacyLinks', () => {
  it('reads each mark once: a link already under its key, from any Payee, is left alone', () => {
    const marks = [
      assignment(
        'a',
        '2026-10-01',
        settled('pay1', { journalLinks: [{ refId: 41, source: 'auto' }] })
      ),
      assignment('b', '2026-10-02', settled('pay2')),
    ];
    expect(unreadLegacyLinks(marks, new Set(['journal:41'])).map((l) => l.refId)).toEqual(['pay2']);
    expect(unreadLegacyLinks(marks, new Set(['journal:41', 'recorded:pay2']))).toEqual([]);
  });
});
