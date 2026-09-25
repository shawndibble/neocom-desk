/**
 * Applied DPS against a Target Profile (issue #1546) — our own math on top
 * of the engine's per-weapon raw DPS and attributes (ADR 0016: anything
 * beyond what the engine computes is our addition, and labelled as such).
 * Pure. Assumes a stationary shooter and a target moving fully transversal
 * at the profile's speed, the same simplification Pyfa's graphs default to.
 *
 * - Turrets: EVE's chance-to-hit, `0.5 ^ (trackingTerm² + rangeTerm²)`, then
 *   the average hit-quality multiplier including 1% wrecking shots — so a
 *   certain hit averages ~1.015× the listed volley, as in game and in Pyfa.
 * - Missiles: all-or-nothing on flight range, then
 *   `min(1, S/E, (S/E · Ve/Vt)^drf)`.
 * - Drones: nothing past drone control range; a mobile drone at least as
 *   fast as its target is assumed to keep up and always hit (Pyfa's "auto"
 *   mode), one slower than it — or a sentry — tracks like a turret on the ship.
 * - Then the target's resists: each damage type the weapon deals is taken
 *   down by the target's resist to it.
 */
import { targetResists, type TargetProfile, type TargetResists } from './targetProfile';

/** A weapon's damage split by type, as shares summing to 1. */
export type DamageSplit = TargetResists;

/** A weapon whose damage types aren't known counts as an even split. */
const EVEN_SPLIT: DamageSplit = { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 };

interface TrackingWeapon {
  /** Raw DPS, no reload. */
  dps: number;
  /** Metres. */
  optimal: number;
  /** Metres. */
  falloff: number;
  /** Radians per second. */
  tracking: number;
  /** Metres. */
  optimalSigRadius: number;
}

interface DamageTyped {
  /** How its damage splits by type — what the target's resists bite on. Absent: an even split. */
  damage?: DamageSplit;
}

export type AppliedWeapon = DamageTyped &
  (
    | ({ kind: 'turret' } & TrackingWeapon)
    | {
        kind: 'missile';
        dps: number;
        /** Metres — flight speed × flight time. */
        range: number;
        explosionRadius: number;
        explosionVelocity: number;
        damageReductionFactor: number;
      }
    | ({
        kind: 'drone';
        /** m/s; 0 for a sentry. */
        speed: number;
      } & TrackingWeapon)
  );

/** Everything applied DPS needs from one calculated Fitting. */
export interface AppliedDpsInputs {
  /** Only weapons actually firing: active/overloaded modules, launched drones (their stack's DPS). */
  weapons: AppliedWeapon[];
  /** Metres. */
  droneControlRange: number;
}

export interface AppliedDpsPoint {
  /** Metres for a range graph, m/s for a speed graph. */
  x: number;
  dps: number;
}

export function turretHitChance(
  weapon: TrackingWeapon,
  target: TargetProfile,
  distance: number
): number {
  let trackingTerm = 0;
  if (target.velocity > 0) {
    if (distance <= 0 || weapon.tracking <= 0) return 0;
    const angular = target.velocity / distance;
    trackingTerm = (angular * weapon.optimalSigRadius) / (weapon.tracking * target.signatureRadius);
  }
  const rangeTerm =
    weapon.falloff > 0
      ? Math.max(0, distance - weapon.optimal) / weapon.falloff
      : distance > weapon.optimal
        ? Infinity
        : 0;
  return 0.5 ** (trackingTerm ** 2 + rangeTerm ** 2);
}

/** Average damage per shot relative to the listed volley, for a given chance to hit. */
export function turretDamageMultiplier(hitChance: number): number {
  const wreckingChance = Math.min(hitChance, 0.01);
  const normalChance = hitChance - wreckingChance;
  const normalPart = normalChance > 0 ? normalChance * ((0.01 + hitChance) / 2 + 0.49) : 0;
  return normalPart + wreckingChance * 3;
}

export function missileApplication(
  weapon: Extract<AppliedWeapon, { kind: 'missile' }>,
  target: TargetProfile
): number {
  const sigTerm = target.signatureRadius / weapon.explosionRadius;
  if (target.velocity <= 0) return Math.min(1, sigTerm);
  const velocityTerm =
    (sigTerm * (weapon.explosionVelocity / target.velocity)) ** weapon.damageReductionFactor;
  return Math.min(1, sigTerm, velocityTerm);
}

