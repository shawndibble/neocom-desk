/**
 * The plan edit a group Retarget — or the per-plan quick-fill link beside it
 * — makes: the four fields a `BuildGroupSnapshot` carries, written onto one
 * plan's own record fields. Never a second source of truth: once applied, a
 * plan's hub, facility, security and build system live only on the plan
 * (issue #626), the same as `buildLocationPatch` for a Build Location pick.
 */
import { EMPTY_RIG_FIT, FACILITY_PRESETS, resolveRigFit } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroupSnapshot } from './buildGroups';

type RetargetPatch = Pick<BuildPlanRecord, 'hubId' | 'facility' | 'security'> &
  Partial<
    Pick<
      BuildPlanRecord,
      | 'buildSystemId'
      | 'buildSystemName'
      | 'buildLocationId'
      | 'buildLocationName'
      | 'rigFit'
      | 'facilityTaxPct'
    >
  >;

export function retargetPatch(snapshot: BuildGroupSnapshot): RetargetPatch {
  return {
    hubId: snapshot.hubId,
    facility: snapshot.facility,
    security: snapshot.security,
    // Written even when absent — a snapshot with no build system means "at
    // the hub", and the four fields move as one bundle, so a plan's stray
    // build system from before this Retarget must go with it.
    buildSystemId: snapshot.buildSystemId,
    buildSystemName: snapshot.buildSystemName,
    // The picked place travels with the rest of the bundle, so a stale pick
    // from before this Retarget cannot outlive it (`buildLocationPatch`).
    buildLocationId: snapshot.buildLocationId,
    buildLocationName: snapshot.buildLocationName,
    // An NPC station has no rig slots and a tax CCP fixes at 0.25%, so both
    // are cleared the same way a manual facility change clears them
    // (`buildLocationPatch`). Landing on a structure writes the rig fit and
    // tax the pilot entered in the dialog, and leaves a plan's own alone when
    // they entered none: ESI publishes no structure rig fitting, so there is
    // nothing truer to set them to.
    ...(FACILITY_PRESETS[snapshot.facility].structure
      ? {
          ...(snapshot.rigFit ? { rigFit: snapshot.rigFit } : {}),
          ...(snapshot.facilityTaxPct !== undefined
            ? { facilityTaxPct: snapshot.facilityTaxPct }
            : {}),
        }
      : { rigFit: EMPTY_RIG_FIT, facilityTaxPct: undefined }),
  };
}

/**
 * Whether a plan already carries a snapshot's four values — what decides
 * whether the per-plan quick-fill link has anything left to do. Mirrors
 * the owned-stock offer (`ownedStockOffer`): nothing to offer once applying
 * it would be a no-op.
 */
export function planMatchesSnapshot(
  plan: Pick<
    BuildPlanRecord,
    'hubId' | 'facility' | 'security' | 'buildSystemId' | 'buildSystemName'
  > &
    Partial<
      Pick<
        BuildPlanRecord,
        'buildLocationId' | 'buildLocationName' | 'rigFit' | 'rigLevel' | 'facilityTaxPct'
      >
    >,
  snapshot: BuildGroupSnapshot
): boolean {
  return (
    plan.hubId === snapshot.hubId &&
    plan.facility === snapshot.facility &&
    plan.security === snapshot.security &&
    plan.buildSystemId === snapshot.buildSystemId &&
    plan.buildSystemName === snapshot.buildSystemName &&
    plan.buildLocationId === snapshot.buildLocationId &&
    plan.buildLocationName === snapshot.buildLocationName &&
    // Rig fit and tax only count when the snapshot carries them — otherwise
    // the patch leaves a plan's own alone, so any value already matches.
    (snapshot.rigFit === undefined ||
      resolveRigFit(plan).every((kind, slot) => kind === snapshot.rigFit?.[slot])) &&
    (snapshot.facilityTaxPct === undefined || plan.facilityTaxPct === snapshot.facilityTaxPct)
  );
}
