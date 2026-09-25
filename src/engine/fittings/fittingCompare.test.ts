import { describe, expect, it } from 'vitest';
import { compareFittingStats, modulesThatDiffer, compareWindow } from './fittingCompare';
import type { Fitting, FittingStats } from './types';

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

const RIFTER_HULL = 587;

function fitting(modules: Fitting['modules']): Fitting {
  return { name: 'Test', shipTypeId: RIFTER_HULL, modules, drones: [], cargo: [] };
}

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