function weaponAppliedDps(
  weapon: AppliedWeapon,
  target: TargetProfile,
  distance: number,
  droneControlRange: number
): number {
  switch (weapon.kind) {
    case 'turret':
      return weapon.dps * turretDamageMultiplier(turretHitChance(weapon, target, distance));
    case 'missile':
      return distance > weapon.range ? 0 : weapon.dps * missileApplication(weapon, target);
    case 'drone': {
      if (distance > droneControlRange) return 0;
      // Pyfa's own threshold for "mobile": a sentry's speed reads 0.
      const keepsUp = weapon.speed > 1 && weapon.speed >= target.velocity;
      const hitChance = keepsUp ? 1 : turretHitChance(weapon, target, distance);
      return weapon.dps * turretDamageMultiplier(hitChance);
    }
  }
}

/** The share of a weapon's damage that gets through the target's resists. */
function throughResists(split: DamageSplit, resists: TargetResists): number {
  return (
    split.em * (1 - resists.em) +
    split.thermal * (1 - resists.thermal) +
    split.kinetic * (1 - resists.kinetic) +
    split.explosive * (1 - resists.explosive)
  );
}

/** Applied DPS against `target` at `distance` metres, after its resists. */
export function appliedDps(
  inputs: AppliedDpsInputs,
  target: TargetProfile,
  distance: number
): number {
  const resists = targetResists(target);
  return inputs.weapons.reduce(
    (sum, weapon) =>
      sum +
      weaponAppliedDps(weapon, target, distance, inputs.droneControlRange) *
        throughResists(weapon.damage ?? EVEN_SPLIT, resists),
    0
  );
}

/** The firing weapons' listed DPS — untouched by any Target Profile. */
export function rawDps(inputs: AppliedDpsInputs): number {
  return inputs.weapons.reduce((sum, weapon) => sum + weapon.dps, 0);
}

function sample(max: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => (max * i) / steps);
}

export function appliedDpsVsRange(
  inputs: AppliedDpsInputs,
  target: TargetProfile,
  maxRange: number,
  steps = 60
): AppliedDpsPoint[] {
  return sample(maxRange, steps).map((x) => ({ x, dps: appliedDps(inputs, target, x) }));
}

/** Applied DPS as the target's speed runs from 0 to `maxSpeed`, at a fixed `distance`. */
export function appliedDpsVsSpeed(
  inputs: AppliedDpsInputs,
  target: TargetProfile,
  distance: number,
  maxSpeed: number,
  steps = 60
): AppliedDpsPoint[] {
  return sample(maxSpeed, steps).map((x) => ({
    x,
    dps: appliedDps(inputs, { ...target, velocity: x }, distance),
  }));
}

function weaponReach(weapon: AppliedWeapon, droneControlRange: number): number {
  switch (weapon.kind) {
    case 'turret':
      return weapon.optimal + 3 * weapon.falloff;
    case 'missile':
      return weapon.range;
    case 'drone':
      return droneControlRange;
  }
}

const RANGE_ROUNDING = 5000;

/**
 * A range axis every fit in `fits` reaches across: 10% past the longest
 * weapon's reach (a turret's optimal + 3 falloffs, where it's down to ~0.2%),
 * rounded up to a whole 5 km. 0 when nothing fires.
 */
export function graphMaxRange(fits: readonly AppliedDpsInputs[]): number {
  const reach = Math.max(
    0,
    ...fits.flatMap((fit) => fit.weapons.map((w) => weaponReach(w, fit.droneControlRange)))
  );
  return Math.ceil((reach * 1.1) / RANGE_ROUNDING) * RANGE_ROUNDING;
}

/**
 * The range a sampled range graph peaks at, 0 for an empty graph. On a tie —
 * a missile's or a keeping-up drone's flat line — the far end, so a speed
 * graph worked out there isn't pinned at 0 m, where no turret ever hits a
 * moving target.
 */
export function bestRange(points: readonly AppliedDpsPoint[]): number {
  let best: AppliedDpsPoint | null = null;
  for (const point of points) if (best === null || point.dps >= best.dps) best = point;
  return best?.x ?? 0;
}

const SPEED_ROUNDING = 500;

/** A speed axis that shows the profile's own speed with room either side: twice it, at least 1000 m/s. */
export function graphMaxSpeed(target: TargetProfile): number {
  return Math.max(1000, Math.ceil((target.velocity * 2) / SPEED_ROUNDING) * SPEED_ROUNDING);
}
