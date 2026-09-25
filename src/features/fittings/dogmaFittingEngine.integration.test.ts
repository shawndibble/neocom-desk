import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import wasmInit, { calculate } from '@eveshipfit/dogma-engine';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import { extractFittingStats, extractOffense } from '@/engine/fittings/stats';
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
    drones: [{ typeId: WARRIOR_II, quantity: 5, state: 'online' }],
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
      dogmaFit.items.map((item) => item.type_id),
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
      dogmaFit.items.map((item) => item.type_id),
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

  it('marks a type id the pinned data has nothing for as unknown, without failing the rest of the calculation', () => {
    const fitting = vexorNavyIssueFit();
    fitting.modules.push({ slot: 'rig', slotIndex: 0, typeId: 999_999_999, state: 'online' });
    const profile = buildAllVProfile(ALL_TEST_SKILL_IDS);
    const dogmaFit = fittingToDogmaFit(fitting, profile);

    const calculation = calculate(dogmaFit);
    const stats = extractFittingStats(
      dogmaFit.items.map((item) => item.type_id),
      calculation.ship.attributes,
      calculation.items
    );

    expect(stats.unknownItemTypeIds).toEqual([999_999_999]);
    // The rest of the fit still calculated — same as the clean-fit case above.
    expect(stats.cpuTotal).toBeCloseTo(437.5, 6);
    expect(stats.droneDps).toBeCloseTo(124.578, 2);
  });

  it('breaks Offense into per-weapon rows that sum to the engine total, overheated from its overload state', () => {
    const fitting = vexorNavyIssueFit();
    fitting.drones = [{ typeId: WARRIOR_II, quantity: 5, state: 'active' }];
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
    expect(offense.weapons[0].overheatedDps).toBeCloseTo(46.368, 2);
    expect(offense.weapons[0].overheatedVolley).toBeCloseTo(365.148, 2);
    expect(offense.weapons[1].overheatedDps).toBeNull();
    expect(offense.overheatedDps).toBeCloseTo(170.946, 2);
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
