import { describe, expect, it } from 'vitest';
import { extractFittingStats, extractModuleResult } from './stats';
import { DOGMA_ATTRIBUTE, ITEM_DOGMA_ATTRIBUTE } from './types';

function attrs(
  values: Partial<Record<keyof typeof DOGMA_ATTRIBUTE, number>>
): Map<number, { value: number }> {
  const map = new Map<number, { value: number }>();
  for (const [key, value] of Object.entries(values)) {
    map.set(DOGMA_ATTRIBUTE[key as keyof typeof DOGMA_ATTRIBUTE], { value });
  }
  return map;
}

describe('extractFittingStats', () => {
  it('reads cpu/powergrid used and total from output minus free', () => {
    const stats = extractFittingStats(
      [],
      attrs({
        cpuOutput: 400,
        cpuFree: 150,
        powerOutput: 1000,
        powerFree: 200,
      }),
      []
    );

    expect(stats.cpuTotal).toBe(400);
    expect(stats.cpuUsed).toBe(250);
    expect(stats.powergridTotal).toBe(1000);
    expect(stats.powergridUsed).toBe(800);
  });

  it('reads ehp and drone dps straight from the engine-derived attributes', () => {
    const stats = extractFittingStats([], attrs({ ehp: 24187.5, droneDamagePerSecond: 171.3 }), []);

    expect(stats.ehp).toBeCloseTo(24187.5, 6);
    expect(stats.droneDps).toBeCloseTo(171.3, 6);
  });

  it('reports a stable capacitor by its settle percentage when depletesIn is negative', () => {
    const stats = extractFittingStats(
      [],
      attrs({ capacitorDepletesIn: -1, capacitorStablePercentage: 62 }),
      []
    );

    expect(stats.capacitor).toEqual({ stable: true, stablePercentage: 62 });
  });

  it('reports an unstable capacitor by seconds to empty when depletesIn is non-negative', () => {
    const stats = extractFittingStats(
      [],
      attrs({ capacitorDepletesIn: 86.625, capacitorStablePercentage: 0 }),
      []
    );

    expect(stats.capacitor).toEqual({ stable: false, depletesInSeconds: 86.625 });
  });

  it('collects the type ids of items the engine returned empty attributes for', () => {
    const stats = extractFittingStats([4405, 999999999, 2488], attrs({}), [
      { attributes: new Map([[1, { value: 1 }]]) },
      { attributes: new Map() },
      { attributes: new Map([[2, { value: 1 }]]) },
    ]);

    expect(stats.unknownItemTypeIds).toEqual([999999999]);
  });

  it('treats every attribute as 0 when the ship result carries none at all', () => {
    const stats = extractFittingStats([], new Map(), []);

    expect(stats.cpuUsed).toBe(0);
    expect(stats.ehp).toBe(0);
    expect(stats.droneDps).toBe(0);
    expect(stats.shield).toEqual({
      hp: 0,
      ehp: 0,
      emResonance: 0,
      thermalResonance: 0,
      kineticResonance: 0,
      explosiveResonance: 0,
    });
  });

  it('reads capacitor capacity and recharge time straight off the ship', () => {
    const stats = extractFittingStats(
      [],
      attrs({ capacitorCapacity: 375, capacitorRechargeTime: 125000 }),
      []
    );

    expect(stats.capacitorCapacity).toBe(375);
    expect(stats.capacitorRechargeTime).toBe(125000);
  });

  it("reads each layer's hp, EHP and four resonances", () => {
    const stats = extractFittingStats(
      [],
      attrs({
        shieldCapacity: 450,
        shieldEhp: 562.5,
        armorEhp: 810,
        hullEhp: 350,
        shieldEmResonance: 1,
        shieldExplosiveResonance: 0.5,
        shieldKineticResonance: 0.6,
        shieldThermalResonance: 0.8,
        armorHp: 405,
        armorEmResonance: 0.4,
        armorExplosiveResonance: 0.9,
        armorKineticResonance: 0.75,
        armorThermalResonance: 0.65,
        hullHp: 350,
        hullEmResonance: 1,
        hullExplosiveResonance: 1,
        hullKineticResonance: 1,
        hullThermalResonance: 1,
      }),
      []
    );

    expect(stats.shield).toEqual({
      hp: 450,
      ehp: 562.5,
      emResonance: 1,
      explosiveResonance: 0.5,
      kineticResonance: 0.6,
      thermalResonance: 0.8,
    });
    expect(stats.armor).toEqual({
      hp: 405,
      ehp: 810,
      emResonance: 0.4,
      explosiveResonance: 0.9,
      kineticResonance: 0.75,
      thermalResonance: 0.65,
    });
    expect(stats.hull).toEqual({
      hp: 350,
      ehp: 350,
      emResonance: 1,
      explosiveResonance: 1,
      kineticResonance: 1,
      thermalResonance: 1,
    });
  });

  it('reads targeting and navigation straight off the ship', () => {
    const stats = extractFittingStats(
      [],
      attrs({
        maxTargetRange: 22500,
        maxLockedTargets: 4,
        scanResolution: 660,
        signatureRadius: 35,
        maxVelocity: 391.4625,
        agility: 3.2,
        mass: 1067000,
        warpSpeed: 3,
      }),
      []
    );

    expect(stats.targeting).toEqual({
      maxTargetRange: 22500,
      maxLockedTargets: 4,
      scanResolution: 660,
      signatureRadius: 35,
    });
    expect(stats.navigation).toEqual({
      maxVelocity: 391.4625,
      agility: 3.2,
      mass: 1067000,
      warpSpeed: 3,
    });
  });

  it('reads drone bandwidth/capacity totals and calibration total straight off the ship', () => {
    const stats = extractFittingStats(
      [],
      attrs({ droneBandwidth: 75, droneCapacity: 125, calibration: 400 }),
      []
    );

    expect(stats.droneBandwidthTotal).toBe(75);
    expect(stats.droneCapacity).toBe(125);
    expect(stats.calibrationTotal).toBe(400);
  });
});

