import { describe, it, expect } from 'vitest';
import { canOverrideRecordRate, isRetroactiveRate, resolveRate, type TaxRate } from './rates';

const CORP: TaxRate = { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' };
const ctx = {
  date: '2026-07-12',
  minerId: 'm1',
  moonId: 40000001,
  recordKey: '90000001:1001:2026-07-12',
  isGuest: false,
};

describe('resolveRate', () => {
  it('uses the corp default when nothing more specific applies', () => {
    expect(resolveRate([CORP], ctx)).toEqual({
      pct: 10,
      scope: 'corp',
      effectiveFrom: '2026-01-01',
    });
  });

  it('returns undefined when no rate is in effect yet', () => {
    expect(resolveRate([CORP], { ...ctx, date: '2025-12-31' })).toBeUndefined();
  });

  it('applies the Guest default only to a guest', () => {
    const rates: TaxRate[] = [CORP, { scope: 'guest', pct: 15, effectiveFrom: '2026-01-01' }];
    expect(resolveRate(rates, ctx)?.pct).toBe(10);
    expect(resolveRate(rates, { ...ctx, isGuest: true })?.pct).toBe(15);
  });

  it('lets the most specific rate win: record over moon over Miner over Guest over corp', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'guest', pct: 15, effectiveFrom: '2026-01-01' },
      { scope: 'miner', minerId: 'm1', pct: 8, effectiveFrom: '2026-01-01' },
      { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' },
      { scope: 'record', recordKey: ctx.recordKey, pct: 2 },
    ];
    const guest = { ...ctx, isGuest: true };
    expect(resolveRate(rates, guest)?.scope).toBe('record');
    expect(resolveRate(rates.slice(0, 4), guest)?.scope).toBe('moon');
    expect(resolveRate(rates.slice(0, 3), guest)?.scope).toBe('miner');
    expect(resolveRate(rates.slice(0, 2), guest)?.scope).toBe('guest');
  });

  it('ignores overrides aimed at another Miner, moon or record', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'miner', minerId: 'm2', pct: 8, effectiveFrom: '2026-01-01' },
      { scope: 'moon', moonId: 40000002, pct: 5, effectiveFrom: '2026-01-01' },
      { scope: 'record', recordKey: 'other', pct: 2 },
    ];
    expect(resolveRate(rates, ctx)?.pct).toBe(10);
  });

  it('is never retroactive: a rate applies from its effective-from date, earlier days keep the old one', () => {
    const rates: TaxRate[] = [CORP, { scope: 'corp', pct: 12, effectiveFrom: '2026-07-13' }];
    expect(resolveRate(rates, ctx)?.pct).toBe(10);
    expect(resolveRate(rates, { ...ctx, date: '2026-07-13' })?.pct).toBe(12);
  });

  it('a more specific rate not yet in effect falls back to the broader one', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-08-01' },
    ];
    expect(resolveRate(rates, ctx)?.scope).toBe('corp');
  });

  it('a refinery with no known moon only matches broader rates', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' },
    ];
    expect(resolveRate(rates, { ...ctx, moonId: undefined })?.pct).toBe(10);
  });
});

describe('isRetroactiveRate', () => {
  it('flags a new rate dated before today', () => {
    expect(isRetroactiveRate('2026-07-11', '2026-07-12')).toBe(true);
    expect(isRetroactiveRate('2026-07-12', '2026-07-12')).toBe(false);
    expect(isRetroactiveRate('2026-08-01', '2026-07-12')).toBe(false);
  });
});

describe('canOverrideRecordRate', () => {
  it('allows a per-record override only on a day not yet on a Statement', () => {
    const onStatement = new Set(['2026-07-01', '2026-07-12']);
    expect(canOverrideRecordRate('2026-07-12', onStatement)).toBe(false);
    expect(canOverrideRecordRate('2026-07-13', onStatement)).toBe(true);
  });
});
