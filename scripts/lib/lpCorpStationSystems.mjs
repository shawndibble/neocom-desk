// Pure join behind build-sde.mjs's `functions/src/data/lpCorpStationSystems.ts`
// (issue #2873): which solar systems each LP Store corporation has a station
// in. ESI's offers carry no home station, so the LP Store search snapshot ships
// every system a corporation could be reached at and the client picks the
// nearest. `functions/` cannot read `public/data`, hence a baked copy.

/**
 * `lpCorporations` ([{ id }]) + `npcStations` ([{ systemId, ownerCorporationId? }])
 * -> `{ [corporationId]: sorted distinct systemIds }`. A corporation that owns no
 * station is left out entirely, so the function never fetches a store it could
 * not place on a map.
 */
export function lpCorpStationSystems(lpCorporations, npcStations) {
  const wanted = new Set(lpCorporations.map((corp) => corp.id));
  const byCorp = new Map();
  for (const station of npcStations) {
    const corpId = station.ownerCorporationId;
    if (corpId === undefined || !wanted.has(corpId)) continue;
    if (!Number.isInteger(station.systemId)) continue;
    let systems = byCorp.get(corpId);
    if (systems === undefined) byCorp.set(corpId, (systems = new Set()));
    systems.add(station.systemId);
  }
  const result = {};
  for (const corpId of [...byCorp.keys()].sort((a, b) => a - b)) {
    result[corpId] = [...byCorp.get(corpId)].sort((a, b) => a - b);
  }
  return result;
}
