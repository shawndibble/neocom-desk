import { describe, expect, it } from 'vitest';
import { compareFittingStats, modulesThatDiffer, compareWindow } from './fittingCompare';
import { appliedDps, appliedDpsVsRange, bestRange, graphMaxRange } from './appliedDps';
import type { AppliedDpsInputs } from './appliedDps';
import type { Fitting, FittingStats } from './types';
import { neutralExtendedStats } from './__fixtures__/fittingStats';

function stats(overrides: Partial<FittingStats> = {}): FittingStats {
  return {
    cpuUsed: 10,
    cpuTotal: 100,
    powergridUsed: 10,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
    droneDps: 0,
    droneBandwidthUsed: 0,
    droneBandwidthTotal: 0,
    maxActiveDrones: 0,
    droneBandwidthByType: {},
    hardpoints: { turrets: 0, launchers: 0 },
    droneCapacity: 0,
    ehp: 1000,
    capacitor: { stable: true, stablePercentage: 50 },
    capacitorCapacity: 500,
    capacitorRechargeTime: 120000,
    shield: {
      hp: 500,
      ehp: 1000,
      emResonance: 0.5,
      thermalResonance: 0.5,
      kineticResonance: 0.5,
      explosiveResonance: 0.5,
    },
    armor: {
      hp: 500,
      ehp: 1000,
      emResonance: 0.5,
      thermalResonance: 0.5,
      kineticResonance: 0.5,
      explosiveResonance: 0.5,
    },
    hull: {
      hp: 500,
      ehp: 1000,
      emResonance: 0.5,
      thermalResonance: 0.5,
      kineticResonance: 0.5,
      explosiveResonance: 0.5,
    },
    targeting: {
      maxTargetRange: 10000,
      maxLockedTargets: 5,
      scanResolution: 200,
      signatureRadius: 40,
    },
    navigation: { maxVelocity: 200, agility: 3, mass: 1000000, warpSpeed: 3 },
    unknownItemTypeIds: [],
    slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
    modules: [],
    offense: { weapons: [], dps: 0, volley: 0, overheated: null },
    applied: { weapons: [], droneControlRange: 20000 },
    repair: { shield: 0, armor: 0, hull: 0 },
    overheated: null,
    ...neutralExtendedStats(),
    ...overrides,
  };
}

describe('compareFittingStats', () => {
  it('marks a stat as not differing when every fitting rounds to the same value', () => {
    const table = compareFittingStats([stats(), stats()]);
    const ehpRow = table.rows.find((row) => row.key === 'ehp')!;
    expect(ehpRow.differs).toBe(false);
    expect(ehpRow.bestIndices).toEqual([]);
  });

  it('marks a stat as differing and picks the higher value as best for a higher-is-better field', () => {
    const table = compareFittingStats([stats({ ehp: 1000 }), stats({ ehp: 2000 })]);
    const ehpRow = table.rows.find((row) => row.key === 'ehp')!;
    expect(ehpRow.differs).toBe(true);
    expect(ehpRow.values).toEqual([1000, 2000]);
    expect(ehpRow.bestIndices).toEqual([1]);
  });

  it('picks the lower value as best for a lower-is-better field (signature radius)', () => {
    const table = compareFittingStats([
      stats({
        targeting: {
          maxTargetRange: 10000,
          maxLockedTargets: 5,
          scanResolution: 200,
          signatureRadius: 60,
        },
      }),
      stats({
        targeting: {
          maxTargetRange: 10000,
          maxLockedTargets: 5,
          scanResolution: 200,
          signatureRadius: 40,
        },
      }),
    ]);
    const row = table.rows.find((row) => row.key === 'signatureRadius')!;
    expect(row.bestIndices).toEqual([1]);
  });

  it('gives no highlight for a field with no declared direction (e.g. cpuUsed)', () => {
    const table = compareFittingStats([stats({ cpuUsed: 10 }), stats({ cpuUsed: 90 })]);
    const row = table.rows.find((row) => row.key === 'cpuUsed')!;
    expect(row.differs).toBe(true);
    expect(row.bestIndices).toEqual([]);
  });

  it('compares total DPS and volley (weapons and drones), higher is best', () => {
    const table = compareFittingStats([
      stats({ offense: { weapons: [], dps: 250.04, volley: 1200, overheated: null } }),
      stats({ offense: { weapons: [], dps: 310.26, volley: 900, overheated: null } }),
    ]);
    const dps = table.rows.find((row) => row.key === 'totalDps')!;
    expect(dps.values).toEqual([250, 310.3]);
    expect(dps.bestIndices).toEqual([1]);
    const volley = table.rows.find((row) => row.key === 'totalVolley')!;
    expect(volley.bestIndices).toEqual([0]);
  });

  it('compares local repair per layer, higher is best', () => {
    const table = compareFittingStats([
      stats({ repair: { shield: 0, armor: 42.5, hull: 0 } }),
      stats({ repair: { shield: 0, armor: 30, hull: 0 } }),
    ]);
    expect(table.rows.find((row) => row.key === 'armorRepair')!.bestIndices).toEqual([0]);
    expect(table.rows.find((row) => row.key === 'shieldRepair')!.differs).toBe(false);
  });

  it('handles a three-way tie for best with all indices', () => {
    const table = compareFittingStats([
      stats({ ehp: 500 }),
      stats({ ehp: 1000 }),
      stats({ ehp: 1000 }),
    ]);
    const row = table.rows.find((row) => row.key === 'ehp')!;
    expect(row.bestIndices).toEqual([1, 2]);
  });

  describe('capacitor', () => {
    it('ranks a stable capacitor above an unstable one regardless of percentage/duration', () => {
      const table = compareFittingStats([
        stats({ capacitor: { stable: false, depletesInSeconds: 500 } }),
        stats({ capacitor: { stable: true, stablePercentage: 1 } }),
      ]);
      const row = table.rows.find((row) => row.key === 'capacitor')!;
      expect(row.bestIndices).toEqual([1]);
    });

    it('among stable fits, ranks the higher stable percentage best', () => {
      const table = compareFittingStats([
        stats({ capacitor: { stable: true, stablePercentage: 30 } }),
        stats({ capacitor: { stable: true, stablePercentage: 70 } }),
      ]);
      const row = table.rows.find((row) => row.key === 'capacitor')!;
      expect(row.bestIndices).toEqual([1]);
    });

    it('among unstable fits, ranks the longer depletion time best', () => {
      const table = compareFittingStats([
        stats({ capacitor: { stable: false, depletesInSeconds: 50 } }),
        stats({ capacitor: { stable: false, depletesInSeconds: 200 } }),
      ]);
      const row = table.rows.find((row) => row.key === 'capacitor')!;
      expect(row.bestIndices).toEqual([1]);
    });

    it('encodes an unstable value as negative, so the UI can tell it apart from a stable percentage', () => {
      const table = compareFittingStats([
        stats({ capacitor: { stable: true, stablePercentage: 50 } }),
        stats({ capacitor: { stable: false, depletesInSeconds: 500 } }),
      ]);
      const row = table.rows.find((row) => row.key === 'capacitor')!;
      expect(row.values).toEqual([50, -500]);
    });

    it('does not differ when both sides round to the same stable percentage', () => {
      const table = compareFittingStats([
        stats({ capacitor: { stable: true, stablePercentage: 50.01 } }),
        stats({ capacitor: { stable: true, stablePercentage: 49.99 } }),
      ]);
      const row = table.rows.find((row) => row.key === 'capacitor')!;
      expect(row.differs).toBe(false);
      expect(row.bestIndices).toEqual([]);
    });
  });
});

