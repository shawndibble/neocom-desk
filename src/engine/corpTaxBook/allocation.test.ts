import { describe, it, expect } from 'vitest';
import {
  allocatePayments,
  dismissalCredits,
  isBeforeBook,
  matchDonation,
  settleTolerance,
  type TaxPayment,
} from './allocation';
import type { Statement } from './statements';
import type { DayCharge } from './charges';

function statement(id: string, amount: number, issuedAt: string, code = `NDT-${id}`): Statement {
  return {
    id,
    minerId: 'm1',
    code,
    periodStart: issuedAt.slice(0, 7) + '-01',
    periodEnd: issuedAt.slice(0, 10),
    coversFrom: issuedAt.slice(0, 7) + '-01',
    coversThrough: issuedAt.slice(0, 10),
    issuedAt,
    hubId: 'jita',
    oreForm: 'compressed',
    amount,
    lines: [
      {
        kind: 'mined',
        date: issuedAt.slice(0, 7) + '-02',
        chargeKey: `90000001:1001:${issuedAt.slice(0, 7)}-02`,
        oreLines: [],
        estimatedValue: amount * 10,
        tax: amount,
      },
    ],
  };
}

function payment(
  id: string,
  amount: number,
  at: string,
  extra: Partial<TaxPayment> = {}
): TaxPayment {
  return { id, minerId: 'm1', characterId: 90000001, amount, at, source: 'donation', ...extra };
}

const JUNE = statement('s1', 10_000_000, '2026-06-30T00:00:00Z');
const JULY = statement('s2', 8_000_000, '2026-07-31T00:00:00Z');

describe('settleTolerance', () => {
  it('is max(0.5%, 100k ISK)', () => {
    expect(settleTolerance(10_000_000)).toBe(100_000);
    expect(settleTolerance(100_000_000)).toBe(500_000);
  });
});

