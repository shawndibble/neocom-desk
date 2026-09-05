/**
 * The plan edit that picking a build location makes.
 *
 * Its own module, and pure, because it is the one place the app decides what a
 * chosen station or structure *is* — including the two values it settles by
 * being an NPC station rather than by anyone typing them.
 */
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { BuildLocationOption } from './buildLocations';

type BuildLocationPatch = Pick<
  BuildPlanRecord,
  'facility' | 'security' | 'buildSystemId' | 'buildSystemName' | 'buildLocationId'
> &
  Partial<Pick<BuildPlanRecord, 'rigLevel' | 'facilityTaxPct' | 'buildLocationName'>>;

export function buildLocationPatch(option: BuildLocationOption): BuildLocationPatch {
  return {
    facility: option.facility,
    security: option.security,
    buildSystemId: option.systemId,
    buildSystemName: option.systemName,
    // Kept for the search box's own label, never for a calculation. The name
    // is dropped rather than replaced when ESI withheld it: the stand-in
    // label belongs to i18next, so only the id is data here.
    buildLocationId: option.structureId,
    buildLocationName: option.name ?? undefined,
    // An NPC station has no rig slots, and a tax CCP fixes at 0.25% — which
    // `jobFee` already applies from `FACILITY_PRESETS.npcStation.defaultTaxPct`
    // the moment the facility is one. Clearing both here is what stops a rig
    // and a tax the pilot set for some structure from silently returning when
    // they pick a structure again later.
    ...(FACILITY_PRESETS[option.facility].structure
      ? {}
      : { rigLevel: 'none' as const, facilityTaxPct: undefined }),
  };
}
