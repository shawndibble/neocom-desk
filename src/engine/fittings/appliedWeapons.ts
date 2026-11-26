import type { AppliedDpsInputs, AppliedWeapon, DamageSplit } from './appliedDps';
import { weaponReloadDuty } from './tank';
import type { WeaponRange } from './types';

export const APPLIED_DPS_ATTRIBUTE = {
  dps: -12,
  optimal: 54,
  smartbombRange: 99,
  falloff: 158,
  tracking: 160,
  optimalSigRadius: 620,
  maxVelocity: 37,
  explosionDelay: 281,
  explosionRadius: 654,
  explosionVelocity: 653,
  damageReductionFactor: 1353,
  droneControlRange: 458,
  emDamage: 114,
  explosiveDamage: 116,
  kineticDamage: 117,
  thermalDamage: 118,
  fighterAttackEmDamage: 2227,
  fighterAttackThermalDamage: 2228,
  fighterAttackKineticDamage: 2229,
  fighterAttackExplosiveDamage: 2230,
  fighterTurretEmDamage: 2171,
  fighterTurretThermalDamage: 2172,
  fighterTurretKineticDamage: 2173,
  fighterTurretExplosiveDamage: 2174,
} as const;

export const DEFAULT_DRONE_CONTROL_RANGE = 20000;

interface AttributeMap {
  get(attributeId: number): { value: number } | undefined;
}

interface FitItemLike {
  slot: { type: string };
  state: string;
  quantity?: number;
}

interface ItemResultLike {
  attributes: AttributeMap;
  state: string;
  charge?: { attributes: AttributeMap };
}

function read(attributes: AttributeMap, id: number): number {
  return attributes.get(id)?.value ?? 0;
}

function trackingOf(attributes: AttributeMap) {
  return {
    optimal: read(attributes, APPLIED_DPS_ATTRIBUTE.optimal),
    falloff: read(attributes, APPLIED_DPS_ATTRIBUTE.falloff),
    tracking: read(attributes, APPLIED_DPS_ATTRIBUTE.tracking),
    optimalSigRadius: read(attributes, APPLIED_DPS_ATTRIBUTE.optimalSigRadius),
  };
}

const PLAIN_DAMAGE = {
  em: APPLIED_DPS_ATTRIBUTE.emDamage,
  thermal: APPLIED_DPS_ATTRIBUTE.thermalDamage,
  kinetic: APPLIED_DPS_ATTRIBUTE.kineticDamage,
  explosive: APPLIED_DPS_ATTRIBUTE.explosiveDamage,
};
const FIGHTER_ATTACK_DAMAGE = {
  em: APPLIED_DPS_ATTRIBUTE.fighterAttackEmDamage,
  thermal: APPLIED_DPS_ATTRIBUTE.fighterAttackThermalDamage,
  kinetic: APPLIED_DPS_ATTRIBUTE.fighterAttackKineticDamage,
  explosive: APPLIED_DPS_ATTRIBUTE.fighterAttackExplosiveDamage,
};
const FIGHTER_TURRET_DAMAGE = {
  em: APPLIED_DPS_ATTRIBUTE.fighterTurretEmDamage,
  thermal: APPLIED_DPS_ATTRIBUTE.fighterTurretThermalDamage,
  kinetic: APPLIED_DPS_ATTRIBUTE.fighterTurretKineticDamage,
  explosive: APPLIED_DPS_ATTRIBUTE.fighterTurretExplosiveDamage,
};

function damageSplit(
  attributes: AttributeMap | undefined,
  ids: Record<keyof DamageSplit, number> = PLAIN_DAMAGE
): { damage?: DamageSplit } {
  if (!attributes) return {};
  const em = read(attributes, ids.em);
  const thermal = read(attributes, ids.thermal);
  const kinetic = read(attributes, ids.kinetic);
  const explosive = read(attributes, ids.explosive);
  const total = em + thermal + kinetic + explosive;
  if (total <= 0) return {};
  return {
    damage: {
      em: em / total,
      thermal: thermal / total,
      kinetic: kinetic / total,
      explosive: explosive / total,
    },
  };
}

export function chargeDamageSplit(charge: AttributeMap | undefined): DamageSplit | null {
  return damageSplit(charge).damage ?? null;
}

function missileFlightRange(charge: AttributeMap): number {
  return (
    read(charge, APPLIED_DPS_ATTRIBUTE.maxVelocity) *
    (read(charge, APPLIED_DPS_ATTRIBUTE.explosionDelay) / 1000)
  );
}

function chargeFlightRange(charge: AttributeMap | undefined): number {
  return charge && !isMissile(charge) ? missileFlightRange(charge) : 0;
}

function isMissile(charge: AttributeMap | undefined): charge is AttributeMap {
  return charge !== undefined && read(charge, APPLIED_DPS_ATTRIBUTE.explosionRadius) > 0;
}

