import { describe, expect, it } from 'vitest';
import { applyCostIndexOverride, costIndexSource, parseCostIndexPct } from './costIndexOverride';
import type { MarketSnapshot } from './marketData';

function snapshot(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    hubPrices: {},
    hubBuyPrices: {},
    hubSellVolumes: {},
    adjustedPrices: {},
    systemCostIndex: 0.0464,
    ...over,
  };
}

describe('applyCostIndexOverride', () => {
  it('replaces the ESI index with the override, a percent turned into a fraction', () => {
    expect(applyCostIndexOverride(snapshot(), 4)?.systemCostIndex).toBeCloseTo(0.04);
  });

  it('leaves the snapshot alone when there is no override', () => {
    const s = snapshot();
    expect(applyCostIndexOverride(s, undefined)).toBe(s);
  });

  it('passes a loading snapshot through', () => {
    expect(applyCostIndexOverride(null, 4)).toBeNull();
  });

  it('rescues a snapshot whose index is null because ESI was offline', () => {
    expect(
      applyCostIndexOverride(snapshot({ systemCostIndex: null }), 2.5)?.systemCostIndex
    ).toBeCloseTo(0.025);
  });

  it('clears the missing flag once an override stands in for it', () => {
    const out = applyCostIndexOverride(
      snapshot({ systemCostIndex: 0, systemCostIndexMissing: true }),
      3
    );
    expect(out?.systemCostIndexMissing).toBe(false);
  });
});

describe('costIndexSource', () => {
  it('is override when set, missing when ESI has none, else esi', () => {
    expect(costIndexSource(snapshot(), 3)).toBe('override');
    expect(costIndexSource(snapshot({ systemCostIndexMissing: true }), undefined)).toBe('missing');
    expect(costIndexSource(snapshot(), undefined)).toBe('esi');
    expect(costIndexSource(null, undefined)).toBe('esi');
  });
});

describe('parseCostIndexPct', () => {
  it('reads a decimal point or comma and clamps to 0-100', () => {
    expect(parseCostIndexPct('4.25')).toBe(4.25);
    expect(parseCostIndexPct('4,25')).toBe(4.25);
    expect(parseCostIndexPct('150')).toBe(100);
    expect(parseCostIndexPct('-3')).toBe(0);
  });

  it('reads blank as cleared (null) and garbage as keep (undefined)', () => {
    expect(parseCostIndexPct('  ')).toBeNull();
    expect(parseCostIndexPct('abc')).toBeUndefined();
  });
});
