import { describe, expect, it } from 'vitest';
import { diffFittingStats } from './variationDelta';
import type { FittingStats } from './types';

function layer(hp: number) {
  return {
    hp,
    ehp: hp * 1.5,
    emResonance: 0.8,
    thermalResonance: 0.7,
    kineticResonance: 0.6,
    explosiveResonance: 0.5,
  };
}

const base: FittingStats = {
  cpuUsed: 100,
  cpuTotal: 400,
  powergridUsed: 500,
  powergridTotal: 1000,
  calibrationUsed: 100,
  calibrationTotal: 400,
  droneDps: 50,
  droneBandwidthUsed: 25,
  droneBandwidthTotal: 50,
  maxActiveDrones: 0,
  droneBandwidthByType: {},
  hardpoints: { turrets: 0, launchers: 0 },
  droneCapacity: 75,
  ehp: 20000,
  capacitor: { stable: true, stablePercentage: 62 },
  capacitorCapacity: 1500,
  capacitorRechargeTime: 300000,
  shield: layer(5000),
  armor: layer(4000),
  hull: layer(3000),
  targeting: {
    maxTargetRange: 60000,
    maxLockedTargets: 6,
    scanResolution: 400,
    signatureRadius: 120,
  },
  navigation: {
    maxVelocity: 250,
    agility: 3.5,
    mass: 10000000,
    warpSpeed: 3,
  },
  unknownItemTypeIds: [],
  applied: { weapons: [], droneControlRange: 20000 },
  slotCounts: { high: 4, medium: 4, low: 4, rig: 3, subsystem: 0 },
  modules: [],
  offense: { weapons: [], dps: 0, volley: 0, overheated: null },
  repair: { shield: 0, armor: 0, hull: 0 },
  overheated: null,
};

describe('diffFittingStats', () => {
  it('reports no changes for identical stats', () => {
    expect(diffFittingStats(base, base)).toEqual({ changes: [], count: 0 });
  });

  it('reports only the fields that actually differ', () => {
    const after: FittingStats = { ...base, ehp: 24000, droneDps: 50 };
    const delta = diffFittingStats(base, after);
    expect(delta.count).toBe(1);
    expect(delta.changes).toEqual([{ key: 'ehp', before: 20000, after: 24000 }]);
  });

  it('reports a total DPS change (e.g. a turret variation)', () => {
    const after: FittingStats = { ...base, offense: { ...base.offense, dps: 120 } };
    expect(diffFittingStats(base, after).changes).toEqual([
      { key: 'totalDps', before: 0, after: 120 },
    ]);
  });

  it('ignores a change below the field own display precision', () => {
    const after: FittingStats = { ...base, cpuUsed: base.cpuUsed + 0.001 };
    expect(diffFittingStats(base, after)).toEqual({ changes: [], count: 0 });
  });

  it('compares a resonance at its displayed resist percentage, not the raw resonance', () => {
    const after: FittingStats = { ...base, armor: { ...base.armor, emResonance: 0.794 } };
    // resistPct(0.8) rounds to 20, resistPct(0.794) rounds to 21 -> counts.
    const delta = diffFittingStats(base, after);
    expect(delta.changes).toEqual([{ key: 'armorEmResonance', before: 20, after: 21 }]);
  });

  it('flags a capacitor stability flip as changed, using the shown metric on each side', () => {
    const after: FittingStats = {
      ...base,
      capacitor: { stable: false, depletesInSeconds: 340 },
    };
    const delta = diffFittingStats(base, after);
    expect(delta.changes).toContainEqual({ key: 'capacitor', before: 62, after: -340 });
  });

  it('compares depletion time when both sides are unstable', () => {
    const unstableBefore: FittingStats = {
      ...base,
      capacitor: { stable: false, depletesInSeconds: 300 },
    };
    const unstableAfter: FittingStats = {
      ...base,
      capacitor: { stable: false, depletesInSeconds: 340 },
    };
    const delta = diffFittingStats(unstableBefore, unstableAfter);
    expect(delta.changes).toContainEqual({ key: 'capacitor', before: -300, after: -340 });
  });

  it('does not flag capacitor when both stable percentages round the same', () => {
    const after: FittingStats = {
      ...base,
      capacitor: { stable: true, stablePercentage: 62.2 },
    };
    expect(diffFittingStats(base, after).changes).toEqual([]);
  });
});
