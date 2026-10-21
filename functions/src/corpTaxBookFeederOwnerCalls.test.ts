import { describe, expect, it } from 'vitest';
import { effectiveOwnerRatePct } from './corpTaxBookEngine.js';
import {
  appendAgreedRate,
  appendModeChange,
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
    });
    expect(effectiveOwnerRatePct(history, '2026-10-18')).toBe(6);
    // Never reaches back: the day before still reads the request.
    expect(effectiveOwnerRatePct(history, '2026-10-17')).toBe(4);
  });
  it('keeps earlier entries, deriving them from the legacy fields', () => {
    const history = appendAgreedRate(record({ requestedRatePct: 4, agreedRatePct: 5 }), 6, NOW);
    expect(history.map((e) => [e.kind, e.pct])).toEqual([
      ['requested', 4],
      ['agreed', 5],
      ['agreed', 6],
    ]);
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
