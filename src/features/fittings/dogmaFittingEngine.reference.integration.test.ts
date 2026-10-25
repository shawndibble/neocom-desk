import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { appliedDps, sustainedInputs } from '@/engine/fittings/appliedDps';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { Fitting, FittingModule, FittingStats } from '@/engine/fittings/types';

/**
 * Reference fits: eight standard hulls at All V whose key stats are pinned,
 * each with the source of the number beside it — an engine attribute id, or
 * a formula with its inputs. No value without one.
 *
 * When `@eveshipfit/dogma-engine` / `@eveshipfit/sde` are bumped (together,
 * ADR 0016), run this file and justify every value that moves: a shift must
 * trace to a named change in the engine or SDE, never be re-pinned blind.
 * `docs/agents/testing-and-ci.md` repeats this.
 *
 * Hull attributes read off the pinned SDE with no skills: mass 4, inertia
 * modifier 70, max velocity 37, max target range 76, shield capacity 263,
 * armor HP 265, hull HP 9, capacitor capacity 482, recharge time 55 (ms),
 * armor resonances 267–270, hull resonances 109/110/111/113.
 *
 * Common to every fit (All V skills, engine-applied; each checked against the
 * hull values below):
 * - hull HP = base × 1.25 (Mechanics V); armor HP = base × 1.25 (Hull Upgrades V)
 * - shield HP = (base + extenders) × 1.25 (Shield Management V)
 * - capacitor = base × 1.25 (Energy Management V); recharge time = base × 0.75
 * - max target range = base × 1.25 (Long Range Targeting V)
 * - inertia = base × 0.675; align = ln 4 × inertia × mass / 1e6 seconds
 * - EHP per layer, even damage profile = HP ÷ mean resonance. Damage Control II
 *   scales armor resonances by 0.85 and hull resonances by 0.6; the hull's
 *   base resonance is 0.67 in all four types.
 *
 * Type ids were looked up by exact name in `public/data/types.json`, 2026-10-25.
 */

const DRAKE = 24698;
const HURRICANE = 24702;
const OMEN = 2006;
const VEXOR = 626;
const MYRMIDON = 24700;
const HULK = 22544;
const GUARDIAN = 11987;
const TENGU = 29984;
const TENGU_SUBSYSTEMS = [45625, 45590, 45603, 45614];

const HEAVY_ASSAULT_MISSILE_LAUNCHER_II = 25715;
const SCOURGE_HEAVY_ASSAULT_MISSILE = 20307;
const HEAVY_MISSILE_LAUNCHER_II = 2410;
const SCOURGE_HEAVY_MISSILE = 209;
const AUTOCANNON_425MM_II = 2913;
const HAIL_M = 12777;
const HEAVY_PULSE_LASER_II = 3520;
const MULTIFREQUENCY_M = 254;
const HOBGOBLIN_II = 2456;
const LARGE_SHIELD_EXTENDER_II = 3841;
const MEDIUM_SHIELD_EXTENDER_II = 3831;
const MULTISPECTRUM_SHIELD_HARDENER_II = 2281;
const BALLISTIC_CONTROL_SYSTEM_II = 22291;
const GYROSTABILIZER_II = 519;
const HEAT_SINK_II = 2364;
const DAMAGE_CONTROL_II = 2048;
const DRONE_DAMAGE_AMPLIFIER_II = 4405;
const MEDIUM_ARMOR_REPAIRER_II = 3530;
const MEDIUM_ANCILLARY_ARMOR_REPAIRER = 33101;
const NANITE_REPAIR_PASTE = 28668;
const MEDIUM_CAPACITOR_BOOSTER_II = 2024;
const CAP_BOOSTER_400 = 11287;
const MEDIUM_REMOTE_ARMOR_REPAIRER_II = 26913;
const MEDIUM_REMOTE_CAPACITOR_TRANSMITTER_II = 12221;
const MODULATED_STRIP_MINER_II = 17912;
const SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_B_II = 60283;
const MINING_LASER_UPGRADE_II = 28576;
const AFTERBURNER_1MN_II = 438;
const AFTERBURNER_10MN_II = 12058;
const WARP_SCRAMBLER_II = 448;

