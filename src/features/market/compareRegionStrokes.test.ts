import { describe, expect, it } from 'vitest';
import {
  compareRegionStroke,
  openPriceStroke,
  PRIMARY_REGION_STROKE,
} from './compareRegionStrokes';

describe('openPriceStroke', () => {
  it('tells Sell from Buy by weight, with the region keeping its colour and dash', () => {
    const region = compareRegionStroke(0);
    const buy = openPriceStroke(region, 'buy');
    const sell = openPriceStroke(region, 'sell');
    expect(sell.width).toBeGreaterThan(buy.width);
    expect(buy.color).toBe(sell.color);
    expect(buy.dash).toBe(region.dash);
    expect(sell.dash).toBe(region.dash);
  });

  it('gives any two regions a different dash, so colour is never the only cue', () => {
    const dashes = [PRIMARY_REGION_STROKE, ...[0, 1, 2, 3].map(compareRegionStroke)].map(
      (r) => r.dash
    );
    expect(new Set(dashes).size).toBe(dashes.length);
  });
});