describe('allocatePayments', () => {
  it('credits a donation to the oldest Statement first', () => {
    const result = allocatePayments({
      statements: [JULY, JUNE],
      payments: [payment('p1', 12_000_000, '2026-08-01T00:00:00Z')],
      dismissalCredits: [],
    });
    expect(result.byStatement.get('s1')).toMatchObject({
      credited: 10_000_000,
      remaining: 0,
      settled: true,
    });
    expect(result.byStatement.get('s2')).toMatchObject({
      credited: 2_000_000,
      remaining: 6_000_000,
      settled: false,
    });
    expect(result.balance).toBe(6_000_000);
    expect(result.credit).toBe(0);
  });

  it('a code pins a donation to its Statement, with any excess going oldest first', () => {
    const result = allocatePayments({
      statements: [JUNE, JULY],
      payments: [payment('p1', 9_000_000, '2026-08-01T00:00:00Z', { statementId: 's2' })],
      dismissalCredits: [],
    });
    expect(result.byStatement.get('s2')).toMatchObject({ credited: 8_000_000, settled: true });
    expect(result.byStatement.get('s1')).toMatchObject({ credited: 1_000_000, settled: false });
  });

  it('turns an overpayment or a prepayment into credit', () => {
    const over = allocatePayments({
      statements: [JUNE],
      payments: [payment('p1', 13_000_000, '2026-07-01T00:00:00Z')],
      dismissalCredits: [],
    });
    expect(over.credit).toBe(3_000_000);
    expect(over.balance).toBe(-3_000_000);

    const prepay = allocatePayments({
      statements: [],
      payments: [payment('p1', 2_000_000, '2026-06-01T00:00:00Z')],
      dismissalCredits: [],
    });
    expect(prepay.credit).toBe(2_000_000);
  });

  it('marking part of a donation "not tax" reopens that much debt', () => {
    const paid = payment('p1', 10_000_000, '2026-07-01T00:00:00Z');
    expect(
      allocatePayments({
        statements: [JUNE],
        payments: [paid],
        dismissalCredits: [],
      }).byStatement.get('s1')?.settled
    ).toBe(true);
    const buyback = allocatePayments({
      statements: [JUNE],
      payments: [{ ...paid, notTaxAmount: 4_000_000 }],
      dismissalCredits: [],
    });
    expect(buyback.byStatement.get('s1')).toMatchObject({ credited: 6_000_000, settled: false });
    expect(buyback.balance).toBe(4_000_000);
  });

  it('settles a Statement paid within the tolerance and writes the rest off, logged', () => {
    const result = allocatePayments({
      statements: [JUNE, JULY],
      payments: [
        payment('p1', 9_950_000, '2026-07-01T00:00:00Z'),
        payment('p2', 1_000_000, '2026-07-02T00:00:00Z'),
      ],
      dismissalCredits: [],
    });
    expect(result.byStatement.get('s1')).toMatchObject({
      credited: 9_950_000,
      writtenOff: 50_000,
      remaining: 0,
      settled: true,
    });
    // The second donation is not spent topping up the settled Statement.
    expect(result.byStatement.get('s2')).toMatchObject({ credited: 1_000_000 });
    expect(result.writeOffs).toEqual([{ statementId: 's1', amount: 50_000 }]);
    // Balance = Statements − payments − dismissals (and logged write-offs).
    expect(result.balance).toBe(18_000_000 - 10_950_000 - 50_000);
  });

  it('does not settle a Statement short by more than the tolerance', () => {
    const result = allocatePayments({
      statements: [JUNE],
      payments: [payment('p1', 9_800_000, '2026-07-01T00:00:00Z')],
      dismissalCredits: [],
    });
    expect(result.byStatement.get('s1')).toMatchObject({
      settled: false,
      remaining: 200_000,
      writtenOff: 0,
    });
  });

  it('never settles an unpaid Statement just because it is small', () => {
    const tiny = statement('s9', 80_000, '2026-06-30T00:00:00Z');
    const result = allocatePayments({ statements: [tiny], payments: [], dismissalCredits: [] });
    expect(result.byStatement.get('s9')?.settled).toBe(false);
  });

  it('a dismissal of a billed day credits its Statement', () => {
    const result = allocatePayments({
      statements: [JUNE],
      payments: [],
      dismissalCredits: [
        { statementId: 's1', dismissalId: 'd1', chargeKey: 'k', amount: 10_000_000 },
      ],
    });
    expect(result.byStatement.get('s1')).toMatchObject({ settled: true, remaining: 0 });
    expect(result.balance).toBe(0);
  });
});

describe('allocatePayments (review follow-ups)', () => {
  it('a dismissal credit beyond its Statement flows to the oldest other open Statement', () => {
    const result = allocatePayments({
      statements: [JUNE, JULY],
      payments: [],
      dismissalCredits: [
        { statementId: 's2', dismissalId: 'd1', chargeKey: 'k', amount: 9_000_000 },
      ],
    });
    expect(result.byStatement.get('s2')).toMatchObject({ credited: 8_000_000, settled: true });
    expect(result.byStatement.get('s1')).toMatchObject({ credited: 1_000_000 });
    expect(result.credit).toBe(0);
  });

  it('only a payment can settle within the tolerance — a dismissal alone does not', () => {
    const result = allocatePayments({
      statements: [JUNE],
      payments: [],
      dismissalCredits: [
        { statementId: 's1', dismissalId: 'd1', chargeKey: 'k', amount: 9_950_000 },
      ],
    });
    expect(result.byStatement.get('s1')).toMatchObject({ settled: false, remaining: 50_000 });
  });

  it('a Statement that came out negative becomes credit', () => {
    const result = allocatePayments({
      statements: [statement('s3', -300_000, '2026-06-30T00:00:00Z')],
      payments: [],
      dismissalCredits: [],
    });
    expect(result.credit).toBe(300_000);
    expect(result.balance).toBe(-300_000);
  });
});

