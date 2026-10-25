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
  | 'sustainedDps'
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
export type StatChangeKey = FittingStatKey | 'capacitor' | ImproveDamageKey;

/**
 * The damage figure an Improve row leads with, which no Fitting-diff view
 * lists: DPS applied to a Target Profile, or the fit's sustained DPS with its
 * drones and fighters. Not in `NUMERIC_FIELDS`, so no diff ever reports them.
 */
export type ImproveDamageKey = 'appliedDps' | 'sustainedDamage';

/** Which way a change is an improvement; `neutral` stats only move with the hull, so no change is good or bad. */
export type StatDirection = 'higher' | 'lower' | 'neutral';

/** Displayed value and rounding for one stat — matches `FittingStatsSections`' own `toFixed` calls. */
export interface NumericField {
  key: FittingStatKey;
  direction: StatDirection;
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
  { key: 'cpuUsed', direction: 'lower', digits: 1, value: (s) => s.cpuUsed },
  { key: 'cpuTotal', direction: 'neutral', digits: 1, value: (s) => s.cpuTotal },
  { key: 'powergridUsed', direction: 'lower', digits: 1, value: (s) => s.powergridUsed },
  { key: 'powergridTotal', direction: 'neutral', digits: 1, value: (s) => s.powergridTotal },
  { key: 'calibrationUsed', direction: 'lower', digits: 0, value: (s) => s.calibrationUsed },
  { key: 'calibrationTotal', direction: 'neutral', digits: 0, value: (s) => s.calibrationTotal },
  { key: 'totalDps', direction: 'higher', digits: 1, value: (s) => s.offense.dps },
  { key: 'totalVolley', direction: 'higher', digits: 0, value: (s) => s.offense.volley },
  { key: 'sustainedDps', direction: 'higher', digits: 1, value: (s) => s.offense.sustainedDps },
  // Nothing to overheat reads as its plain DPS, so every column has a figure.
  {
    key: 'overheatedDps',
    direction: 'higher',
    digits: 1,
    value: (s) => s.offense.overheated?.dps ?? s.offense.dps,
    compareOnly: true,
  },
  { key: 'droneDps', direction: 'higher', digits: 1, value: (s) => s.droneDps },
  {
    key: 'droneBandwidthUsed',
    direction: 'neutral',
    digits: 0,
    value: (s) => s.droneBandwidthUsed,
  },
  {
    key: 'droneBandwidthTotal',
    direction: 'neutral',
    digits: 0,
    value: (s) => s.droneBandwidthTotal,
  },
  { key: 'droneCapacity', direction: 'higher', digits: 0, value: (s) => s.droneCapacity },
  { key: 'ehp', direction: 'higher', digits: 0, value: (s) => s.ehp },
  { key: 'shieldRepair', direction: 'higher', digits: 1, value: (s) => s.repair.shield },
  { key: 'armorRepair', direction: 'higher', digits: 1, value: (s) => s.repair.armor },
  { key: 'hullRepair', direction: 'higher', digits: 1, value: (s) => s.repair.hull },
  {
    key: 'burstTank',
    direction: 'higher',
    digits: 1,
    value: (s) => s.tank.burstEffective,
    compareOnly: true,
  },
  {
    key: 'sustainedTank',
    direction: 'higher',
    digits: 1,
    value: (s) => s.tank.sustainedEffective,
    compareOnly: true,
  },
  { key: 'capacitorCapacity', direction: 'higher', digits: 0, value: (s) => s.capacitorCapacity },
  {
    key: 'capacitorRechargeTime',
    direction: 'lower',
    digits: 0,
    value: (s) => s.capacitorRechargeTime / 1000,
  },
  {
    key: 'capacitorDelta',
    direction: 'higher',
    digits: 1,
    value: (s) => s.capacitorBudget.delta,
    compareOnly: true,
  },
  { key: 'shieldHp', direction: 'higher', digits: 0, value: (s) => s.shield.hp },
  {
    key: 'shieldEmResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.shield.emResonance),
  },
  {
    key: 'shieldThermalResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.shield.thermalResonance),
  },
  {
    key: 'shieldKineticResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.shield.kineticResonance),
  },
  {
    key: 'shieldExplosiveResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.shield.explosiveResonance),
  },
  { key: 'armorHp', direction: 'higher', digits: 0, value: (s) => s.armor.hp },
  {
    key: 'armorEmResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.armor.emResonance),
  },
  {
    key: 'armorThermalResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.armor.thermalResonance),
  },
  {
    key: 'armorKineticResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.armor.kineticResonance),
  },
  {
    key: 'armorExplosiveResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.armor.explosiveResonance),
  },
  { key: 'hullHp', direction: 'higher', digits: 0, value: (s) => s.hull.hp },
  {
    key: 'hullEmResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.hull.emResonance),
  },
  {
    key: 'hullThermalResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.hull.thermalResonance),
  },
  {
    key: 'hullKineticResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.hull.kineticResonance),
  },
  {
    key: 'hullExplosiveResonance',
    direction: 'higher',
    digits: 0,
    value: (s) => resistPct(s.hull.explosiveResonance),
  },
  {
    key: 'maxTargetRange',
    direction: 'higher',
    digits: 1,
    value: (s) => s.targeting.maxTargetRange / 1000,
  },
  {
    key: 'maxLockedTargets',
    direction: 'higher',
    digits: 0,
    value: (s) => s.targeting.maxLockedTargets,
  },
  {
    key: 'scanResolution',
    direction: 'higher',
    digits: 0,
    value: (s) => s.targeting.scanResolution,
  },
  {
    key: 'sensorStrength',
    direction: 'higher',
    digits: 1,
    value: (s) => s.sensor.strength,
    compareOnly: true,
  },
  {
    key: 'signatureRadius',
    direction: 'lower',
    digits: 0,
    value: (s) => s.targeting.signatureRadius,
  },
  { key: 'maxVelocity', direction: 'higher', digits: 0, value: (s) => s.navigation.maxVelocity },
  { key: 'agility', direction: 'lower', digits: 3, value: (s) => s.navigation.agility },
  { key: 'mass', direction: 'lower', digits: 0, value: (s) => s.navigation.mass / 1000 },
  { key: 'warpSpeed', direction: 'higher', digits: 1, value: (s) => s.navigation.warpSpeed },
  {
    key: 'cargoCapacity',
    direction: 'higher',
    digits: 0,
    value: (s) => s.holds.cargo,
    compareOnly: true,
  },
];

