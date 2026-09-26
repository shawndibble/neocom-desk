/**
 * The stat field table every Fitting-diff view shares: which numeric stats
 * exist, their accessor, and the rounding each displays at — so a stat that
 * reads identically on screen never counts as "changed" in any of them.
 * Neutral home for `variationDelta.ts` (2-way before/after) and
 * `fittingCompare.ts` (N-way compare) to both import from.
 */
import { resistPct } from './stats';
import type { FittingStats } from './types';

/** Every numeric stat a Fitting-diff view can report changed. */
export type FittingStatKey =
  | 'cpuUsed'
  | 'cpuTotal'
  | 'powergridUsed'
  | 'powergridTotal'
  | 'calibrationUsed'
  | 'calibrationTotal'
  | 'totalDps'
  | 'totalVolley'
  | 'overheatedDps'
  | 'droneDps'
  | 'droneBandwidthUsed'
  | 'droneBandwidthTotal'
  | 'droneCapacity'
  | 'ehp'
  | 'shieldRepair'
  | 'armorRepair'
  | 'hullRepair'
  | 'burstTank'
  | 'sustainedTank'
  | 'capacitorCapacity'
  | 'capacitorRechargeTime'
  | 'capacitorDelta'
  | 'shieldHp'
  | 'shieldEmResonance'
  | 'shieldThermalResonance'
  | 'shieldKineticResonance'
  | 'shieldExplosiveResonance'
  | 'armorHp'
  | 'armorEmResonance'
  | 'armorThermalResonance'
  | 'armorKineticResonance'
  | 'armorExplosiveResonance'
  | 'hullHp'
  | 'hullEmResonance'
  | 'hullThermalResonance'
  | 'hullKineticResonance'
  | 'hullExplosiveResonance'
  | 'maxTargetRange'
  | 'maxLockedTargets'
  | 'scanResolution'
  | 'sensorStrength'
  | 'signatureRadius'
  | 'maxVelocity'
  | 'agility'
  | 'mass'
  | 'warpSpeed'
  | 'cargoCapacity';

/** `capacitor` is a discriminated union (`CapacitorStatus`), handled separately from the plain-numeric fields below. */
export type StatChangeKey = FittingStatKey | 'capacitor';

/** Displayed value and rounding for one stat — matches `FittingStatsSections`' own `toFixed` calls. */
export interface NumericField {
  key: FittingStatKey;
  digits: number;
  value: (stats: FittingStats) => number;
  /**
   * Only Fitting Compare shows it; a Variations swap's diff lists what it
   * always has. Overheated DPS because Variations is worked out without heat
   * (it would only repeat total DPS); the tank, cap-delta, sensor and hold
   * rows because they restate a field the diff already shows (the repairs,
   * the capacitor) or are no module swap's question (the hold).
   */
  compareOnly?: boolean;
}