describe('allocatePayments paymentCredits', () => {
  it('splits one donation across the Statements it paid, oldest first', () => {
    const a = allocatePayments({
      statements: [JUNE, JULY],
      payments: [payment('p1', 12_000_000, '2026-08-01T00:00:00Z')],
      dismissalCredits: [],
    });
    expect(a.paymentCredits).toEqual([
      { paymentId: 'p1', statementId: 's1', amount: 10_000_000 },
      { paymentId: 'p1', statementId: 's2', amount: 2_000_000 },
    ]);
  });

  it('leaves a payment out of a Statement it did not touch, and counts only the tax part', () => {
    const a = allocatePayments({
      statements: [JUNE, JULY],
      payments: [payment('p1', 6_000_000, '2026-08-01T00:00:00Z', { notTaxAmount: 1_000_000 })],
      dismissalCredits: [],
    });
    expect(a.paymentCredits).toEqual([{ paymentId: 'p1', statementId: 's1', amount: 5_000_000 }]);
  });
});

describe('dismissalCredits', () => {
  it('credits the tax a Statement billed for a day dismissed after it was issued', () => {
    const charge = {
      key: JUNE.lines[0].chargeKey!,
      minerId: 'm1',
      date: JUNE.lines[0].date,
    } as DayCharge;
    const credits = dismissalCredits(
      [JUNE],
      [
        {
          id: 'd1',
          scope: 'record',
          targetId: charge.key,
          by: 95000001,
          at: '2026-07-05T00:00:00Z',
          reason: 'Fleet op',
        },
      ],
      [charge]
    );
    expect(credits).toEqual([
      { statementId: 's1', dismissalId: 'd1', chargeKey: charge.key, amount: 10_000_000 },
    ]);
  });
});

describe('matchDonation', () => {
  const miners = [{ id: 'm1', characterIds: [90000001, 90000002], mainCharacterId: 90000001 }];

  it('pins a donation whose reason carries a Statement code to that Statement', () => {
    expect(
      matchDonation(
        { characterId: 12345, reason: 'tax ndt-s2 thanks' },
        { miners, statements: [JUNE, JULY], knownCharacterIds: new Set() }
      )
    ).toEqual({ kind: 'statement', statementId: 's2', minerId: 'm1' });
  });

  it('credits a Miner when any of its characters donates without a code', () => {
    expect(
      matchDonation(
        { characterId: 90000002, reason: '' },
        { miners, statements: [], knownCharacterIds: new Set() }
      )
    ).toEqual({ kind: 'miner', minerId: 'm1' });
  });

  it('credits a character’s own Miner when it mined but was never grouped', () => {
    expect(
      matchDonation(
        { characterId: 777, reason: undefined },
        { miners, statements: [], knownCharacterIds: new Set([777]) }
      )
    ).toEqual({ kind: 'miner', minerId: 'solo:777' });
  });

  it('sends an unknown character with no code to Unmatched', () => {
    expect(
      matchDonation(
        { characterId: 555, reason: 'hi' },
        { miners, statements: [JUNE], knownCharacterIds: new Set() }
      )
    ).toEqual({ kind: 'unmatched' });
  });
});

describe('donations before the book (#4505)', () => {
  const run = (at: string, extra: Partial<TaxPayment> = {}) =>
    allocatePayments({
      statements: [JUNE],
      payments: [payment('p1', 12_000_000, at, extra)],
      dismissalCredits: [],
      startDate: '2026-06-01',
    });

  it('credits nothing for a donation dated the day before the start date', () => {
    const result = run('2026-05-31T23:59:59Z');
    expect(result.byStatement.get('s1')).toMatchObject({ credited: 0, settled: false });
    expect(result.paymentCredits).toEqual([]);
    expect(result.credit).toBe(0);
  });

  it('counts a donation on the start date', () => {
    expect(run('2026-06-01T00:00:00Z').byStatement.get('s1')?.settled).toBe(true);
  });

  it('keeps crediting a manual payment dated before the start date', () => {
    expect(run('2026-05-01T00:00:00Z', { source: 'manual' }).byStatement.get('s1')?.settled).toBe(
      true
    );
  });

  it('re-evaluates when the start date moves later', () => {
    const input = {
      statements: [JUNE],
      payments: [payment('p1', 12_000_000, '2026-06-10T00:00:00Z')],
      dismissalCredits: [],
    };
    expect(allocatePayments({ ...input, startDate: '2026-06-01' }).credit).toBe(2_000_000);
    expect(allocatePayments({ ...input, startDate: '2026-06-11' }).credit).toBe(0);
  });

  it('isBeforeBook compares the UTC day', () => {
    expect(isBeforeBook('2026-05-31T23:59:59Z', '2026-06-01')).toBe(true);
    expect(isBeforeBook('2026-06-01T00:00:00Z', '2026-06-01')).toBe(false);
  });
});

