import { idSetKey } from '@/lib/idSetKey';
import type { BuildPlanRecord } from '@/db';
import type { StockReduction } from '@/engine/industry/jobConsumedStock';
import { filterStockByScope, type DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import type { OwnedStockChange } from '@/engine/industry/ownedStockOffer';
import type { OwnedStockScope } from '@/engine/industry/types';
import type { SourcingPatchEntry } from './buildPlanStore';
import { toIndustryBlueprint } from './blueprintCatalog';
import { buildPlanTypeIds, type RecipeCatalog } from './recipes';
import { stockLocationLabel, type OwnedStockDetection } from './ownedStockDetection';

type Translate = Parameters<typeof stockLocationLabel>[2];

export function materialTypeIdKey(rows: Iterable<{ typeID: number }>): string {
  const ids = new Set<number>();
  for (const row of rows) ids.add(row.typeID);
  return idSetKey(ids);
}

export function typeIdsFromKey(key: string): number[] {
  return key === '' ? [] : key.split(',').map(Number);
}

export function groupMaterialTypeIdKey(
  plans: readonly Pick<BuildPlanRecord, 'blueprintTypeID'>[],
  sources: RecipeCatalog
): string {
  const ids: { typeID: number }[] = [];
  for (const plan of plans) {
    const entry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
    if (!entry) continue;
    for (const typeID of buildPlanTypeIds(toIndustryBlueprint(entry.blueprint), sources)) {
      ids.push({ typeID });
    }
  }
  return materialTypeIdKey(ids);
}

export interface OwnedStockViewInput {
  stock: DetectedOwnedStockMap;
  stockBeforeJobs?: DetectedOwnedStockMap;
  reductions?: readonly StockReduction[];
  scope: OwnedStockScope | undefined;
  characterNames: ReadonlyMap<number, string>;
  locationNames: ReadonlyMap<number, string>;
  incompleteCharacters: readonly string[];
  incompleteCorporation?: string | null;
  corporationName?: string | null;
}

export interface OwnedStockView {
  detection: OwnedStockDetection;
}

export function ownedStockView(input: OwnedStockViewInput, t: Translate): OwnedStockView {
  const scopedStock = filterStockByScope(input.stock, input.scope);
  const scopedBeforeJobs = input.stockBeforeJobs
    ? filterStockByScope(input.stockBeforeJobs, input.scope)
    : scopedStock;
  const incompleteCharacters = input.incompleteCorporation
    ? [...input.incompleteCharacters, input.incompleteCorporation]
    : input.incompleteCharacters;
  const detection: OwnedStockDetection = {
    scopedQuantityFor: (typeID) => scopedStock.get(typeID)?.quantity ?? 0,
    reducedFor: (typeID) => {
      const quantity =
        (scopedBeforeJobs.get(typeID)?.quantity ?? 0) - (scopedStock.get(typeID)?.quantity ?? 0);
      if (quantity <= 0) return null;
      const blueprintNames = [
        ...new Set(
          (input.reductions ?? []).filter((r) => r.typeID === typeID).map((r) => r.blueprintName)
        ),
      ];
      return { quantity, blueprintNames };
    },
    lowerBound: incompleteCharacters.length > 0,
    incompleteCharacters,
    characterNameFor: (characterId) => input.characterNames.get(characterId) ?? t('common.unknown'),
    corporationNameFor: () => input.corporationName ?? t('common.unknown'),
    locationLabelFor: (placement) => stockLocationLabel(placement, input.locationNames, t),
  };
  return { detection };
}

export function planSourcingPatches(changes: readonly OwnedStockChange[]): SourcingPatchEntry[] {
  return changes.map(({ typeID, to }) => ({ typeID, patch: { ownedQuantity: to } }));
}

export function applyToGroupOwnedStock(
  ledger: Record<number, number>,
  changes: readonly Pick<OwnedStockChange, 'typeID' | 'to'>[]
): void {
  for (const { typeID, to } of changes) {
    if (to === undefined || to <= 0) delete ledger[typeID];
    else ledger[typeID] = to;
  }
}

export interface GroupOwnedDifference {
  typeID: number;
  name: string;
  group: number;
  plan: number;
}

export function groupOwnedDifference(
  materials: readonly { typeID: number; name: string }[],
  planOwned: Record<number, { ownedQuantity?: number } | undefined> | undefined,
  groupOwned: Record<number, number> | undefined
): GroupOwnedDifference | null {
  let best: GroupOwnedDifference | null = null;
  for (const { typeID, name } of materials) {
    const plan = Math.max(0, Math.floor(planOwned?.[typeID]?.ownedQuantity ?? 0));
    const group = Math.max(0, Math.floor(groupOwned?.[typeID] ?? 0));
    if (plan === group) continue;
    const gap = Math.abs(plan - group);
    const bestGap = best ? Math.abs(best.plan - best.group) : -1;
    if (gap > bestGap || (gap === bestGap && best && typeID < best.typeID)) {
      best = { typeID, name, group, plan };
    }
  }
  return best;
}
