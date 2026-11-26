import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { appliedDps, sustainedInputs } from '@/engine/fittings/appliedDps';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { Fitting, FittingModule, FittingStats } from '@/engine/fittings/types';

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

const CRUISER = { signatureRadius: 125, velocity: 200 };
const SHOT_RANGE = 5000;

const slotModule = (
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

const rack = (
  slot: FittingModule['slot'],
  typeId: number,
  count: number,
  state: FittingModule['state'] = 'active',
  chargeTypeId?: number,
  from = 0
): FittingModule[] =>
  Array.from({ length: count }, (_, i) => slotModule(slot, from + i, typeId, state, chargeTypeId));

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
    slotModule('medium', 2, MULTISPECTRUM_SHIELD_HARDENER_II),
    ...rack('low', BALLISTIC_CONTROL_SYSTEM_II, 2, 'online'),
    slotModule('low', 2, DAMAGE_CONTROL_II, 'online'),
  ]),
  hurricane: fit('Hurricane (autocannons)', HURRICANE, [
    ...rack('high', AUTOCANNON_425MM_II, 6, 'active', HAIL_M),
    slotModule('medium', 0, AFTERBURNER_10MN_II),
    slotModule('medium', 1, MEDIUM_SHIELD_EXTENDER_II, 'online'),
    ...rack('low', GYROSTABILIZER_II, 2, 'online'),
    slotModule('low', 2, DAMAGE_CONTROL_II, 'online'),
  ]),
  omen: fit('Omen (pulse lasers)', OMEN, [
    ...rack('high', HEAVY_PULSE_LASER_II, 5, 'active', MULTIFREQUENCY_M),
    slotModule('medium', 0, WARP_SCRAMBLER_II),
    ...rack('low', HEAT_SINK_II, 2, 'online'),
    slotModule('low', 2, MEDIUM_ARMOR_REPAIRER_II),
    slotModule('low', 3, DAMAGE_CONTROL_II, 'online'),
  ]),
  vexor: fit(
    'Vexor (drones)',
    VEXOR,
    [
      slotModule('low', 0, DAMAGE_CONTROL_II, 'online'),
      ...rack('low', DRONE_DAMAGE_AMPLIFIER_II, 2, 'online', undefined, 1),
    ],
    [{ typeId: HOBGOBLIN_II, quantity: 5, state: 'active' }]
  ),
  myrmidon: fit('Myrmidon (dual rep, cap booster, AAR)', MYRMIDON, [
    slotModule('medium', 0, MEDIUM_CAPACITOR_BOOSTER_II, 'active', CAP_BOOSTER_400),
    ...rack('low', MEDIUM_ARMOR_REPAIRER_II, 2),
    slotModule('low', 2, MEDIUM_ANCILLARY_ARMOR_REPAIRER, 'active', NANITE_REPAIR_PASTE),
    slotModule('low', 3, DAMAGE_CONTROL_II, 'online'),
  ]),
  hulk: fit('Hulk (strip miners)', HULK, [
    ...rack(
      'high',
      MODULATED_STRIP_MINER_II,
      2,
      'active',
      SIMPLE_ASTEROID_MINING_CRYSTAL_TYPE_B_II
    ),
    slotModule('medium', 0, AFTERBURNER_1MN_II),
    ...rack('low', MINING_LASER_UPGRADE_II, 3, 'online'),
  ]),
  guardian: fit('Guardian (remote reps)', GUARDIAN, [
    ...rack('high', MEDIUM_REMOTE_ARMOR_REPAIRER_II, 3),
    slotModule('high', 3, MEDIUM_REMOTE_CAPACITOR_TRANSMITTER_II),
    slotModule('medium', 0, MEDIUM_CAPACITOR_BOOSTER_II, 'active', CAP_BOOSTER_400),
    slotModule('low', 0, DAMAGE_CONTROL_II, 'online'),
  ]),
  tengu: fit('Tengu (T3 missiles)', TENGU, [
    ...TENGU_SUBSYSTEMS.map((typeId, slotIndex) =>
      slotModule('subsystem', slotIndex, typeId, 'online')
    ),
    ...rack('high', HEAVY_MISSILE_LAUNCHER_II, 4, 'active', SCOURGE_HEAVY_MISSILE),
    slotModule('medium', 0, LARGE_SHIELD_EXTENDER_II, 'online'),
    slotModule('medium', 1, MULTISPECTRUM_SHIELD_HARDENER_II),
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

const near = (actual: number, expected: number, relative = 1e-3) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative);

const stablePct = (hull: Hull): number => {
  const { capacitor } = stats[hull];
  expect(capacitor.stable, `${hull} capacitor stable`).toBe(true);
  return (capacitor as { stablePercentage: number }).stablePercentage;
};

const depletesIn = (hull: Hull): number => {
  const { capacitor } = stats[hull];
  expect(capacitor.stable, `${hull} capacitor stable`).toBe(false);
  return (capacitor as { depletesInSeconds: number }).depletesInSeconds;
};

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
    near(s.offense.dps, 412.84);
    near(s.offense.sustainedDps, 396.1);
    near(s.offense.volley, 1479.56);
    near(applied('drake').full, 412.84);
    near(applied('drake').sustained, 396.1);
    near(s.shield.hp, 13375, 1e-6);
    near(s.shield.ehp, 39043.97);
    near(s.armor.hp, 4062.5, 1e-6);
    near(s.armor.ehp, 7080.61);
    near(s.hull.hp, 4687.5, 1e-6);
    near(s.hull.ehp, 11660.45);
    near(s.ehp, 57785.03);
    near(stablePct('drake'), 90.14, 1e-4);
    near(s.capacitorCapacity, 3125, 1e-6);
    near(s.navigation.maxVelocity, 187.5, 1e-6);
    near(align('drake'), 8.2112);
    near(s.targeting.maxTargetRange, 81250, 1e-6);
  });

  it('Hurricane: 6 × 425mm AutoCannon II with Hail M', () => {
    const s = stats.hurricane;
    near(s.offense.dps, 725.81);
    near(s.offense.sustainedDps, 701.42);
    near(s.offense.volley, 1739.22);
    near(applied('hurricane').full, 588.82);
    near(applied('hurricane').sustained, 569.03);
    near(s.shield.hp, 7000, 1e-6);
    near(s.shield.ehp, 11034.48);
    near(s.armor.hp, 5625, 1e-6);
    near(s.armor.ehp, 9803.92);
    near(s.hull.hp, 4375, 1e-6);
    near(s.hull.ehp, 10883.08);
    near(s.ehp, 31721.49);
    near(stablePct('hurricane'), 90.78, 1e-4);
    near(s.capacitorCapacity, 2875, 1e-6);
    near(s.navigation.mass, 17_800_000, 1e-9);
    near(s.navigation.maxVelocity, 544.96);
    near(align('hurricane'), 11.1597);
    near(s.targeting.maxTargetRange, 75000, 1e-6);
  });

  it('Omen: 5 × Heavy Pulse Laser II with Multifrequency M', () => {
    const s = stats.omen;
    near(s.offense.dps, 354.2);
    near(s.offense.sustainedDps, 354.2);
    near(s.offense.volley, 816.72);
    near(applied('omen').full, 307.58);
    near(s.shield.hp, 1500, 1e-6);
    near(s.shield.ehp, 2364.53);
    near(s.armor.hp, 2125, 1e-6);
    near(s.armor.ehp, 3703.7);
    near(s.hull.hp, 1875, 1e-6);
    near(s.hull.ehp, 4664.18);
    near(s.ehp, 10732.41);
    near(depletesIn('omen'), 90, 1e-4);
    near(s.capacitorCapacity, 2000, 1e-6);
    near(s.repair.armor, 40.89);
    near(s.navigation.maxVelocity, 325, 1e-6);
    near(align('omen'), 5.2308);
    near(s.targeting.maxTargetRange, 68750, 1e-6);
  });

  it('Vexor: 5 Hobgoblin II', () => {
    const s = stats.vexor;
    near(s.droneDps, 210.82);
    near(s.offense.dps, 210.82);
    near(s.offense.volley, 843.3);
    near(applied('vexor').full, 213.998);
    near(s.shield.hp, 1375, 1e-6);
    near(s.shield.ehp, 2167.49);
    near(s.armor.hp, 2500, 1e-6);
    near(s.hull.hp, 2500, 1e-6);
    near(s.hull.ehp, 6218.91);
    near(s.armor.ehp, 4357.3);
    near(s.ehp, 12743.69);
    expect(s.capacitor).toEqual({ stable: true, stablePercentage: 100 });
    near(s.capacitorCapacity, 1812.5, 1e-6);
    near(s.navigation.maxVelocity, 243.75, 1e-6);
    near(align('vexor'), 5.8166);
    near(s.targeting.maxTargetRange, 65625, 1e-6);
  });

  it('Myrmidon: dual armor repairers, cap booster, ancillary armor repairer', () => {
    const s = stats.myrmidon;
    near(s.repair.armor, 207.32);
    near(s.tank.ancillary[0].loaded, 94.875);
    near(s.tank.ancillary[0].empty, 31.625);
    near(s.capacitorBudget.boosterInjection, 400 / 17, 1e-6);
    near(depletesIn('myrmidon'), 421.47, 1e-4);
    near(s.capacitorCapacity, 3625, 1e-6);
    near(s.shield.hp, 4375, 1e-6);
    near(s.shield.ehp, 6896.55);
    near(s.armor.hp, 5625, 1e-6);
    near(s.armor.ehp, 9803.92);
    near(s.hull.hp, 5937.5, 1e-6);
    near(s.hull.ehp, 14769.9);
    near(s.ehp, 31470.37);
    near(s.navigation.maxVelocity, 181.25, 1e-6);
    near(align('myrmidon'), 8.3188);
    near(s.targeting.maxTargetRange, 68750, 1e-6);
  });

  it('Hulk: 2 Modulated Strip Miner II with a Type B II crystal', () => {
    const s = stats.hulk;
    const [row] = s.mining.rows;
    expect(row.count).toBe(2);
    near(row.cycleSeconds, 26.01, 1e-4);
    near(s.mining.perSecond, 52.13);
    near(s.mining.wastePerSecond, 32.16);
    near(s.shield.hp, 5625, 1e-6);
    near(s.shield.ehp, 9698.28);
    near(s.armor.hp, 3750, 1e-6);
    near(s.armor.ehp, 5555.56);
    near(s.hull.hp, 5625, 1e-6);
    near(s.hull.ehp, 8395.52);
    near(s.ehp, 23649.35);
    near(s.navigation.mass, 15_500_000, 1e-9);
    near(s.navigation.maxVelocity, 232.66);
    near(align('hulk'), 8.7025);
    near(s.targeting.maxTargetRange, 68750, 1e-6);
    near(s.capacitorCapacity, 781.25, 1e-6);
    near(stablePct('hulk'), 89.6, 1e-4);
  });

  it('Guardian: 3 remote armor repairers and a remote capacitor transmitter', () => {
    const s = stats.guardian;
    near(s.support.remoteRepair.armor, 128);
    near(s.support.capTransfer, 23.4);
    near(s.capacitorBudget.boosterInjection, 400 / 17, 1e-6);
    expect(s.capacitor).toEqual({ stable: true, stablePercentage: 100 });
    near(s.capacitorCapacity, 2812.5, 1e-6);
    near(s.shield.hp, 1318.75, 1e-6);
    near(s.shield.ehp, 2709.47);
    near(s.armor.hp, 2636.25, 1e-6);
    near(s.armor.ehp, 7191.82);
    near(s.hull.hp, 2505, 1e-6);
    near(s.hull.ehp, 6231.34);
    near(s.ehp, 16132.63);
    near(s.navigation.maxVelocity, 261.25, 1e-6);
    near(align('guardian'), 6.8383);
    near(s.targeting.maxTargetRange, 81250, 1e-6);
  });

  it('Tengu: 4 Heavy Missile Launcher II with Scourge, four subsystems', () => {
    const s = stats.tengu;
    near(s.offense.dps, 99.19);
    near(s.offense.sustainedDps, 96.28);
    near(s.offense.volley, 819.5);
    near(applied('tengu').full, 82.18);
    near(applied('tengu').sustained, 79.77);
    near(s.shield.hp, 9687.5, 1e-6);
    near(s.shield.ehp, 24428.68);
    near(s.armor.hp, 2625, 1e-6);
    near(s.armor.ehp, 4692.74);
    near(s.hull.hp, 2125, 1e-6);
    near(s.hull.ehp, 3171.64);
    near(s.ehp, 32293.06);
    near(stablePct('tengu'), 90.82, 1e-4);
    near(s.capacitorCapacity, 1875, 1e-6);
    near(s.navigation.maxVelocity, 244.375, 1e-6);
    near(align('tengu'), 4.3793);
    near(s.targeting.maxTargetRange, 117187.5, 1e-6);
  });
});