describe('compareFittingStats price rows', () => {
  it('adds no price rows when prices is omitted', () => {
    const table = compareFittingStats([stats(), stats()]);
    expect(table.rows.some((row) => row.key === 'priceSell' || row.key === 'priceBuy')).toBe(false);
  });

  it('adds sell and buy rows, marked differing, when totals differ', () => {
    const table = compareFittingStats([stats(), stats()], undefined, [
      { sell: 1_000_000, buy: 900_000 },
      { sell: 1_500_000, buy: 1_200_000 },
    ]);
    const sell = table.rows.find((row) => row.key === 'priceSell')!;
    const buy = table.rows.find((row) => row.key === 'priceBuy')!;
    expect(sell.values).toEqual([1_000_000, 1_500_000]);
    expect(sell.differs).toBe(true);
    expect(buy.values).toEqual([900_000, 1_200_000]);
    expect(buy.differs).toBe(true);
  });

  it('does not mark a price row as differing when both fittings round to the same total', () => {
    const table = compareFittingStats([stats(), stats()], undefined, [
      { sell: 1_000_000.2, buy: 900_000 },
      { sell: 999_999.8, buy: 900_000 },
    ]);
    const sell = table.rows.find((row) => row.key === 'priceSell')!;
    const buy = table.rows.find((row) => row.key === 'priceBuy')!;
    expect(sell.differs).toBe(false);
    expect(buy.differs).toBe(false);
  });

  it('gives no best-value highlight for price (cost is not ranked)', () => {
    const table = compareFittingStats([stats(), stats()], undefined, [
      { sell: 2_000_000, buy: 1_000_000 },
      { sell: 1_000_000, buy: 500_000 },
    ]);
    const sell = table.rows.find((row) => row.key === 'priceSell')!;
    expect(sell.bestIndices).toEqual([]);
  });

  it('still shows price for the fittings that priced, when one slot has no price', () => {
    const table = compareFittingStats([stats(), stats()], undefined, [
      { sell: 1_000_000, buy: 900_000 },
      null,
    ]);
    const sell = table.rows.find((row) => row.key === 'priceSell')!;
    expect(sell.values[0]).toBe(1_000_000);
    expect(Number.isNaN(sell.values[1])).toBe(true);
    expect(sell.differs).toBe(true);
  });
});

const RIFTER_HULL = 587;

function fitting(modules: Fitting['modules']): Fitting {
  return { name: 'Test', shipTypeId: RIFTER_HULL, modules, drones: [], cargo: [] };
}