/** The Cruiser Target Profile (`targetProfile.ts`): 125 m signature, 200 m/s, no resists. */
const CRUISER = { signatureRadius: 125, velocity: 200 };
const SHOT_RANGE = 5000;

const module = (
  slot: FittingModule['slot'],
  slotIndex: number,
  typeId: number,
  state: FittingModule['state'] = 'active',
  chargeTypeId?: number
): FittingModule => ({
  slot,
  slotIndex,
  typeId,
  state,
  ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
});

/** `count` copies of a module in one rack, numbered from `from`. */
const rack = (
  slot: FittingModule['slot'],
  typeId: number,
  count: number,
  state: FittingModule['state'] = 'active',
  chargeTypeId?: number,
  from = 0
): FittingModule[] =>
  Array.from({ length: count }, (_, i) => module(slot, from + i, typeId, state, chargeTypeId));

const fit = (
  name: string,
  shipTypeId: number,
  modules: FittingModule[],
  drones: Fitting['drones'] = []
): Fitting => ({ name, shipTypeId, modules, drones, cargo: [] });

const FITS = {
  drake: fit('Drake (HAM)', DRAKE, [
    ...rack('high', HEAVY_ASSAULT_MISSILE_LAUNCHER_II, 6, 'active', SCOURGE_HEAVY_ASSAULT_MISSILE),
    ...rack('medium', LARGE_SHIELD_EXTENDER_II, 2, 'online'),
    module('medium', 2, MULTISPECTRUM_SHIELD_HARDENER_II),
    ...rack('low', BALLISTIC_CONTROL_SYSTEM_II, 2, 'online'),
    module('low', 2, DAMAGE_CONTROL_II, 'online'),
  ]),
  hurricane: fit('Hurricane (autocannons)', HURRICANE, [
    ...rack('high', AUTOCANNON_425MM_II, 6, 'active', HAIL_M),
    module('medium', 0, AFTERBURNER_10MN_II),
    module('medium', 1, MEDIUM_SHIELD_EXTENDER_II, 'online'),
    ...rack('low', GYROSTABILIZER_II, 2, 'online'),
    module('low', 2, DAMAGE_CONTROL_II, 'online'),
  ]),
  omen: fit('Omen (pulse lasers)', OMEN, [
    ...rack('high', HEAVY_PULSE_LASER_II, 5, 'active', MULTIFREQUENCY_M),
    module('medium', 0, WARP_SCRAMBLER_II),
    ...rack('low', HEAT_SINK_II, 2, 'online'),
    module('low', 2, MEDIUM_ARMOR_REPAIRER_II),
    module('low', 3, DAMAGE_CONTROL_II, 'online'),
  ]),
  vexor: fit(
    'Vexor (drones)',
    VEXOR,
    [
      module('low', 0, DAMAGE_CONTROL_II, 'online'),
      ...rack('low', DRONE_DAMAGE_AMPLIFIER_II, 2, 'online', undefined, 1),
    ],
    [{ typeId: HOBGOBLIN_II, quantity: 5, state: 'active' }]
  ),
  myrmidon: fit('Myrmidon (dual rep, cap booster, AAR)', MYRMIDON, [
    module('medium', 0, MEDIUM_CAPACITOR_BOOSTER_II, 'active', CAP_BOOSTER_400),
    ...rack('low', MEDIUM_ARMOR_REPAIRER_II, 2),
    module('low', 2, MEDIUM_ANCILLARY_ARMOR_REPAIRER, 'active', NANITE_REPAIR_PASTE),
    module('low', 3, DAMAGE_CONTROL_II, 'online'),
  ]),
  hulk: fit('Hulk (strip miners)', HULK, [
    ...rack(
      'high',
      MODULATED_STRIP_MINER_II,
      2,
      'active',
      SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_B_II
    ),
    module('medium', 0, AFTERBURNER_1MN_II),
    ...rack('low', MINING_LASER_UPGRADE_II, 3, 'online'),
  ]),
  guardian: fit('Guardian (remote reps)', GUARDIAN, [
    ...rack('high', MEDIUM_REMOTE_ARMOR_REPAIRER_II, 3),
    module('high', 3, MEDIUM_REMOTE_CAPACITOR_TRANSMITTER_II),
    module('medium', 0, MEDIUM_CAPACITOR_BOOSTER_II, 'active', CAP_BOOSTER_400),
    module('low', 0, DAMAGE_CONTROL_II, 'online'),
  ]),
  tengu: fit('Tengu (T3 missiles)', TENGU, [
    ...TENGU_SUBSYSTEMS.map((typeId, slotIndex) =>
      module('subsystem', slotIndex, typeId, 'online')
    ),
    ...rack('high', HEAVY_MISSILE_LAUNCHER_II, 4, 'active', SCOURGE_HEAVY_MISSILE),
    module('medium', 0, LARGE_SHIELD_EXTENDER_II, 'online'),
    module('medium', 1, MULTISPECTRUM_SHIELD_HARDENER_II),
  ]),
};

