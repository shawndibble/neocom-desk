import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '@/lib/age';
import {
  FUEL_BLOCK_VOLUME_M3,
  fuelBays,
  fuelPlan,
  fuelUntilMs,
  starbaseFuelPlan,
} from './fuelPlan';

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
    expect(plan.rateSource).toBe('measured');
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
    expect(plan).toEqual({ perDay: null, needed: 0, rateSource: null, ratePending: false });
  });

  it('has no rate, and so no need, for an empty bay or a dry structure', () => {
    const none = { perDay: null, needed: null, rateSource: null, ratePending: false };
    expect(fuelPlan({ ...base, blocks: 0, fuelExpiresMs: NOW + 3 * DAY_MS })).toEqual(none);
    expect(fuelPlan({ ...base, blocks: 50, fuelExpiresMs: null })).toEqual(none);
  });

  it('has no rate when the fuel runs out within the hour', () => {
    const plan = fuelPlan({ ...base, blocks: 2, fuelExpiresMs: NOW + 30 * MINUTE_MS });
    expect(plan).toEqual({ perDay: null, needed: null, rateSource: null, ratePending: false });
  });

  it('measures the rate from when EVE read the bay', () => {
    const plan = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      bayReadAtMs: NOW - 2 * MINUTE_MS,
    });
    expect(plan.perDay).toBeCloseTo((240 * DAY_MS) / (10 * DAY_MS + 2 * MINUTE_MS), 6);
    expect(plan.rateSource).toBe('measured');
  });

  describe('when EVE read the bay before the expiry', () => {
    // A refuel between the two reads: 773 blocks before it, 27 days of fuel after.
    const refuelled = {
      ...base,
      blocks: 773,
      fuelExpiresMs: NOW + 27 * DAY_MS,
      bayReadAtMs: NOW - 20 * MINUTE_MS,
    };

    it('does not trust the pair, which would understate the rate', () => {
      expect(fuelPlan(refuelled)).toEqual({
        perDay: null,
        needed: null,
        rateSource: null,
        ratePending: true,
      });
    });

    it('falls back to the rate last measured from a matching pair', () => {
      const plan = fuelPlan({ ...refuelled, knownPerDay: 120 });
      expect(plan.perDay).toBe(120);
      expect(plan.rateSource).toBe('remembered');
      expect(plan.ratePending).toBe(false);
      // 3 more days at 120/day.
      expect(plan.needed).toBe(360);
    });

    it('waits for EVE when the old bay read was empty', () => {
      expect(fuelPlan({ ...refuelled, blocks: 0 }).ratePending).toBe(true);
      expect(fuelPlan({ ...refuelled, blocks: 0, knownPerDay: 120 }).perDay).toBe(120);
    });

    it('remembers no rate for an unreadable bay or a dry structure', () => {
      const none = { perDay: null, needed: null, rateSource: null, ratePending: false };
      expect(fuelPlan({ ...refuelled, blocks: null, knownPerDay: 120 })).toEqual(none);
      expect(fuelPlan({ ...refuelled, fuelExpiresMs: null, knownPerDay: 120 })).toEqual(none);
    });
  });

  describe('when EVE read the bay after the expiry', () => {
    const later = {
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      expiryReadAtMs: NOW - 20 * MINUTE_MS,
    };

    it('estimates from the pair, since a refuel between them can only overstate the rate', () => {
      const plan = fuelPlan(later);
      expect(plan.perDay).toBe(24);
      expect(plan.rateSource).toBe('estimated');
    });

    it('prefers its estimate to an older remembered rate', () => {
      const plan = fuelPlan({ ...later, knownPerDay: 20 });
      expect(plan.perDay).toBe(24);
      expect(plan.rateSource).toBe('estimated');
    });
  });

  it('does not trust a pair when either read time is unknown', () => {
    const plan = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      bayReadAtMs: null,
    });
    expect(plan.perDay).toBeNull();
    expect(plan.ratePending).toBe(true);
    const remembered = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      expiryReadAtMs: null,
      knownPerDay: 24,
    });
    expect(remembered.perDay).toBe(24);
  });

  it('prefers a fresh measurement over the remembered rate', () => {
    const plan = fuelPlan({
      ...base,
      blocks: 240,
      fuelExpiresMs: NOW + 10 * DAY_MS,
      knownPerDay: 120,
    });
    expect(plan.perDay).toBe(24);
    expect(plan.rateSource).toBe('measured');
  });

  it('prices a block at 5 m3', () => {
    expect(FUEL_BLOCK_VOLUME_M3).toBe(5);
  });
});

describe('starbaseFuelPlan', () => {
  const UNTIL = NOW + 10 * DAY_MS;

  it('needs the blocks the tower burns between its dry date and the target', () => {
    const plan = starbaseFuelPlan({ perDay: 480, fuelExpiresMs: NOW + 4 * DAY_MS, untilMs: UNTIL });
    expect(plan).toEqual({ perDay: 480, needed: 2880, rateSource: null, ratePending: false });
  });

  it('needs nothing when the fuel already lasts to the target', () => {
    const plan = starbaseFuelPlan({ perDay: 480, fuelExpiresMs: UNTIL, untilMs: UNTIL });
    expect(plan.needed).toBe(0);
  });

  it('cannot say what it needs without a dry date or a burn rate', () => {
    expect(
      starbaseFuelPlan({ perDay: 480, fuelExpiresMs: null, untilMs: UNTIL }).needed
    ).toBeNull();
    expect(
      starbaseFuelPlan({ perDay: null, fuelExpiresMs: NOW + DAY_MS, untilMs: UNTIL }).needed
    ).toBeNull();
  });
});
