import { describe, expect, it } from 'vitest';
import { effectiveOwnerRatePct } from './corpTaxBookEngine.js';
import {
  appendAgreedRate,
  appendModeChange,
  MAX_AS_OF_DAYS_BACK,
  resolveAsOf,
  parseSetFeederModeInput,
  parseSetFeederRateInput,
} from './corpTaxBookFeederOwnerCalls.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';

const JOINED = Date.parse('2026-10-01T08:00:00Z');
const NOW = Date.parse('2026-10-18T12:00:00Z');

const record = (extra: Partial<FeederRecord> = {}): FeederRecord => ({
  corporationId: 5,
  status: 'active',
  invitedBy: 1,
  joinedAt: JOINED,
  mode: 'normal',
  coveragePeriods: [{ from: '2026-10-01' }],
  ...extra,
});

describe('parseSetFeederRateInput', () => {
  const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5 };
  it('reads the feeder and a 0-100 rate', () => {
    expect(parseSetFeederRateInput({ ...base, pct: 7.5 })).toMatchObject({
      feederCorporationId: 5,
      pct: 7.5,
    });
  });
  it.each([-1, 101, Number.NaN, '5', undefined])('rejects a rate of %s', (pct) => {
    expect(() => parseSetFeederRateInput({ ...base, pct })).toThrow();
  });
  it('needs a feeder corporation', () => {
    expect(() => parseSetFeederRateInput({ corporationId: 9, pct: 5 })).toThrow();
  });
});

describe('parseSetFeederRateInput as-of', () => {
  const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5, pct: 5 };
  it('reads an optional YYYY-MM-DD day', () => {
    expect(parseSetFeederRateInput({ ...base, asOf: '2026-10-10' }).asOf).toBe('2026-10-10');
    expect(parseSetFeederRateInput(base).asOf).toBeUndefined();
  });
  it.each(['10/10/2026', '2026-02-31', 5])('rejects an as-of of %s', (asOf) => {
    expect(() => parseSetFeederRateInput({ ...base, asOf })).toThrow();
  });
});

describe('resolveAsOf', () => {
  it('the window matches the engine in src/ (30 days)', () => {
    expect(MAX_AS_OF_DAYS_BACK).toBe(30);
  });

  it('is today when no day is given', () => {
    expect(resolveAsOf(record(), undefined, NOW)).toBe('2026-10-18');
  });
  it('allows today and the moon owner first day', () => {
    expect(resolveAsOf(record(), '2026-10-18', NOW)).toBe('2026-10-18');
    expect(resolveAsOf(record(), '2026-10-01', NOW)).toBe('2026-10-01');
  });
  it('refuses a day before the moon owner first day', () => {
    expect(() => resolveAsOf(record(), '2026-09-30', NOW)).toThrow(/as-of/);
  });
  it('refuses a future day', () => {
    expect(() => resolveAsOf(record(), '2026-10-19', NOW)).toThrow(/as-of/);
  });
  it('allows exactly 30 days back and refuses 31', () => {
    const old = record({ joinedAt: Date.parse('2026-06-01T00:00:00Z') });
    expect(resolveAsOf(old, '2026-09-18', NOW)).toBe('2026-09-18');
    expect(() => resolveAsOf(old, '2026-09-17', NOW)).toThrow(/as-of/);
  });
});

describe('parseSetFeederModeInput', () => {
  const base = { corporationId: 9, accessToken: 't', feederCorporationId: 5 };
  it('reads the mode and an optional note', () => {
    expect(parseSetFeederModeInput({ ...base, mode: 'settled-otherwise' })).toMatchObject({
      mode: 'settled-otherwise',
    });
    expect(
      parseSetFeederModeInput({ ...base, mode: 'settled-otherwise', note: '  by hand ' }).note
    ).toBe('by hand');
  });
  it('treats a blank note as none', () => {
    expect(parseSetFeederModeInput({ ...base, mode: 'normal', note: '  ' }).note).toBeUndefined();
  });
  it('rejects an unknown mode and an over-long note', () => {
    expect(() => parseSetFeederModeInput({ ...base, mode: 'free' })).toThrow();
    expect(() =>
      parseSetFeederModeInput({ ...base, mode: 'normal', note: 'x'.repeat(501) })
    ).toThrow();
  });
});

