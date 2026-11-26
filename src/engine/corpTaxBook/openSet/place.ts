import { extractionStatus } from '../extraction';
import { toEngineExtraction, type SyncExtraction } from '../sync';
import type { ObservedMiningEntry } from '../types';
import type { PlaceOf } from '../charges';
import type { Placement } from './types';

export function placeOfFactory(
  extractions: readonly SyncExtraction[],
  expiryHours: Readonly<Record<string, number>>
): PlaceOf {
  const engine = extractions.map(toEngineExtraction);
  return (structureId, date) => {
    for (const ex of engine) {
      if (ex.structureId !== structureId) continue;
      const status = extractionStatus(ex, `${date}T23:59:59Z`, {
        expiryHours: expiryHours[String(structureId)],
      });
      if (
        status.fracturedAt &&
        date >= status.fracturedAt.slice(0, 10) &&
        status.expiresAt &&
        date <= status.expiresAt.slice(0, 10)
      ) {
        return { moonId: ex.moonId, extractionId: ex.id };
      }
    }
    return {};
  };
}

function rowPlaceOf(rows: readonly ObservedMiningEntry[]): PlaceOf {
  return (structureId, date) => {
    const moonId = rows.find(
      (o) => o.structureId === structureId && o.date === date && o.moonId !== undefined
    )?.moonId;
    return moonId === undefined ? {} : { moonId };
  };
}

export function placeOfFor(placement: Placement, rows: readonly ObservedMiningEntry[]): PlaceOf {
  return placement.kind === 'observed-rows'
    ? rowPlaceOf(rows)
    : placeOfFactory(placement.extractions, placement.structureExpiryHours);
}
