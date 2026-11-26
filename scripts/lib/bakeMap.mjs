export const MAP_FILES = [
  'mapSolarSystems.jsonl',
  'mapStargates.jsonl',
  'mapRegions.jsonl',
  'mapPlanets.jsonl',
];

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

export function mapRegions(records) {
  return records.map((r) => ({ id: r._key, name: r.name.en })).sort((a, b) => a.id - b.id);
}

export function mapJumpPairs(stargates) {
  return stargates.map((g) => [g.solarSystemID, g.destination.solarSystemID]);
}

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

export function planetRadiiKm(planets) {
  const out = {};
  for (const p of planets) {
    if (!Number.isFinite(p.radius) || p.radius <= 0) continue;
    out[p._key] = Math.round(p.radius / 1000);
  }
  return out;
}

export const GATE_COUNT_MIN = 6_000;
export const GATE_COUNT_MAX = 20_000;

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
