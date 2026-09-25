import { describe, expect, it } from 'vitest';
import {
  alignTimeSeconds,
  showsDrones,
  extractDroneLimits,
  extractFittingStats,
  extractModuleResult,
  extractOffense,
  extractOverheatedStats,
  overheatedOrNull,
  weaponRowKey,
  type OffenseItem,
} from './stats';
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
    const stats = extractFittingStats(
      [
        { type_id: 4405, slot: { type: 'low' } },
        { type_id: 999999999, slot: { type: 'rig' } },
        { type_id: 2488, slot: { type: 'drone_bay' } },
      ],
      attrs({}),
      [
        { attributes: new Map([[1, { value: 1 }]]) },
        { attributes: new Map() },
        { attributes: new Map([[2, { value: 1 }]]) },
      ]
    );

    expect(stats.unknownItemTypeIds).toEqual([999999999]);
  });

  it('never counts cargo as unknown, since the engine calculates nothing for it', () => {
    const stats = extractFittingStats([{ type_id: 209, slot: { type: 'cargo' } }], attrs({}), [
      { attributes: new Map() },
    ]);

    expect(stats.unknownItemTypeIds).toEqual([]);
  });

  it("reads hull resists from the ship's own resonance ids (EM 113, thermal 110, kinetic 109, explosive 111)", () => {
    // Literal ids, not DOGMA_ATTRIBUTE: a fixture built from the constants
    // under test would agree with a wrong constant.
    const ship = new Map([
      [113, { value: 0.67 }],
      [110, { value: 0.6 }],
      [109, { value: 0.5 }],
      [111, { value: 0.4 }],
      [974, { value: 1 }],
      [975, { value: 1 }],
      [976, { value: 1 }],
      [977, { value: 1 }],
    ]);

    const stats = extractFittingStats([], ship, []);

    expect(stats.hull).toMatchObject({
      emResonance: 0.67,
      thermalResonance: 0.6,
      kineticResonance: 0.5,
      explosiveResonance: 0.4,
    });
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
        baseWarpSpeed: 1,
        warpSpeedMultiplier: 3,
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

function weaponResult(
  dps: number,
  volley: number,
  state: 'online' | 'active' | 'overload' = 'active',
  maxState: 'active' | 'overload' = 'overload'
) {
  return {
    attributes: new Map([
      [ITEM_DOGMA_ATTRIBUTE.damagePerSecond, { value: dps }],
      [ITEM_DOGMA_ATTRIBUTE.damageVolley, { value: volley }],
    ]),
    state,
    max_state: maxState,
  };
}

const BLASTER: OffenseItem = { typeId: 3186, chargeTypeId: 230, quantity: 1, isDrone: false };
const WARRIOR: OffenseItem = { typeId: 2488, quantity: 5, isDrone: true };

describe('extractOffense', () => {
  it('groups identical weapons into one row, scales drones by stack size, and sums rows to the total', () => {
    const offense = extractOffense(
      [BLASTER, BLASTER, WARRIOR],
      [weaponResult(26.8, 152), weaponResult(26.8, 152), weaponResult(24, 96, 'active', 'active')],
      null
    );

    expect(offense.weapons).toEqual([
      expect.objectContaining({ typeId: 3186, chargeTypeId: 230, isDrone: false, count: 2 }),
      expect.objectContaining({ typeId: 2488, isDrone: true, count: 5 }),
    ]);
    expect(offense.weapons[0].dps).toBeCloseTo(53.6, 6);
    expect(offense.weapons[0].volley).toBeCloseTo(304, 6);
    expect(offense.weapons[1].dps).toBeCloseTo(120, 6);
    expect(offense.weapons[1].volley).toBeCloseTo(480, 6);
    expect(offense.dps).toBeCloseTo(173.6, 6);
    expect(offense.volley).toBeCloseTo(784, 6);
  });

  it('keeps the same weapon with a different charge on its own row', () => {
    const offense = extractOffense(
      [BLASTER, { ...BLASTER, chargeTypeId: 238 }],
      [weaponResult(26.8, 152), weaponResult(20, 110)],
      null
    );

    expect(offense.weapons.map((row) => row.chargeTypeId)).toEqual([230, 238]);
  });

  it('leaves out weapons that are not firing and items that deal no damage', () => {
    const offense = extractOffense(
      [
        BLASTER,
        { ...BLASTER, chargeTypeId: undefined },
        { typeId: 2048, quantity: 1, isDrone: false },
      ],
      [
        weaponResult(0, 204, 'online'), // an online launcher still reports a volley
        weaponResult(0, 0), // active, but no charge loaded
        { attributes: new Map(), state: 'active' as const, max_state: 'active' as const },
      ],
      null
    );

    expect(offense.weapons).toEqual([]);
    expect(offense.dps).toBe(0);
    expect(offense.volley).toBe(0);
  });

  it('reads each overheatable row from the overheated calculation, and never overheats drones', () => {
    const offense = extractOffense(
      [BLASTER, BLASTER, WARRIOR],
      [weaponResult(26.8, 152), weaponResult(26.8, 152), weaponResult(24, 96, 'active', 'active')],
      [
        weaponResult(30.8, 175, 'overload'),
        weaponResult(30.8, 175, 'overload'),
        weaponResult(24, 96, 'active', 'active'),
      ]
    );

    expect(offense.weapons[0].overheated?.dps).toBeCloseTo(61.6, 6);
    expect(offense.weapons[0].overheated?.volley).toBeCloseTo(350, 6);
    expect(offense.weapons[1].overheated).toBeNull();
    // Rows that can't overheat count at their normal value in the overheated total.
    expect(offense.overheated?.dps).toBeCloseTo(181.6, 6);
    expect(offense.overheated?.volley).toBeCloseTo(830, 6);
  });

  it('has no overheated values at all without an overheated calculation', () => {
    const offense = extractOffense([BLASTER], [weaponResult(26.8, 152)], null);

    expect(offense.weapons[0].overheated).toBeNull();
    expect(offense.overheated).toBeNull();
  });

  it('has no overheated total when only drones fire', () => {
    const offense = extractOffense(
      [WARRIOR],
      [weaponResult(24, 96, 'active', 'active')],
      [weaponResult(24, 96, 'active', 'active')]
    );

    expect(offense.overheated).toBeNull();
  });

  it('keys each row by drone-ness, type and charge', () => {
    const offense = extractOffense(
      [BLASTER, WARRIOR],
      [weaponResult(1, 1), weaponResult(1, 1)],
      null
    );

    expect(offense.weapons.map(weaponRowKey)).toEqual(['module:3186:230', 'drone:2488:']);
  });
});

describe('local repair and overheated stats', () => {
  it("reads the ship's local shield, armor and hull repair rates", () => {
    const stats = extractFittingStats(
      [],
      attrs({ shieldBoostRate: 40, armorRepairRate: 63.2, hullRepairRate: 0 }),
      []
    );

    expect(stats.repair).toEqual({ shield: 40, armor: 63.2, hull: 0 });
  });

  it('reads EHP, resists, max velocity and repair rates off the overheated calculation', () => {
    const overheated = extractOverheatedStats(
      attrs({
        ehp: 17204,
        maxVelocity: 1200,
        armorRepairRate: 81.8,
        shieldEmResonance: 0.3,
        armorKineticResonance: 0.4,
      })
    );

    expect(overheated).toMatchObject({
      ehp: 17204,
      maxVelocity: 1200,
      repair: { shield: 0, armor: 81.8, hull: 0 },
    });
    expect(overheated.shield.emResonance).toBe(0.3);
    expect(overheated.armor.kineticResonance).toBe(0.4);
  });
});

describe('overheatedOrNull', () => {
  it('returns the overheated value only when it differs at display rounding', () => {
    expect(overheatedOrNull(63.2, 81.8, 1)).toBe(81.8);
    expect(overheatedOrNull(63.21, 63.24, 1)).toBeNull();
    expect(overheatedOrNull(63.2, null, 1)).toBeNull();
  });
});

describe('alignTimeSeconds', () => {
  it('is the game’s align time: ln 4 × inertia × mass in millions of kg', () => {
    // A 14,700 t cruiser at 0.51 inertia aligns in about 10.4 s.
    expect(alignTimeSeconds(14_700_000, 0.51)).toBeCloseTo(10.393, 3);
  });

  it('is zero for a massless or inertia-free ship rather than NaN', () => {
    expect(alignTimeSeconds(0, 0.5)).toBe(0);
    expect(alignTimeSeconds(1_000_000, 0)).toBe(0);
  });
});

describe('showsDrones', () => {
  const corax = { droneCapacity: 0, droneBandwidthTotal: 0 };
  const tristan = { droneCapacity: 40, droneBandwidthTotal: 25 };

  it('is true for a hull with a drone bay or drone bandwidth', () => {
    expect(showsDrones(tristan, 0)).toBe(true);
    expect(showsDrones({ droneCapacity: 25, droneBandwidthTotal: 0 }, 0)).toBe(true);
  });

  it('is false for a hull with neither', () => {
    expect(showsDrones(corax, 0)).toBe(false);
  });

  it('stays true while drones are fitted, so a pasted fit’s drones can still be removed', () => {
    expect(showsDrones(corax, 2)).toBe(true);
  });

  it('waits for the ship data before offering drones, rather than flashing them', () => {
    expect(showsDrones(null, 0)).toBe(false);
    expect(showsDrones(null, 1)).toBe(true);
  });
});

describe('extractDroneLimits', () => {
  it("reads the pilot's max active drones and each drone type's bandwidth, launched or not", () => {
    const limits = extractDroneLimits(
      [
        { type_id: 2454, slot: { type: 'drone_bay' } },
        { type_id: 3001, slot: { type: 'high' } },
        { type_id: 2185, slot: { type: 'drone_bay' } },
      ],
      [
        { attributes: new Map([[1272, { value: 5 }]]) },
        { attributes: new Map([[1272, { value: 99 }]]) },
        { attributes: new Map([[1272, { value: 10 }]]) },
      ],
      new Map([[352, { value: 5 }]])
    );
    expect(limits).toEqual({ maxActiveDrones: 5, droneBandwidthByType: { 2454: 5, 2185: 10 } });
  });

  it('allows no drones in space when the character has no Drones skill', () => {
    expect(extractDroneLimits([], [], new Map()).maxActiveDrones).toBe(0);
  });
});

describe('extractFittingStats — warp speed', () => {
  it('is base warp speed (1281) times the hull’s warp speed multiplier (600), in AU/s', () => {
    // Literal ids: a Rifter's base is 1 and its multiplier 5 — the base alone is 1 on every hull.
    const ship = new Map([
      [1281, { value: 1 }],
      [600, { value: 5 }],
    ]);
    expect(extractFittingStats([], ship, []).navigation.warpSpeed).toBe(5);
  });
});

describe('extractFittingStats — hardpoints', () => {
  it("reads the hull's turret (102) and launcher (101) hardpoints", () => {
    const ship = new Map([
      [102, { value: 3 }],
      [101, { value: 2 }],
    ]);
    expect(extractFittingStats([], ship, []).hardpoints).toEqual({ turrets: 3, launchers: 2 });
  });
});