export function weaponRange(attributes: AttributeMap, charge?: AttributeMap): WeaponRange | null {
  if (isMissile(charge)) return { optimal: missileFlightRange(charge), falloff: 0 };
  if (read(attributes, APPLIED_DPS_ATTRIBUTE.tracking) > 0) {
    const { optimal, falloff } = trackingOf(attributes);
    return { optimal, falloff };
  }
  const reach = areaRange(attributes, charge);
  return reach > 0 ? { optimal: reach, falloff: 0 } : null;
}

export function droneSpeed(attributes: AttributeMap): number {
  return read(attributes, APPLIED_DPS_ATTRIBUTE.maxVelocity);
}

function areaRange(attributes: AttributeMap, charge?: AttributeMap): number {
  return (
    read(attributes, APPLIED_DPS_ATTRIBUTE.smartbombRange) ||
    read(attributes, APPLIED_DPS_ATTRIBUTE.optimal) ||
    chargeFlightRange(charge)
  );
}

function moduleWeapon(result: ItemResultLike): AppliedWeapon | null {
  if (result.state !== 'active' && result.state !== 'overload') return null;
  const dps = read(result.attributes, APPLIED_DPS_ATTRIBUTE.dps);
  if (dps <= 0) return null;
  const charge = result.charge?.attributes;
  const duty = weaponReloadDuty(result.attributes, false);
  const reload = duty < 1 ? { reloadDuty: duty } : {};
  if (isMissile(charge)) {
    return {
      kind: 'missile',
      dps,
      ...reload,
      range: missileFlightRange(charge),
      explosionRadius: read(charge, APPLIED_DPS_ATTRIBUTE.explosionRadius),
      explosionVelocity: read(charge, APPLIED_DPS_ATTRIBUTE.explosionVelocity),
      damageReductionFactor: read(charge, APPLIED_DPS_ATTRIBUTE.damageReductionFactor),
      ...damageSplit(charge),
    };
  }
  if (read(result.attributes, APPLIED_DPS_ATTRIBUTE.tracking) > 0) {
    return {
      kind: 'turret',
      dps,
      ...reload,
      ...trackingOf(result.attributes),
      ...damageSplit(charge),
    };
  }
  if (isMissile(result.attributes) && read(result.attributes, APPLIED_DPS_ATTRIBUTE.optimal) > 0) {
    return {
      kind: 'missile',
      dps,
      range: read(result.attributes, APPLIED_DPS_ATTRIBUTE.optimal),
      explosionRadius: read(result.attributes, APPLIED_DPS_ATTRIBUTE.explosionRadius),
      explosionVelocity: read(result.attributes, APPLIED_DPS_ATTRIBUTE.explosionVelocity),
      damageReductionFactor: read(result.attributes, APPLIED_DPS_ATTRIBUTE.damageReductionFactor),
      ...damageSplit(charge ?? result.attributes),
    };
  }
  const range = areaRange(result.attributes, charge);
  if (range > 0) {
    const own = damageSplit(charge);
    return { kind: 'area', dps, range, ...(own.damage ? own : damageSplit(result.attributes)) };
  }
  return null;
}

export function extractAppliedDpsInputs(
  items: readonly FitItemLike[],
  results: readonly ItemResultLike[],
  characterAttributes: AttributeMap
): AppliedDpsInputs {
  const weapons: AppliedWeapon[] = [];
  items.forEach((item, index) => {
    const result = results[index];
    if (!result) return;
    if (item.slot.type === 'drone_bay') {
      if (item.state !== 'active') return;
      const perDrone = read(result.attributes, APPLIED_DPS_ATTRIBUTE.dps);
      if (perDrone <= 0) return;
      weapons.push({
        kind: 'drone',
        dps: perDrone * (item.quantity ?? 1),
        speed: droneSpeed(result.attributes),
        ...trackingOf(result.attributes),
        ...damageSplit(result.attributes),
      });
      return;
    }
    if (item.slot.type === 'fighter_tube') {
      if (item.state !== 'active') return;
      const perFighter = read(result.attributes, APPLIED_DPS_ATTRIBUTE.dps);
      if (perFighter <= 0) return;
      const split = damageSplit(result.attributes, FIGHTER_ATTACK_DAMAGE);
      weapons.push({
        kind: 'fighter',
        dps: perFighter * (item.quantity ?? 1),
        ...(split.damage ? split : damageSplit(result.attributes, FIGHTER_TURRET_DAMAGE)),
      });
      return;
    }
    if (item.slot.type === 'cargo' || item.slot.type === 'fighter_bay') return;
    const weapon = moduleWeapon(result);
    if (weapon) weapons.push(weapon);
  });
  return {
    weapons,
    droneControlRange:
      read(characterAttributes, APPLIED_DPS_ATTRIBUTE.droneControlRange) ||
      DEFAULT_DRONE_CONTROL_RANGE,
  };
}
