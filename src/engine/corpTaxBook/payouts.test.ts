import { describe, expect, it } from 'vitest';
import type { FeederPayout } from './feederAccrual';
import {
  balanceAfter,
  buildRecordedPayout,
  outgoingDonationsFromJournal,
  payoutId,
  payoutPeriod,
  payoutReason,
  payeeIdsAt,
  payoutToMerge,
  reconcileBookOutgoing,
  withPayeeChange,
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

const base = { since: '2026-10-01' };

/** One moon owner (corporation 9999) paid through payee 77. */
function reconcileOutgoing(input: {
  payouts: (FeederPayout & { id: string })[];
  outgoing: OutgoingDonation[];
  since: string;
}) {
  const [r] = reconcileBookOutgoing({
    owners: [{ corporationId: 9999, payee: { kind: 'character', id: 77 }, ...input }],
    outgoing: input.outgoing,
  });
  return { attach: r!.attach, create: r!.create };
}
const T0 = () => '2026-10-18T10:00:00.000Z';

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
  it('never lets a contract or other payout take a journal donation (#4617)', () => {
    for (const method of ['other'] as const) {
      const r = reconcileOutgoing({
        ...base,
        payouts: [payout({ method, status: 'recorded' })],
        outgoing: [out()],
      });
      expect(r.attach).toEqual([]);
      expect(r.create).toHaveLength(1);
    }
  });
});

describe('reconcileBookOutgoing (#4617)', () => {
  const shared = { kind: 'character' as const, id: 77 };
  const owner = (corporationId: number, over: Record<string, unknown> = {}) => ({
    corporationId,
    payee: shared,
    payouts: [] as (FeederPayout & { id: string })[],
    since: '2026-10-01',
    ...over,
  });
  it('never auto-records one donation for two moon owners that share a payee', () => {
    const r = reconcileBookOutgoing({ owners: [owner(5), owner(6)], outgoing: [out()] });
    expect(r.flatMap((o) => o.create)).toEqual([]);
    expect(r.flatMap((o) => o.attach)).toEqual([]);
  });
  it('still attaches a shared-payee donation to the payment an officer recorded', () => {
    const r = reconcileBookOutgoing({
      owners: [owner(5), owner(6, { payouts: [payout({ id: 'mine' })] })],
      outgoing: [out()],
    });
    expect(r.find((o) => o.corporationId === 6)?.attach).toEqual([{ id: 'mine', journalRef: 100 }]);
    expect(r.flatMap((o) => o.create)).toEqual([]);
  });
  it('never counts a journal entry another moon owner already holds', () => {
    const held = payout({ id: 'j1_100', status: 'matched', journalRef: 100 });
    const r = reconcileBookOutgoing({
      owners: [
        owner(5, { payouts: [held] }),
        owner(6, { payee: { kind: 'character', id: 88 }, payouts: [payout({ id: 'x' })] }),
      ],
      outgoing: [out(), out({ refId: 100, recipientId: 6 })],
    });
    expect(r.flatMap((o) => [...o.attach, ...o.create])).toEqual([]);
  });
  it('records a donation to the moon owner corporation itself, payee or not', () => {
    const r = reconcileBookOutgoing({ owners: [owner(5)], outgoing: [out({ recipientId: 5 })] });
    expect(r[0]?.create.map((c) => c.id)).toEqual([payoutId(out())]);
  });
  it('matches the payee in force on the donation date, not only the current one', () => {
    const changed = Date.parse('2026-10-15T00:00:00Z');
    const history = [
      { payee: { kind: 'character' as const, id: 70 }, from: 0 },
      { payee: shared, from: changed },
    ];
    const r = reconcileBookOutgoing({
      owners: [owner(5, { payeeHistory: history })],
      outgoing: [
        out({ refId: 1, recipientId: 70, at: '2026-10-10T10:00:00.000Z' }),
        out({ refId: 2, recipientId: 70, at: '2026-10-18T10:00:00.000Z' }),
      ],
    });
    expect(r[0]?.create.map((c) => c.payout.journalRef)).toEqual([1]);
  });
});