describe('officer write-offs (#4637)', () => {
  const writeOff = (
    id: string,
    amount: number,
    extra: { statementId?: string; at?: string } = {}
  ) => ({
    id,
    amount,
    at: extra.at ?? '2026-08-01T00:00:00Z',
    ...(extra.statementId ? { statementId: extra.statementId } : {}),
  });

  it('reduces the Statement it names, and only that one; the rest is dropped, never credit', () => {
    const result = allocatePayments({
      statements: [JUNE, JULY],
      payments: [],
      dismissalCredits: [],
      officerWriteOffs: [writeOff('w1', 12_000_000, { statementId: 's2' })],
    });
    expect(result.byStatement.get('s2')).toMatchObject({
      forgiven: 8_000_000,
      remaining: 0,
      settled: true,
    });
    expect(result.byStatement.get('s1')).toMatchObject({ forgiven: 0, remaining: 10_000_000 });
    expect(result.credit).toBe(0);
    expect(result.balance).toBe(10_000_000);
    expect(result.writeOffCredits).toEqual([
      { writeOffId: 'w1', statementId: 's2', amount: 8_000_000 },
    ]);
  });

  it('without a Statement, reduces open Statements oldest first', () => {
    const result = allocatePayments({
      statements: [JULY, JUNE],
      payments: [],
      dismissalCredits: [],
      officerWriteOffs: [writeOff('w1', 12_000_000)],
    });
    expect(result.byStatement.get('s1')).toMatchObject({ forgiven: 10_000_000, settled: true });
    expect(result.byStatement.get('s2')).toMatchObject({
      forgiven: 2_000_000,
      remaining: 6_000_000,
      settled: false,
    });
    expect(result.balance).toBe(6_000_000);
  });

  it('applies after payments, so a payment stays on the Statement it paid', () => {
    const result = allocatePayments({
      statements: [JUNE, JULY],
      payments: [payment('p1', 10_000_000, '2026-08-05T00:00:00Z')],
      dismissalCredits: [],
      // Recorded before the payment arrived; it still never moves the payment.
      officerWriteOffs: [writeOff('w1', 9_000_000, { at: '2026-08-01T00:00:00Z' })],
    });
    expect(result.paymentCredits).toEqual([
      { paymentId: 'p1', statementId: 's1', amount: 10_000_000 },
    ]);
    expect(result.byStatement.get('s1')).toMatchObject({ forgiven: 0, settled: true });
    expect(result.byStatement.get('s2')).toMatchObject({ forgiven: 8_000_000, settled: true });
    expect(result.credit).toBe(0);
    expect(result.balance).toBe(0);
  });

  it('forgives nothing on a Statement already paid', () => {
    const result = allocatePayments({
      statements: [JUNE],
      payments: [payment('p1', 10_000_000, '2026-07-05T00:00:00Z')],
      dismissalCredits: [],
      officerWriteOffs: [writeOff('w1', 1_000_000, { statementId: 's1' })],
    });
    expect(result.byStatement.get('s1')).toMatchObject({ forgiven: 0, settled: true });
    expect(result.writeOffCredits).toEqual([]);
    expect(result.credit).toBe(0);
  });

  it('applies several write-offs in the order they were recorded', () => {
    const result = allocatePayments({
      statements: [JUNE],
      payments: [],
      dismissalCredits: [],
      officerWriteOffs: [
        writeOff('w2', 4_000_000, { at: '2026-08-02T00:00:00Z' }),
        writeOff('w1', 7_000_000, { at: '2026-08-01T00:00:00Z' }),
      ],
    });
    expect(result.writeOffCredits).toEqual([
      { writeOffId: 'w1', statementId: 's1', amount: 7_000_000 },
      { writeOffId: 'w2', statementId: 's1', amount: 3_000_000 },
    ]);
  });
});
