import type { BuildPlanRecord } from '@/db';

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
    | 'productSalePrice'
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

export const clearedBuildLocation = {
  buildLocationId: undefined,
  buildLocationName: undefined,
} satisfies PlanPatch;

export const clearedReactionBuildLocation = {
  reactionBuildLocationId: undefined,
  reactionBuildLocationName: undefined,
} satisfies PlanPatch;