describe('payeeIdsAt / withPayeeChange (#4617)', () => {
  const T = Date.parse('2026-10-15T00:00:00Z');
  it('is the payee in force then, plus the moon owner corporation', () => {
    const rec = {
      corporationId: 5,
      payee: { kind: 'character' as const, id: 77 },
      payeeHistory: [
        { payee: { kind: 'corporation' as const, id: 60 }, from: 0 },
        { payee: { kind: 'character' as const, id: 77 }, from: T },
      ],
    };
    expect(payeeIdsAt(rec, '2026-10-14T23:59:00Z')).toEqual(new Set([5, 60]));
    expect(payeeIdsAt(rec, '2026-10-15T00:00:00Z')).toEqual(new Set([5, 77]));
  });
  it('falls back to the current payee on a record with no history', () => {
    expect(payeeIdsAt({ corporationId: 5, payee: { kind: 'character', id: 77 } }, T0())).toEqual(
      new Set([5, 77])
    );
    expect(payeeIdsAt({ corporationId: 5 }, T0())).toEqual(new Set([5]));
  });
  it('before the first payee was set, only the corporation itself', () => {
    const rec = {
      corporationId: 5,
      payee: { kind: 'character' as const, id: 77 },
      payeeHistory: [{ payee: { kind: 'character' as const, id: 77 }, from: T }],
    };
    expect(payeeIdsAt(rec, '2026-10-01T00:00:00Z')).toEqual(new Set([5]));
  });
  it('appends a change, seeding the history from a record that had none', () => {
    const old = { payee: { kind: 'character' as const, id: 70 }, payeeChangedAt: 100 };
    expect(withPayeeChange(old, { kind: 'character', id: 77 }, T)).toEqual([
      { payee: { kind: 'character', id: 70 }, from: 100 },
      { payee: { kind: 'character', id: 77 }, from: T },
    ]);
    expect(withPayeeChange({ payee: old.payee }, { kind: 'character', id: 77 }, T)[0]).toEqual({
      payee: { kind: 'character', id: 70 },
      from: 0,
    });
    expect(withPayeeChange({}, { kind: 'corporation', id: 60 }, T)).toEqual([
      { payee: { kind: 'corporation', id: 60 }, from: T },
    ]);
  });
  it('re-saving the same payee changes nothing', () => {
    const history = [{ payee: { kind: 'character' as const, id: 77 }, from: T }];
    const rec = { payee: { kind: 'character' as const, id: 77 }, payeeHistory: history };
    expect(withPayeeChange(rec, { kind: 'character', id: 77 }, T + 5)).toEqual(history);
  });
});

describe('payoutToMerge (#4617)', () => {
  const auto = payout({ id: 'j1_100', status: 'matched', journalRef: 100 });
  const recorded = { amount: 5_000_000, date: '2026-10-19', method: 'donation' as const };
  it('folds a later manual add into the payment the journal already recorded', () => {
    expect(payoutToMerge([auto], recorded)).toBe('j1_100');
  });
  it('never merges another amount, a far date, a contract, or a row marked not a payout', () => {
    expect(payoutToMerge([auto], { ...recorded, amount: 1 })).toBeUndefined();
    expect(payoutToMerge([auto], { ...recorded, date: '2026-10-30' })).toBeUndefined();
    expect(payoutToMerge([auto], { ...recorded, method: 'other' })).toBeUndefined();
    expect(payoutToMerge([{ ...auto, notAPayout: true }], recorded)).toBeUndefined();
  });
  it('merges into a row only once, and never into a payment an officer recorded', () => {
    expect(payoutToMerge([{ ...auto, confirmedAt: 1 }], recorded)).toBeUndefined();
    expect(
      payoutToMerge([payout({ id: 'abc', status: 'matched', journalRef: 100 })], recorded)
    ).toBeUndefined();
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
