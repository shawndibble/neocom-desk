/**
 * The corp structures a Build Plan can be pointed at, and what each one fills
 * in: facility preset, solar system, and security band.
 *
 * Filtered by structure typeID rather than by the `services` list a structure
 * reports. `services` is optional on `CorporationStructure` and ESI omits it
 * for a structure that has run out of fuel — which is exactly when a pilot is
 * still planning jobs for it. What a structure *is* does not go dark; what it
 * is currently running does.
 *
 * Nothing here fetches. The caller hands in the structures and the systems it
 * has already resolved, so this stays a pure mapping with a test.
 */
import type { CorporationStructure } from '@/esi/endpoints';
import { securityBand } from '@/engine/securityStatus';
import {
  FACILITY_KIND_BY_STRUCTURE_TYPE_ID,
  type FacilityKind,
  type SecurityBand,
} from '@/engine/industry/types';
import { FACILITY_PRESETS } from '@/engine/industry/types';

/** What `/universe/systems/{id}` tells us about one system, reduced to what a plan needs. */
export interface SystemSummary {
  name: string;
  /** ESI's raw float. Banded here, never by the caller. */
  security: number;
}

/** One pickable structure, already carrying every field choosing it would set. */
export interface BuildStructureOption {
  structureId: number;
  name: string;
  facility: FacilityKind;
  systemId: number;
  systemName: string;
  security: SecurityBand;
}

export function buildStructureOptions(
  structures: readonly CorporationStructure[],
  systems: ReadonlyMap<number, SystemSummary>
): BuildStructureOption[] {
  const options: BuildStructureOption[] = [];
  for (const structure of structures) {
    const facility = FACILITY_KIND_BY_STRUCTURE_TYPE_ID[structure.type_id];
    if (!facility) continue;
    // Without the system there is no security band, and inventing one would
    // pick a rig multiplier (1x, 1.9x or 2.1x) out of thin air.
    const system = systems.get(structure.system_id);
    if (!system) continue;
    options.push({
      structureId: structure.structure_id,
      // ESI withholds `name` from a Character whose role cannot see it. What
      // and where it is still identifies it well enough to pick.
      name: structure.name ?? `${FACILITY_PRESETS[facility].name} in ${system.name}`,
      facility,
      systemId: structure.system_id,
      systemName: system.name,
      security: securityBand(system.security),
    });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}
