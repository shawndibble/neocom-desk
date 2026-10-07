import { describe, it, expect } from 'vitest';
import { shipKillHeatColor, SHIP_KILL_HEAT_STOPS } from './killHeat';

describe('shipKillHeatColor', () => {
  it('leaves a quiet system uncolored', () => {
    expect(shipKillHeatColor(0)).toBeNull();
    expect(shipKillHeatColor(-1)).toBeNull();
  });

  it('lands on yellow, orange and red at the stops', () => {
    expect(shipKillHeatColor(SHIP_KILL_HEAT_STOPS.yellow)).toBe('#f5b94a');
    expect(shipKillHeatColor(SHIP_KILL_HEAT_STOPS.orange)).toBe('#fa965a');
    expect(shipKillHeatColor(SHIP_KILL_HEAT_STOPS.red)).toBe('#ff7369');
  });

  it('stays red above the red stop', () => {
    expect(shipKillHeatColor(SHIP_KILL_HEAT_STOPS.red + 40)).toBe('#ff7369');
  });

  it('runs from near-white at one kill toward yellow', () => {
    const one = shipKillHeatColor(1);
    expect(one).not.toBeNull();
    expect(one).not.toBe('#f5b94a');
    expect(one).not.toBe('#dee7ee');
  });

  it('gives every count in the ramp its own step up to the red stop', () => {
    const colors = Array.from({ length: SHIP_KILL_HEAT_STOPS.red }, (_, i) =>
      shipKillHeatColor(i + 1)
    );
    expect(new Set(colors).size).toBe(colors.length);
  });
});
