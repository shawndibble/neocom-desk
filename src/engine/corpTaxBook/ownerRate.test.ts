import { describe, expect, it } from 'vitest';
import {
  earliestAsOf,
  MAX_AS_OF_DAYS_BACK,
  effectiveOwnerRate,
  latestRateChange,
  ownerMargin,
  rateChangeEvent,
  pendingRateRequest,
  rateNotice,
  requestedOwnerRate,
  type OwnerRateEntry,
} from './ownerRate';

const req = (pct: number, effectiveFrom: string, recordedAt = `${effectiveFrom}T00:00:00Z`) =>
  ({ kind: 'requested', pct, effectiveFrom, recordedAt }) satisfies OwnerRateEntry;
const agreed = (pct: number, effectiveFrom: string, recordedAt = `${effectiveFrom}T00:00:00Z`) =>
  ({ kind: 'agreed', pct, effectiveFrom, recordedAt }) satisfies OwnerRateEntry;

describe('earliestAsOf', () => {
  it('the window is 30 days (pinned equal in functions/ by its own test)', () => {
    expect(MAX_AS_OF_DAYS_BACK).toBe(30);
  });

  it('is 30 days back, or the first day when that is later', () => {
    expect(earliestAsOf('2026-10-18', '2026-01-01')).toBe('2026-09-18');
    expect(earliestAsOf('2026-10-18', '2026-10-01')).toBe('2026-10-01');
  });
});

