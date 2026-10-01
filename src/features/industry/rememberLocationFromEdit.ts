/**
 * What a Build Plan page edit leaves behind as the pilot's remembered
 * location — the write half of `facilityDefaults.ts` and
 * `reactionFacilityDefaults.ts`.
 *
 * Pure, and its own module, because it is the one place that decides which
 * edits count as the pilot *setting* a location. Only `BuildPlanDetail`'s own
 * edit path calls it: a plan written anywhere else (Opportunities seeding, Fit
 * Import, the group view's Retarget dialog, a sync pull) is the app moving
 * plans, not the pilot choosing a place, and must not move the default. The
 * plan page's own "apply group target" link does write it — that is the
 * pilot setting this plan's place, from this plan's page.
 */
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

/** The plan fields that make up its primary location. `rigLevel` is the pre-#609 spelling of `rigFit`. */
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

/** The plan fields that make up its Reaction Location (issue #698). */
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
  // `in`, not `!== undefined`: clearing a field (`buildLocationId: undefined`)
  // is an edit to the location as much as setting one.
  return keys.some((key) => key in patch);
}

/**
 * One location's fields as a defaults record, each optional field added only
 * when it has a value. Firestore rejects `undefined` at any depth and the
 * synced write swallows that error, so a stray `undefined` here would keep the
 * default on this device without anyone noticing.
 */
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
    // What tells `newBuildPlan` this record is the new rule's, not a
    // Settings-era one it should still let the last plan outrank.
    setOnPlanPage: true,
    ...(fields.security !== undefined ? { security: fields.security } : {}),
    // One fact in two fields: a plan holding half of it builds at its hub, so
    // half is remembered as none.
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

/**
 * The defaults a plan-page edit should save, keyed by the record each goes
 * to: none, one or (in principle) both.
 *
 * Saved is the plan's whole *resulting* location — the plan with the patch
 * applied — not just the fields the patch named: a rig change on a plan
 * pointed at the pilot's Azbel remembers the Azbel, its system and the new
 * rigs, since the next plan should start where this one now builds.
 *
 * `activity` is the plan's own (its blueprint's): a reaction-activity plan's
 * primary location is where its reactions run, so it lands in the reaction
 * record — the same fact the Reaction Location default holds.
 */
export function rememberedLocationsFromEdit(
  plan: BuildPlanRecord,
  patch: Partial<BuildPlanRecord>,
  activity: IndustryActivity
): RememberedLocations {
  const next: BuildPlanRecord = { ...plan, ...patch };
  const remembered: RememberedLocations = {};

  // Guarded rather than trusted: the facility select only offers this
  // activity's facilities, but a record that disagrees would seed new plans at
  // a place that cannot run them.
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

  // A reaction-activity plan has no Reaction Location of its own, and a plan
  // that never turned Include Reactions on has no facility to remember.
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
