import { describe, expect, it } from 'vitest';
import { extractFittingStats } from './stats';
import { DOGMA_ATTRIBUTE } from './types';

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

  it('reads the hull slot layout per rack', () => {
    const stats = extractFittingStats(
      [],
      attrs({ hiSlots: 4, medSlots: 3, lowSlots: 5, rigSlots: 3, subsystemSlots: 5 }),
      []
    );

    expect(stats.slotLayout).toEqual({ high: 4, medium: 3, low: 5, rig: 3, subsystem: 5 });
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

  it("reads each layer's hp and four resonances", () => {
    const stats = extractFittingStats(
      [],
      attrs({
        shieldCapacity: 450,
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
      emResonance: 1,
      explosiveResonance: 0.5,
      kineticResonance: 0.6,
      thermalResonance: 0.8,
    });
    expect(stats.armor).toEqual({
      hp: 405,
      emResonance: 0.4,
      explosiveResonance: 0.9,
      kineticResonance: 0.75,
      thermalResonance: 0.65,
    });
    expect(stats.hull).toEqual({
      hp: 350,
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
