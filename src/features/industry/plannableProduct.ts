import { loadBlueprints } from '@/sde/loadSde';
import type { BlueprintMap } from '@/sde/types';

export interface PlannableIndex {
  productByBlueprintTypeID: ReadonlyMap<number, number>;
  producibleTypeIDs: ReadonlySet<number>;
}

export function buildPlannableIndex(blueprints: BlueprintMap): PlannableIndex {
  const productByBlueprintTypeID = new Map<number, number>();
  const producibleTypeIDs = new Set<number>();
  for (const [idStr, blueprint] of Object.entries(blueprints)) {
    const productTypeID = blueprint.products[0]?.typeID;
    if (productTypeID === undefined) continue;
    productByBlueprintTypeID.set(Number(idStr), productTypeID);
    producibleTypeIDs.add(productTypeID);
  }
  return { productByBlueprintTypeID, producibleTypeIDs };
}

export function plannableProductTypeID(index: PlannableIndex, typeId: number): number | null {
  const product = index.productByBlueprintTypeID.get(typeId);
  if (product !== undefined) return product;
  return index.producibleTypeIDs.has(typeId) ? typeId : null;
}

export function loadPlannableIndex(): Promise<PlannableIndex> {
  return loadBlueprints().then(buildPlannableIndex);
}
