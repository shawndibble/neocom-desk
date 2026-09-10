/**
 * The "where and how this plan's job runs" half of a make-or-buy context —
 * facility, rig fit, security, structure tax — independent of pricing, which
 * each caller layers its own fields on top of (`BuildPlanDetail.tsx`'s own
 * `makeOrBuyContext`, `craftSweepGroup.ts`'s per-member `ctx`). Pulled out
 * once both needed the exact same four-field shape.
 */
import type { BuildPlanRecord } from '@/db';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityPreset,
  type RigFit,
  type SecurityBand,
} from '@/engine/industry/types';

export interface PlanFacilityContext {
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
  facilityTaxPct?: number;
}

export function facilityContextFor(
  plan: Pick<BuildPlanRecord, 'facility' | 'rigFit' | 'rigLevel' | 'security' | 'facilityTaxPct'>
): PlanFacilityContext {
  const facility = FACILITY_PRESETS[plan.facility];
  return {
    facility,
    rigFit: resolveRigFit({ rigFit: plan.rigFit, rigLevel: plan.rigLevel }),
    security: plan.security,
    facilityTaxPct: facility.structure ? plan.facilityTaxPct : undefined,
  };
}
