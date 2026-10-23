import { describe, expect, it, vi } from 'vitest';
import type { SrpClaim } from '../srpClaimTypes';
import {
  approveAmount,
  canBulkApprove,
  MAX_SRP_BATCH,
  pruneSelection,
  runInBatches,
  splitClaims,
  sumAmounts,
  typedAmount,
} from './srpQueue';

const claim = (killmailId: number, over: Partial<SrpClaim> = {}): SrpClaim => ({
  killmailId,
  corporationId: 1,
  characterId: 2,
  characterName: 'P',
  hullTypeId: 3,
  solarSystemId: 4,
  killedAt: 0,
  filedAt: killmailId,
  state: 'pending',
  amount: 100,
  basis: null,
  suggested: null,
  fleetOrFc: null,
  note: null,
  refileCount: 0,
  ...over,
});

describe('splitClaims', () => {
  it('sorts each tab: pending oldest first, owed by approval, history newest closed first', () => {
    const split = splitClaims([
      claim(3),
      claim(1),
      claim(5, { state: 'approved', decidedAt: 50 }),
      claim(4, { state: 'approved', decidedAt: 40 }),
      claim(6, { state: 'paid', closedAt: 10 }),
      claim(7, { state: 'rejected', closedAt: 20 }),
    ]);
    expect(split.pending.map((c) => c.killmailId)).toEqual([1, 3]);
    expect(split.owed.map((c) => c.killmailId)).toEqual([4, 5]);
    expect(split.history.map((c) => c.killmailId)).toEqual([7, 6]);
  });
});

describe('amounts', () => {
  it('sums what is owed, treating no amount as zero', () => {
    expect(sumAmounts([claim(1), claim(2, { amount: null }), claim(3, { amount: 50 })])).toBe(150);
  });
  it('lets only claims with an amount into a bulk approve', () => {
    expect(canBulkApprove(claim(1))).toBe(true);
    expect(canBulkApprove(claim(1, { amount: null }))).toBe(false);
  });
  it('reads a typed amount as whole ISK only', () => {
    expect(typedAmount('250000')).toBe(250000);
    expect(typedAmount('')).toBeNull();
    expect(typedAmount(undefined)).toBeNull();
    expect(typedAmount('0')).toBeNull();
    expect(typedAmount('1.5')).toBeNull();
    expect(typedAmount('abc')).toBeNull();
  });
  it('approves at the claim amount, else the typed one', () => {
    expect(approveAmount(claim(1), '999')).toBe(100);
    expect(approveAmount(claim(1, { amount: null }), '999')).toBe(999);
    expect(approveAmount(claim(1, { amount: null }), '')).toBeNull();
  });
});

describe('pruneSelection', () => {
  it('drops ticks for rows that are gone', () => {
    expect(pruneSelection([1, 2, 3], [claim(2), claim(3)])).toEqual([2, 3]);
  });
});

describe('runInBatches', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ killmailId: i + 1 }));
  const okAll = async (chunk: { killmailId: number }[]) => ({
    results: chunk.map((c) => ({
      ok: true as const,
      killmailId: c.killmailId,
      state: 'approved' as const,
      characterId: 1,
      characterName: 'P',
      amount: 1,
    })),
  });

  it('splits at the server cap and merges the outcomes in order', async () => {
    const call = vi.fn(okAll);
    const out = await runInBatches(ids(120), call);
    expect(call.mock.calls.map(([c]) => c.length)).toEqual([MAX_SRP_BATCH, MAX_SRP_BATCH, 20]);
    expect(out.results.map((r) => r.killmailId)).toEqual(ids(120).map((i) => i.killmailId));
  });
  it('turns a failed chunk into per-claim refusals and carries on', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { details: { reason: 'wrong-corp' } }))
      .mockImplementation(okAll);
    const out = await runInBatches(ids(60), call);
    expect(out.results.filter((r) => !r.ok)).toHaveLength(50);
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'wrong-corp' });
    expect(out.results.filter((r) => r.ok)).toHaveLength(10);
  });
});
