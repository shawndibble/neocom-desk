export function wholeNumber(s) {
  if (s === undefined || s === '') return null;
  const value = Number(s);
  return Number.isInteger(value) ? value : null;
}

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

export function stationOwnerFields(corporationIdCell, factionByCorp) {
  const ownerCorporationId = wholeNumber(corporationIdCell);
  if (ownerCorporationId === null) return {};
  const fields = { ownerCorporationId };
  const ownerFactionId = factionByCorp.get(ownerCorporationId);
  if (ownerFactionId !== undefined) fields.ownerFactionId = ownerFactionId;
  return fields;
}

export const DEFAULT_REPROCESSING_TAKE = 0.05;

export function stationReprocessingFields(takeCell) {
  if (takeCell === undefined || takeCell === '') return {};
  const take = Number(takeCell);
  if (!Number.isFinite(take) || take === DEFAULT_REPROCESSING_TAKE) return {};
  return { reprocessingStationsTake: take };
}
