import { describe, expect, it } from 'vitest';
import { liveAccount } from './corpTaxBookAccounts.js';

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