describe('effectiveOwnerRate', () => {
  it('does not reach back from an entry that was agreed with an as-of date (#6347)', () => {
    const history = [{ ...agreed(8, '2026-10-05'), noBackdate: true as const }];
    expect(effectiveOwnerRate(history, '2026-10-04')).toBeUndefined();
    expect(effectiveOwnerRate(history, '2026-10-05')?.pct).toBe(8);
  });

  it('a legacy first entry still reaches back when a later as-of entry follows it', () => {
    const history = [
      agreed(8, '2026-10-05'),
      { ...agreed(9, '2026-10-10'), noBackdate: true as const },
    ];
    expect(effectiveOwnerRate(history, '2026-09-20')?.pct).toBe(8);
  });

  it('is undefined with no history or before any rate takes effect', () => {
    expect(effectiveOwnerRate([], '2026-10-01')).toBeUndefined();
    expect(effectiveOwnerRate([req(6, '2026-10-05')], '2026-10-04')).toBeUndefined();
  });

  it('never takes a requested rate: with nothing agreed there is no rate', () => {
    expect(effectiveOwnerRate([req(6, '2026-10-01')], '2026-10-10')).toBeUndefined();
  });

  it('backdates the first agreed rate over the days before it', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05'), agreed(9, '2026-10-07')];
    expect(effectiveOwnerRate(history, '2026-09-20')).toEqual({
      pct: 8,
      kind: 'agreed',
      effectiveFrom: '2026-10-05',
    });
  });

  it('is effective-dated: the latest entry on or before the day, never a later one', () => {
    const history = [agreed(6, '2026-10-01'), agreed(7, '2026-10-10')];
    expect(effectiveOwnerRate(history, '2026-10-09')?.pct).toBe(6);
    expect(effectiveOwnerRate(history, '2026-10-10')?.pct).toBe(7);
  });

  it('lets the agreed rate win over a requested one', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    expect(effectiveOwnerRate(history, '2026-10-10')).toMatchObject({ pct: 8, kind: 'agreed' });
  });

  it('a request never applies, even on days before the agreed rate starts', () => {
    const history = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    expect(effectiveOwnerRate(history, '2026-10-04')).toMatchObject({ pct: 8, kind: 'agreed' });
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

describe('pendingRateRequest', () => {
  it('is the request made with nothing agreed, or after the last agreement and different from it', () => {
    expect(pendingRateRequest([])).toBeUndefined();
    expect(pendingRateRequest([req(6, '2026-10-01')])).toBe(6);
    expect(pendingRateRequest([req(6, '2026-10-01'), agreed(8, '2026-10-05')])).toBeUndefined();
    expect(pendingRateRequest([agreed(8, '2026-10-01'), req(6, '2026-10-05')])).toBe(6);
    expect(pendingRateRequest([agreed(8, '2026-10-01'), req(8, '2026-10-05')])).toBeUndefined();
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
    const before = [agreed(7, '2026-10-01'), req(6, '2026-10-02')];
    const after = [...before, agreed(8, '2026-10-05')];
    expect(rateChangeEvent({ before, after, date: '2026-10-05' })).toEqual({
      date: '2026-10-05',
      oldPct: 7,
      newPct: 8,
      requestedPct: 6,
      recordedAt: '2026-10-05T00:00:00Z',
    });
  });

  it('is told apart by when it was recorded: 8% to 6% and back to 8% on one day are three changes', () => {
    const first = [agreed(8, '2026-10-05', '2026-10-05T10:00:00Z')];
    const second = [...first, agreed(6, '2026-10-05', '2026-10-05T11:00:00Z')];
    const third = [...second, agreed(8, '2026-10-05', '2026-10-05T12:00:00Z')];
    const date = '2026-10-05';
    expect(rateChangeEvent({ before: first, after: second, date })?.recordedAt).toBe(
      '2026-10-05T11:00:00Z'
    );
    expect(rateChangeEvent({ before: second, after: third, date })?.recordedAt).toBe(
      '2026-10-05T12:00:00Z'
    );
  });

  it('reports no old rate for a first rate', () => {
    const event = rateChangeEvent({
      before: [],
      after: [agreed(8, '2026-10-05')],
      date: '2026-10-05',
    });
    expect(event).toEqual({ date: '2026-10-05', newPct: 8, recordedAt: '2026-10-05T00:00:00Z' });
  });

  it('is undefined when the effective rate did not change', () => {
    const before = [req(6, '2026-10-01'), agreed(8, '2026-10-05')];
    expect(
      rateChangeEvent({ before, after: [...before, req(4, '2026-10-08')], date: '2026-10-08' })
    ).toBeUndefined();
    expect(
      rateChangeEvent({ before, after: [...before, agreed(8, '2026-10-09')], date: '2026-10-09' })
    ).toBeUndefined();
  });

  it('is undefined when nothing is in effect on the date', () => {
    expect(
      rateChangeEvent({ before: [], after: [req(6, '2026-10-09')], date: '2026-10-05' })
    ).toBeUndefined();
  });

  it('a request alone never moves the rate', () => {
    const before = [req(6, '2026-10-01')];
    expect(
      rateChangeEvent({ before, after: [...before, req(5, '2026-10-08')], date: '2026-10-08' })
    ).toBeUndefined();
  });
});

describe('latestRateChange', () => {
  it('is the last agreed change, with what is asked for now', () => {
    const history = [agreed(6, '2026-10-01'), agreed(8, '2026-10-05'), req(7, '2026-10-08')];
    expect(latestRateChange(history)).toEqual({
      date: '2026-10-05',
      oldPct: 6,
      newPct: 8,
      requestedPct: 7,
      recordedAt: '2026-10-05T00:00:00Z',
    });
  });

  it('is undefined with a request alone or an agreement to the rate in force', () => {
    expect(latestRateChange([req(6, '2026-10-01')])).toBeUndefined();
    expect(
      latestRateChange([agreed(6, '2026-10-01'), req(5, '2026-10-02'), agreed(6, '2026-10-05')])
    ).toEqual({
      date: '2026-10-01',
      newPct: 6,
      requestedPct: 5,
      recordedAt: '2026-10-01T00:00:00Z',
    });
  });

  it('keeps the earlier change when a later agreement repeats the rate', () => {
    const history = [agreed(8, '2026-10-05'), agreed(8, '2026-10-09')];
    expect(latestRateChange(history)?.date).toBe('2026-10-05');
  });
});

describe('rateNotice', () => {
  it('carries the ask only when it differs from the new rate', () => {
    expect(rateNotice({ date: '2026-10-05', newPct: 8, requestedPct: 6 })).toEqual({
      pct: 8,
      date: '2026-10-05',
      askedPct: 6,
    });
    expect(rateNotice({ date: '2026-10-05', newPct: 8, requestedPct: 8 })).toEqual({
      pct: 8,
      date: '2026-10-05',
    });
    expect(rateNotice({ date: '2026-10-05', newPct: 8 })).toEqual({ pct: 8, date: '2026-10-05' });
  });
});