export const NUMERIC_FIELDS: readonly NumericField[] = [
  { key: 'cpuUsed', digits: 1, value: (s) => s.cpuUsed },
  { key: 'cpuTotal', digits: 1, value: (s) => s.cpuTotal },
  { key: 'powergridUsed', digits: 1, value: (s) => s.powergridUsed },
  { key: 'powergridTotal', digits: 1, value: (s) => s.powergridTotal },
  { key: 'calibrationUsed', digits: 0, value: (s) => s.calibrationUsed },
  { key: 'calibrationTotal', digits: 0, value: (s) => s.calibrationTotal },
  { key: 'totalDps', digits: 1, value: (s) => s.offense.dps },
  { key: 'totalVolley', digits: 0, value: (s) => s.offense.volley },
  // Nothing to overheat reads as its plain DPS, so every column has a figure.
  {
    key: 'overheatedDps',
    digits: 1,
    value: (s) => s.offense.overheated?.dps ?? s.offense.dps,
    compareOnly: true,
  },
  { key: 'droneDps', digits: 1, value: (s) => s.droneDps },
  { key: 'droneBandwidthUsed', digits: 0, value: (s) => s.droneBandwidthUsed },
  { key: 'droneBandwidthTotal', digits: 0, value: (s) => s.droneBandwidthTotal },
  { key: 'droneCapacity', digits: 0, value: (s) => s.droneCapacity },
  { key: 'ehp', digits: 0, value: (s) => s.ehp },
  { key: 'shieldRepair', digits: 1, value: (s) => s.repair.shield },
  { key: 'armorRepair', digits: 1, value: (s) => s.repair.armor },
  { key: 'hullRepair', digits: 1, value: (s) => s.repair.hull },
  { key: 'burstTank', digits: 1, value: (s) => s.tank.burstEffective, compareOnly: true },
  {
    key: 'sustainedTank',
    digits: 1,
    value: (s) => s.tank.sustainedEffective,
    compareOnly: true,
  },
  { key: 'capacitorCapacity', digits: 0, value: (s) => s.capacitorCapacity },
  { key: 'capacitorRechargeTime', digits: 0, value: (s) => s.capacitorRechargeTime / 1000 },
  {
    key: 'capacitorDelta',
    digits: 1,
    value: (s) => s.capacitorBudget.delta,
    compareOnly: true,
  },
  { key: 'shieldHp', digits: 0, value: (s) => s.shield.hp },
  { key: 'shieldEmResonance', digits: 0, value: (s) => resistPct(s.shield.emResonance) },
  { key: 'shieldThermalResonance', digits: 0, value: (s) => resistPct(s.shield.thermalResonance) },
  { key: 'shieldKineticResonance', digits: 0, value: (s) => resistPct(s.shield.kineticResonance) },
  {
    key: 'shieldExplosiveResonance',
    digits: 0,
    value: (s) => resistPct(s.shield.explosiveResonance),
  },
  { key: 'armorHp', digits: 0, value: (s) => s.armor.hp },
  { key: 'armorEmResonance', digits: 0, value: (s) => resistPct(s.armor.emResonance) },
  { key: 'armorThermalResonance', digits: 0, value: (s) => resistPct(s.armor.thermalResonance) },
  { key: 'armorKineticResonance', digits: 0, value: (s) => resistPct(s.armor.kineticResonance) },
  {
    key: 'armorExplosiveResonance',
    digits: 0,
    value: (s) => resistPct(s.armor.explosiveResonance),
  },
  { key: 'hullHp', digits: 0, value: (s) => s.hull.hp },
  { key: 'hullEmResonance', digits: 0, value: (s) => resistPct(s.hull.emResonance) },
  { key: 'hullThermalResonance', digits: 0, value: (s) => resistPct(s.hull.thermalResonance) },
  { key: 'hullKineticResonance', digits: 0, value: (s) => resistPct(s.hull.kineticResonance) },
  { key: 'hullExplosiveResonance', digits: 0, value: (s) => resistPct(s.hull.explosiveResonance) },
  { key: 'maxTargetRange', digits: 1, value: (s) => s.targeting.maxTargetRange / 1000 },
  { key: 'maxLockedTargets', digits: 0, value: (s) => s.targeting.maxLockedTargets },
  { key: 'scanResolution', digits: 0, value: (s) => s.targeting.scanResolution },
  { key: 'sensorStrength', digits: 1, value: (s) => s.sensor.strength, compareOnly: true },
  { key: 'signatureRadius', digits: 0, value: (s) => s.targeting.signatureRadius },
  { key: 'maxVelocity', digits: 0, value: (s) => s.navigation.maxVelocity },
  { key: 'agility', digits: 3, value: (s) => s.navigation.agility },
  { key: 'mass', digits: 0, value: (s) => s.navigation.mass / 1000 },
  { key: 'warpSpeed', digits: 1, value: (s) => s.navigation.warpSpeed },
  { key: 'cargoCapacity', digits: 0, value: (s) => s.holds.cargo, compareOnly: true },
];

/** Same rounding every diff view compares/displays at, keyed by `StatChangeKey` including `capacitor`. */
export const STAT_DIGITS: Readonly<Record<StatChangeKey, number>> = {
  ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, field.digits])),
  capacitor: 0,
} as Readonly<Record<StatChangeKey, number>>;

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
