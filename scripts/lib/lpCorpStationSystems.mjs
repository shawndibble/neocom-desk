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
