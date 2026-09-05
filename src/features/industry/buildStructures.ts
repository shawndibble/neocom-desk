/**
 * The places a Build Plan can be pointed at, and what each one fills in:
 * facility preset, solar system, and security band.
 *
 * Keyed off the typeID, which is what says whether a place can host a
 * manufacturing job at all — an NPC station always can, an Engineering Complex
 * can, and a Citadel, Refinery or Keepstar cannot. Deliberately not the
 * `services` a structure reports: ESI omits that once a structure runs out of
 * fuel, which is exactly when a pilot is still planning jobs for it. What a
 * place *is* does not go dark; what it is currently running does.
 *
 * Nothing here fetches. The caller hands in the places and the systems it has
 * already resolved, so this stays a pure mapping with a test.
 */
import { securityBand } from '@/engine/securityStatus';
import {
  FACILITY_KIND_BY_STRUCTURE_TYPE_ID,
  type FacilityKind,
  type SecurityBand,
} from '@/engine/industry/types';

/** What `/universe/systems/{id}` tells us about one system, reduced to what a plan needs. */
export interface SystemSummary {
  name: string;
  /** ESI's raw float. Banded here, never by the caller. */
  security: number;
}

/**
 * A place the search turned up, before it is known whether a job can run
 * there. `typeId` decides that; `name` is null where ESI withheld it.
 */
export interface LocatablePlace {
  id: number;
  name: string | null;
  typeId: number;
  systemId: number;
}

/** One pickable location, already carrying every field choosing it would set. */
export interface BuildStructureOption {
  /** Station id or structure id — only ever used as a React key and a select value. */
  structureId: number;
  /**
   * The structure's own name, or `null` where ESI withheld it from a Character
   * whose role cannot see it. Null rather than a composed fallback: the label
   * that replaces it is UI copy and belongs in i18next, not in this module.
   */
  name: string | null;
  facility: FacilityKind;
  systemId: number;
  systemName: string;
  security: SecurityBand;
}

export function buildStructureOptions(
  places: readonly LocatablePlace[],
  systems: ReadonlyMap<number, SystemSummary>,
  isNpcStation: (typeId: number) => boolean = () => false
): BuildStructureOption[] {
  const options: BuildStructureOption[] = [];
  for (const place of places) {
    const facility = isNpcStation(place.typeId)
      ? 'npcStation'
      : FACILITY_KIND_BY_STRUCTURE_TYPE_ID[place.typeId];
    if (!facility) continue;
    // Without the system there is no security band, and inventing one would
    // pick a rig multiplier (1x, 1.9x or 2.1x) out of thin air.
    const system = systems.get(place.systemId);
    if (!system) continue;
    options.push({
      structureId: place.id,
      name: place.name,
      facility,
      systemId: place.systemId,
      systemName: system.name,
      security: securityBand(system.security),
    });
  }
  // Unnamed structures sort last, together: they have no name to sort by, and
  // scattering them through the list would make it read as unsorted.
  return options.sort((a, b) => (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff'));
}
