/**
 * Adapts SDE blueprint + type data (src/sde) to a searchable catalog for the
 * Build Plan blueprint picker, and to the shape src/engine/industry expects.
 * Not memoized: callers hold the result in component state (see
 * src/features/skills/skillMap.ts for the same convention).
 */
import { loadBlueprints, loadTypes } from '@/sde/loadSde';
import type { BlueprintType, TypeMap } from '@/sde/types';
import type { IndustryBlueprint } from '@/engine/industry/types';

export interface BlueprintCatalogEntry {
  blueprintTypeID: number;
  blueprint: BlueprintType;
  /** Manufactured item type ID; null for a blueprint with no product (shouldn't happen in v1 data). */
  productTypeID: number | null;
  /** Product name when known, else the blueprint's own name. */
  productName: string;
}

export interface BlueprintCatalog {
  entries: BlueprintCatalogEntry[];
  byBlueprintTypeID: Map<number, BlueprintCatalogEntry>;
  /**
   * First blueprint producing a given item (Market Browser's "jump to a
   * Build Plan" context-menu action). Multiple blueprints can share a
   * product in principle; v1 data doesn't, so first-wins is fine.
   */
  byProductTypeID: Map<number, BlueprintCatalogEntry>;
  /** Raw type-info map (name lookups for materials), keyed by typeID string. */
  typesById: TypeMap;
}

export async function loadBlueprintCatalog(): Promise<BlueprintCatalog> {
  const [blueprints, types] = await Promise.all([loadBlueprints(), loadTypes()]);
  const entries: BlueprintCatalogEntry[] = [];
  const byBlueprintTypeID = new Map<number, BlueprintCatalogEntry>();
  const byProductTypeID = new Map<number, BlueprintCatalogEntry>();

  for (const [idStr, blueprint] of Object.entries(blueprints)) {
    const blueprintTypeID = Number(idStr);
    const product = blueprint.products[0];
    const productTypeID = product?.typeID ?? null;
    const productName =
      (productTypeID !== null ? types[String(productTypeID)]?.name : undefined) ?? blueprint.name;
    const entry: BlueprintCatalogEntry = { blueprintTypeID, blueprint, productTypeID, productName };
    entries.push(entry);
    byBlueprintTypeID.set(blueprintTypeID, entry);
    if (productTypeID !== null && !byProductTypeID.has(productTypeID)) {
      byProductTypeID.set(productTypeID, entry);
    }
  }

  return { entries, byBlueprintTypeID, byProductTypeID, typesById: types };
}

/** Item name for a typeID (materials, products), falling back to `#typeID` when unknown. */
export function nameForType(catalog: BlueprintCatalog, typeID: number): string {
  return catalog.typesById[String(typeID)]?.name ?? `#${typeID}`;
}

/** Case-insensitive substring search over product names. */
export function searchByProductName(
  catalog: BlueprintCatalog,
  query: string
): BlueprintCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.entries.filter((e) => e.productName.toLowerCase().includes(q));
}

/** Adapt an SDE BlueprintType to the shape src/engine/industry consumes (drops skills). */
export function toIndustryBlueprint(blueprint: BlueprintType): IndustryBlueprint {
  return {
    name: blueprint.name,
    time: blueprint.time,
    materials: blueprint.materials,
    products: blueprint.products,
  };
}
