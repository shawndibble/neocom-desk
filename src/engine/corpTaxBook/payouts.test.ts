import { describe, expect, it } from 'vitest';
import type { FeederPayout } from './feederAccrual';
import {
  balanceAfter,
  buildRecordedPayout,
  outgoingDonationsFromJournal,
  payoutId,
  payoutPeriod,
  payoutReason,
  reconcileOutgoing,
  type OutgoingDonation,
} from './payouts';

const out = (over: Partial<OutgoingDonation> = {}): OutgoingDonation => ({
  refId: 100,
  division: 1,
  recipientId: 77,
  amount: 5_000_000,
  at: '2026-10-18T10:00:00.000Z',
  ...over,
});

const payout = (
  over: Partial<FeederPayout & { id: string }> = {}
): FeederPayout & { id: string } => ({
  id: 'p1',
  date: '2026-10-18',
  amount: 5_000_000,
  method: 'donation',
  status: 'waiting-for-journal',
  notAPayout: false,
  ...over,
});

const base = { payeeIds: new Set([77]), since: '2026-10-01' };

describe('outgoingDonationsFromJournal', () => {
  it('keeps only donations the corporation sent', () => {
    const rows = outgoingDonationsFromJournal(
      [
        {
          id: 1,
          date: '2026-10-18T10:00:00Z',
          ref_type: 'player_donation',
          amount: -(5e6).valueOf(),
          first_party_id: 9,
          second_party_id: 77,
          reason: 'x',
        },
        {
          id: 2,
          date: '2026-10-18T10:00:00Z',
          ref_type: 'player_donation',
          amount: 5e6,
          first_party_id: 77,
          second_party_id: 9,
        },
        {
          id: 3,
          date: '2026-10-18T10:00:00Z',
          ref_type: 'market_transaction',
          amount: -5e6,
          second_party_id: 77,
        },
        { id: 4, date: '2026-10-18T10:00:00Z', ref_type: 'player_donation', amount: -5e6 },
      ],
      1,
      9
    );
    expect(rows).toEqual([
      {
        refId: 1,
        division: 1,
        recipientId: 77,
        amount: 5_000_000,
        at: '2026-10-18T10:00:00.000Z',
        reason: 'x',
      },
    ]);
  });
});

describe('reconcileOutgoing', () => {
  it('attaches a donation to the recorded payout with the same amount, date and recipient', () => {
    const r = reconcileOutgoing({ ...base, payouts: [payout()], outgoing: [out()] });
    expect(r.attach).toEqual([{ id: 'p1', journalRef: 100 }]);
    expect(r.create).toEqual([]);
  });
  it('allows a few days between the recorded date and the journal', () => {
    const r = reconcileOutgoing({
      ...base,
      payouts: [payout({ date: '2026-10-16' })],
      outgoing: [out()],
    });
    expect(r.attach).toHaveLength(1);
    const far = reconcileOutgoing({
      ...base,
      payouts: [payout({ date: '2026-10-10' })],
      outgoing: [out()],
    });
    expect(far.attach).toEqual([]);
    expect(far.create).toHaveLength(1);
  });
  it('does not match another amount, which is recorded on its own', () => {
    const r = reconcileOutgoing({
      ...base,
      payouts: [payout({ amount: 4_000_000 })],
      outgoing: [out()],
    });
    expect(r.attach).toEqual([]);
    expect(r.create).toEqual([
      {
        id: payoutId(out()),
        payout: {
          date: '2026-10-18',
          amount: 5_000_000,
          method: 'donation',
          status: 'matched',
          journalRef: 100,
          notAPayout: false,
        },
      },
    ]);
  });
  it('never double counts: a donation already attached is skipped on the next read', () => {
    const attached = payout({ status: 'matched', journalRef: 100 });
    const r = reconcileOutgoing({ ...base, payouts: [attached], outgoing: [out()] });
    expect(r).toEqual({ attach: [], create: [] });
  });
  it('one donation attaches to one record when two are identical', () => {
    const r = reconcileOutgoing({
      ...base,
      payouts: [payout({ id: 'a' }), payout({ id: 'b' })],
      outgoing: [out(), out({ refId: 101 })],
    });
    expect(r.attach.map((a) => a.id).sort()).toEqual(['a', 'b']);
    expect(r.create).toEqual([]);
  });
  it('ignores a donation to someone who is not the payee', () => {
    const r = reconcileOutgoing({
      ...base,
      payouts: [payout()],
      outgoing: [out({ recipientId: 5 })],
    });
    expect(r).toEqual({ attach: [], create: [] });
  });
  it('leaves a row marked not a payout alone and does not recreate it', () => {
    const no = payout({ id: 'j1_100', status: 'matched', journalRef: 100, notAPayout: true });
    const r = reconcileOutgoing({ ...base, payouts: [no], outgoing: [out()] });
    expect(r).toEqual({ attach: [], create: [] });
  });
  it('does not match a recorded payout marked not a payout', () => {
    const r = reconcileOutgoing({
      ...base,
      payouts: [payout({ notAPayout: true })],
      outgoing: [out()],
    });
    expect(r.attach).toEqual([]);
    expect(r.create).toHaveLength(1);
  });
  it('does not auto-record a donation from before coverage began', () => {
    const r = reconcileOutgoing({ ...base, since: '2026-10-19', payouts: [], outgoing: [out()] });
    expect(r).toEqual({ attach: [], create: [] });
  });
  it('rounds a fractional journal amount to whole ISK', () => {
    const r = reconcileOutgoing({ ...base, payouts: [], outgoing: [out({ amount: 5_000_000.4 })] });
    expect(r.create[0]?.payout.amount).toBe(5_000_000);
  });
});

