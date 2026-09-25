import { resistPct } from './stats';
import type { FittingStats } from './types';

/** Every numeric stat the variations panel can report changed. */
export type FittingStatKey =
  | 'cpuUsed'
  | 'cpuTotal'
  | 'powergridUsed'
  | 'powergridTotal'
  | 'calibrationUsed'
  | 'calibrationTotal'
  | 'droneDps'
  | 'droneBandwidthUsed'
  | 'droneBandwidthTotal'
  | 'droneCapacity'
  | 'ehp'
  | 'capacitorCapacity'
  | 'capacitorRechargeTime'
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
  | 'signatureRadius'
  | 'maxVelocity'
  | 'agility'
  | 'mass'
  | 'warpSpeed';

/** `capacitor` is a discriminated union (`CapacitorStatus`), handled separately from the plain-numeric fields below — see `capacitorChange`. */
export type StatChangeKey = FittingStatKey | 'capacitor';

/** Displayed value and rounding for one stat — matches `FittingStatsSections`' own `toFixed` calls, so a change invisible on screen never counts as "changed" here. */
interface NumericField {
  key: FittingStatKey;
  digits: number;
  value: (stats: FittingStats) => number;
}

const NUMERIC_FIELDS: readonly NumericField[] = [
  { key: 'cpuUsed', digits: 1, value: (s) => s.cpuUsed },
  { key: 'cpuTotal', digits: 1, value: (s) => s.cpuTotal },
  { key: 'powergridUsed', digits: 1, value: (s) => s.powergridUsed },
  { key: 'powergridTotal', digits: 1, value: (s) => s.powergridTotal },
  { key: 'calibrationUsed', digits: 0, value: (s) => s.calibrationUsed },
  { key: 'calibrationTotal', digits: 0, value: (s) => s.calibrationTotal },
  { key: 'droneDps', digits: 1, value: (s) => s.droneDps },
  { key: 'droneBandwidthUsed', digits: 0, value: (s) => s.droneBandwidthUsed },
  { key: 'droneBandwidthTotal', digits: 0, value: (s) => s.droneBandwidthTotal },
  { key: 'droneCapacity', digits: 0, value: (s) => s.droneCapacity },
  { key: 'ehp', digits: 0, value: (s) => s.ehp },
  { key: 'capacitorCapacity', digits: 0, value: (s) => s.capacitorCapacity },
  { key: 'capacitorRechargeTime', digits: 0, value: (s) => s.capacitorRechargeTime / 1000 },
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
  { key: 'signatureRadius', digits: 0, value: (s) => s.targeting.signatureRadius },
  { key: 'maxVelocity', digits: 0, value: (s) => s.navigation.maxVelocity },
  { key: 'agility', digits: 3, value: (s) => s.navigation.agility },
  { key: 'mass', digits: 0, value: (s) => s.navigation.mass / 1000 },
  { key: 'warpSpeed', digits: 1, value: (s) => s.navigation.warpSpeed },
];

export interface StatChange {
  key: StatChangeKey;
  before: number;
  after: number;
}

export interface FittingStatsDelta {
  changes: StatChange[];
  count: number;
}

/** Same rounding `diffFittingStats` compares at — for a UI formatting a `StatChange`'s before/after/delta consistently with the count it's part of. */
export const STAT_DIGITS: Readonly<Record<StatChangeKey, number>> = {
  ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, field.digits])),
  capacitor: 0,
} as Readonly<Record<StatChangeKey, number>>;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Capacitor is a discriminated union, not a plain number, so it sits outside
 * `NUMERIC_FIELDS`. `before`/`after` hold a negated depletion time on the
 * unstable side so it never collides with a stable percentage's positive range.
 */
function capacitorChange(before: FittingStats, after: FittingStats): StatChange | null {
  const metric = (capacitor: FittingStats['capacitor']) =>
    capacitor.stable ? capacitor.stablePercentage : -capacitor.depletesInSeconds;

  if (before.capacitor.stable !== after.capacitor.stable) {
    return { key: 'capacitor', before: metric(before.capacitor), after: metric(after.capacitor) };
  }
  const b = round(metric(before.capacitor), 0);
  const a = round(metric(after.capacitor), 0);
  return b === a ? null : { key: 'capacitor', before: b, after: a };
}

/** Every stat that differs, at the same rounding `FittingStatsSections` displays it at, so the count always matches what's on screen. */
export function diffFittingStats(before: FittingStats, after: FittingStats): FittingStatsDelta {
  const changes: StatChange[] = [];
  for (const field of NUMERIC_FIELDS) {
    const b = round(field.value(before), field.digits);
    const a = round(field.value(after), field.digits);
    if (b !== a) changes.push({ key: field.key, before: b, after: a });
  }
  const cap = capacitorChange(before, after);
  if (cap) changes.push(cap);
  return { changes, count: changes.length };
}
