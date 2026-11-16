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

/** Gate counts outside this band mean the stargate table was cut short or doubled. */
export const GATE_COUNT_MIN = 6_000;
export const GATE_COUNT_MAX = 20_000;

/**
 * What is wrong with the baked gate positions, as messages (none when sound):
 * the gate count is plausible, Jita's gates are there, and every jump the
 * graph holds has a gate to fly it by. The last is the drift check: a graph
 * edge with no gate position would give a trip no time, so the two files must
 * be baked together.
 * @param {Record<string, number[]>} gates `bakeGatePositions` output
 * @param {Record<string, number[]>} jumps `jumps.json`: system -> neighbours
 * @param {number} jitaId
 */
export function gatePositionProblems(gates, jumps, jitaId) {
  const problems = [];
  const count = Object.values(gates).reduce((n, flat) => n + flat.length / 4, 0);
  if (count < GATE_COUNT_MIN || count > GATE_COUNT_MAX) {
    problems.push(
      `gate count ${count} outside the plausible ${GATE_COUNT_MIN}-${GATE_COUNT_MAX} range`
    );
  }
  if (!(gates[jitaId]?.length > 0)) problems.push('Jita has no gate positions');
  let missing = 0;
  for (const [from, tos] of Object.entries(jumps)) {
    const flat = gates[from] ?? [];
    for (const to of tos) {
      let found = false;
      for (let i = 0; i < flat.length; i += 4) if (flat[i] === to) found = true;
      if (!found) missing++;
    }
  }
  if (missing > 0) problems.push(`${missing} jump graph edges have no gate position`);
  return problems;
}
