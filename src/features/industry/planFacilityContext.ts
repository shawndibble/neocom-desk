/**
 * The "where and how this plan's job runs" half of a make-or-buy context —
 * facility, rig fit, security, structure tax — independent of pricing, which
 * each caller layers its own fields on top of (`BuildPlanDetail.tsx`'s own
 * `makeOrBuyContext`, `autoBuildGroup.ts`'s per-member `ctx`). Pulled out
 * once both needed the exact same four-field shape.
 */
import type { BuildPlanRecord } from '@/db';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityPreset,
  type RigFit,
  type SecurityBand,
  type SkillLevels,
} from '@/engine/industry/types';
import type { MakeOrBuyContext } from '@/engine/industry/makeOrBuy';

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

/**
 * The Reaction Location's own "where and how" half (issue #698) — `null`
 * when none is configured, which is how every plan behaves before Include
 * Reactions is ever turned on. Missing `systemCostIndex` on purpose: that
 * comes from a live ESI call the caller makes separately (mirroring how the
 * plan's own `systemCostIndex` is layered on top of `facilityContextFor`'s
 * result rather than being part of it), keyed by `reactionBuildSystemId`.
 */
export function reactionPlanFacilityContextFor(
  plan: Pick<
    BuildPlanRecord,
    'reactionFacility' | 'reactionRigFit' | 'reactionSecurity' | 'reactionFacilityTaxPct'
  >
): PlanFacilityContext | null {
  if (plan.reactionFacility === undefined) return null;
  const facility = FACILITY_PRESETS[plan.reactionFacility];
  return {
    facility,
    rigFit: resolveRigFit({ rigFit: plan.reactionRigFit }),
    security: plan.reactionSecurity ?? 'highsec',
    facilityTaxPct: facility.structure ? plan.reactionFacilityTaxPct : undefined,
  };
}

/**
 * Auto Build's depth context (issues #695/#696): a `MakeOrBuyContext`
 * with every pricing field zeroed, since `maxAutoBuildDepth` never prices
 * anything — only walks the tree. Built from the plan-level
 * `reactionPlanFacilityContextFor` result, never the price-resolved
 * `reactionFacilityContext` a rendered plan also carries: that one stays
 * `undefined` until its own market snapshot lands, which would gate depth
 * discovery on a fetch it does not need for any plan with a Reaction
 * Location configured. The single seam `BuildPlanDetail.tsx`'s solo control
 * and `autoBuildGroup.ts`'s per-member walk both build this from.
 */
export function autoBuildDepthContext(
  facilityContext: PlanFacilityContext,
  reactionPlanFacilityContext: PlanFacilityContext | null,
  skills: SkillLevels
): MakeOrBuyContext {
  return {
    ...facilityContext,
    systemCostIndex: 0,
    adjustedPrices: {},
    materialPrices: {},
    skills,
    reactionFacility: reactionPlanFacilityContext
      ? { ...reactionPlanFacilityContext, systemCostIndex: 0 }
      : undefined,
  };
}
