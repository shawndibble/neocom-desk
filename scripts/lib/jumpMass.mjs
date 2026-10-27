// wormholeMass.json and shipMass.json: what Route Safety checks a ship against
// (issue #2906). A hole type's per-jump limit is dogma attribute 1385
// (wormholeMaxJumpMass), its total 1383 (wormholeMaxStableMass); a hull's mass
// is invTypes.mass. Wormhole types share a name across many typeIds (every
// "C729" is the same hole), so the table is keyed by name.

export const WORMHOLE_GROUP_ID = 988;
const MAX_JUMP_MASS = 1385;
const MAX_STABLE_MASS = 1383;
const JUMP_DRIVE_RANGE = 867;
const JUMP_DRIVE_FUEL_TYPE = 866;
const JUMP_DRIVE_FUEL_PER_LY = 868;

/**
 * `{ name: [maxJumpKg, maxStableKg] }`. K162 (the far end of any hole) and
 * types with no limits carry none, so they are left out rather than guessed.
 * @param {{typeID:number,name:string,groupID:number}[]} types
 * @param {Map<number, Map<number, number|null>>} attrsByType
 */
export function bakeWormholeMass(types, attrsByType) {
  const out = {};
  for (const t of types) {
    if (t.groupID !== WORMHOLE_GROUP_ID) continue;
    const attrs = attrsByType.get(t.typeID);
    const jump = attrs?.get(MAX_JUMP_MASS);
    const stable = attrs?.get(MAX_STABLE_MASS);
    if (!jump || !stable) continue;
    out[t.name.replace(/^Wormhole /, '')] = [jump, stable];
  }
  return out;
}

/**
 * `{ typeId: [name, groupID, massKg, drive?] }` for published hulls. `drive`
 * (issue #3147) is `[rangeLy, fuelTypeId, fuelPerLy]`, the hull's base jump
 * drive, and is left off a hull whose range attribute (867) is not above zero.
 * @param {{typeID:number,name:string,groupID:number,mass:number,published:boolean}[]} types
 * @param {Set<number>} shipGroupIds groups in the ship category
 * @param {Map<number, Map<number, number|null>>} [attrsByType]
 */
export function bakeShipMass(types, shipGroupIds, attrsByType = new Map()) {
  const out = {};
  for (const t of types) {
    if (!t.published || !shipGroupIds.has(t.groupID) || !(t.mass > 0)) continue;
    const attrs = attrsByType.get(t.typeID);
    const range = attrs?.get(JUMP_DRIVE_RANGE);
    const row = [t.name, t.groupID, t.mass];
    if (range > 0) {
      row.push([
        range,
        attrs.get(JUMP_DRIVE_FUEL_TYPE) ?? 0,
        attrs.get(JUMP_DRIVE_FUEL_PER_LY) ?? 0,
      ]);
    }
    out[t.typeID] = row;
  }
  return out;
}
