// The map tables, read from CCP's own JSONL export (`mapSolarSystems`,
// `mapStargates`, `mapRegions`, `mapPlanets`) instead of Fuzzwork's CSVs. Each
// function turns parsed JSONL records into the rows the bakes in
// `bakeMarket.mjs` and `bakePi.mjs` consume. Pure: no I/O.

export const MAP_FILES = [
  'mapSolarSystems.jsonl',
  'mapStargates.jsonl',
  'mapRegions.jsonl',
  'mapPlanets.jsonl',
];

/** @typedef {{id:number,name:string,security:number,regionId:number,x:number,y:number,z:number}} MapSystem */

/**
 * Every solar system, ordered by id.
 * @returns {MapSystem[]}
 */
export function mapSystems(records) {
  return records
    .map((r) => ({
      id: r._key,
      name: r.name.en,
      security: r.securityStatus ?? 0,
      regionId: r.regionID,
      x: r.position?.x ?? 0,
      y: r.position?.y ?? 0,
      z: r.position?.z ?? 0,
    }))
    .sort((a, b) => a.id - b.id);
}

/** Every region, ordered by id. */
export function mapRegions(records) {
  return records.map((r) => ({ id: r._key, name: r.name.en })).sort((a, b) => a.id - b.id);
}

/**
 * Stargate adjacency as `[from, to]` pairs, one per gate: a gate sits in its
 * own system and names the system it leads to.
 */
export function mapJumpPairs(stargates) {
  return stargates.map((g) => [g.solarSystemID, g.destination.solarSystemID]);
}

/**
 * In-system gate positions, `{ systemId: [toSystemId, x, y, z, ...] }`, ordered
 * by system id then destination. Positions are metres from the system's star
 * (the SDE's origin) rounded to whole Mm (1,000 km): far finer than any warp
 * time can tell apart, and about 7 digits instead of 13.
 */
export function bakeGatePositions(stargates) {
  const bySystem = new Map();
  for (const g of stargates) {
    const p = g.position;
    if (!p) continue;
    const flat = bySystem.get(g.solarSystemID) ?? [];
    flat.push([
      g.destination.solarSystemID,
      Math.round(p.x / 1e6),
      Math.round(p.y / 1e6),
      Math.round(p.z / 1e6),
    ]);
    bySystem.set(g.solarSystemID, flat);
  }
  const out = {};
  for (const id of [...bySystem.keys()].sort((a, b) => a - b)) {
    out[id] = bySystem
      .get(id)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .flat();
  }
  return out;
}

/** `{ planetId: radius in km }` for planets with a radius, as the PI link maths needs. */
export function planetRadiiKm(planets) {
  const out = {};
  for (const p of planets) {
    if (!Number.isFinite(p.radius) || p.radius <= 0) continue;
    out[p._key] = Math.round(p.radius / 1000);
  }
  return out;
}
