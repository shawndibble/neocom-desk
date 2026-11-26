import { targetResists, type TargetProfile, type TargetResists } from './targetProfile';
import type { PerDamageType } from './types';

export type DamageSplit = PerDamageType;

const EVEN_SPLIT: DamageSplit = { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 };

interface TrackingWeapon {
  dps: number;
  optimal: number;
  falloff: number;
  tracking: number;
  optimalSigRadius: number;
}

interface DamageTyped {
  reloadDuty?: number;
  damage?: DamageSplit;
}

export type AppliedWeapon = DamageTyped &
  (
    | ({ kind: 'turret' } & TrackingWeapon)
    | {
        kind: 'missile';
        dps: number;
        range: number;
        explosionRadius: number;
        explosionVelocity: number;
        damageReductionFactor: number;
      }
    | ({
        kind: 'drone';
        speed: number;
      } & TrackingWeapon)
    | {
        kind: 'area';
        dps: number;
        range: number;
      }
    | {
        kind: 'fighter';
        dps: number;
      }
  );

export interface AppliedDpsInputs {
  weapons: AppliedWeapon[];
  droneControlRange: number;
}

export interface AppliedDpsPoint {
  x: number;
  dps: number;
}

export function isMobileDrone(speed: number): boolean {
  return speed > 1;
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
      const keepsUp = isMobileDrone(weapon.speed) && weapon.speed >= target.velocity;
      const hitChance = keepsUp ? 1 : turretHitChance(weapon, target, distance);
      return weapon.dps * turretDamageMultiplier(hitChance);
    }
    case 'area':
      return distance > weapon.range ? 0 : weapon.dps;
    case 'fighter':
      return weapon.dps;
  }
}

function throughResists(split: DamageSplit, resists: TargetResists): number {
  return (
    split.em * (1 - resists.em) +
    split.thermal * (1 - resists.thermal) +
    split.kinetic * (1 - resists.kinetic) +
    split.explosive * (1 - resists.explosive)
  );
}

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

export function sustainedInputs(inputs: AppliedDpsInputs): AppliedDpsInputs {
  return {
    ...inputs,
    weapons: inputs.weapons.map((w) =>
      w.reloadDuty !== undefined && w.reloadDuty < 1 ? { ...w, dps: w.dps * w.reloadDuty } : w
    ),
  };
}

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
    case 'area':
      return weapon.range;
    case 'drone':
      return droneControlRange;
    case 'fighter':
      return 0;
  }
}

const RANGE_ROUNDING = 5000;

export function graphMaxRange(fits: readonly AppliedDpsInputs[]): number {
  const reach = Math.max(
    0,
    ...fits.flatMap((fit) => fit.weapons.map((w) => weaponReach(w, fit.droneControlRange)))
  );
  const axis =
    reach > 0
      ? reach
      : Math.max(
          0,
          ...fits.filter((fit) => fit.weapons.length > 0).map((f) => f.droneControlRange)
        );
  return Math.ceil((axis * 1.1) / RANGE_ROUNDING) * RANGE_ROUNDING;
}

export function bestRange(points: readonly AppliedDpsPoint[]): number {
  let best: AppliedDpsPoint | null = null;
  for (const point of points) if (best === null || point.dps >= best.dps) best = point;
  return best?.x ?? 0;
}

const SPEED_ROUNDING = 500;

export function graphMaxSpeed(target: TargetProfile): number {
  return Math.max(1000, Math.ceil((target.velocity * 2) / SPEED_ROUNDING) * SPEED_ROUNDING);
}