describe('compareFittingStats applied DPS rows', () => {
  const target = { signatureRadius: 125, velocity: 350 };
  const railgun: AppliedDpsInputs = {
    droneControlRange: 20000,
    weapons: [
      {
        kind: 'turret',
        dps: 300,
        optimal: 30000,
        falloff: 10000,
        tracking: 0.05,
        optimalSigRadius: 400,
      },
    ],
  };
  const missiles: AppliedDpsInputs = {
    droneControlRange: 20000,
    weapons: [
      {
        kind: 'missile',
        dps: 200,
        range: 60000,
        explosionRadius: 100,
        explosionVelocity: 500,
        damageReductionFactor: 0.9,
      },
    ],
  };

  function expected(applied: AppliedDpsInputs) {
    const at = bestRange(appliedDpsVsRange(applied, target, graphMaxRange([applied])));
    return { dps: appliedDps(applied, target, at), km: at / 1000 };
  }
  const tenth = (n: number) => Math.round(n * 10) / 10;

  it('adds no applied rows without a Target Profile', () => {
    const keys = compareFittingStats([stats()]).rows.map((r) => r.key);
    expect(keys).not.toContain('appliedDps');
    expect(keys).not.toContain('bestRange');
  });

  it("gives each column the single-Fitting page's applied DPS and its own best range", () => {
    const table = compareFittingStats(
      [stats({ applied: railgun }), stats({ applied: missiles })],
      target
    );
    const dps = table.rows.find((r) => r.key === 'appliedDps')!;
    const range = table.rows.find((r) => r.key === 'bestRange')!;
    const [a, b] = [expected(railgun), expected(missiles)];
    expect(dps.values).toEqual([tenth(a.dps), tenth(b.dps)]);
    expect(range.values).toEqual([tenth(a.km), tenth(b.km)]);
  });

  it('highlights the higher applied DPS and leaves best range without a best side', () => {
    const table = compareFittingStats(
      [stats({ applied: railgun }), stats({ applied: missiles })],
      target
    );
    const dps = table.rows.find((r) => r.key === 'appliedDps')!;
    const range = table.rows.find((r) => r.key === 'bestRange')!;
    expect(dps.differs).toBe(true);
    expect(dps.bestIndices).toEqual([dps.values[0]! > dps.values[1]! ? 0 : 1]);
    expect(range.differs).toBe(true);
    expect(range.bestIndices).toEqual([]);
  });

  it('shows 0 for a Fitting with no firing weapons', () => {
    const table = compareFittingStats([stats(), stats({ applied: missiles })], target);
    const dps = table.rows.find((r) => r.key === 'appliedDps')!;
    const range = table.rows.find((r) => r.key === 'bestRange')!;
    expect(dps.values[0]).toBe(0);
    expect(range.values[0]).toBe(0);
    expect(dps.bestIndices).toEqual([1]);
  });
});

describe('modulesThatDiffer', () => {
  it('excludes a module every fitting shares in the same quantity', () => {
    const a = fitting([{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }]);
    const b = fitting([{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }]);
    expect(modulesThatDiffer([a, b])).toEqual([]);
  });

  it('reports a module only some fittings carry, with a per-fitting count', () => {
    const a = fitting([{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }]);
    const b = fitting([]);
    const result = modulesThatDiffer([a, b]);
    expect(result).toEqual([{ typeId: 100, counts: [1, 0] }]);
  });

  it('reports a differing stack count for a module both fittings carry', () => {
    const a = fitting([
      { slot: 'high', slotIndex: 0, typeId: 200, state: 'active' },
      { slot: 'high', slotIndex: 1, typeId: 200, state: 'active' },
    ]);
    const b = fitting([{ slot: 'high', slotIndex: 0, typeId: 200, state: 'active' }]);
    expect(modulesThatDiffer([a, b])).toEqual([{ typeId: 200, counts: [2, 1] }]);
  });

  it('handles entirely different hulls with no shared modules', () => {
    const a = fitting([{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active' }]);
    const b = fitting([{ slot: 'high', slotIndex: 0, typeId: 200, state: 'active' }]);
    expect(modulesThatDiffer([a, b])).toEqual([
      { typeId: 100, counts: [1, 0] },
      { typeId: 200, counts: [0, 1] },
    ]);
  });
});

describe('compareWindow', () => {
  it('shows every column at once when there are 2 or fewer', () => {
    expect(compareWindow(1, 0)).toEqual({ start: 0, end: 1 });
    expect(compareWindow(2, 0)).toEqual({ start: 0, end: 2 });
  });

  it('windows to 2 of 3, starting at page 0', () => {
    expect(compareWindow(3, 0)).toEqual({ start: 0, end: 2 });
  });

  it('windows to the last 2 of 3 at page 1', () => {
    expect(compareWindow(3, 1)).toEqual({ start: 1, end: 3 });
  });

  it('clamps a page beyond the last window', () => {
    expect(compareWindow(3, 5)).toEqual({ start: 1, end: 3 });
  });
});
