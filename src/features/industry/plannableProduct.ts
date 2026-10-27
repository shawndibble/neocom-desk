/**
 * "What would a Build Plan for this typeID actually build?" — the lookup
 * behind `BuildPlanContextMenu`, which appears wherever an item name shows up
 * outside the Market Browser (the BPC search table, a contract's item list).
 *
 * Deliberately thinner than `blueprintCatalog.ts`: that builds the picker's
 * full searchable catalog and needs `types.json` for names, which a menu
 * offering one navigation action has no use for. This reads `blueprints.json`
 * alone.
 */
import { loadBlueprints } from '@/sde/loadSde';
import type { BlueprintMap } from '@/sde/types';

export interface PlannableIndex {
  /** Blueprint/formula typeID -> the typeID it produces. */
  productByBlueprintTypeID: ReadonlyMap<number, number>;
  /** Every typeID some blueprint or formula produces. */
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

/**
 * The product a Build Plan started from `typeId` should target, or null when
 * nothing in the game builds it.
 *
 * Two readings, because the menu appears on both kinds of row: a blueprint
 * (every BPC search row, and blueprint items inside a contract) means "build
 * what this makes", while a plain item means "build this". The blueprint
 * reading wins when a typeID is somehow both — `/industry?product=` takes the
 * *product*, so resolving a blueprint to itself would open a plan for the
 * copy instead of for the ship it prints.
 */
export function plannableProductTypeID(index: PlannableIndex, typeId: number): number | null {
  const product = index.productByBlueprintTypeID.get(typeId);
  if (product !== undefined) return product;
  return index.producibleTypeIDs.has(typeId) ? typeId : null;
}

/**
 * Not memoized: `loadBlueprints` already is, so the only per-call work is
 * rebuilding two maps — paid once per right-click, since the menu resolves on
 * open rather than on mount. Module-level caching here would buy nothing and
 * would leak one caller's resolved index into the next.
 */
export function loadPlannableIndex(): Promise<PlannableIndex> {
  return loadBlueprints().then(buildPlannableIndex);
}