/** Same rounding every diff view compares/displays at, keyed by `StatChangeKey` including `capacitor`. */
export const STAT_DIGITS: Readonly<Record<StatChangeKey, number>> = {
  ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, field.digits])),
  capacitor: 0,
  appliedDps: 1,
  sustainedDamage: 1,
} as Readonly<Record<StatChangeKey, number>>;

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Better direction per stat. The capacitor is compared on the metric
 * `diffFittingStats` stores, where stable (a positive %) beats unstable
 * (a negated depletion time), then a higher %, then a longer depletion.
 */
export const STAT_DIRECTION: Readonly<Record<StatChangeKey, StatDirection>> = {
  ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, field.direction])),
  capacitor: 'higher',
  appliedDps: 'higher',
  sustainedDamage: 'higher',
} as Readonly<Record<StatChangeKey, StatDirection>>;

/** Role stats (`skillGains`) where less is better: a reload, a fuel bill. Absent: higher. */
const LOWER_ROLE_KEYS: ReadonlySet<string> = new Set(['burstReload', 'coreFuel']);

export function statDirection(key: string): StatDirection {
  if (key in STAT_DIRECTION) return STAT_DIRECTION[key as StatChangeKey];
  return LOWER_ROLE_KEYS.has(key) ? 'lower' : 'higher';
}

export type ChangeVerdict = 'better' | 'worse' | 'neutral';

/** Whether a before → after change is an improvement, by the stat's own direction. */
export function changeVerdict(change: {
  key: string;
  before: number;
  after: number;
}): ChangeVerdict {
  const direction = statDirection(change.key);
  if (direction === 'neutral' || change.before === change.after) return 'neutral';
  // Unstable capacitor is stored as a negated depletion time: longer (more negative) is better.
  const unstable = change.key === 'capacitor' && change.before < 0 && change.after < 0;
  const rose = unstable ? change.after < change.before : change.after > change.before;
  return rose === (direction === 'higher') ? 'better' : 'worse';
}
