import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import wasmInit, { calculate } from '@eveshipfit/dogma-engine';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import { toProjectedEffects, withIncoming, withWeather } from './dogmaFittingEngine';
import {
  extractCapacitorBudget,
  extractLockedTargets,
  extractFighterStats,
  extractTank,
  extractDroneLimits,
  extractFittingStats,
  extractModuleResult,
  extractOffense,
} from '@/engine/fittings/stats';
import { extractAppliedDpsInputs } from '@/engine/fittings/appliedWeapons';
import { extractSupport } from '@/engine/fittings/support';
import { affectedAttributes } from '@/engine/fittings/affectedBy';
import { extractMining, miningYield } from '@/engine/fittings/mining';
import { capacitorStatusAtDrain } from '@/engine/fittings/tank';
import { buildAllVProfile, buildPilotProfile } from '@/engine/fittings/pilotProfile';
import type { Fitting } from '@/engine/fittings/types';

/**
 * Runs the real, pinned `@eveshipfit/dogma-engine` + `@eveshipfit/sde`
 * (ADR 0016) against a real fit, end to end through this app's own mapping
 * and stats-extraction code — the AC #1531 asks for ("a known Fitting...
 * matching a reference"). The reference values below are not from Pyfa or
 * eveship.fit (this run has no way to reach either live); they are this
 * exact pinned engine's own output for this exact fit, computed once via a
 * direct run of the packages installed here and pinned in `package.json`, so
 * this test is really validating that `fitMapper`/`pilotProfile`/`stats`
 * build the engine the *input* it expects and read its *output* correctly —
 * the layer this ticket actually adds. Whether the engine's own math matches
 * a third-party tool is ADR 0016's bet, not this seam's.
 *
 * Regenerate the expected values (log `stats` from a run of this file) if
 * `@eveshipfit/dogma-engine`/`@eveshipfit/sde` are ever bumped — they must be
 * bumped together (ADR 0016), and either can shift these numbers.
 *
 * Item and skill type ids below were looked up against Fuzzwork's
 * `invTypes.csv`/`dgmTypeAttributes.csv` on 2026-09-24 (the same source
 * `scripts/build-sde.mjs` bakes from), not recalled from memory.
 */

const require = createRequire(import.meta.url);

const VEXOR_NAVY_ISSUE = 17843;
const NEUTRON_BLASTER_CANNON_II = 3186;
const ANTIMATTER_CHARGE_M = 230;
const MULTISPECTRUM_SHIELD_HARDENER_II = 2281;
const MEDIUM_CORE_DEFENSE_FIELD_EXTENDER_II = 31796;
const DAMAGE_CONTROL_II = 2048;
const MEDIUM_ARMOR_REPAIRER_II = 3530;
const DRONE_DAMAGE_AMPLIFIER_II = 4405;
const WARRIOR_II = 2488;
const RIFTER = 587;
const REACTIVE_ARMOR_HARDENER = 4403;
const CARACAL = 621;
const HEAVY_MISSILE_LAUNCHER_II = 2410;
const SCOURGE_HEAVY_MISSILE = 209;
// Looked up by exact name in the pinned `sde.dat`, 2026-09-25.
const HURRICANE = 24702;
const MAELSTROM = 24694;
const HULK = 22544;
const THANATOS = 23911;
const MEDIUM_SHIELD_BOOSTER_II = 10850;
const MEDIUM_CAPACITOR_BOOSTER_II = 2024;
const CAP_BOOSTER_400 = 11287;
const CAP_BOOSTER_150 = 11283;
const NAVY_CAP_BOOSTER_400 = 32006;
const MEDIUM_ENERGY_NEUTRALIZER_II = 12267;
const MEDIUM_ENERGY_NOSFERATU_II = 12259;
const MEDIUM_REMOTE_ARMOR_REPAIRER_II = 26913;
const MEDIUM_ANCILLARY_ARMOR_REPAIRER = 33101;
const NANITE_REPAIR_PASTE = 28668;
const MEDIUM_ANCILLARY_SHIELD_BOOSTER = 32772;
const MEDIUM_REMOTE_SHIELD_BOOSTER_II = 3598;
const MEDIUM_REMOTE_CAPACITOR_TRANSMITTER_II = 12221;
const STASIS_WEBIFIER_II = 527;
const WARP_SCRAMBLER_II = 448;
const MULTISPECTRUM_ECM_II = 2567;
// Looked up by exact name in the pinned `sde.dat`, 2026-09-25.
const TRACKING_DISRUPTOR_II = 2109;
const OPTIMAL_RANGE_DISRUPTION_SCRIPT = 29005;
const REMOTE_SENSOR_DAMPENER_II = 1969;
const SCAN_RESOLUTION_DAMPENING_SCRIPT = 29013;
const GUIDANCE_DISRUPTOR_II = 37546;
const MISSILE_RANGE_DISRUPTION_SCRIPT = 40334;
const TARGET_PAINTER_II = 19806;
const MODULATED_STRIP_MINER_II = 17912;
const SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_A_II = 60281;
const MINING_DRONE_II = 10250;
const GYROSTABILIZER_II = 519;
const AFTERBURNER_1MN_II = 438;
const CLAYMORE = 22468;
const SKIRMISH_COMMAND_BURST_II = 43556;
const RAPID_DEPLOYMENT_CHARGE = 42840;
/** Leadership, Skirmish Command, Command Burst Specialist, Wing/Fleet Command, Command Ships. */
const SVIPUL = 34562;
const SVIPUL_PROPULSION_MODE = 34566;
const STANDARD_BLUE_PILL_BOOSTER = 9950;
const TEMPLAR_I = 23055;
const CENOBITE_I = 37599;
/** Fighters, Light Fighters, Support Fighters, Fighter Hangar Management. */
const FIGHTER_SKILL_IDS = [23069, 40572, 40573, 24613];
const COMMAND_SKILL_IDS = [3348, 3349, 3354, 11574, 24764, 23950];

const PARTIAL_SKILLS = new Map([
  [3332, 3], // Gallente Cruiser
  [3426, 3], // CPU Management
  [3413, 3], // Power Grid Management
  [3318, 2], // Weapon Upgrades
  [3394, 2], // Hull Upgrades
  [3392, 3], // Mechanics
  [3436, 3], // Drones
  [3442, 1], // Drone Interfacing
  [3301, 3], // Small Hybrid Turret
  [3304, 2], // Medium Hybrid Turret
  [3419, 2], // Shield Management
  [3425, 1], // Shield Upgrades
]);

