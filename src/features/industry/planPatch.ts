import type { BuildPlanRecord } from '@/db';

/** The Build Plan fields this panel edits, sent as an `edit` `BuildPlanChange`. */
export type PlanPatch = Partial<
  Pick<
    BuildPlanRecord,
    | 'runs'
    | 'me'
    | 'te'
    | 'facility'
    | 'rigFit'
    | 'rigLevel'
    | 'security'
    | 'hubId'
    | 'buildSystemId'
    | 'buildSystemName'
    | 'buildLocationId'
    | 'buildLocationName'
    | 'facilityTaxPct'
    | 'costIndexOverridePct'
    | 'materialPriceBasis'
    | 'ownedStockScope'
    | 'includeCorpAssets'
    | 'buildHere'
    | 'includeReactions'
    | 'reactionFacility'
    | 'reactionRigFit'
    | 'reactionSecurity'
    | 'reactionFacilityTaxPct'
    | 'reactionBuildSystemId'
    | 'reactionBuildSystemName'
    | 'reactionBuildLocationId'
    | 'reactionBuildLocationName'
  >
>;

/**
 * The half of a patch that drops the plan's remembered location. Spread by
 * every control that can move the job away from the place the search picked:
 * a Raitaru still named in the box while the plan says NPC station is a label
 * lying about the plan.
 */
export const clearedBuildLocation = {
  buildLocationId: undefined,
  buildLocationName: undefined,
} satisfies PlanPatch;

/** @see clearedBuildLocation — the same rule for the Reaction Location. */
export const clearedReactionBuildLocation = {
  reactionBuildLocationId: undefined,
  reactionBuildLocationName: undefined,
} satisfies PlanPatch;
