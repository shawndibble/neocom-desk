import { describe, expect, it } from 'vitest';
import {
  decideApprove,
  decideChangeAmount,
  decideMarkPaid,
  decideReject,
  parseApproveBatch,
  parseApproveItem,
  parseChangeAmount,
  parseMarkPaidBatch,
  parseMarkPaidItem,
  parseReject,
} from './srpOfficer.js';

const officer = { characterId: 2, characterName: 'Pilot 2' };
const NOW = 1_000;
const pending = { state: 'pending', amount: 100, characterId: 9, characterName: 'Nine' };
const typed = { state: 'pending', amount: null, characterId: 9, characterName: 'Nine' };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { details?: { reason?: string } }).details?.reason ?? 'invalid';
  }
  return 'ok';
};

describe('parsing', () => {
  it('needs whole-ISK amounts, bounded reasons and distinct batches', () => {
    expect(parseApproveItem({ killmailId: 5 })).toEqual({ killmailId: 5 });
    expect(parseApproveItem({ killmailId: 5, amount: 7, reason: ' why ' })).toEqual({
      killmailId: 5,
      amount: 7,
      reason: 'why',
    });
    expect(() => parseApproveItem({ killmailId: 5, amount: 1.5 })).toThrow();
    expect(() => parseApproveItem({ killmailId: 5, amount: 0 })).toThrow();
    expect(() => parseApproveItem({ killmailId: 5, amount: 1e14 })).toThrow();
    expect(() => parseApproveBatch({ claims: [] })).toThrow();
    expect(() => parseApproveBatch({ claims: [{ killmailId: 1 }, { killmailId: 1 }] })).toThrow();
    expect(() =>
      parseMarkPaidBatch({
        claims: Array.from({ length: 51 }, (_, i) => ({ killmailId: i + 1 })),
      })
    ).toThrow();
    expect(parseMarkPaidBatch({ claims: [{ killmailId: 1, expectedAmount: 5 }] })).toEqual([
      { killmailId: 1, expectedAmount: 5 },
    ]);
    expect(parseMarkPaidItem({ killmailId: 1, expectedAmount: null })).toEqual({
      killmailId: 1,
      expectedAmount: null,
    });
    expect(parseApproveItem({ killmailId: 5, expectedAmount: 9 }).expectedAmount).toBe(9);
    expect(parseApproveItem({ killmailId: 5, expectedAmount: null }).expectedAmount).toBeNull();
    expect(() => parseApproveItem({ killmailId: 5, expectedAmount: 0 })).toThrow();
    expect(() => parseReject({ killmailId: 1, reason: '   ' })).toThrow();
    expect(() => parseReject({ killmailId: 1 })).toThrow();
    expect(() => parseChangeAmount({ killmailId: 1, amount: 5 })).toThrow();
  });
});

