import { describe, expect, it } from 'vitest';
import { METER_STOPS, ratioMeterColor } from './meterColor';

describe('ratioMeterColor', () => {
  it('starts gray at 0 and ends on the muted red at 100', () => {
    expect(ratioMeterColor(0)).toBe('#6f8296');
    expect(ratioMeterColor(100)).toBe('#d1675f');
  });

  it('lands exactly on each stop', () => {
    for (const [pct, hex] of METER_STOPS) expect(ratioMeterColor(pct)).toBe(hex);
  });

  it('clamps outside 0-100', () => {
    expect(ratioMeterColor(-20)).toBe(ratioMeterColor(0));
    expect(ratioMeterColor(250)).toBe(ratioMeterColor(100));
  });

  it('stays out of yellow and orange until past half: gray, blue, then green', () => {
    // Below 50% the green channel leads red, so the colour is cool, never warm.
    for (const pct of [0, 10, 20, 30, 40, 45, 50]) {
      const hex = ratioMeterColor(pct);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      expect(g, `${pct}% ${hex}`).toBeGreaterThanOrEqual(r);
    }
  });

  it('blends between stops', () => {
    const mid = ratioMeterColor(11);
    expect(mid).not.toBe(ratioMeterColor(0));
    expect(mid).not.toBe(ratioMeterColor(22));
  });
});
