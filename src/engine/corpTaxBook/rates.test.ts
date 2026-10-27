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

  it('lets the most specific rate win: record over Miner over moon over Guest over corp', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'guest', pct: 15, effectiveFrom: '2026-01-01' },
      { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' },
      { scope: 'miner', minerId: 'm1', pct: 8, effectiveFrom: '2026-01-01' },
      { scope: 'record', recordKey: ctx.recordKey, pct: 2 },
    ];
    const guest = { ...ctx, isGuest: true };
    expect(resolveRate(rates, guest)?.scope).toBe('record');
    expect(resolveRate(rates.slice(0, 4), guest)?.scope).toBe('miner');
    expect(resolveRate(rates.slice(0, 3), guest)?.scope).toBe('moon');
    expect(resolveRate(rates.slice(0, 2), guest)?.scope).toBe('guest');
  });

  it('prices a miner with a miner rate at the miner rate, even on a moon with a moon rate', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' },
      { scope: 'miner', minerId: 'm1', pct: 8, effectiveFrom: '2026-01-01' },
    ];
    expect(resolveRate(rates, ctx)).toMatchObject({ scope: 'miner', pct: 8 });
    expect(resolveRate(rates, { ...ctx, minerId: 'm2' })).toMatchObject({ scope: 'moon', pct: 5 });
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

describe('per-feeder tier', () => {
  const FEEDER = 98000077;
  const feeder: TaxRate = {
    scope: 'feeder',
    feederId: FEEDER,
    pct: 7,
    effectiveFrom: '2026-01-01',
  };
  const at = { ...ctx, feederId: FEEDER };

  it('beats the Guest and corp defaults for a feeder refinery', () => {
    const rates: TaxRate[] = [
      CORP,
      { scope: 'guest', pct: 15, effectiveFrom: '2026-01-01' },
      feeder,
    ];
    expect(resolveRate(rates, { ...at, isGuest: true })).toEqual({
      pct: 7,
      scope: 'feeder',
      effectiveFrom: '2026-01-01',
    });
  });

  it('loses to a per-miner and a per-moon rate', () => {
    const miner: TaxRate = { scope: 'miner', minerId: 'm1', pct: 8, effectiveFrom: '2026-01-01' };
    const moon: TaxRate = { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' };
    expect(resolveRate([CORP, feeder, miner], at)?.scope).toBe('miner');
    expect(resolveRate([CORP, feeder, moon], at)?.scope).toBe('moon');
  });

  it('ignores another feeder and a refinery with no feeder', () => {
    expect(resolveRate([CORP, feeder], { ...at, feederId: 98000078 })?.scope).toBe('corp');
    expect(resolveRate([CORP, feeder], ctx)?.scope).toBe('corp');
  });

  it('is effective-dated: earlier days keep the old rate, a future rate falls back', () => {
    const rates: TaxRate[] = [CORP, feeder, { ...feeder, pct: 9, effectiveFrom: '2026-07-13' }];
    expect(resolveRate(rates, at)?.pct).toBe(7);
    expect(resolveRate(rates, { ...at, date: '2026-07-13' })?.pct).toBe(9);
    expect(resolveRate(rates, { ...at, date: '2025-12-31' })).toBeUndefined();
  });
});

describe('per-refinery (structure) tier (#4621)', () => {
  const FEEDER = 98000077;
  const REFINERY = 1035000000001;
  const refinery: TaxRate = {
    scope: 'structure',
    structureId: REFINERY,
    pct: 6,
    effectiveFrom: '2026-07-01',
  };
  const feeder: TaxRate = {
    scope: 'feeder',
    feederId: FEEDER,
    pct: 8,
    effectiveFrom: '2026-07-01',
  };
  // A moon owner's ledger-only row: no moon is ever known.
  const at = { ...ctx, moonId: undefined, feederId: FEEDER, structureId: REFINERY };

  it('prices a refinery with no known moon, beating the per-moon-owner rate', () => {
    expect(resolveRate([CORP, feeder, refinery], at)).toEqual({
      pct: 6,
      scope: 'structure',
      effectiveFrom: '2026-07-01',
    });
  });

  it('loses to a per-Miner rate and to a per-moon rate', () => {
    const miner: TaxRate = { scope: 'miner', minerId: 'm1', pct: 4, effectiveFrom: '2026-07-01' };
    const moon: TaxRate = { scope: 'moon', moonId: 40000001, pct: 3, effectiveFrom: '2026-07-01' };
    expect(resolveRate([CORP, refinery, miner], at)?.scope).toBe('miner');
    expect(resolveRate([CORP, refinery, moon], { ...at, moonId: 40000001 })?.scope).toBe('moon');
  });

  it('ignores another refinery and a row with no refinery given', () => {
    expect(resolveRate([CORP, refinery], { ...at, structureId: 1035000000002 })?.scope).toBe(
      'corp'
    );
    expect(resolveRate([CORP, refinery], ctx)?.scope).toBe('corp');
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
