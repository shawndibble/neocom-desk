import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import { craftScope } from '@/engine/industry/craftScope';
import type { IndustryActivity } from '@/engine/industry/types';
import { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';

/**
 * The plan's "where and how a job runs" inputs, which don't depend on whether
 * prices have loaded yet: the production methods it may mark buildable, and
 * the Build and Reaction facility contexts Auto Build's depth walk needs.
 */
export function usePlanFacilityContexts(
  plan: BuildPlanRecord,
  activity: IndustryActivity,
  includeReactions: boolean
) {
  // Production methods this plan may currently mark buildable — the one
  // answer the recursive engine, the manual toggle and Auto Build all share,
  // so they cannot disagree (`craftScope`'s own doc comment).
  const craftScopeList = useMemo(
    () => craftScope(activity, includeReactions),
    [activity, includeReactions]
  );

  /** @see facilityContext — the Reaction Location's own "where and how" half, `null` until one is configured. */
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

  /** The facility/rig/security/tax inputs Auto Build's depth walk needs. */
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