describe('buildRecordedPayout', () => {
  it('waits for the journal after a donation, nothing else does', () => {
    expect(buildRecordedPayout({ amount: 10, date: '2026-10-18', method: 'donation' })).toEqual({
      date: '2026-10-18',
      amount: 10,
      method: 'donation',
      status: 'waiting-for-journal',
      notAPayout: false,
    });
    expect(buildRecordedPayout({ amount: 10, date: '2026-10-18', method: 'contract' }).method).toBe(
      'other'
    );
    expect(buildRecordedPayout({ amount: 10, date: '2026-10-18', method: 'other' }).status).toBe(
      'recorded'
    );
  });
  it('rejects a non-whole, non-positive amount or a bad date', () => {
    expect(() => buildRecordedPayout({ amount: 0, date: '2026-10-18', method: 'other' })).toThrow();
    expect(() =>
      buildRecordedPayout({ amount: 1.5, date: '2026-10-18', method: 'other' })
    ).toThrow();
    expect(() => buildRecordedPayout({ amount: 5, date: 'soon', method: 'other' })).toThrow();
  });
});

describe('balanceAfter / payoutPeriod / payoutReason', () => {
  it('shows what is left after a payment, and credit when it is more', () => {
    expect(balanceAfter(1000.9, 1000)).toEqual({ kind: 'even', isk: 0 });
    expect(balanceAfter(1000, 400)).toEqual({ kind: 'owed', isk: 600 });
    expect(balanceAfter(1000, 1500)).toEqual({ kind: 'credit', isk: 500 });
  });
  it('spans the days since the last payment, or all of them when none is open', () => {
    const days = [{ date: '2026-10-01' }, { date: '2026-10-05' }, { date: '2026-10-17' }];
    expect(payoutPeriod(days, [])).toEqual({ from: '2026-10-01', to: '2026-10-17' });
    expect(payoutPeriod(days, [{ date: '2026-10-05', notAPayout: false }])).toEqual({
      from: '2026-10-17',
      to: '2026-10-17',
    });
    expect(payoutPeriod(days, [{ date: '2026-10-20', notAPayout: false }])).toEqual({
      from: '2026-10-01',
      to: '2026-10-17',
    });
    expect(payoutPeriod([], [])).toBeUndefined();
  });
  it('words the reason without the rate or margin', () => {
    expect(payoutReason('Moon mining payout', { from: '2026-10-01', to: '2026-10-17' })).toBe(
      'Moon mining payout, 2026-10-01 to 2026-10-17'
    );
  });
});
