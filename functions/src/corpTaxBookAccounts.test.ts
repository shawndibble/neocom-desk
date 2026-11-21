import { describe, expect, it } from 'vitest';
import { ledgerDays, ledgerPayments, liveAccount, paidSinceRecord } from './corpTaxBookAccounts.js';

describe('liveAccount', () => {
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
    expect(liveAccount(recorded, payments)).toEqual({
      owed: 8_000_000,
      days: 3,
      oldest: '2026-10-05',
      paidThrough: '2026-10-04',
      asOf: '2026-10-20T10:00:00.000Z',
    });
  });

  it('owes nothing, and lists no days, once the payments since cover it', () => {
    expect(liveAccount(recorded, [{ amount: 20_000_000 }])).toMatchObject({
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

describe('liveAccount with the days still owed', () => {
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
    expect(liveAccount(recorded, [])).toMatchObject({
      owed: 7_000_000,
      days: 3,
      unpaidDays: recorded.unpaidDays,
    });
  });

  it('pays the oldest day first, part of the next, and moves the oldest date on', () => {
    expect(liveAccount(recorded, [{ amount: 1_500_000 }])).toMatchObject({
      owed: 5_500_000,
      days: 2,
      oldest: '2026-11-09',
      unpaidDays: [
        { date: '2026-11-09', owed: 2_500_000, tax: 3_000_000 },
        { date: '2026-11-10', owed: 3_000_000, tax: 3_000_000 },
      ],
    });
  });

  it('lets what older Statements owe take the new money before any running day', () => {
    const withLegacy = { ...recorded, owed: 8_000_000, oldest: '2026-10-01' };
    expect(liveAccount(withLegacy, [{ amount: 500_000 }])).toMatchObject({
      owed: 7_500_000,
      oldest: '2026-10-01',
      unpaidDays: recorded.unpaidDays,
    });
  });

  it('does not take a few ISK of per-day rounding for Statement debt', () => {
    const rounded = { ...recorded, owed: 7_000_002 };
    expect(liveAccount(rounded, [{ amount: 1_500_000 }])).toMatchObject({
      oldest: '2026-11-09',
      unpaidDays: [
        { date: '2026-11-09', owed: 2_500_000, tax: 3_000_000 },
        { date: '2026-11-10', owed: 3_000_000, tax: 3_000_000 },
      ],
    });
  });

  it('lists no days once the payments cover them all', () => {
    expect(liveAccount(recorded, [{ amount: 9_000_000 }])).toMatchObject({
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