describe('decisions', () => {
  it('approves a pending claim at its amount, with no closedAt', () => {
    const d = decideApprove(pending, { killmailId: 1 }, officer, NOW);
    expect(d.patch).toMatchObject({ state: 'approved', amount: 100, decidedBy: 2 });
    expect(d.patch).not.toHaveProperty('closedAt');
    expect(d.outcome).toMatchObject({ characterId: 9, amount: 100, state: 'approved' });
  });

  it('needs a reason to override and records the computed figure', () => {
    expect(code(() => decideApprove(pending, { killmailId: 1, amount: 50 }, officer, NOW))).toBe(
      'reason-required'
    );
    const d = decideApprove(pending, { killmailId: 1, amount: 50, reason: 'r' }, officer, NOW);
    expect(d.patch).toMatchObject({
      amount: 50,
      computedAmount: 100,
      amountSource: 'override',
      overrideReason: 'r',
    });
    expect(d.detail).toMatchObject({ computedAmount: 100, reason: 'r', amount: 50 });
  });

  it('treats an amount equal to the held one as no override', () => {
    const d = decideApprove(pending, { killmailId: 1, amount: 100 }, officer, NOW);
    expect(d.patch).not.toHaveProperty('overrideBy');
  });

  it('refuses when no amount is known and none is given; a typed one needs no reason', () => {
    expect(code(() => decideApprove(typed, { killmailId: 1 }, officer, NOW))).toBe(
      'amount-required'
    );
    const d = decideApprove(typed, { killmailId: 1, amount: 40 }, officer, NOW);
    expect(d.patch).toMatchObject({ amount: 40, amountSource: 'typed', computedAmount: null });
  });

  it('rejects with closedAt and the reason', () => {
    const d = decideReject(pending, { killmailId: 1, reason: 'no' }, officer, NOW);
    expect(d.patch).toMatchObject({ state: 'rejected', rejectionReason: 'no', closedAt: NOW });
    expect(d.outcome.reason).toBe('no');
  });

  it('refuses an own claim for every decision', () => {
    const own = { ...pending, characterId: 2 };
    const approved = { ...own, state: 'approved' };
    expect(code(() => decideApprove(own, { killmailId: 1 }, officer, NOW))).toBe('own-claim');
    expect(code(() => decideReject(own, { killmailId: 1, reason: 'x' }, officer, NOW))).toBe(
      'own-claim'
    );
    expect(
      code(() => decideChangeAmount(own, { killmailId: 1, amount: 3, reason: 'x' }, officer, NOW))
    ).toBe('own-claim');
    expect(code(() => decideMarkPaid(approved, { killmailId: 1 }, officer, NOW))).toBe('own-claim');
  });

  it('refuses a stale expectedAmount, accepts a matching or omitted one', () => {
    expect(
      code(() => decideApprove(pending, { killmailId: 1, expectedAmount: 99 }, officer, NOW))
    ).toBe('amount-changed');
    expect(
      code(() =>
        decideApprove(typed, { killmailId: 1, expectedAmount: 99, amount: 5 }, officer, NOW)
      )
    ).toBe('amount-changed');
    expect(
      code(() => decideApprove(pending, { killmailId: 1, expectedAmount: 100 }, officer, NOW))
    ).toBe('ok');
    expect(
      code(() =>
        decideApprove(typed, { killmailId: 1, expectedAmount: null, amount: 5 }, officer, NOW)
      )
    ).toBe('ok');
    const approved = { ...pending, state: 'approved' };
    expect(
      code(() => decideMarkPaid(approved, { killmailId: 1, expectedAmount: 5 }, officer, NOW))
    ).toBe('amount-changed');
    expect(
      code(() => decideMarkPaid(approved, { killmailId: 1, expectedAmount: 100 }, officer, NOW))
    ).toBe('ok');
  });

  it('changes an approved amount in place: no state change, no closedAt', () => {
    const d = decideChangeAmount(
      { ...pending, state: 'approved' },
      { killmailId: 1, amount: 60, reason: 'b' },
      officer,
      NOW
    );
    expect(d.patch).toMatchObject({ amount: 60, computedAmount: 100 });
    expect(d.patch).not.toHaveProperty('state');
    expect(d.patch).not.toHaveProperty('closedAt');
    expect(d.outcome.state).toBe('approved');
  });

  it('changes a pending amount and keeps the first computed one', () => {
    const first = decideChangeAmount(
      pending,
      { killmailId: 1, amount: 80, reason: 'a' },
      officer,
      NOW
    );
    const again = decideChangeAmount(
      { ...pending, ...first.patch },
      { killmailId: 1, amount: 60, reason: 'b' },
      officer,
      NOW
    );
    expect(again.patch).toMatchObject({ amount: 60, computedAmount: 100 });
    expect(
      code(() =>
        decideChangeAmount(pending, { killmailId: 1, amount: 100, reason: 'a' }, officer, NOW)
      )
    ).toBe('amount-unchanged');
  });

  it('marks only an approved claim paid, with closedAt', () => {
    const approved = { ...pending, state: 'approved' };
    expect(decideMarkPaid(approved, { killmailId: 1 }, officer, NOW).patch).toMatchObject({
      state: 'paid',
      closedAt: NOW,
    });
    expect(code(() => decideMarkPaid(pending, { killmailId: 1 }, officer, NOW))).toBe(
      'illegal-transition'
    );
  });

  it('refuses every other transition and a missing claim', () => {
    for (const state of ['approved', 'paid', 'rejected']) {
      const claim = { ...pending, state };
      if (state !== 'approved') {
        expect(
          code(() =>
            decideChangeAmount(claim, { killmailId: 1, amount: 3, reason: 'x' }, officer, NOW)
          )
        ).toBe('illegal-transition');
      }
      expect(code(() => decideApprove(claim, { killmailId: 1 }, officer, NOW))).toBe(
        'illegal-transition'
      );
      expect(code(() => decideReject(claim, { killmailId: 1, reason: 'x' }, officer, NOW))).toBe(
        'illegal-transition'
      );
    }
    for (const state of ['paid', 'rejected']) {
      expect(
        code(() => decideMarkPaid({ ...pending, state }, { killmailId: 1 }, officer, NOW))
      ).toBe('illegal-transition');
    }
    expect(code(() => decideApprove(undefined, { killmailId: 1 }, officer, NOW))).toBe(
      'claim-not-found'
    );
  });
});
