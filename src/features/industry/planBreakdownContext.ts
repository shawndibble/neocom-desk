import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { SKILL_IDS, type IndustryActivity } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import type { pricingSourcesForHub } from './buildPlanPricingInputs';
import type { MarketSnapshot } from './marketData';
import { materialPriceBasisOf } from './priceBasis';
import type { usePlanMaterials } from './usePlanMaterials';

interface PlanBreakdownContextInput {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  hub: TradeHub;
  activity: IndustryActivity;
  modifiers: CharacterModifiers;
  snapshot: MarketSnapshot | null;
  costIndexSystemName: string;
  resolvedMe: number;
  productName: string;
  productQuantity: number | null;
  productUnitPrice: number | null;
  standing: ReturnType<typeof pricingSourcesForHub>['standing'];
  planSeconds: number | undefined;
  boughtDepth: ReturnType<typeof usePlanMaterials>['boughtDepth'];
}

/** What the Calculation Breakdown modal needs to explain the plan's numbers. */
export function planBreakdownContext({
  plan,
  catalog,
  hub,
  activity,
  modifiers,
  snapshot,
  costIndexSystemName,
  resolvedMe,
  productName,
  productQuantity,
  productUnitPrice,
  standing,
  planSeconds,
  boughtDepth,
}: PlanBreakdownContextInput) {
  return {
    hubName: hub.systemName,
    materialPriceBasis: materialPriceBasisOf(plan.materialPriceBasis),
    me: resolvedMe,
    isReaction: activity === 'reaction',
    accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
    brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
    systemCostIndex: snapshot?.systemCostIndex ?? null,
    costIndexSystemName,
    productName,
    productQuantity,
    productUnitPrice,
    standing,
    planSeconds,
    depthRows: [...boughtDepth].map(([typeID, walk]) => ({
      typeID,
      name: nameForType(catalog, typeID),
      walk,
    })),
  };
}
