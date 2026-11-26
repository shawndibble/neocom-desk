import { EMPTY_RIG_FIT, FACILITY_PRESETS } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { BuildLocationOption } from './buildLocations';

type BuildLocationPatch = Pick<
  BuildPlanRecord,
  'facility' | 'security' | 'buildSystemId' | 'buildSystemName' | 'buildLocationId'
> &
  Partial<Pick<BuildPlanRecord, 'rigFit' | 'facilityTaxPct' | 'buildLocationName'>>;

export function buildLocationPatch(option: BuildLocationOption): BuildLocationPatch {
  return {
    facility: option.facility,
    security: option.security,
    buildSystemId: option.systemId,
    buildSystemName: option.systemName,
    buildLocationId: option.structureId,
    buildLocationName: option.name ?? undefined,
    ...(FACILITY_PRESETS[option.facility].structure
      ? {}
      : { rigFit: EMPTY_RIG_FIT, facilityTaxPct: undefined }),
  };
}

type ReactionBuildLocationPatch = Pick<
  BuildPlanRecord,
  'reactionFacility' | 'reactionSecurity' | 'reactionBuildSystemId' | 'reactionBuildLocationId'
> &
  Partial<
    Pick<
      BuildPlanRecord,
      'reactionRigFit' | 'reactionBuildSystemName' | 'reactionBuildLocationName'
    >
  >;

export function reactionBuildLocationPatch(
  option: BuildLocationOption
): ReactionBuildLocationPatch {
  return {
    reactionFacility: option.facility,
    reactionSecurity: option.security,
    reactionBuildSystemId: option.systemId,
    reactionBuildSystemName: option.systemName,
    reactionBuildLocationId: option.structureId,
    reactionBuildLocationName: option.name ?? undefined,
  };
}
