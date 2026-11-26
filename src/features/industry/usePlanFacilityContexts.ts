import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import { craftScope } from '@/engine/industry/craftScope';
import type { IndustryActivity } from '@/engine/industry/types';
import { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';

export function usePlanFacilityContexts(
  plan: BuildPlanRecord,
  activity: IndustryActivity,
  includeReactions: boolean
) {
  const craftScopeList = useMemo(
    () => craftScope(activity, includeReactions),
    [activity, includeReactions]
  );

  const reactionPlanFacilityContext = useMemo(
    () =>
      reactionPlanFacilityContextFor({
        reactionFacility: plan.reactionFacility,
        reactionRigFit: plan.reactionRigFit,
        reactionSecurity: plan.reactionSecurity,
        reactionFacilityTaxPct: plan.reactionFacilityTaxPct,
      }),
    [plan.reactionFacility, plan.reactionRigFit, plan.reactionSecurity, plan.reactionFacilityTaxPct]
  );

  const facilityContext = useMemo(
    () =>
      facilityContextFor({
        facility: plan.facility,
        rigFit: plan.rigFit,
        rigLevel: plan.rigLevel,
        security: plan.security,
        facilityTaxPct: plan.facilityTaxPct,
      }),
    [plan.facility, plan.rigFit, plan.rigLevel, plan.security, plan.facilityTaxPct]
  );

  return { craftScopeList, reactionPlanFacilityContext, facilityContext };
}
