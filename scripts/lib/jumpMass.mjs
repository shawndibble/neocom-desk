export const WORMHOLE_GROUP_ID = 988;
const MAX_JUMP_MASS = 1385;
const MAX_STABLE_MASS = 1383;
const JUMP_DRIVE_RANGE = 867;
const JUMP_DRIVE_FUEL_TYPE = 866;
const JUMP_DRIVE_FUEL_PER_LY = 868;
const AGILITY = 70;
const MAX_VELOCITY = 37;
const WARP_SPEED = 600;

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

export function bakeShipFlight(shipMass, attrsByType) {
  const out = {};
  for (const id of Object.keys(shipMass)) {
    const attrs = attrsByType.get(Number(id));
    const row = [attrs?.get(AGILITY), attrs?.get(MAX_VELOCITY), attrs?.get(WARP_SPEED)];
    if (row.every((v) => typeof v === 'number' && v > 0)) out[id] = row;
  }
  return out;
}
