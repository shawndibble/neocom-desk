import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { FUEL_BLOCK_VOLUME_M3, fuelBays, fuelPlan, fuelUntilMs } from './fuelPlan';

const NOW = Date.UTC(2026, 10, 12, 12);
const NITROGEN = 4051;
const OXYGEN = 4312;

function asset(over: Partial<Parameters<typeof fuelBays>[0][number]>) {
  return {
    type_id: NITROGEN,
    quantity: 100,
    location_id: 1001,
    location_flag: 'StructureFuel',
    ...over,
  };
}

describe('fuelBays', () => {
  it('sums fuel blocks in each structure fuel bay, across block types', () => {
    const bays = fuelBays([
      asset({ quantity: 100 }),
      asset({ type_id: OXYGEN, quantity: 50 }),
      asset({ location_id: 1002, quantity: 7 }),
    ]);
    expect(bays.get(1001)).toBe(150);
    expect(bays.get(1002)).toBe(7);
  });

  it('counts only the StructureFuel flag and only fuel block types', () => {
    const bays = fuelBays([
      asset({ quantity: 10 }),
      asset({ location_flag: 'CorpSAG1', quantity: 900 }),
      asset({ location_flag: 'CorpDeliveries', quantity: 900 }),
      asset({ type_id: 34, quantity: 900 }),
    ]);
    expect(bays.get(1001)).toBe(10);
  });

  it('has no entry for a structure with nothing in its bay', () => {
    expect(fuelBays([asset({ location_flag: 'CorpSAG1' })]).has(1001)).toBe(false);
  });
});

describe('fuelUntilMs', () => {
  it('is the end of the chosen EVE day', () => {
    expect(fuelUntilMs('2026-12-12')).toBe(Date.UTC(2026, 11, 13));
  });
});

describe('fuelPlan', () => {
  const base = { bayReadAtMs: NOW, expiryReadAtMs: NOW, untilMs: NOW + 30 * DAY_MS };

  it('works the rate out from the bay and the time to expiry', () => {
    const plan = fuelPlan({ ...base, blocks: 240, fuelExpiresMs: NOW + 10 * DAY_MS });
    expect(plan.perDay).toBe(24);
  });

  it('needs the blocks to burn from expiry to the date, rounded up', () => {
    const plan = fuelPlan({ ...base, blocks: 100, fuelExpiresMs: NOW + 3 * DAY_MS });
    // 33.33…/day for 27 days = 900.
    expect(plan.needed).toBe(900);
    const odd = fuelPlan({ ...base, blocks: 10, fuelExpiresMs: NOW + 3 * DAY_MS });
    // 3.33…/day for 27 days = 90; 10/3*27 in floating point must not round to 91.
    expect(odd.needed).toBe(90);
    const fraction = fuelPlan({
      ...base,
      blocks: 7,
      fuelExpiresMs: NOW + 2 * DAY_MS,
      untilMs: NOW + 3 * DAY_MS,
    });
    expect(fraction.needed).toBe(4);
  });

  it('needs 0 when the fuel already lasts past the date', () => {
    const plan = fuelPlan({ ...base, blocks: 1000, fuelExpiresMs: NOW + 40 * DAY_MS });
    expect(plan.needed).toBe(0);
    expect(plan.perDay).toBe(25);
  });

  it('needs 0 past the date even with no bay reading', () => {
    const plan = fuelPlan({ ...base, blocks: null, fuelExpiresMs: NOW + 40 * DAY_MS });
    expect(plan).toEqual({ perDay: null, needed: 0 });
  });

  it('has no rate, and so no need, for an empty bay or a dry structure', () => {
    expect(fuelPlan({ ...base, blocks: 0, fuelExpiresMs: NOW + 3 * DAY_MS })).toEqual({
      perDay: null,
      needed: null,
    });
    expect(fuelPlan({ ...base, blocks: 50, fuelExpiresMs: null })).toEqual({
      perDay: null,
      needed: null,
    });
  });

  it('has no rate when the fuel runs out within the hour', () => {
    const plan = fuelPlan({ ...base, blocks: 2, fuelExpiresMs: NOW + 30 * 60_000 });
    expect(plan).toEqual({ perDay: null, needed: null });
  });

  it('has no rate when the bay and the expiry come from different refreshes', () => {
    const plan = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      bayReadAtMs: NOW - 2 * HOUR_MS,
    });
    expect(plan).toEqual({ perDay: null, needed: null });
  });

  it('measures the rate from when the bay was read', () => {
    const plan = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      bayReadAtMs: NOW - 30 * 60_000,
      expiryReadAtMs: NOW,
    });
    expect(plan.perDay).toBeCloseTo(240 / (10 + 1 / 48), 6);
  });

  it('prices a block at 5 m3', () => {
    expect(FUEL_BLOCK_VOLUME_M3).toBe(5);
  });
});
