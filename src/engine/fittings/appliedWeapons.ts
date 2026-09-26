/**
 * Reads the per-weapon inputs applied DPS needs (`appliedDps.ts`) off a
 * calculation — its own table of attribute ids rather than more rows in
 * `types.ts`'s `DOGMA_ATTRIBUTE`, since these are all read per item (module,
 * its loaded charge, a drone) or off the character, never the ship.
 *
 * Ids verified 2026-09-24 by a live run of the pinned engine against a Vexor
 * Navy Issue (Neutron Blaster Cannon II + Antimatter, Warrior IIs) and a
 * Caracal (Heavy Missile Launcher II + Scourge Heavy Missile). `dps` is the
 * patched per-item derived attribute (EVEShipFit/sde-patched `ids.yaml`):
 * DPS without reload, on the turret/launcher item itself (0 unless it's
 * running) and per single drone on a drone stack.
 */
import type { AppliedDpsInputs, AppliedWeapon, DamageSplit } from './appliedDps';

export const APPLIED_DPS_ATTRIBUTE = {
  dps: -12,
  optimal: 54,
  falloff: 158,
  tracking: 160,
  optimalSigRadius: 620,
  maxVelocity: 37,
  /** Missile flight time, ms. */
  explosionDelay: 281,
  explosionRadius: 654,
  explosionVelocity: 653,
  damageReductionFactor: 1353,
  /** On the character, not the ship; absent when no skills are passed. */
  droneControlRange: 458,
  // Damage per type (plain SDE `emDamage` & co., looked up by name in the
  // pinned `sde.dat` 2026-09-25): on a turret's or launcher's charge, and on
  // a drone itself.
  emDamage: 114,
  explosiveDamage: 116,
  kineticDamage: 117,
  thermalDamage: 118,
  // A fighter's standard attack, the one its `dps` above is: a live run of
  // the pinned engine (Templar I in a Thanatos tube, 2026-09-25) gave `dps`
  // equal to fighterAbilityAttackMissileDamagePerSecond (-55), with its
  // damage on fighterAbilityAttackMissileDamage* (ids read by name off the
  // pinned `sde.dat`'s dogma attributes). A few attacks carry the
  // fighterAbilityAttackTurretDamage* ones instead.
  fighterAttackEmDamage: 2227,
  fighterAttackThermalDamage: 2228,
  fighterAttackKineticDamage: 2229,
  fighterAttackExplosiveDamage: 2230,
  fighterTurretEmDamage: 2171,
  fighterTurretThermalDamage: 2172,
  fighterTurretKineticDamage: 2173,
  fighterTurretExplosiveDamage: 2174,
} as const;

/** The base drone control range with no skills trained. */
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

/** The damage split by type, as shares; nothing when the item carries no damage at all. */
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

function moduleWeapon(result: ItemResultLike): AppliedWeapon | null {
  if (result.state !== 'active' && result.state !== 'overload') return null;
  const dps = read(result.attributes, APPLIED_DPS_ATTRIBUTE.dps);
  if (dps <= 0) return null;
  const charge = result.charge?.attributes;
  if (charge && read(charge, APPLIED_DPS_ATTRIBUTE.explosionRadius) > 0) {
    return {
      kind: 'missile',
      dps,
      range:
        read(charge, APPLIED_DPS_ATTRIBUTE.maxVelocity) *
        (read(charge, APPLIED_DPS_ATTRIBUTE.explosionDelay) / 1000),
      explosionRadius: read(charge, APPLIED_DPS_ATTRIBUTE.explosionRadius),
      explosionVelocity: read(charge, APPLIED_DPS_ATTRIBUTE.explosionVelocity),
      damageReductionFactor: read(charge, APPLIED_DPS_ATTRIBUTE.damageReductionFactor),
      ...damageSplit(charge),
    };
  }
  if (read(result.attributes, APPLIED_DPS_ATTRIBUTE.tracking) > 0) {
    return { kind: 'turret', dps, ...trackingOf(result.attributes), ...damageSplit(charge) };
  }
  // Smartbombs, a launcher with nothing loaded, …: nothing to apply.
  return null;
}

/**
 * `items`/`results` must be the index-parallel `dogmaFit.items` and
 * `calculation.items`. A drone stack counts only when the Fitting launched it
 * (`item.state === 'active'`) — the engine itself reports bay drones as
 * active too. A module counts only while running (active or overloaded), a
 * fighter squadron only while launched (in a tube).
 */
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
        speed: read(result.attributes, APPLIED_DPS_ATTRIBUTE.maxVelocity),
        ...trackingOf(result.attributes),
        ...damageSplit(result.attributes),
      });
      return;
    }
    if (item.slot.type === 'fighter_tube') {
      // A tube holds a launched squadron; the bay's (`fighter_bay`) don't fight.
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
