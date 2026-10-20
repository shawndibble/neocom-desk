import { describe, expect, it } from 'vitest';
import {
  effectiveOwnerRate,
  ownerMargin,
  rateChangeEvent,
  requestedOwnerRate,
  type OwnerRateEntry,
} from './ownerRate';

const req = (pct: number, effectiveFrom: string, recordedAt = `${effectiveFrom}T00:00:00Z`) =>
  ({ kind: 'requested', pct, effectiveFrom, recordedAt }) satisfies OwnerRateEntry;
const agreed = (pct: number, effectiveFrom: string, recordedAt = `${effectiveFrom}T00:00:00Z`) =>
  ({ kind: 'agreed', pct, effectiveFrom, recordedAt }) satisfies OwnerRateEntry;

describe('effectiveOwnerRate', () => {
  it('is undefined with no history or before any rate takes effect', () => {
    expect(effectiveOwnerRate([], '2026-10-01')).toBeUndefined();
    expect(effectiveOwnerRate([req(6, '2026-10-05')], '2026-10-04')).toBeUndefined();
  });

  it('uses the requested rate when nothing was agreed', () => {
    expect(effectiveOwnerRate([req(6, '2026-10-01')], '2026-10-10')).toEqual({
      pct: 6,
      kind: 'requested',
      effectiveFrom: '2026-10-01',
    });
  });

  it('is effective-dated: the latest entry on or before the day, never a later one', () => {
    const history = [req(6, '2026-10-01'), req(7, '2026-10-10')];
    expect(effectiveOwnerRate(history, '2026-10-09')?.pct).toBe(6);
    expect(effectiveOwnerRate(history, '2026-10-10')?.pct).toBe(7);
  });

  it('lets the agreed rate win over a requested one', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    expect(effectiveOwnerRate(history, '2026-10-10')).toMatchObject({ pct: 8, kind: 'agreed' });
  });

  it('keeps the requested rate on days before the agreed rate starts', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    expect(effectiveOwnerRate(history, '2026-10-04')).toMatchObject({ pct: 6, kind: 'requested' });
  });

  it('a feeder request after an override is a request only and never changes the rate', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05'), req(4, '2026-10-08')];
    expect(effectiveOwnerRate(history, '2026-10-20')).toMatchObject({ pct: 8, kind: 'agreed' });
    expect(requestedOwnerRate(history, '2026-10-20')).toBe(4);
  });

  it('a later agreed rate replaces an earlier one; a tie goes to the later record', () => {
    const history = [
      agreed(8, '2026-10-05'),
      agreed(9, '2026-10-05', '2026-10-05T12:00:00Z'),
      agreed(7, '2026-10-02'),
    ];
    expect(effectiveOwnerRate(history, '2026-10-06')?.pct).toBe(9);
  });

  it('does not depend on the order of the history', () => {
    const history = [agreed(8, '2026-10-05'), req(6, '2026-10-01')];
    expect(effectiveOwnerRate([...history].reverse(), '2026-10-10')?.pct).toBe(8);
  });
});

describe('requestedOwnerRate', () => {
  it('is the feeder latest request in effect, or undefined', () => {
    expect(requestedOwnerRate([agreed(8, '2026-10-01')], '2026-10-10')).toBeUndefined();
    expect(requestedOwnerRate([req(6, '2026-10-01'), req(5, '2026-10-03')], '2026-10-10')).toBe(5);
  });
});

describe('ownerMargin', () => {
  it('is the miner rate minus the owner rate, computed on read', () => {
    expect(ownerMargin(10, 8)).toBe(2);
    expect(ownerMargin(10, 12)).toBe(-2);
  });

  it('is undefined when either rate is missing', () => {
    expect(ownerMargin(undefined, 8)).toBeUndefined();
    expect(ownerMargin(10, undefined)).toBeUndefined();
  });

  it('does not drift on decimal rates', () => {
    expect(ownerMargin(0.3, 0.1)).toBe(0.2);
  });
});

describe('rateChangeEvent', () => {
  it('reports old, new and requested rate and the date when an override changes the rate', () => {
    const before = [req(6, '2026-10-01')];
    const after = [...before, agreed(8, '2026-10-05')];
    expect(rateChangeEvent({ before, after, date: '2026-10-05' })).toEqual({
      date: '2026-10-05',
      oldPct: 6,
      newPct: 8,
      requestedPct: 6,
    });
  });

  it('reports no old rate for a first rate', () => {
    const event = rateChangeEvent({
      before: [],
      after: [agreed(8, '2026-10-05')],
      date: '2026-10-05',
    });
    expect(event).toEqual({ date: '2026-10-05', newPct: 8 });
  });

  it('is undefined when the effective rate did not change', () => {
    const before = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    // A feeder request after the override: recorded, but the rate stands.
    expect(
      rateChangeEvent({ before, after: [...before, req(4, '2026-10-08')], date: '2026-10-08' })
    ).toBeUndefined();
    // The Collector agrees to what is already in force.
    expect(
      rateChangeEvent({ before, after: [...before, agreed(8, '2026-10-09')], date: '2026-10-09' })
    ).toBeUndefined();
  });

  it('is undefined when nothing is in effect on the date', () => {
    expect(
      rateChangeEvent({ before: [], after: [req(6, '2026-10-09')], date: '2026-10-05' })
    ).toBeUndefined();
  });

  it('reports a feeder request that moves the rate while nothing was agreed', () => {
    const before = [req(6, '2026-10-01')];
    expect(
      rateChangeEvent({ before, after: [...before, req(5, '2026-10-08')], date: '2026-10-08' })
    ).toEqual({ date: '2026-10-08', oldPct: 6, newPct: 5, requestedPct: 5 });
  });
});
