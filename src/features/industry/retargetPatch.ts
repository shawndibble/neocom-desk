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
      | 'costIndexOverridePct'
    >
  >;

export function retargetPatch(snapshot: BuildGroupSnapshot): RetargetPatch {
  return {
    hubId: snapshot.hubId,
    facility: snapshot.facility,
    security: snapshot.security,
    buildSystemId: snapshot.buildSystemId,
    buildSystemName: snapshot.buildSystemName,
    buildLocationId: snapshot.buildLocationId,
    buildLocationName: snapshot.buildLocationName,
    costIndexOverridePct: undefined,
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
    (snapshot.rigFit === undefined ||
      resolveRigFit(plan).every((kind, slot) => kind === snapshot.rigFit?.[slot])) &&
    (snapshot.facilityTaxPct === undefined || plan.facilityTaxPct === snapshot.facilityTaxPct)
  );
}