function vexorNavyIssueFit(): Fitting {
  return {
    name: 'Integration Test Vexor Navy Issue',
    shipTypeId: VEXOR_NAVY_ISSUE,
    modules: [
      {
        slot: 'high',
        slotIndex: 0,
        typeId: NEUTRON_BLASTER_CANNON_II,
        state: 'active',
        chargeTypeId: ANTIMATTER_CHARGE_M,
      },
      {
        slot: 'high',
        slotIndex: 1,
        typeId: NEUTRON_BLASTER_CANNON_II,
        state: 'active',
        chargeTypeId: ANTIMATTER_CHARGE_M,
      },
      {
        slot: 'high',
        slotIndex: 2,
        typeId: NEUTRON_BLASTER_CANNON_II,
        state: 'active',
        chargeTypeId: ANTIMATTER_CHARGE_M,
      },
      { slot: 'medium', slotIndex: 0, typeId: MULTISPECTRUM_SHIELD_HARDENER_II, state: 'active' },
      {
        slot: 'medium',
        slotIndex: 1,
        typeId: MEDIUM_CORE_DEFENSE_FIELD_EXTENDER_II,
        state: 'online',
      },
      {
        slot: 'medium',
        slotIndex: 2,
        typeId: MEDIUM_CORE_DEFENSE_FIELD_EXTENDER_II,
        state: 'online',
      },
      {
        slot: 'medium',
        slotIndex: 3,
        typeId: MEDIUM_CORE_DEFENSE_FIELD_EXTENDER_II,
        state: 'online',
      },
      { slot: 'low', slotIndex: 0, typeId: DAMAGE_CONTROL_II, state: 'online' },
      { slot: 'low', slotIndex: 1, typeId: MEDIUM_ARMOR_REPAIRER_II, state: 'active' },
      { slot: 'low', slotIndex: 2, typeId: DRONE_DAMAGE_AMPLIFIER_II, state: 'online' },
      { slot: 'low', slotIndex: 3, typeId: DRONE_DAMAGE_AMPLIFIER_II, state: 'online' },
    ],
    drones: [{ typeId: WARRIOR_II, quantity: 5, state: 'active' }],
    cargo: [],
  };
}

