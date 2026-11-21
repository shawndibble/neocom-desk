import { describe, expect, it } from 'vitest';
import {
  ledgerDays,
  ledgerPayments,
  liveRunningAccount,
  netPayment,
  paidSinceRecord,
  payOldestFirst,
} from './corpTaxBookRunningAccounts.js';

describe('liveRunningAccount', () => {
  const recorded = {
    owed: 10_000_000,
    paid: 1_000_000,
    days: 3,
    oldest: '2026-10-05',
    paidThrough: '2026-10-04',
    at: '2026-10-20T10:00:00.000Z',
  };

  it('takes off what the Miner paid beyond what was counted, net of not tax', () => {
    const payments = [{ amount: 1_000_000 }, { amount: 3_000_000, notTaxAmount: 1_000_000 }];
    expect(liveRunningAccount(recorded, payments)).toEqual({
      owed: 8_000_000,
      days: 3,
      oldest: '2026-10-05',
      paidThrough: '2026-10-04',
      asOf: '2026-10-20T10:00:00.000Z',
      credit: 0,
    });
  });

  it("returns the record's credit and what was paid beyond what it owed", () => {
    expect(liveRunningAccount({ ...recorded, credit: 5 }, [{ amount: 1_000_000 }]).credit).toBe(5);
    expect(liveRunningAccount({ ...recorded, credit: 5 }, [{ amount: 12_000_000 }]).credit).toBe(
      1_000_005
    );
  });

  it('owes nothing, and lists no days, once the payments since cover it', () => {
    expect(liveRunningAccount(recorded, [{ amount: 20_000_000 }])).toMatchObject({
      owed: 0,
      days: 0,
      oldest: null,
    });
  });
});

describe('paidSinceRecord', () => {
  it('is what the Miner paid, net of not tax, beyond what the record counted', () => {
    const payments = [{ amount: 1_000_000 }, { amount: 3_000_000, notTaxAmount: 1_000_000 }];
    expect(paidSinceRecord({ paid: 1_000_000 }, payments)).toBe(2_000_000);
    expect(paidSinceRecord({ paid: 9_000_000 }, payments)).toBe(0);
  });
});

describe('liveRunningAccount with the days still owed', () => {
  const recorded = {
    owed: 7_000_000,
    paid: 0,
    days: 3,
    oldest: '2026-11-08',
    at: '2026-11-19T10:00:00.000Z',
    unpaidDays: [
      { date: '2026-11-08', owed: 1_000_000, tax: 2_000_000 },
      { date: '2026-11-09', owed: 3_000_000, tax: 3_000_000 },
      { date: '2026-11-10', owed: 3_000_000, tax: 3_000_000 },
    ],
  };

  it('is the recorded days when nothing was paid since', () => {
    expect(liveRunningAccount(recorded, [])).toMatchObject({
      owed: 7_000_000,
      days: 3,
      unpaidDays: recorded.unpaidDays,
    });
  });

  it('pays the oldest day first, part of the next, and moves the oldest date on', () => {
    expect(liveRunningAccount(recorded, [{ amount: 1_500_000 }])).toMatchObject({
      owed: 5_500_000,
      days: 2,
      oldest: '2026-11-09',
      unpaidDays: [
        { date: '2026-11-09', owed: 2_500_000, tax: 3_000_000 },
        { date: '2026-11-10', owed: 3_000_000, tax: 3_000_000 },
      ],
    });
  });

  it('pays the recorded days oldest first, whatever the record owes beyond them', () => {
    const more = { ...recorded, owed: 8_000_000, oldest: '2026-10-01' };
    expect(liveRunningAccount(more, [{ amount: 1_500_000 }])).toMatchObject({
      owed: 6_500_000,
      oldest: '2026-11-09',
      unpaidDays: [
        { date: '2026-11-09', owed: 2_500_000, tax: 3_000_000 },
        { date: '2026-11-10', owed: 3_000_000, tax: 3_000_000 },
      ],
    });
  });

  it('lists no days once the payments cover them all', () => {
    expect(liveRunningAccount(recorded, [{ amount: 9_000_000 }])).toMatchObject({
      owed: 0,
      days: 0,
      oldest: null,
      unpaidDays: [],
    });
  });
});

describe('ledgerDays', () => {
  it('lists each date once, from the newest Statement that holds it, oldest first', () => {
    const days = ledgerDays([
      {
        issuedAt: '2026-11-12T00:00:00Z',
        lines: [
          { date: '2026-11-08', tax: 100 },
          { date: '2026-11-09', tax: 50 },
        ],
      },
      {
        issuedAt: '2026-11-19T00:00:00Z',
        lines: [
          { date: '2026-11-09', tax: 60 },
          { date: '2026-11-09', tax: 40 },
          { date: '2026-11-10', tax: 70 },
        ],
      },
    ]);
    expect(days).toEqual([
      { date: '2026-11-08', tax: 100 },
      { date: '2026-11-09', tax: 100 },
      { date: '2026-11-10', tax: 70 },
    ]);
  });
});

describe('ledgerPayments', () => {
  it('keeps net payments dated from the start, oldest first, and drops all-not-tax ones', () => {
    const rows = ledgerPayments(
      [
        { id: 'b', data: { amount: 500, at: '2026-11-15T10:00:00Z', source: 'manual' } },
        { id: 'a', data: { amount: 900, notTaxAmount: 400, at: '2026-11-12T10:00:00Z' } },
        { id: 'c', data: { amount: 300, notTaxAmount: 300, at: '2026-11-13T10:00:00Z' } },
        { id: 'd', data: { amount: 800, at: '2026-09-30T10:00:00Z' } },
      ],
      '2026-10-10'
    );
    expect(rows).toEqual([
      { id: 'a', at: '2026-11-12T10:00:00Z', amount: 500, source: 'donation' },
      { id: 'b', at: '2026-11-15T10:00:00Z', amount: 500, source: 'manual' },
    ]);
  });
});

describe('payOldestFirst', () => {
  const days = [
    { date: '2026-11-08', owed: 100 },
    { date: '2026-11-09', owed: 300 },
    { date: '2026-11-10', owed: 300 },
  ];

  it('pays the oldest day, part of the next, and leaves the rest', () => {
    expect(payOldestFirst(days, 250)).toEqual({
      unpaid: [
        { date: '2026-11-09', owed: 150 },
        { date: '2026-11-10', owed: 300 },
      ],
      paid: ['2026-11-08'],
    });
  });

  it('reads a day left owing no more than the tolerance as paid', () => {
    expect(payOldestFirst(days, 399.995, 0.01).paid).toEqual(['2026-11-08', '2026-11-09']);
    expect(payOldestFirst(days, 0)).toEqual({ unpaid: days, paid: [] });
  });
});

describe('netPayment', () => {
  it('is the amount less what is not tax, never below zero', () => {
    expect(netPayment({ amount: 10, notTaxAmount: 3 })).toBe(7);
    expect(netPayment({ amount: 10, notTaxAmount: 30 })).toBe(0);
    expect(netPayment({ amount: 10 })).toBe(10);
  });
});
