import { describe, expect, it } from 'vitest';
import type { AllocationInput, TaxPayment } from './allocation';
import { previewPayment } from './paymentPreview';
import type { Statement } from './statements';

function statement(id: string, amount: number, issuedAt: string): Statement {
  return {
    id,
    minerId: 'm1',
    code: `NDT-${id}`,
    periodStart: issuedAt.slice(0, 7) + '-01',
    periodEnd: issuedAt.slice(0, 10),
    coversFrom: issuedAt.slice(0, 7) + '-01',
    coversThrough: issuedAt.slice(0, 10),
    issuedAt,
    hubId: 'jita',
    oreForm: 'compressed',
    amount,
    lines: [],
  };
}

function payment(id: string, amount: number, at: string, extra: Partial<TaxPayment> = {}) {
  return {
    id,
    minerId: 'm1',
    characterId: 1,
    amount,
    at,
    source: 'manual',
    ...extra,
  } satisfies TaxPayment;
}

const JUNE = statement('s1', 10_000_000, '2026-06-30T00:00:00Z');
const JULY = statement('s2', 8_000_000, '2026-07-31T00:00:00Z');
const AUG = statement('s3', 6_000_000, '2026-08-31T00:00:00Z');

const book = (extra: Partial<AllocationInput> = {}): AllocationInput => ({
  statements: [JUNE, JULY, AUG],
  payments: [],
  dismissalCredits: [],
  ...extra,
});

describe('previewPayment', () => {
  it('clears the oldest Statement and part-pays the next', () => {
    const out = previewPayment(book(), payment('new', 13_000_000, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([
      { statementId: 's1', applied: 10_000_000, remainingAfter: 0, settled: true },
      { statementId: 's2', applied: 3_000_000, remainingAfter: 5_000_000, settled: false },
    ]);
    expect(out.owedBefore).toBe(24_000_000);
    expect(out.owedAfter).toBe(11_000_000);
    expect(out.creditAdded).toBe(0);
  });

  it('skips what earlier payments already covered', () => {
    const out = previewPayment(
      book({ payments: [payment('old', 10_000_000, '2026-07-02T00:00:00Z')] }),
      payment('new', 2_000_000, '2026-09-05T00:00:00Z')
    );
    expect(out.lines.map((l) => l.statementId)).toEqual(['s2']);
    expect(out.owedBefore).toBe(14_000_000);
    expect(out.owedAfter).toBe(12_000_000);
  });

  it('holds an overpayment as credit', () => {
    const out = previewPayment(book(), payment('new', 30_000_000, '2026-09-05T00:00:00Z'));
    expect(out.lines).toHaveLength(3);
    expect(out.lines.every((l) => l.settled)).toBe(true);
    expect(out.owedAfter).toBe(0);
    expect(out.creditAdded).toBe(6_000_000);
    expect(out.creditAfter).toBe(6_000_000);
  });

  it('pays a pinned Statement first, then the oldest', () => {
    const out = previewPayment(
      book(),
      payment('new', 9_000_000, '2026-09-05T00:00:00Z', { statementId: 's3' })
    );
    expect(out.lines).toEqual([
      { statementId: 's3', applied: 6_000_000, remainingAfter: 0, settled: true },
      { statementId: 's1', applied: 3_000_000, remainingAfter: 7_000_000, settled: false },
    ]);
  });

  it('counts a tolerance shortfall as settled', () => {
    const out = previewPayment(book(), payment('new', 9_950_000, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([
      { statementId: 's1', applied: 9_950_000, remainingAfter: 0, settled: true },
    ]);
    expect(out.owedAfter).toBe(14_000_000);
  });

  it('takes nothing for an amount of zero', () => {
    const out = previewPayment(book(), payment('new', 0, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([]);
    expect(out.owedAfter).toBe(out.owedBefore);
  });

  it('credits a Miner with nothing owed in full', () => {
    const out = previewPayment(
      book({ statements: [] }),
      payment('new', 5_000_000, '2026-09-05T00:00:00Z')
    );
    expect(out.lines).toEqual([]);
    expect(out.creditAdded).toBe(5_000_000);
  });
});
