import { securityBand } from '@/engine/securityStatus';
import {
  FACILITY_KIND_BY_STRUCTURE_TYPE_ID,
  FACILITY_PRESETS,
  type FacilityKind,
  type IndustryActivity,
  type SecurityBand,
} from '@/engine/industry/types';

export interface SystemSummary {
  name: string;
  security: number;
}

export interface LocatablePlace {
  id: number;
  name: string | null;
  typeId: number;
  systemId: number;
  npcStation: boolean;
}

export interface BuildLocationOption {
  structureId: number;
  name: string | null;
  facility: FacilityKind;
  systemId: number;
  systemName: string;
  security: SecurityBand;
}

export function buildLocationOptions(
  places: readonly LocatablePlace[],
  systems: ReadonlyMap<number, SystemSummary>,
  activity: IndustryActivity
): BuildLocationOption[] {
  const options: BuildLocationOption[] = [];
  for (const place of places) {
    const facility = place.npcStation
      ? 'npcStation'
      : FACILITY_KIND_BY_STRUCTURE_TYPE_ID[place.typeId];
    if (!facility) continue;
    if (FACILITY_PRESETS[facility].activity !== activity) continue;
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
  return options.sort((a, b) => (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff'));
}
