import { describe, expect, it } from 'vitest';
import type { ChargeChoice } from './chargeChoice';
import {
  capQuickPicks,
  capStrictlyWorseThan,
  compareCapacitor,
  iskPerGj,
  sortCapChoices,
  type CapBoosterFigures,
} from './capBoosterChoice';

const stable = (stablePercentage: number) => ({ stable: true as const, stablePercentage });
const runsDry = (depletesInSeconds: number) => ({ stable: false as const, depletesInSeconds });

function booster(
  typeId: number,
  name: string,
  cap: Partial<CapBoosterFigures> & Pick<CapBoosterFigures, 'injection'>,
  extra: Partial<ChargeChoice> = {}
): ChargeChoice {
  return {
    typeId,
    name,
    baseTypeId: typeId,
    baseName: name,
    tier: name.startsWith('Navy') ? 'faction' : 'tech1',
    faction: name.startsWith('Navy') ? 'Navy' : null,
    dps: 0,
    optimal: 0,
    falloff: 0,
    damage: null,
    price: 100,
    roundsPerMinute: null,
    cargo: 0,
    skillMissing: false,
    cap: {
      gjPerSecond: cap.injection / 12,
      boostsPerLoad: 3,
      capacitor: runsDry(60),
      ...cap,
    },
    ...extra,
  };
}

describe('compareCapacitor', () => {
  it('ranks stable above running dry, then by level or time', () => {
    expect(compareCapacitor(stable(30), runsDry(9999))).toBeGreaterThan(0);
    expect(compareCapacitor(stable(30), stable(60))).toBeLessThan(0);
    expect(compareCapacitor(runsDry(120), runsDry(60))).toBeGreaterThan(0);
    expect(compareCapacitor(stable(45), stable(45))).toBe(0);
  });
});

describe('iskPerGj', () => {
  it("is the hub price over one charge's injection", () => {
    expect(iskPerGj(booster(1, 'Cap Booster 400', { injection: 400 }, { price: 200 }))).toBe(0.5);
  });

  it('is null without a price or a cap booster figure', () => {
    expect(iskPerGj(booster(1, 'Cap Booster 400', { injection: 400 }, { price: null }))).toBeNull();
    expect(iskPerGj({ ...booster(1, 'X', { injection: 400 }), cap: undefined })).toBeNull();
  });
});

describe('sortCapChoices', () => {
  it('runs smallest charge to biggest, Tech I before Navy at each size', () => {
    const sorted = sortCapChoices([
      booster(3, 'Navy Cap Booster 800', { injection: 800 }),
      booster(2, 'Cap Booster 800', { injection: 800 }),
      booster(1, 'Navy Cap Booster 400', { injection: 400 }),
      booster(4, 'Cap Booster 400', { injection: 400 }),
    ]);
    expect(sorted.map((c) => c.name)).toEqual([
      'Cap Booster 400',
      'Navy Cap Booster 400',
      'Cap Booster 800',
      'Navy Cap Booster 800',
    ]);
  });
});

describe('capStrictlyWorseThan', () => {
  it('names a cheaper charge that injects as much and holds the capacitor as well', () => {
    const t1 = booster(1, 'Cap Booster 800', { injection: 800, gjPerSecond: 50 }, { price: 300 });
    const navy = booster(
      2,
      'Navy Cap Booster 800',
      { injection: 800, gjPerSecond: 55 },
      { price: 250 }
    );
    expect(capStrictlyWorseThan(t1, [t1, navy])).toBe(navy);
    expect(capStrictlyWorseThan(navy, [t1, navy])).toBeNull();
  });

  it('names the charge that beats it, not one that is itself beaten', () => {
    const worst = booster(
      1,
      'Cap Booster 800',
      { injection: 800, gjPerSecond: 50 },
      { price: 300 }
    );
    const middle = booster(
      2,
      'Navy Cap Booster 800',
      { injection: 800, gjPerSecond: 52 },
      { price: 280 }
    );
    const best = booster(
      3,
      'Cap Booster 1600',
      { injection: 800, gjPerSecond: 60 },
      { price: 200 }
    );
    expect(capStrictlyWorseThan(worst, [worst, middle, best])).toBe(best);
  });

  it('keeps a pricier charge that holds the capacitor higher', () => {
    const small = booster(
      1,
      'Cap Booster 400',
      { injection: 400, capacitor: runsDry(90) },
      { price: 100 }
    );
    const big = booster(
      2,
      'Cap Booster 800',
      { injection: 800, capacitor: stable(40) },
      { price: 200 }
    );
    expect(capStrictlyWorseThan(big, [small, big])).toBeNull();
    expect(capStrictlyWorseThan(small, [small, big])).toBeNull();
  });

  it('never names a skill-locked or unpriced charge, nor judges an unpriced one', () => {
    const t1 = booster(1, 'Cap Booster 800', { injection: 800 }, { price: 300 });
    const locked = booster(
      2,
      'Navy Cap Booster 800',
      { injection: 800 },
      { price: 1, skillMissing: true }
    );
    const unpriced = booster(3, 'Cap Booster 400', { injection: 400 }, { price: null });
    expect(capStrictlyWorseThan(t1, [t1, locked])).toBeNull();
    expect(capStrictlyWorseThan(unpriced, [unpriced, t1])).toBeNull();
  });
});

describe('capQuickPicks', () => {
  const small = booster(
    1,
    'Cap Booster 200',
    { injection: 200, gjPerSecond: 15, capacitor: runsDry(80) },
    { price: 50 }
  );
  const mid = booster(
    2,
    'Cap Booster 400',
    { injection: 400, gjPerSecond: 30, capacitor: stable(35) },
    { price: 130 }
  );
  const midNavy = booster(
    3,
    'Navy Cap Booster 400',
    { injection: 400, gjPerSecond: 33, capacitor: stable(41) },
    { price: 170 }
  );
  const big = booster(
    4,
    'Cap Booster 800',
    { injection: 800, gjPerSecond: 60, capacitor: stable(80) },
    { price: 240 }
  );

  it('picks the smallest charge that holds the capacitor, the most GJ/s, and the cheapest stable GJ', () => {
    const picks = capQuickPicks([small, mid, midNavy, big]);
    expect(picks?.smallestStable).toBe(mid);
    expect(picks?.mostGjPerSecond).toBe(big);
    // 200 GJ at 50 is the cheapest GJ (0.25), but it runs dry; of the stable, 800 at 240 (0.3).
    expect(picks?.bestValue).toBe(big);
  });

  it('falls back to the cheapest GJ of all when none hold the capacitor', () => {
    const picks = capQuickPicks([small, { ...big, cap: { ...big.cap!, capacitor: runsDry(200) } }]);
    expect(picks?.smallestStable).toBeNull();
    expect(picks?.bestValue).toBe(small);
  });

  it('leaves skill-locked charges out, and is null with nothing usable', () => {
    const locked = { ...big, skillMissing: true };
    expect(capQuickPicks([small, mid, locked])?.mostGjPerSecond).toBe(mid);
    expect(capQuickPicks([locked])).toBeNull();
  });
});
