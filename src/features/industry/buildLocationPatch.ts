/**
 * The plan edit that picking a build location makes.
 *
 * Its own module, and pure, because it is the one place the app decides what a
 * chosen station or structure *is* — including the two values it settles by
 * being an NPC station rather than by anyone typing them.
 */
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { BuildStructureOption } from './buildStructures';

type BuildLocationPatch = Pick<
  BuildPlanRecord,
  'facility' | 'security' | 'buildSystemId' | 'buildSystemName'
> &
  Partial<Pick<BuildPlanRecord, 'rigLevel' | 'facilityTaxPct'>>;

export function buildLocationPatch(option: BuildStructureOption): BuildLocationPatch {
  return {
    facility: option.facility,
    security: option.security,
    buildSystemId: option.systemId,
    buildSystemName: option.systemName,
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