describe('appendAgreedRate', () => {
  it('adds a dated agreed entry the engine reads back', () => {
    const history = appendAgreedRate(record({ requestedRatePct: 4 }), 6, NOW);
    expect(history.at(-1)).toEqual({
      kind: 'agreed',
      pct: 6,
      effectiveFrom: '2026-10-18',
      recordedAt: '2026-10-18T12:00:00.000Z',
      noBackdate: true,
    });
    expect(effectiveOwnerRatePct(history, '2026-10-18')).toBe(6);
    expect(effectiveOwnerRatePct(history, '2026-10-17')).toBeUndefined();
  });
  it('dates the entry by the as-of day', () => {
    const history = appendAgreedRate(record(), 6, NOW, '2026-10-10');
    expect(history.at(-1)).toMatchObject({ effectiveFrom: '2026-10-10', noBackdate: true });
    expect(effectiveOwnerRatePct(history, '2026-10-09')).toBeUndefined();
    expect(effectiveOwnerRatePct(history, '2026-10-10')).toBe(6);
  });
  it('keeps an old first entry reaching back', () => {
    const rec = record({ agreedRatePct: 5 });
    const history = appendAgreedRate(rec, 6, NOW);
    expect(effectiveOwnerRatePct(history, '2026-09-20')).toBe(5);
  });
  it('a later agreed rate never reaches back past the one already in force', () => {
    const history = appendAgreedRate(record({ requestedRatePct: 4, agreedRatePct: 5 }), 6, NOW);
    expect(effectiveOwnerRatePct(history, '2026-10-18')).toBe(6);
    expect(effectiveOwnerRatePct(history, '2026-10-17')).toBe(5);
  });
  it('keeps earlier entries, deriving them from the legacy fields', () => {
    const history = appendAgreedRate(record({ requestedRatePct: 4, agreedRatePct: 5 }), 6, NOW);
    expect(history.map((e) => [e.kind, e.pct])).toEqual([
      ['requested', 4],
      ['agreed', 5],
      ['agreed', 6],
    ]);
  });
  it('repeating the rate in force with an earlier as-of day adds an entry', () => {
    const rec = record({ ownerRateHistory: appendAgreedRate(record(), 6, JOINED, '2026-10-10') });
    const history = appendAgreedRate(rec, 6, NOW, '2026-10-05');
    expect(history.at(-1)).toMatchObject({ pct: 6, effectiveFrom: '2026-10-05' });
  });
  it('compares with the rate in force, not the last one recorded', () => {
    const rec = record({
      ownerRateHistory: [
        ...appendAgreedRate(record(), 5, JOINED, '2026-10-10'),
        { kind: 'agreed', pct: 8, effectiveFrom: '2026-10-17', recordedAt: '2026-10-17T00:00:00Z' },
      ],
    });
    expect(appendAgreedRate(rec, 8, NOW, '2026-10-18')).toEqual(rec.ownerRateHistory);
    expect(appendAgreedRate(rec, 5, NOW, '2026-10-14')).toHaveLength(3);
  });
  it('adds nothing when the standing agreed rate is repeated', () => {
    const rec = record({ ownerRateHistory: appendAgreedRate(record(), 6, JOINED) });
    expect(appendAgreedRate(rec, 6, NOW)).toEqual(rec.ownerRateHistory);
  });
});

describe('appendModeChange', () => {
  it('adds a dated switch', () => {
    expect(appendModeChange(record(), 'settled-otherwise', NOW)).toEqual([
      { from: '2026-10-18', mode: 'settled-otherwise' },
    ]);
  });
  it('derives the earlier switch from a legacy mode', () => {
    expect(appendModeChange(record({ mode: 'settled-otherwise' }), 'normal', NOW)).toEqual([
      { from: '2026-10-01', mode: 'settled-otherwise' },
      { from: '2026-10-18', mode: 'normal' },
    ]);
  });
  it('adds nothing when the mode does not move', () => {
    expect(appendModeChange(record(), 'normal', NOW)).toEqual([]);
  });
});
