import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { GroupClaimMember } from '@/engine/industry/groupStockClaims';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroupSnapshot } from './buildGroups';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import type { BuildPlanChange } from './buildPlanStore';
import type { CorpOwnedStockState } from './corpOwnedStock';
import type { JobProductionSeed } from './logProductionFromJob';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import type { PlanGroup } from './usePlanOwnedStock';

export interface BuildPlanDetailProps {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  ownedStockSnapshot: OwnedStockSnapshot;
  corpOwnedStock: CorpOwnedStockState;
  pricingInputs: BuildPlanPricingInputs;
  onChange: (change: BuildPlanChange) => void;
  groupSnapshot: BuildGroupSnapshot | null;
  group?: PlanGroup | null;
  groupMembers?: readonly GroupClaimMember[];
  onSearchBpcSourcing: (blueprintTypeID: number) => void;
  pendingLogProduction?: JobProductionSeed | null;
  pendingLogProductionKey?: string;
}