describe('extractFittingStats slot counts', () => {
  it("reads each rack's size off the ship, so a subsystem's added slots show up", () => {
    const stats = extractFittingStats(
      [],
      attrs({ hiSlots: 3, medSlots: 4, lowSlots: 2, rigSlots: 3, subsystemSlots: 4 }),
      []
    );
    expect(stats.slotCounts).toEqual({ high: 3, medium: 4, low: 2, rig: 3, subsystem: 4 });
  });
});

describe('extractModuleResult', () => {
  it("reads the reached and highest state plus the module's charge groups", () => {
    const attributes = new Map([
      [ITEM_DOGMA_ATTRIBUTE.chargeGroup1, { value: 83 }],
      [ITEM_DOGMA_ATTRIBUTE.chargeGroup2, { value: 372 }],
      [ITEM_DOGMA_ATTRIBUTE.chargeGroup3, { value: 0 }],
      [ITEM_DOGMA_ATTRIBUTE.chargeSize, { value: 1 }],
    ]);
    expect(extractModuleResult({ attributes, state: 'active', max_state: 'overload' })).toEqual({
      state: 'active',
      maxState: 'overload',
      chargeGroupIds: [83, 372],
    });
  });

  it("reads a Reactive Armor Hardener's own adapted resonances", () => {
    const attributes = new Map([
      [ITEM_DOGMA_ATTRIBUTE.resistanceShiftAmount, { value: 6 }],
      [DOGMA_ATTRIBUTE.armorEmResonance, { value: 0.4 }],
      [DOGMA_ATTRIBUTE.armorThermalResonance, { value: 1 }],
      [DOGMA_ATTRIBUTE.armorKineticResonance, { value: 1 }],
      [DOGMA_ATTRIBUTE.armorExplosiveResonance, { value: 1 }],
    ]);
    expect(
      extractModuleResult({ attributes, state: 'active', max_state: 'overload' }).adaptedResonances
    ).toEqual({
      emResonance: 0.4,
      thermalResonance: 1,
      kineticResonance: 1,
      explosiveResonance: 1,
    });
  });

  it('leaves adaptedResonances off a Reactive Armor Hardener that is not running', () => {
    const attributes = new Map([[ITEM_DOGMA_ATTRIBUTE.resistanceShiftAmount, { value: 6 }]]);
    expect(
      extractModuleResult({ attributes, state: 'online', max_state: 'overload' })
    ).not.toHaveProperty('adaptedResonances');
  });

  it('leaves adaptedResonances off a module that is not a Reactive Armor Hardener', () => {
    const attributes = new Map([[DOGMA_ATTRIBUTE.armorEmResonance, { value: 0.85 }]]);
    expect(
      extractModuleResult({ attributes, state: 'active', max_state: 'active' })
    ).not.toHaveProperty('adaptedResonances');
  });

  it('gives a module that takes no charge an empty charge group list', () => {
    expect(
      extractModuleResult({ attributes: new Map(), state: 'online', max_state: 'online' })
        .chargeGroupIds
    ).toEqual([]);
  });
});