describe('dogma engine integration (real WASM + real pinned SDE)', () => {
  beforeAll(async () => {
    const wasmPath = require.resolve('@eveshipfit/dogma-engine/esf_dogma_engine_bg.wasm');
    const sdePath = require.resolve('@eveshipfit/sde/dist/sde.dat');
    const [wasmBytes, sdeBytes] = await Promise.all([readFile(wasmPath), readFile(sdePath)]);
    await wasmInit({ module_or_path: wasmBytes });
    const { load_sde } = await import('@eveshipfit/dogma-engine');
    load_sde(new Uint8Array(sdeBytes));
  });

  it('computes stats for an All-V pilot matching the pinned engine within a tight tolerance', () => {
    const fitting = vexorNavyIssueFit();
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.cpuTotal).toBeCloseTo(437.5, 6);
    expect(stats.cpuUsed).toBeCloseTo(292.5, 6);
    expect(stats.powergridTotal).toBeCloseTo(1062.5, 6);
    expect(stats.powergridUsed).toBeCloseTo(6379, 0);
    expect(stats.ehp).toBeCloseTo(24187.46, 1);
    expect(stats.droneDps).toBeCloseTo(124.578, 2);
    expect(stats.unknownItemTypeIds).toEqual([]);
  });

  it('computes lower drone DPS and EHP for a partial-skills pilot than for All-V', () => {
    const fitting = vexorNavyIssueFit();
    const profile = buildPilotProfile(PARTIAL_SKILLS, []);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.cpuTotal).toBeCloseTo(402.5, 1);
    expect(stats.cpuUsed).toBeCloseTo(318.6, 1);
    expect(stats.powergridTotal).toBeCloseTo(977.5, 1);
    expect(stats.powergridUsed).toBeCloseTo(6379, 0);
    expect(stats.ehp).toBeCloseTo(21658.1, 1);
    expect(stats.droneDps).toBeCloseTo(79.176, 2);
    expect(stats.unknownItemTypeIds).toEqual([]);
  });

  it('counts no drone DPS for drones left in the bay', () => {
    const fitting = vexorNavyIssueFit();
    fitting.drones = [{ typeId: WARRIOR_II, quantity: 5, state: 'online' }];
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.droneDps).toBe(0);
  });

  it("reads a bay drone's bandwidth and the pilot's drone count, so a Load can launch them", () => {
    const fitting = vexorNavyIssueFit();
    fitting.drones = [{ typeId: WARRIOR_II, quantity: 5, state: 'online' }];
    const allV = fittingToDogmaFit(fitting, buildAllVProfile(ALL_TEST_SKILL_IDS));
    const partial = fittingToDogmaFit(fitting, buildPilotProfile(PARTIAL_SKILLS, []));
    const noDrones = fittingToDogmaFit(fitting, buildPilotProfile(new Map(), []));

    const read = (dogmaFit: ReturnType<typeof fittingToDogmaFit>) => {
      const calculation = calculate(dogmaFit);
      return extractDroneLimits(
        dogmaFit.items,
        calculation.items,
        calculation.character.attributes
      );
    };

    // A Warrior II is a light drone, 5 Mbit/s; Drones V controls five, Drones III three.
    expect(read(allV)).toEqual({ maxActiveDrones: 5, droneBandwidthByType: { [WARRIOR_II]: 5 } });
    expect(read(partial).maxActiveDrones).toBe(3);
    expect(read(noDrones).maxActiveDrones).toBe(0);
  });

  it('marks a type id the pinned data has nothing for as unknown, without failing the rest of the calculation', () => {
    const fitting = vexorNavyIssueFit();
    fitting.modules.push({ slot: 'rig', slotIndex: 0, typeId: 999_999_999, state: 'online' });
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.unknownItemTypeIds).toEqual([999_999_999]);
    // The rest of the fit still calculated — same as the clean-fit case above.
    expect(stats.cpuTotal).toBeCloseTo(437.5, 6);
    expect(stats.droneDps).toBeCloseTo(124.578, 2);
  });

  it('never marks cargo as unknown — the engine calculates nothing for it, known or not', () => {
    const fitting = vexorNavyIssueFit();
    fitting.cargo = [{ typeId: ANTIMATTER_CHARGE_M, quantity: 1000 }];
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.unknownItemTypeIds).toEqual([]);
  });

  it('applies an Abyssal weather: its resist penalty grows with the level, its bonus does not', () => {
    const fitting: Fitting = {
      name: 'Rifter',
      shipTypeId: RIFTER,
      modules: [],
      drones: [],
      cargo: [],
    };
    const fit = fittingToDogmaFit(fitting, buildAllVProfile(ALL_TEST_SKILL_IDS));
    const read = (weatherTypeId?: number) => {
      const withIt = withWeather(fit, weatherTypeId);
      const calculation = calculate(withIt);
      return extractFittingStats(withIt.items, calculation.ship.attributes, calculation.items);
    };
    const clear = read();
    // Firestorm (infernal_weather_1 / _3): thermal resist penalty, +50% armor HP.
    const firestorm1 = read(47390);
    const firestorm3 = read(47392);

    expect(firestorm1.armor.hp).toBeCloseTo(clear.armor.hp * 1.5, 6);
    expect(firestorm3.armor.hp).toBeCloseTo(clear.armor.hp * 1.5, 6);
    expect(firestorm1.armor.thermalResonance).toBeGreaterThan(clear.armor.thermalResonance);
    expect(firestorm3.armor.thermalResonance).toBeGreaterThan(firestorm1.armor.thermalResonance);
    // Other damage types untouched.
    expect(firestorm3.armor.kineticResonance).toBeCloseTo(clear.armor.kineticResonance, 6);
  });

  it('gives every weather the bonus and the level-scaled penalty the picker names', () => {
    // A Rifter with a loaded 200mm AutoCannon II (2889, EMP S 12608), so Dark's range penalty shows.
    const fitting: Fitting = {
      name: 'Rifter',
      shipTypeId: RIFTER,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active', chargeTypeId: 12608 }],
      drones: [],
      cargo: [],
    };
    const fit = fittingToDogmaFit(fitting, buildAllVProfile(ALL_TEST_SKILL_IDS));
    const read = (weatherTypeId?: number) => {
      const withIt = withWeather(fit, weatherTypeId);
      const calculation = calculate(withIt);
      return {
        stats: extractFittingStats(withIt.items, calculation.ship.attributes, calculation.items),
        optimal: calculation.items[0].attributes.get(54)!.value,
      };
    };
    const clear = read();
    const ratio = (weatherTypeId: number, pick: (r: ReturnType<typeof read>) => number) =>
      pick(read(weatherTypeId)) / pick(clear);

    // Dark: +50% velocity; turret optimal −30% at 1, −70% at 3.
    expect(ratio(47378, (r) => r.stats.navigation.maxVelocity)).toBeCloseTo(1.5, 6);
    expect(ratio(47378, (r) => r.optimal)).toBeCloseTo(0.7, 6);
    expect(ratio(47380, (r) => r.optimal)).toBeCloseTo(0.3, 6);
    // Electrical: recharge time halved; EM resonance ×1.3 at 1, ×1.7 at 3 (resists −30 / −70%).
    expect(ratio(47381, (r) => r.stats.capacitorRechargeTime)).toBeCloseTo(0.5, 6);
    expect(ratio(47381, (r) => r.stats.armor.emResonance)).toBeCloseTo(1.3, 6);
    expect(ratio(47383, (r) => r.stats.armor.emResonance)).toBeCloseTo(1.7, 6);
    // Exotic: +50% scan resolution; kinetic resists down.
    expect(ratio(47384, (r) => r.stats.targeting.scanResolution)).toBeCloseTo(1.5, 6);
    expect(ratio(47384, (r) => r.stats.armor.kineticResonance)).toBeCloseTo(1.3, 6);
    // Gamma: +50% shield HP; explosive resists down.
    expect(ratio(47387, (r) => r.stats.shield.hp)).toBeCloseTo(1.5, 6);
    expect(ratio(47387, (r) => r.stats.shield.explosiveResonance)).toBeCloseTo(1.3, 6);
  });

  it("reads the hull's own resists, not the Damage Control modifier attributes", () => {
    // A bare Rifter: every hull since 2021 has a flat 33% structure resist.
    const fitting: Fitting = {
      name: 'Bare Rifter',
      shipTypeId: RIFTER,
      modules: [],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(ALL_TEST_SKILL_IDS));

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.hull.emResonance).toBeCloseTo(0.67, 4);
    expect(stats.hull.thermalResonance).toBeCloseTo(0.67, 4);
    expect(stats.hull.kineticResonance).toBeCloseTo(0.67, 4);
    expect(stats.hull.explosiveResonance).toBeCloseTo(0.67, 4);
    // A frigate warps at 5 AU/s; the base-speed attribute alone reads 1 on every hull.
    expect(stats.navigation.warpSpeed).toBeCloseTo(5, 6);
  });

  it('breaks Offense into per-weapon rows that sum to the engine total, overheated from its overload state', () => {
    const fitting = vexorNavyIssueFit();
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);
    const offenseItems = [
      ...fitting.modules.map((module) => ({
        typeId: module.typeId,
        chargeTypeId: module.chargeTypeId,
        quantity: 1,
        isDrone: false,
      })),
      ...fitting.drones.map((drone) => ({
        typeId: drone.typeId,
        quantity: drone.quantity,
        isDrone: true,
      })),
    ];

    const calculation = calculate(dogmaFit);
    const overheated = calculate({
      ...dogmaFit,
      items: dogmaFit.items.map((item) =>
        item.type_id === NEUTRON_BLASTER_CANNON_II ? { ...item, state: 'overload' as const } : item
      ),
    });
    const offense = extractOffense(offenseItems, calculation.items, overheated.items);

    expect(offense.weapons.map((row) => [row.typeId, row.count])).toEqual([
      [NEUTRON_BLASTER_CANNON_II, 3],
      [WARRIOR_II, 5],
    ]);
    // The ship's own damagePerSecondWithoutReload covers turrets and drones alike.
    expect(offense.dps).toBeCloseTo(calculation.ship.attributes.get(-12)!.value, 6);
    expect(offense.weapons[1].dps).toBeCloseTo(124.578, 2);
    expect(offense.weapons[0].dps).toBeCloseTo(40.32, 2);
    expect(offense.weapons[0].volley).toBeCloseTo(317.52, 2);
    expect(offense.weapons[0].overheated?.dps).toBeCloseTo(46.368, 2);
    expect(offense.weapons[0].overheated?.volley).toBeCloseTo(365.148, 2);
    expect(offense.weapons[1].overheated).toBeNull();
    expect(offense.overheated?.dps).toBeCloseTo(170.946, 2);
  });

  it('measures EHP against a damage profile and adapts a Reactive Armor Hardener to it', () => {
    const fitting: Fitting = {
      name: 'Integration Test RAH Rifter',
      shipTypeId: RIFTER,
      modules: [
        { slot: 'low', slotIndex: 0, typeId: REACTIVE_ARMOR_HARDENER, state: 'active' },
        { slot: 'low', slotIndex: 1, typeId: DAMAGE_CONTROL_II, state: 'active' },
      ],
      drones: [],
      cargo: [],
    };
    const profile = buildPilotProfile(new Map(), []);
    const allEm = { em: 1, thermal: 0, kinetic: 0, explosive: 0 };
    const dogmaFit = fittingToDogmaFit(fitting, profile, allEm);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items,
      calculation.ship.attributes,
      calculation.items
    );
    const rah = extractModuleResult(calculation.items[0]);

    // Pinned from a direct run of the engine (2026-09-24). Uniform and
    // unadapted, the same fit reads 2481.9 total / 901.9 armor.
    expect(stats.ehp).toBeCloseTo(4619.06, 1);
    expect(stats.shield.ehp).toBeCloseTo(514.29, 1);
    expect(stats.armor.ehp).toBeCloseTo(3234.13, 1);
    expect(stats.hull.ehp).toBeCloseTo(870.65, 1);
    // All the RAH's 60% shifted into EM.
    expect(rah.adaptedResonances?.emResonance).toBeCloseTo(0.4, 4);
    expect(rah.adaptedResonances?.thermalResonance).toBeCloseTo(1, 4);
    expect(extractModuleResult(calculation.items[1])).not.toHaveProperty('adaptedResonances');
  });

  it('splits the capacitor budget the way the engine nets it, and keeps remote reps out of the local tank', () => {
    const fitting: Fitting = {
      name: 'Integration Test Caracal support',
      shipTypeId: CARACAL,
      modules: [
        { slot: 'medium', slotIndex: 0, typeId: MEDIUM_SHIELD_BOOSTER_II, state: 'active' },
        {
          slot: 'medium',
          slotIndex: 1,
          typeId: MEDIUM_CAPACITOR_BOOSTER_II,
          state: 'active',
          chargeTypeId: CAP_BOOSTER_400,
        },
        { slot: 'medium', slotIndex: 2, typeId: MEDIUM_ENERGY_NEUTRALIZER_II, state: 'active' },
        { slot: 'medium', slotIndex: 3, typeId: MEDIUM_ENERGY_NOSFERATU_II, state: 'active' },
        { slot: 'high', slotIndex: 0, typeId: MEDIUM_REMOTE_ARMOR_REPAIRER_II, state: 'active' },
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(SUPPORT_SKILL_IDS));
    const calculation = calculate(dogmaFit);
    const ship = calculation.ship.attributes;
    const read = (id: number) => ship.get(id)?.value ?? 0;
    const stats = extractFittingStats(dogmaFit.items, ship, calculation.items);
    const budget = extractCapacitorBudget(dogmaFit.items, calculation.items, ship);
    const tank = extractTank(dogmaFit.items, calculation.items, ship, stats);

    // Peak recharge is 2.5 × capacity over the recharge time, in seconds.
    expect(budget.peakRecharge).toBeCloseTo(
      (2.5 * stats.capacitorCapacity) / (stats.capacitorRechargeTime / 1000),
      6
    );
    // Two Cap Booster 400s a load (40 m3 of 16 m3 charges), one every 12 s,
    // then a 10 s reload: 800 GJ every 34 s. The engine's own net peak load
    // (-4) and delta (-5) count the booster at 400 every 12 s, no reload.
    const reloadShortfall = 400 / 12 - 800 / 34;
    expect(budget.boosterInjection).toBeCloseTo(800 / 34, 6);
    expect(budget.drain - budget.boosterInjection - budget.nosferatuGain).toBeCloseTo(
      read(-4) + reloadShortfall,
      6
    );
    // The Medium Energy Nosferatu II's 36 GJ every 5 s.
    expect(budget.nosferatuGain).toBeCloseTo(36 / 5, 6);
    expect(budget.delta).toBeCloseTo(read(-5) - reloadShortfall, 6);

    // The remote armor repairer repairs someone else: the local tank has no armor.
    expect(tank.burst.armor).toBe(0);
    expect(tank.burst.shield).toBeGreaterThan(0);
    // Passive regeneration peaks at 2.5 × shield HP over the shield recharge time.
    expect(tank.passiveShield).toBeCloseTo((2.5 * stats.shield.hp) / (read(479) / 1000), 6);
  });

  it('averages a Navy Cap Booster 400 over its reload: 26.1 GJ/s, not 33.3', () => {
    const fitting: Fitting = {
      name: 'Integration Test Caracal cap booster',
      shipTypeId: CARACAL,
      modules: [
        {
          slot: 'medium',
          slotIndex: 0,
          typeId: MEDIUM_CAPACITOR_BOOSTER_II,
          state: 'active',
          chargeTypeId: NAVY_CAP_BOOSTER_400,
        },
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(SUPPORT_SKILL_IDS));
    const calculation = calculate(dogmaFit);
    const budget = extractCapacitorBudget(
      dogmaFit.items,
      calculation.items,
      calculation.ship.attributes
    );
    // Three 12 m3 charges in 40 m3, 12 s apart, then 10 s reloading.
    expect(budget.boosterInjection).toBeCloseTo(1200 / 46, 6);
  });

  it('never calls a fit stable that its cap booster only holds up by never reloading', () => {
    // Medium Capacitor Booster II + Navy Cap Booster 400, a shield booster and
    // five neutralizers: the engine counts the booster at 33.3 GJ/s with no
    // reload and says stable; averaged over its reload (26.1) the cap drains.
    const caracal = (neuts: number): Fitting => ({
      name: 'Integration Test Caracal booster-dependent',
      shipTypeId: CARACAL,
      modules: [
        {
          slot: 'medium',
          slotIndex: 0,
          typeId: MEDIUM_CAPACITOR_BOOSTER_II,
          state: 'active',
          chargeTypeId: NAVY_CAP_BOOSTER_400,
        },
        { slot: 'medium', slotIndex: 1, typeId: MEDIUM_SHIELD_BOOSTER_II, state: 'active' },
        ...Array.from({ length: neuts }, (_, slotIndex) => ({
          slot: 'high' as const,
          slotIndex,
          typeId: MEDIUM_ENERGY_NEUTRALIZER_II,
          state: 'active' as const,
        })),
      ],
      drones: [],
      cargo: [],
    });
    const run = (neuts: number) => {
      const dogmaFit = fittingToDogmaFit(caracal(neuts), buildAllVProfile(SUPPORT_SKILL_IDS));
      const calculation = calculate(dogmaFit);
      const ship = calculation.ship.attributes;
      return {
        engineStable: (ship.get(-7)?.value ?? 0) < 0,
        stats: extractFittingStats(dogmaFit.items, ship, calculation.items),
        budget: extractCapacitorBudget(dogmaFit.items, calculation.items, ship),
      };
    };

    const five = run(5);
    expect(five.engineStable).toBe(true);
    expect(five.budget.delta).toBeLessThan(0);
    expect(five.stats.capacitor.stable).toBe(false);
    const drain = five.budget.peakRecharge - five.budget.delta;
    expect(five.stats.capacitor).toEqual(
      capacitorStatusAtDrain(
        five.stats.capacitorCapacity,
        five.stats.capacitorRechargeTime / 1000,
        drain
      )
    );

    // Four still hold, at the level the reload-averaged drain settles at.
    const four = run(4);
    expect(four.budget.delta).toBeGreaterThan(0);
    expect(four.stats.capacitor.stable).toBe(true);
    expect(four.stats.capacitor).toEqual(
      capacitorStatusAtDrain(
        four.stats.capacitorCapacity,
        four.stats.capacitorRechargeTime / 1000,
        four.budget.peakRecharge - four.budget.delta
      )
    );
  });

  it('leaves the engine capacitor figure alone on a fit with no cap booster', () => {
    const fitting: Fitting = {
      name: 'Integration Test Caracal no booster',
      shipTypeId: CARACAL,
      modules: [
        { slot: 'medium', slotIndex: 0, typeId: MEDIUM_SHIELD_BOOSTER_II, state: 'active' },
        { slot: 'high', slotIndex: 0, typeId: MEDIUM_ENERGY_NEUTRALIZER_II, state: 'active' },
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(SUPPORT_SKILL_IDS));
    const calculation = calculate(dogmaFit);
    const ship = calculation.ship.attributes;
    const stats = extractFittingStats(dogmaFit.items, ship, calculation.items);
    const depletes = ship.get(-7)?.value ?? 0;
    expect(stats.capacitor).toEqual(
      depletes < 0
        ? { stable: true, stablePercentage: ship.get(-72)?.value }
        : { stable: false, depletesInSeconds: depletes }
    );
  });

  it('reads what the support modules hand out, each by its own kind', () => {
    const fitting: Fitting = {
      name: 'Integration Test Caracal support out',
      shipTypeId: CARACAL,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: MEDIUM_REMOTE_ARMOR_REPAIRER_II, state: 'active' },
        { slot: 'high', slotIndex: 1, typeId: MEDIUM_REMOTE_SHIELD_BOOSTER_II, state: 'active' },
        {
          slot: 'high',
          slotIndex: 2,
          typeId: MEDIUM_REMOTE_CAPACITOR_TRANSMITTER_II,
          state: 'active',
        },
        { slot: 'medium', slotIndex: 0, typeId: MEDIUM_ENERGY_NEUTRALIZER_II, state: 'active' },
        { slot: 'medium', slotIndex: 1, typeId: MEDIUM_ENERGY_NOSFERATU_II, state: 'active' },
        { slot: 'medium', slotIndex: 2, typeId: STASIS_WEBIFIER_II, state: 'active' },
        { slot: 'medium', slotIndex: 3, typeId: WARP_SCRAMBLER_II, state: 'active' },
        { slot: 'medium', slotIndex: 4, typeId: MULTISPECTRUM_ECM_II, state: 'active' },
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(SUPPORT_SKILL_IDS));
    const calculation = calculate(dogmaFit);
    const support = extractSupport(dogmaFit.items, calculation.items);

    expect(support.rows.map((row) => row.kind)).toEqual([
      'remoteArmor',
      'remoteShield',
      'capTransfer',
      'neutralizer',
      'nosferatu',
      'web',
      'warpDisruption',
      'ecm',
    ]);
    // The engine's outgoing projections carry the same figures it hands a target.
    const outgoing = calculation.outgoing?.effects ?? [];
    const projected = (typeId: number, attributeId: number) => {
      const effect = outgoing.find((e) => e.type_id === typeId);
      const values = effect?.attributes;
      return values instanceof Map ? values.get(attributeId) : values?.[attributeId];
    };
    expect(support.remoteRepair.armor).toBeCloseTo(
      projected(MEDIUM_REMOTE_ARMOR_REPAIRER_II, -45)!,
      6
    );
    expect(support.remoteRepair.shield).toBeCloseTo(
      projected(MEDIUM_REMOTE_SHIELD_BOOSTER_II, -47)!,
      6
    );
    expect(support.neutralizer).toBeCloseTo(projected(MEDIUM_ENERGY_NEUTRALIZER_II, -66)!, 6);
    // A Medium Energy Nosferatu II drains 36 GJ every 5 s.
    expect(support.nosferatu).toBeCloseTo(36 / 5, 6);
    // Stasis Webifier II −60%, Warp Scrambler II two points.
    expect(support.rows.find((row) => row.kind === 'web')?.amount).toBeCloseTo(60, 6);
    expect(support.rows.find((row) => row.kind === 'warpDisruption')?.amount).toBe(2);
    expect(support.rows.find((row) => row.kind === 'ecm')?.amount).toBeGreaterThan(0);
  });

  it('keeps every scripted disruptor and dampener, each with all of its effects', () => {
    const mid = (slotIndex: number, typeId: number, chargeTypeId?: number) => ({
      slot: 'medium' as const,
      slotIndex,
      typeId,
      state: 'active' as const,
      ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
    });
    const fitting: Fitting = {
      name: 'Integration Test Caracal scripted EWAR',
      shipTypeId: CARACAL,
      modules: [
        mid(0, TRACKING_DISRUPTOR_II, OPTIMAL_RANGE_DISRUPTION_SCRIPT),
        mid(1, TRACKING_DISRUPTOR_II),
        mid(2, REMOTE_SENSOR_DAMPENER_II, SCAN_RESOLUTION_DAMPENING_SCRIPT),
        mid(3, GUIDANCE_DISRUPTOR_II, MISSILE_RANGE_DISRUPTION_SCRIPT),
        mid(4, TARGET_PAINTER_II),
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(SUPPORT_SKILL_IDS));
    const support = extractSupport(dogmaFit.items, calculate(dogmaFit).items);
    const shape = support.rows.map((row) => [
      row.kind,
      row.effects.map((e) => [e.effect, Number(e.amount.toFixed(1))]),
    ]);
    // Before: the scripted disruptor, the dampener and the guidance
    // disruptor each read one zeroed attribute and had no row at all.
    expect(shape).toEqual([
      [
        'trackingDisruptor',
        [
          ['optimalRange', -34.4],
          ['falloff', -34.4],
        ],
      ],
      [
        'trackingDisruptor',
        [
          ['optimalRange', -17.2],
          ['falloff', -17.2],
          ['trackingSpeed', -17.2],
        ],
      ],
      ['sensorDampener', [['scanResolution', -30.6]]],
      [
        'guidanceDisruptor',
        [
          ['missileVelocity', -18],
          ['missileFlightTime', -18],
        ],
      ],
      ['targetPainter', []],
    ]);
  });

  it('warns of an empty weapon, never of a strip miner running without a crystal', () => {
    const fitting: Fitting = {
      name: 'Integration Test Hulk empty slots',
      shipTypeId: HULK,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: MODULATED_STRIP_MINER_II, state: 'active' },
        {
          slot: 'medium',
          slotIndex: 0,
          typeId: MEDIUM_CAPACITOR_BOOSTER_II,
          state: 'active',
        },
      ],
      drones: [],
      cargo: [],
    };
    const empty = (typeId: number) => ({ typeId, quantity: 1, isDrone: false });
    const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(MINING_SKILL_IDS));
    const hulk = extractOffense(
      [empty(MODULATED_STRIP_MINER_II), empty(MEDIUM_CAPACITOR_BOOSTER_II)],
      calculate(dogmaFit).items,
      null
    );
    expect(hulk.chargelessWeaponCount).toBe(0);

    const caracal = fittingToDogmaFit(
      {
        name: 'Integration Test Caracal empty launcher',
        shipTypeId: CARACAL,
        modules: [
          { slot: 'high', slotIndex: 0, typeId: HEAVY_MISSILE_LAUNCHER_II, state: 'active' },
        ],
        drones: [],
        cargo: [],
      },
      buildAllVProfile(SUPPORT_SKILL_IDS)
    );
    const launcher = extractOffense(
      [empty(HEAVY_MISSILE_LAUNCHER_II)],
      calculate(caracal).items,
      null
    );
    expect(launcher.chargelessWeaponCount).toBe(1);
  });

  it('mines more with a crystal loaded, and counts launched mining drones', () => {
    const hulk = (modules: Fitting['modules'], drones: Fitting['drones'] = []): Fitting => ({
      name: 'Hulk',
      shipTypeId: HULK,
      modules,
      drones,
      cargo: [],
    });
    const strip = (slotIndex: number, chargeTypeId?: number) => ({
      slot: 'high' as const,
      slotIndex,
      typeId: MODULATED_STRIP_MINER_II,
      state: 'active' as const,
      ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
    });
    const mine = (fitting: Fitting) => {
      const dogmaFit = fittingToDogmaFit(fitting, buildAllVProfile(MINING_SKILL_IDS));
      const calculation = calculate(dogmaFit);
      return miningYield(extractMining(dogmaFit.items, calculation.items));
    };

    const bare = mine(hulk([strip(0)]));
    const crystal = mine(hulk([strip(0, SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_A_II)]));
    expect(bare.rows).toHaveLength(1);
    expect(bare.perSecond).toBeGreaterThan(0);
    // The crystal raises the yield and the residue chance alike.
    expect(crystal.perSecond).toBeGreaterThan(bare.perSecond);
    expect(crystal.wastePct).toBeGreaterThan(bare.wastePct);
    expect(crystal.rows[0].chargeTypeId).toBe(SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_A_II);

    const withDrones = mine(
      hulk([strip(0)], [{ typeId: MINING_DRONE_II, quantity: 5, state: 'active' }])
    );
    const drones = withDrones.rows.find((row) => row.isDrone);
    expect(drones?.count).toBe(5);
    expect(withDrones.perSecond).toBeCloseTo(bare.perSecond + drones!.perSecond, 9);
    // Left in the bay, they mine nothing.
    expect(
      mine(hulk([strip(0)], [{ typeId: MINING_DRONE_II, quantity: 5, state: 'online' }])).perSecond
    ).toBeCloseTo(bare.perSecond, 9);
  });

  it('runs an ancillary armor repairer at three times its dry rate on paste, and an ancillary shield booster on charges draws no capacitor', () => {
    const run = (module: Fitting['modules'][number]) => {
      const dogmaFit = fittingToDogmaFit(
        { name: 'AAR', shipTypeId: HURRICANE, modules: [module], drones: [], cargo: [] },
        buildAllVProfile(SUPPORT_SKILL_IDS)
      );
      const calculation = calculate(dogmaFit);
      const stats = extractFittingStats(
        dogmaFit.items,
        calculation.ship.attributes,
        calculation.items
      );
      return {
        tank: extractTank(dogmaFit.items, calculation.items, calculation.ship.attributes, stats),
        budget: extractCapacitorBudget(
          dogmaFit.items,
          calculation.items,
          calculation.ship.attributes
        ),
      };
    };
    const aar = {
      slot: 'low',
      slotIndex: 0,
      typeId: MEDIUM_ANCILLARY_ARMOR_REPAIRER,
      state: 'active',
    } as const;
    const loaded = run({ ...aar, chargeTypeId: NANITE_REPAIR_PASTE });
    const dry = run(aar);

    expect(loaded.tank.burst.armor).toBeCloseTo(dry.tank.burst.armor * 3, 6);
    expect(loaded.tank.ancillary).toEqual([
      expect.objectContaining({ isLoaded: true, loaded: loaded.tank.burst.armor }),
    ]);
    expect(loaded.tank.ancillary[0].empty).toBeCloseTo(dry.tank.burst.armor, 6);
    expect(dry.tank.ancillary[0].loaded).toBeCloseTo(loaded.tank.burst.armor, 6);
    // 0.32 m³ of paste at 0.01 m³, four a cycle: 8 cycles (9 s each, skills
    // taking a quarter off 12 s), then 60 s reloading.
    expect(loaded.tank.sustained.armor).toBeCloseTo((loaded.tank.burst.armor * 72) / 132, 6);

    const asb = {
      slot: 'medium',
      slotIndex: 0,
      typeId: MEDIUM_ANCILLARY_SHIELD_BOOSTER,
      state: 'active',
    } as const;
    expect(run({ ...asb, chargeTypeId: CAP_BOOSTER_150 }).budget.drain).toBe(0);
    expect(run(asb).budget.drain).toBeGreaterThan(0);
  });

  it('caps locked targets at the lower of the hull and the pilot, who starts at two', () => {
    const maelstrom: Fitting = {
      name: 'M',
      shipTypeId: MAELSTROM,
      modules: [],
      drones: [],
      cargo: [],
    };
    const locks = (skills: [number, number][]) => {
      const dogmaFit = fittingToDogmaFit(maelstrom, buildPilotProfile(new Map(skills), []));
      const calculation = calculate(dogmaFit);
      return extractLockedTargets(calculation.ship.attributes, calculation.character.attributes);
    };
    // A Maelstrom locks 7; Target Management (3429) / Advanced (3430) add one a level to two.
    expect(locks([])).toEqual({ ship: 7, pilot: 2, effective: 2 });
    expect(locks([[3429, 1]])).toEqual({ ship: 7, pilot: 3, effective: 3 });
    expect(
      locks([
        [3429, 5],
        [3430, 5],
      ])
    ).toEqual({ ship: 7, pilot: 12, effective: 7 });
  });

  it('reads the sensor strength and type, the holds and the jump drive off the hull', () => {
    const read = (shipTypeId: number) => {
      const dogmaFit = fittingToDogmaFit(
        { name: 'H', shipTypeId, modules: [], drones: [], cargo: [] },
        buildPilotProfile(new Map(), [])
      );
      const calculation = calculate(dogmaFit);
      return extractFittingStats(dogmaFit.items, calculation.ship.attributes, calculation.items);
    };
    const caracal = read(CARACAL);
    expect(caracal.sensor.type).toBe('gravimetric');
    expect(caracal.sensor.strength).toBeGreaterThan(0);
    expect(caracal.holds.cargo).toBeGreaterThan(0);
    expect(caracal.jumpDrive).toBeNull();
    // A Hulk has a mining hold; a Thanatos (carrier) a fleet hangar and a jump drive.
    expect(read(HULK).holds.miningHold).toBe(11500);
    const thanatos = read(THANATOS);
    expect(thanatos.holds.fleetHangar).toBeGreaterThan(0);
    expect(thanatos.jumpDrive?.rangeLightYears).toBeGreaterThan(0);
    expect(thanatos.jumpDrive?.fuelPerLightYear).toBeGreaterThan(0);
  });

  it('names what affects a module: its skills, the hull, a damage mod (penalised) and its charge', () => {
    const fitting: Fitting = {
      name: 'Rifter',
      shipTypeId: RIFTER,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 2889, state: 'active', chargeTypeId: 185 },
        { slot: 'low', slotIndex: 0, typeId: GYROSTABILIZER_II, state: 'online' },
        { slot: 'low', slotIndex: 1, typeId: GYROSTABILIZER_II, state: 'online' },
      ],
      drones: [],
      cargo: [],
    };
    const dogmaFit = fittingToDogmaFit(
      fitting,
      buildPilotProfile(
        new Map([
          [3300, 5],
          [3302, 5],
          [3310, 5],
          [3315, 5],
        ]),
        []
      )
    );
    const calculation = calculate(dogmaFit, { sources: true });
    const rows = affectedAttributes(calculation.items[0].attributes, {
      shipTypeId: RIFTER,
      itemTypeIds: dogmaFit.items.map((item) => item.type_id),
      chargeTypeIds: dogmaFit.items.map((item) => item.charge?.type_id),
      projectedTypeIds: [],
    });

    // Damage multiplier (64): Surgical Strike, the Rifter's bonus, two Gyrostabilizers.
    const damage = rows.find((row) => row.attributeId === 64)!;
    expect(damage.value).toBeGreaterThan(damage.base);
    const kinds = damage.sources.map((source) => [source.kind, source.typeId]);
    expect(kinds).toContainEqual(['skill', 3315]);
    expect(kinds).toContainEqual(['item', GYROSTABILIZER_II]);
    // The second Gyrostabilizer is stacking-penalised.
    expect(
      damage.sources.some(
        (source) => source.typeId === GYROSTABILIZER_II && source.penalty !== null
      )
    ).toBe(true);
    // Rate of fire (51): Rapid Firing.
    expect(rows.find((row) => row.attributeId === 51)!.sources).toContainEqual(
      expect.objectContaining({ kind: 'skill', typeId: 3310 })
    );
    // Nothing negative: the patched, derived ids are never listed.
    expect(rows.every((row) => row.attributeId > 0)).toBe(true);
  });

  it('takes in what another Fitting projects: its web, its remote reps, its command burst', () => {
    const allV = buildAllVProfile([...SUPPORT_SKILL_IDS, ...COMMAND_SKILL_IDS]);
    const target: Fitting = {
      name: 'Rifter',
      shipTypeId: RIFTER,
      modules: [{ slot: 'medium', slotIndex: 0, typeId: AFTERBURNER_1MN_II, state: 'active' }],
      drones: [],
      cargo: [],
    };
    const targetFit = fittingToDogmaFit(target, allV);
    const projectedOnto = (source: Fitting) => {
      const projection = toProjectedEffects(calculate(fittingToDogmaFit(source, allV)).outgoing);
      const calculation = calculate(withIncoming(targetFit, projection));
      return { projection, ship: calculation.ship.attributes };
    };
    const alone = calculate(targetFit).ship.attributes;
    const speed = (ship: typeof alone) => ship.get(37)!.value;

    const webber = projectedOnto({
      name: 'Webber',
      shipTypeId: RIFTER,
      modules: [{ slot: 'medium', slotIndex: 0, typeId: STASIS_WEBIFIER_II, state: 'active' }],
      drones: [],
      cargo: [],
    });
    expect(speed(webber.ship)).toBeCloseTo(speed(alone) * 0.4, 3);

    const logi = projectedOnto({
      name: 'Logi',
      shipTypeId: CARACAL,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: MEDIUM_REMOTE_ARMOR_REPAIRER_II, state: 'active' },
      ],
      drones: [],
      cargo: [],
    });
    const handedOut = logi.projection.effects[0].attributes[-45];
    expect(handedOut).toBeGreaterThan(0);
    expect(logi.ship.get(-45)?.value).toBeCloseTo(handedOut, 6);

    const booster = projectedOnto({
      name: 'Booster',
      shipTypeId: CLAYMORE,
      modules: [
        {
          slot: 'high',
          slotIndex: 0,
          typeId: SKIRMISH_COMMAND_BURST_II,
          state: 'active',
          chargeTypeId: RAPID_DEPLOYMENT_CHARGE,
        },
      ],
      drones: [],
      cargo: [],
    });
    expect(booster.projection.buffs.length).toBeGreaterThan(0);
    // Rapid Deployment: the afterburner's speed bonus is up.
    expect(speed(booster.ship)).toBeGreaterThan(speed(alone));
  });

  it('adds nothing when nothing is projected', () => {
    const fit = fittingToDogmaFit(
      { name: 'R', shipTypeId: RIFTER, modules: [], drones: [], cargo: [] },
      buildPilotProfile(new Map(), [])
    );
    expect(withIncoming(fit, { buffs: [], effects: [] })).toBe(fit);
    expect(withIncoming(fit, undefined)).toBe(fit);
  });

  it('flies a Tactical Destroyer in its mode, and switches a booster side effect on', () => {
    const svipul = (mode?: number): Fitting => ({
      name: 'Svipul',
      shipTypeId: SVIPUL,
      modules: [],
      drones: [],
      cargo: [],
      ...(mode === undefined ? {} : { mode }),
    });
    const read = (fitting: Fitting, profile = buildPilotProfile(new Map(), [])) => {
      const dogmaFit = fittingToDogmaFit(fitting, profile);
      const calculation = calculate(dogmaFit);
      return extractFittingStats(dogmaFit.items, calculation.ship.attributes, calculation.items);
    };
    const bare = calculate({ ship: { type_id: SVIPUL }, items: [] }).ship.attributes;
    // Defense Mode by default: a third off incoming damage on every layer.
    expect(read(svipul()).shield.emResonance).toBeCloseTo(bare.get(271)!.value * (2 / 3), 6);
    // Propulsion Mode: more agile, no resist bonus.
    expect(read(svipul(SVIPUL_PROPULSION_MODE)).navigation.agility).toBeLessThan(
      read(svipul()).navigation.agility
    );
    expect(read(svipul(SVIPUL_PROPULSION_MODE)).shield.emResonance).toBeCloseTo(
      bare.get(271)!.value,
      6
    );

    const bluePill = (sideEffects?: number[]) => ({
      skillLevels: new Map<number, number>(),
      implantTypeIds: [],
      boosterTypeIds: [STANDARD_BLUE_PILL_BOOSTER],
      ...(sideEffects ? { boosterSideEffects: sideEffects } : {}),
    });
    const rifter = { name: 'R', shipTypeId: RIFTER, modules: [], drones: [], cargo: [] };
    // Its Shield Capacity side effect: −20% with no Neurotoxin skills.
    expect(read(rifter, bluePill([2737])).shield.hp).toBeCloseTo(
      read(rifter, bluePill()).shield.hp * 0.8,
      6
    );
  });

  it('launches fighter squadrons from the tubes, and reads their DPS and the tubes they take', () => {
    const fitting: Fitting = {
      name: 'Thanatos',
      shipTypeId: THANATOS,
      modules: [],
      drones: [],
      cargo: [],
      fighters: [
        { typeId: TEMPLAR_I, quantity: 6, state: 'active' },
        { typeId: TEMPLAR_I, quantity: 6, state: 'online' },
        { typeId: CENOBITE_I, quantity: 3, state: 'active' },
      ],
    };
    const dogmaFit = fittingToDogmaFit(
      fitting,
      buildAllVProfile([...SUPPORT_SKILL_IDS, ...FIGHTER_SKILL_IDS])
    );
    const calculation = calculate(dogmaFit);
    const fighters = extractFighterStats(calculation.ship.attributes);

    expect(fighters.tubes).toEqual({ used: 2, total: 4 });
    expect(fighters.light).toEqual({ used: 1, total: 3 });
    expect(fighters.support).toEqual({ used: 1, total: 2 });
    expect(fighters.dps).toBeGreaterThan(0);
    // Offense rows add up to the engine's own fighter DPS; the bay squadron doesn't fight.
    const offense = extractOffense(
      fitting.fighters!.map((f) => ({
        typeId: f.typeId,
        quantity: f.quantity,
        isDrone: true,
        isFighter: true,
      })),
      calculation.items,
      null
    );
    expect(offense.dps).toBeCloseTo(fighters.dps, 6);
    expect(offense.weapons).toEqual([
      expect.objectContaining({ typeId: TEMPLAR_I, count: 6, isFighter: true }),
    ]);
    // Applied DPS takes the launched squadron at the same DPS, its attack all EM.
    const applied = extractAppliedDpsInputs(
      dogmaFit.items,
      calculation.items,
      calculation.character.attributes
    );
    expect(applied.weapons).toEqual([
      {
        kind: 'fighter',
        dps: expect.closeTo(offense.dps, 6),
        damage: { em: 1, thermal: 0, kinetic: 0, explosive: 0 },
      },
    ]);
  });

  it('reads applied-DPS inputs: running turrets, loaded launchers, launched drones only', () => {
    const vexor = vexorNavyIssueFit();
    vexor.drones = [{ typeId: WARRIOR_II, quantity: 5, state: 'active' }];
    // Drone Avionics (3437) V adds 5 km a level to the 20 km base.
    const vexorFit = fittingToDogmaFit(vexor, buildAllVProfile([...ALL_TEST_SKILL_IDS, 3437]));
    const vexorCalc = calculate(vexorFit);
    const vexorInputs = extractAppliedDpsInputs(
      vexorFit.items,
      vexorCalc.items,
      vexorCalc.character.attributes
    );
    expect(vexorInputs.weapons.map((w) => w.kind)).toEqual(['turret', 'turret', 'turret', 'drone']);
    const [blaster, , , warriors] = vexorInputs.weapons;
    expect(blaster).toMatchObject({ optimal: expect.any(Number), falloff: expect.any(Number) });
    if (blaster.kind !== 'turret' || warriors.kind !== 'drone') throw new Error('unexpected kinds');
    expect(blaster.dps).toBeGreaterThan(0);
    expect(blaster.tracking).toBeGreaterThan(0);
    expect(blaster.optimalSigRadius).toBe(40000);
    expect(warriors.speed).toBeGreaterThan(0);
    expect(warriors.optimalSigRadius).toBe(25);
    // The Warriors' DPS reconciles with the ship-level drone DPS the engine reports.
    expect(warriors.dps).toBeCloseTo(vexorCalc.ship.attributes.get(-14)?.value ?? 0, 3);
    // Control range is a character attribute, not a ship one.
    expect(vexorInputs.droneControlRange).toBe(45000);

    const caracal: Fitting = {
      name: 'Integration Test Caracal',
      shipTypeId: CARACAL,
      modules: [
        {
          slot: 'high',
          slotIndex: 0,
          typeId: HEAVY_MISSILE_LAUNCHER_II,
          state: 'active',
          chargeTypeId: SCOURGE_HEAVY_MISSILE,
        },
        {
          slot: 'high',
          slotIndex: 1,
          typeId: HEAVY_MISSILE_LAUNCHER_II,
          state: 'online',
          chargeTypeId: SCOURGE_HEAVY_MISSILE,
        },
      ],
      drones: [],
      cargo: [],
    };
    const caracalFit = fittingToDogmaFit(caracal, buildPilotProfile(new Map(), []));
    const caracalCalc = calculate(caracalFit);
    const caracalInputs = extractAppliedDpsInputs(
      caracalFit.items,
      caracalCalc.items,
      caracalCalc.character.attributes
    );
    // Pinned from a direct run of the engine (2026-09-24), no skills.
    expect(caracalInputs.weapons).toEqual([
      {
        kind: 'missile',
        dps: expect.closeTo(13.07, 2),
        range: expect.closeTo(4730 * 6.5, 0),
        explosionRadius: expect.closeTo(140, 3),
        explosionVelocity: expect.closeTo(85, 3),
        damageReductionFactor: expect.closeTo(0.682, 3),
        // Scourge is all kinetic.
        damage: { em: 0, thermal: 0, kinetic: 1, explosive: 0 },
      },
    ]);
    // Antimatter splits thermal and kinetic; Warriors are all explosive.
    expect(blaster.damage?.thermal).toBeGreaterThan(0);
    expect(blaster.damage?.kinetic).toBeGreaterThan(0);
    expect(blaster.damage?.em).toBe(0);
    expect(warriors.damage).toEqual({ em: 0, thermal: 0, kinetic: 0, explosive: 1 });
    expect(caracalInputs.droneControlRange).toBe(20000);
  });
});

/**
 * Every skill this fit's items or the partial-skills scenario reference, for
 * an "All V" profile scoped to this test rather than the app's full ~511-
 * skill catalog (`public/data/skills.json`) — the production All-V builder
 * (`buildAllVProfile`) is exercised with the real catalog by its own unit
 * test; what matters here is that a skill relevant to this specific fit
 * lands in the engine's `character.skills` map correctly.
 */
const ALL_TEST_SKILL_IDS = [...PARTIAL_SKILLS.keys()];

/** Every skill from 3300 to 3499 — the core ship, weapon, engineering and electronics skills — for the support and tank fits. */
const SUPPORT_SKILL_IDS = Array.from({ length: 200 }, (_, i) => 3300 + i);

/** The core skills plus the mining ones outside 3300-3499 (Mining Barge, Exhumers). */
const MINING_SKILL_IDS = [...SUPPORT_SKILL_IDS, 17940, 22551];
