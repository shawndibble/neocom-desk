import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { legacyPaymentLinks } from './legacyPaidMarks';

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
  it("reads one payment as one link under the payment's own id, for its recorded amount", () => {
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
        kind: 'legacy',
        refId: 'pay1',
        amount: 250_000,
        paidOn: '2026-10-05',
        source: 'manual',
        refs: [{ kind: 'journal', refId: 41 }],
      },
    ]);
  });

  it('reads the oldest shape, a bare journalRefId, as a held transaction too', () => {
    const [link] = legacyPaymentLinks([
      assignment('a', '2026-10-01', settled('pay1', { journalRefId: 41 })),
    ]);
    expect(link).toMatchObject({
      kind: 'legacy',
      refId: 'pay1',
      refs: [{ kind: 'journal', refId: 41 }],
    });
  });

  it('keeps every installment as metadata: the link pays the recorded amount once', () => {
    const [link, ...rest] = legacyPaymentLinks([
      assignment(
        'a',
        '2026-10-01',
        settled('pay1', {
          journalLinks: [{ refId: 41, source: 'manual' }],
          contractLinks: [{ refId: 9, source: 'manual' }],
        })
      ),
    ]);
    expect(rest).toEqual([]);
    expect(link).toMatchObject({
      amount: 250_000,
      refs: [
        { kind: 'journal', refId: 41 },
        { kind: 'contract', refId: 9 },
      ],
    });
  });

  it('reads a bare “mark paid” under its Assignment’s id, for the day’s tax, on the day it was marked', () => {
    const [link] = legacyPaymentLinks([
      assignment('a', '2026-10-01', { paidAt: Date.parse('2026-10-03T08:00:00Z') }),
    ]);
    expect(link).toMatchObject({
      kind: 'legacy',
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
