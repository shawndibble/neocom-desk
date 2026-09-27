// Pure join behind build-sde.mjs's station owner columns on
// public/data/market/stations.json (issue #1675): which NPC corporation owns
// each station, and which faction that corporation belongs to. ESI's
// `GET /corporations/{id}` omits `faction_id` for NPC corps, so the faction
// can only come from the SDE's `crpNPCCorporations.factionID`.
// Takes the array-of-arrays `parseCsv` returns (header row first, every cell a
// string), so this is testable with small hand-made fixtures.

function wholeNumber(s) {
  if (s === undefined || s === '') return null;
  const value = Number(s);
  return Number.isInteger(value) ? value : null;
}

/** `crpNPCCorporations` rows -> Map of corporationID to factionID; a blank faction is left out. */
export function npcCorpFactions(rows) {
  const header = rows[0];
  const corp = header.indexOf('corporationID');
  const faction = header.indexOf('factionID');
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const corporationId = wholeNumber(rows[i][corp]);
    const factionId = wholeNumber(rows[i][faction]);
    if (corporationId !== null && factionId !== null) map.set(corporationId, factionId);
  }
  return map;
}

/**
 * The owner keys for one `staStations` row's `corporationID` cell. A key is
 * left off rather than written as null: `JSON.stringify` would emit `null` for
 * NaN, and callers test these for `undefined` (the same convention as `typeId`).
 */
export function stationOwnerFields(corporationIdCell, factionByCorp) {
  const ownerCorporationId = wholeNumber(corporationIdCell);
  if (ownerCorporationId === null) return {};
  const fields = { ownerCorporationId };
  const ownerFactionId = factionByCorp.get(ownerCorporationId);
  if (ownerFactionId !== undefined) fields.ownerFactionId = ownerFactionId;
  return fields;
}
