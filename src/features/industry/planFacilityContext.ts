import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityPreset,
  type RigFit,
  type SecurityBand,
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

export function autoBuildDepthContext(
  facilityContext: PlanFacilityContext,
  reactionPlanFacilityContext: PlanFacilityContext | null,
  modifiers: CharacterModifiers
): MakeOrBuyContext {
  return {
    ...facilityContext,
    systemCostIndex: 0,
    adjustedPrices: {},
    materialPrices: {},
    modifiers,
    reactionFacility: reactionPlanFacilityContext
      ? { ...reactionPlanFacilityContext, systemCostIndex: 0 }
      : undefined,
  };
}