type Hull = keyof typeof FITS;

const stats = {} as Record<Hull, FittingStats>;

beforeAll(async () => {
  await loadRealDogmaEngine();
  const skills = JSON.parse(
    await readFile(new URL('../../../public/data/skills.json', import.meta.url), 'utf8')
  ) as { typeID: number }[];
  const profile = buildAllVProfile(skills.map((skill) => skill.typeID));
  for (const hull of Object.keys(FITS) as Hull[]) {
    stats[hull] = await computeFittingStats(FITS[hull], profile);
  }
});
afterAll(() => vi.unstubAllGlobals());

/** Within 0.1% — loose enough for float noise, tight enough that a real shift shows. */
const near = (actual: number, expected: number, relative = 1e-3) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);

/** Applied DPS against the Cruiser profile at 5 km, raw and with reloads. */
const applied = (hull: Hull) => ({
  full: appliedDps(stats[hull].applied, CRUISER, SHOT_RANGE),
  sustained: appliedDps(sustainedInputs(stats[hull].applied), CRUISER, SHOT_RANGE),
});

const align = (hull: Hull) =>
  alignTimeSeconds(stats[hull].navigation.mass, stats[hull].navigation.agility);

describe('reference fits at All V (real WASM + real pinned SDE)', () => {
  it('breaks no fitting rule and finds no unknown type in any reference fit', () => {
    for (const hull of Object.keys(FITS) as Hull[]) {
      expect(stats[hull].ruleBreaks, hull).toEqual([]);
      expect(stats[hull].unknownItemTypeIds, hull).toEqual([]);
    }
  });

  it('Drake: 6 HAM II with Scourge HAM', () => {
    const s = stats.drake;
    // Engine ship-level output: 6 launchers × volley ÷ cycle, skills and 2 Ballistic Control System II applied.
    near(s.offense.dps, 412.84);
    // Same, averaged over each launcher's reload (the magazine's reload).
    near(s.offense.sustainedDps, 396.1);
    // volley = 6 × per-launcher damage (attrs 114/116/117/118 of the charge × launcher damage modifier attr 64).
    near(s.offense.volley, 1479.56);
    // A missile of this explosion radius/velocity applies fully to a 125 m, 200 m/s target (`appliedDps.ts`), so it equals raw.
    near(applied('drake').full, 412.84);
    near(applied('drake').sustained, 396.1);
    // Shield HP = (5500 + 2 × 2600 Large Shield Extender II) × 1.25 (attr 263).
    near(s.shield.hp, 13375, 1e-6);
    near(s.shield.ehp, 39043.97); // HP ÷ mean shield resonance (attrs 271–274) after the hardener, engine-applied.
    near(s.armor.hp, 4062.5, 1e-6); // 3250 (attr 265) × 1.25
    near(s.armor.ehp, 7080.61); // 4062.5 ÷ (mean(0.5, 0.9, 0.75, 0.55) × 0.85)
    near(s.hull.hp, 4687.5, 1e-6); // 3750 (attr 9) × 1.25
    near(s.hull.ehp, 11660.45); // 4687.5 ÷ (0.67 × 0.6)
    near(s.ehp, 57785.03); // sum of the three layers' EHP
    expect(s.capacitor).toEqual({ stable: true, stablePercentage: expect.any(Number) });
    // Engine's capacitor simulation: peak recharge vs the hardener's draw (attr 6 per cycle).
    near((s.capacitor as { stablePercentage: number }).stablePercentage, 90.14);
    near(s.capacitorCapacity, 3125, 1e-6); // 2500 (attr 482) × 1.25
    near(s.navigation.maxVelocity, 187.5, 1e-6); // 150 (attr 37) × 1.25 (Navigation V)
    near(align('drake'), 8.2112); // ln4 × (0.65 × 0.675) × 13.5e6 / 1e6
    near(s.targeting.maxTargetRange, 81250, 1e-6); // 65000 (attr 76) × 1.25
  });

  it('Hurricane: 6 × 425mm AutoCannon II with Hail M', () => {
    const s = stats.hurricane;
    near(s.offense.dps, 725.81); // 6 × volley ÷ cycle, Gunnery skills and 2 Gyrostabilizer II applied (engine)
    near(s.offense.sustainedDps, 701.42); // averaged over reloads (magazine of Hail M)
    near(s.offense.volley, 1739.22); // 6 × charge damage (attrs 114–118 of Hail M) × turret damage modifier (attr 64)
    // Turret hit chance at 5 km vs 125 m / 200 m/s: optimal 1875 m + falloff 12698 m (attrs 54/158), tracking attr 160 (`appliedDps.ts`).
    near(applied('hurricane').full, 588.82);
    near(applied('hurricane').sustained, 569.03);
    near(s.shield.hp, 7000, 1e-6); // (4500 + 1100 Medium Shield Extender II) × 1.25
    near(s.shield.ehp, 11034.48); // 7000 ÷ mean shield resonance (attrs 271–274), engine-applied
    near(s.armor.hp, 5625, 1e-6); // 4500 × 1.25
    near(s.armor.ehp, 9803.92); // 5625 ÷ (mean(0.4, 0.9, 0.75, 0.65) × 0.85)
    near(s.hull.hp, 4375, 1e-6); // 3500 × 1.25
    near(s.hull.ehp, 10883.08); // 4375 ÷ (0.67 × 0.6)
    near(s.ehp, 31721.49); // sum of the three layers' EHP
    near((s.capacitor as { stablePercentage: number }).stablePercentage, 90.78); // engine's capacitor simulation; 10MN AB II draws attr 6 per cycle
    near(s.capacitorCapacity, 2875, 1e-6); // 2300 × 1.25
    // Mass: 12.8e6 hull + 5e6 from the 10MN Afterburner II (attr 796) = 17.8e6; speed 180 × 1.25 × (1 + afterburner boost ÷ mass).
    near(s.navigation.mass, 17_800_000, 1e-9);
    near(s.navigation.maxVelocity, 544.96);
    near(align('hurricane'), 11.1597); // ln4 × (0.67 × 0.675) × 17.8e6 / 1e6
    near(s.targeting.maxTargetRange, 75000, 1e-6); // 60000 × 1.25
  });

  it('Omen: 5 × Heavy Pulse Laser II with Multifrequency M', () => {
    const s = stats.omen;
    near(s.offense.dps, 354.2); // 5 × volley ÷ cycle, Gunnery skills and 2 Heat Sink II applied (engine)
    near(s.offense.sustainedDps, 354.2); // a laser crystal never reloads, so sustained equals raw
    near(s.offense.volley, 816.72); // 5 × crystal damage (attrs 114–118 of Multifrequency M) × turret damage modifier (attr 64)
    // Turret hit chance at 5 km vs the Cruiser profile: optimal 7875 m + falloff 6250 m (attrs 54/158), tracking attr 160.
    near(applied('omen').full, 307.58);
    near(s.shield.hp, 1500, 1e-6); // 1200 × 1.25
    near(s.shield.ehp, 2364.53); // 1500 ÷ mean shield resonance (attrs 271–274), engine-applied
    near(s.armor.hp, 2125, 1e-6); // 1700 × 1.25
    near(s.armor.ehp, 3703.7); // 2125 ÷ (mean(0.5, 0.8, 0.75, 0.65) × 0.85)
    near(s.hull.hp, 1875, 1e-6); // 1500 × 1.25
    near(s.hull.ehp, 4664.18); // 1875 ÷ (0.67 × 0.6)
    near(s.ehp, 10732.41); // sum of the three layers' EHP
    // The 5 lasers and the armor repairer draw more than the 2000 GJ (1600 × 1.25) capacitor recharges: it runs dry.
    expect(s.capacitor.stable).toBe(false);
    near((s.capacitor as { depletesInSeconds: number }).depletesInSeconds, 90); // engine's capacitor simulation
    near(s.capacitorCapacity, 2000, 1e-6);
    near(s.repair.armor, 40.89); // Medium Armor Repairer II: armor repaired per cycle ÷ cycle (attr 73), skills applied
    near(s.navigation.maxVelocity, 325, 1e-6); // 260 × 1.25
    near(align('omen'), 5.2308); // ln4 × (0.43 × 0.675) × 13e6 / 1e6
    near(s.targeting.maxTargetRange, 68750, 1e-6); // 55000 × 1.25
  });

  it('Vexor: 5 Hobgoblin II', () => {
    const s = stats.vexor;
    // Ship drone damage output (engine attr -14): 5 drones × (damage × multiplier ÷ cycle), Drones skills and 2 Drone Damage Amplifier II applied.
    near(s.droneDps, 210.82);
    near(s.offense.dps, 210.82);
    near(s.offense.volley, 843.3); // 4 × dps: the Hobgoblin II's 4 s cycle (attr 51)
    // TODO(#5218): applied DPS (the drones' own attr -12, 5 × 42.80) exceeds the ship total (attr -14) by ~1.5%; pinned as it is today.
    near(applied('vexor').full, 213.998);
    near(s.shield.hp, 1375, 1e-6); // 1100 × 1.25
    near(s.armor.hp, 2500, 1e-6); // 2000 × 1.25
    near(s.hull.hp, 2500, 1e-6); // 2000 × 1.25
    near(s.hull.ehp, 6218.91); // 2500 ÷ (0.67 × 0.6)
    near(s.armor.ehp, 4357.3); // 2500 ÷ (mean(0.5, 0.9, 0.65, 0.65) × 0.85)
    near(s.ehp, 12743.69); // sum of the three layers' EHP
    expect(s.capacitor).toEqual({ stable: true, stablePercentage: 100 }); // nothing draws capacitor
    near(s.capacitorCapacity, 1812.5, 1e-6); // 1450 × 1.25
    near(s.navigation.maxVelocity, 243.75, 1e-6); // 195 × 1.25
    near(align('vexor'), 5.8166); // ln4 × (0.56 × 0.675) × 11.1e6 / 1e6
    near(s.targeting.maxTargetRange, 65625, 1e-6); // 52500 × 1.25
  });

  it('Myrmidon: dual armor repairers, cap booster, ancillary armor repairer', () => {
    const s = stats.myrmidon;
    near(s.repair.armor, 207.32); // 2 × Medium Armor Repairer II + the loaded AAR (94.875), each repair per cycle ÷ cycle
    near(s.tank.ancillary[0].loaded, 94.875); // AAR with Nanite Repair Paste: its repair per cycle × paste multiplier ÷ cycle (attr 73)
    near(s.tank.ancillary[0].empty, 31.625); // paste-less: the loaded rate ÷ 3
    // Cap booster: 400 GJ charge per 17 s cycle (Cap Booster 400, Medium Capacitor Booster II).
    near(s.capacitorBudget.boosterInjection, 400 / 17, 1e-6);
    // Three repairers draw more than recharge + booster give: it empties, in the engine's simulation.
    expect(s.capacitor.stable).toBe(false);
    near((s.capacitor as { depletesInSeconds: number }).depletesInSeconds, 421.47);
    near(s.capacitorCapacity, 3625, 1e-6); // 2900 × 1.25
    near(s.shield.hp, 4375, 1e-6); // 3500 × 1.25
    near(s.armor.hp, 5625, 1e-6); // 4500 × 1.25
    near(s.armor.ehp, 9803.92); // 5625 ÷ (mean(0.5, 0.9, 0.65, 0.65) × 0.85)
    near(s.hull.hp, 5937.5, 1e-6); // 4750 × 1.25
    near(s.hull.ehp, 14769.9); // 5937.5 ÷ (0.67 × 0.6)
    near(s.ehp, 31470.37); // sum of the three layers' EHP
    near(s.navigation.maxVelocity, 181.25, 1e-6); // 145 × 1.25
    near(align('myrmidon'), 8.3188); // ln4 × (0.7 × 0.675) × 12.7e6 / 1e6
    near(s.targeting.maxTargetRange, 68750, 1e-6); // 55000 × 1.25
  });

  it('Hulk: 2 Modulated Strip Miner II with a Type B II crystal', () => {
    const s = stats.hulk;
    const [row] = s.mining.rows;
    expect(row.count).toBe(2);
    // Cycle = duration (attr 73) 36 s × 0.7225 (0.85², Mining Barge / Exhumer skills, engine-applied) = 26.01 s.
    near(row.cycleSeconds, 26.01, 1e-4);
    // 2 miners × yield per cycle (attr 77, crystal and Mining Laser Upgrade II applied) × (1 + crit chance × crit bonus) ÷ cycle.
    near(s.mining.perSecond, 52.13);
    near(s.mining.wastePerSecond, 32.16); // the Type B II crystal's residue share of the yield (the crystal's residue, engine-applied)
    near(s.shield.hp, 5625, 1e-6); // 4500 × 1.25
    near(s.armor.hp, 3750, 1e-6); // 3000 × 1.25
    near(s.armor.ehp, 5555.56); // 3750 ÷ mean(0.4, 0.9, 0.75, 0.65): no hardener, no Damage Control
    near(s.hull.hp, 5625, 1e-6); // 4500 × 1.25
    near(s.hull.ehp, 8395.52); // 5625 ÷ 0.67
    near(s.ehp, 23649.35); // sum of the three layers' EHP
    // Mass: 15e6 hull + 0.5e6 from the 1MN Afterburner II (attr 796); speed 160 × 1.25 × (1 + afterburner boost ÷ mass).
    near(s.navigation.mass, 15_500_000, 1e-9);
    near(s.navigation.maxVelocity, 232.66);
    near(align('hulk'), 8.7025); // ln4 × (0.6 × 0.675) × 15.5e6 / 1e6
    near(s.targeting.maxTargetRange, 68750, 1e-6); // 55000 × 1.25
    near(s.capacitorCapacity, 781.25, 1e-6); // 625 × 1.25
    near((s.capacitor as { stablePercentage: number }).stablePercentage, 89.6); // engine's capacitor simulation
  });

  it('Guardian: 3 remote armor repairers and a remote capacitor transmitter', () => {
    const s = stats.guardian;
    // 3 × Medium Remote Armor Repairer II: each repairs 42.67 HP/s at its cycle (attr 73); engine output per module.
    near(s.support.remoteRepair.armor, 128);
    near(s.support.capTransfer, 23.4); // Medium Remote Capacitor Transmitter II: GJ moved per cycle ÷ cycle
    near(s.capacitorBudget.boosterInjection, 400 / 17, 1e-6); // Cap Booster 400: 400 GJ per 17 s
    expect(s.capacitor).toEqual({ stable: true, stablePercentage: 100 });
    near(s.capacitorCapacity, 2812.5, 1e-6); // 2250 × 1.25
    near(s.shield.hp, 1318.75, 1e-6); // 1055 × 1.25
    near(s.armor.hp, 2636.25, 1e-6); // 2109 × 1.25
    near(s.armor.ehp, 7191.82); // 2636.25 ÷ (mean(0.5, 0.2, 0.375, 0.65) × 0.85)
    near(s.hull.hp, 2505, 1e-6); // 2004 × 1.25
    near(s.hull.ehp, 6231.34); // 2505 ÷ (0.67 × 0.6)
    near(s.ehp, 16132.63); // sum of the three layers' EHP
    near(s.navigation.maxVelocity, 261.25, 1e-6); // 209 × 1.25
    near(align('guardian'), 6.8383); // ln4 × (0.61 × 0.675) × 11.98e6 / 1e6
    near(s.targeting.maxTargetRange, 81250, 1e-6); // 65000 × 1.25
  });

  it('Tengu: 4 Heavy Missile Launcher II with Scourge, four subsystems', () => {
    const s = stats.tengu;
    near(s.offense.dps, 99.19); // 4 × volley ÷ cycle, skills and subsystem bonuses applied (engine)
    near(s.offense.sustainedDps, 96.28); // averaged over reloads
    near(s.offense.volley, 819.5); // 4 × charge damage (attrs 114–118 of Scourge) × launcher damage modifier (attr 64)
    // A heavy missile's explosion radius/velocity (attrs 654/653) against 125 m / 200 m/s applies ~83% (`appliedDps.ts`).
    near(applied('tengu').full, 82.18);
    near(applied('tengu').sustained, 79.77);
    near(s.shield.hp, 9687.5, 1e-6); // 9687.5 ÷ 1.25 = 7750: hull 2600 (attr 263) + Large Shield Extender II, plus the subsystems' shield bonus (engine-applied)
    near(s.shield.ehp, 24428.68); // HP ÷ mean shield resonance (attrs 271–274) after the hardener and subsystems, engine-applied
    near(s.armor.hp, 2625, 1e-6); // 2100 × 1.25
    near(s.armor.ehp, 4692.74); // HP ÷ mean armor resonance (attrs 267–270), engine-applied
    near(s.hull.hp, 2125, 1e-6); // 1700 × 1.25
    near(s.hull.ehp, 3171.64); // 2125 ÷ 0.67
    near(s.ehp, 32293.06); // sum of the three layers' EHP
    near((s.capacitor as { stablePercentage: number }).stablePercentage, 90.82); // engine's capacitor simulation
    near(s.capacitorCapacity, 1875, 1e-6); // 1875 = 1.25 × 1500: 1400 (attr 482) plus 100 from the subsystems
    near(s.navigation.maxVelocity, 244.375, 1e-6); // 170 × 1.25 × 1.15 (propulsion subsystem, engine-applied)
    near(align('tengu'), 4.3793); // ln4 × (0.52 × 0.675 × 0.625) × 14.4e6 / 1e6; the extra 0.625 is the subsystems'
    near(s.targeting.maxTargetRange, 117187.5, 1e-6); // 75000 × 1.25 × 1.25 (subsystem bonus, engine-applied)
  });
});
