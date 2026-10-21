import { describe, expect, it } from 'vitest';
import {
  parseMarkPayoutInput,
  parseReconcilePayoutsInput,
  parseRecordPayoutInput,
} from './corpTaxBookFeederPayouts.js';

const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5 };

describe('parseRecordPayoutInput', () => {
  it('reads whole ISK, a day and a method', () => {
    expect(
      parseRecordPayoutInput({ ...base, amount: 1_000_000, date: '2026-10-18', method: 'donation' })
    ).toMatchObject({ feederCorporationId: 5, amount: 1_000_000, method: 'donation' });
  });
  it.each([0, -5, 1.5, '5', undefined])('rejects an amount of %s', (amount) => {
    expect(() =>
      parseRecordPayoutInput({ ...base, amount, date: '2026-10-18', method: 'other' })
    ).toThrow();
  });
  it('rejects a bad day, an unknown method and a missing moon owner', () => {
    expect(() =>
      parseRecordPayoutInput({ ...base, amount: 5, date: 'soon', method: 'other' })
    ).toThrow();
    expect(() =>
      parseRecordPayoutInput({ ...base, amount: 5, date: '2026-10-18', method: 'barter' })
    ).toThrow();
    expect(() =>
      parseRecordPayoutInput({ corporationId: 9, amount: 5, date: '2026-10-18', method: 'other' })
    ).toThrow();
  });
});

describe('parseMarkPayoutInput', () => {
  it('needs the payout and a yes or no', () => {
    expect(parseMarkPayoutInput({ ...base, payoutId: 'j1_2', notAPayout: true })).toMatchObject({
      payoutId: 'j1_2',
      notAPayout: true,
    });
    expect(() => parseMarkPayoutInput({ ...base, payoutId: 'j1_2' })).toThrow();
    expect(() => parseMarkPayoutInput({ ...base, notAPayout: true })).toThrow();
  });
});

describe('parseReconcilePayoutsInput', () => {
  const row = { refId: 1, division: 1, recipientId: 77, amount: 5, at: '2026-10-18T10:00:00Z' };
  it('reads the outgoing donations', () => {
    expect(parseReconcilePayoutsInput({ corporationId: 9, outgoing: [row] }).outgoing).toEqual([
      { ...row, at: '2026-10-18T10:00:00.000Z' },
    ]);
  });
  it('rejects a malformed row and an oversize list', () => {
    expect(() =>
      parseReconcilePayoutsInput({ corporationId: 9, outgoing: [{ ...row, amount: 'x' }] })
    ).toThrow();
    expect(() =>
      parseReconcilePayoutsInput({
        corporationId: 9,
        outgoing: Array.from({ length: 501 }, () => row),
      })
    ).toThrow();
  });
});
