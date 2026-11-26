import type { BuildPlanRecord } from '@/db';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type IndustryActivity,
  type FacilityKind,
  type RigFit,
  type SecurityBand,
} from '@/engine/industry/types';
import { normalizeFacilityDefaults, type FacilityDefaults } from './facilityDefaults';
import {
  normalizeReactionFacilityDefaults,
  type ReactionFacilityDefaults,
} from './reactionFacilityDefaults';

const PRIMARY_LOCATION_KEYS = [
  'facility',
  'rigFit',
  'rigLevel',
  'facilityTaxPct',
  'security',
  'buildSystemId',
  'buildSystemName',
  'buildLocationId',
  'buildLocationName',
] as const satisfies readonly (keyof BuildPlanRecord)[];

const REACTION_LOCATION_KEYS = [
  'reactionFacility',
  'reactionRigFit',
  'reactionFacilityTaxPct',
  'reactionSecurity',
  'reactionBuildSystemId',
  'reactionBuildSystemName',
  'reactionBuildLocationId',
  'reactionBuildLocationName',
] as const satisfies readonly (keyof BuildPlanRecord)[];

export interface RememberedLocations {
  manufacturing?: FacilityDefaults;
  reaction?: ReactionFacilityDefaults;
}

function touches(patch: Partial<BuildPlanRecord>, keys: readonly (keyof BuildPlanRecord)[]) {
  return keys.some((key) => key in patch);
}

function locationRecord(fields: {
  facility: FacilityKind;
  rigFit: RigFit;
  facilityTaxPct: number | undefined;
  security: SecurityBand | undefined;
  buildSystemId: number | undefined;
  buildSystemName: string | undefined;
  buildLocationId: number | undefined;
  buildLocationName: string | undefined;
}): FacilityDefaults {
  return {
    facility: fields.facility,
    rigFit: fields.rigFit,
    facilityTaxPct: fields.facilityTaxPct ?? null,
    setOnPlanPage: true,
    ...(fields.security !== undefined ? { security: fields.security } : {}),
    ...(fields.buildSystemId !== undefined && fields.buildSystemName !== undefined
      ? { buildSystemId: fields.buildSystemId, buildSystemName: fields.buildSystemName }
      : {}),
    ...(fields.buildLocationId !== undefined
      ? {
          buildLocationId: fields.buildLocationId,
          ...(fields.buildLocationName !== undefined
            ? { buildLocationName: fields.buildLocationName }
            : {}),
        }
      : {}),
  };
}

export function rememberedLocationsFromEdit(
  plan: BuildPlanRecord,
  patch: Partial<BuildPlanRecord>,
  activity: IndustryActivity
): RememberedLocations {
  const next: BuildPlanRecord = { ...plan, ...patch };
  const remembered: RememberedLocations = {};

  if (
    touches(patch, PRIMARY_LOCATION_KEYS) &&
    FACILITY_PRESETS[next.facility].activity === activity
  ) {
    const record = locationRecord({
      facility: next.facility,
      rigFit: resolveRigFit(next),
      facilityTaxPct: next.facilityTaxPct,
      security: next.security,
      buildSystemId: next.buildSystemId,
      buildSystemName: next.buildSystemName,
      buildLocationId: next.buildLocationId,
      buildLocationName: next.buildLocationName,
    });
    if (activity === 'reaction') remembered.reaction = normalizeReactionFacilityDefaults(record);
    else remembered.manufacturing = normalizeFacilityDefaults(record);
  }

  if (
    activity === 'manufacturing' &&
    touches(patch, REACTION_LOCATION_KEYS) &&
    next.reactionFacility !== undefined &&
    FACILITY_PRESETS[next.reactionFacility].activity === 'reaction'
  ) {
    remembered.reaction = normalizeReactionFacilityDefaults(
      locationRecord({
        facility: next.reactionFacility,
        rigFit: resolveRigFit({ rigFit: next.reactionRigFit }),
        facilityTaxPct: next.reactionFacilityTaxPct,
        security: next.reactionSecurity,
        buildSystemId: next.reactionBuildSystemId,
        buildSystemName: next.reactionBuildSystemName,
        buildLocationId: next.reactionBuildLocationId,
        buildLocationName: next.reactionBuildLocationName,
      })
    );
  }

  return remembered;
}
