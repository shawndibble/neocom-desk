import { loadBlueprints, loadTypes } from '@/sde/loadSde';
import type { BlueprintMap, BlueprintType, TypeMap } from '@/sde/types';
import type { IndustryBlueprint } from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';

export interface BlueprintCatalogEntry {
  blueprintTypeID: number;
  blueprint: BlueprintType;
  productTypeID: number | null;
  productName: string;
  productNameLower: string;
}

export interface BlueprintCatalog {
  entries: BlueprintCatalogEntry[];
  byBlueprintTypeID: Map<number, BlueprintCatalogEntry>;
  byProductTypeID: Map<number, BlueprintCatalogEntry>;
  typesById: TypeMap;
}

export const EMPTY_BLUEPRINT_CATALOG: BlueprintCatalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map(),
  typesById: {},
};

let built: { blueprints: BlueprintMap; types: TypeMap; catalog: BlueprintCatalog } | null = null;

export async function loadBlueprintCatalog(): Promise<BlueprintCatalog> {
  const [blueprints, types] = await Promise.all([loadBlueprints(), loadTypes()]);
  if (built && built.blueprints === blueprints && built.types === types) return built.catalog;
  const catalog = buildCatalog(blueprints, types);
  built = { blueprints, types, catalog };
  return catalog;
}

function buildCatalog(blueprints: BlueprintMap, types: TypeMap): BlueprintCatalog {
  const entries: BlueprintCatalogEntry[] = [];
  const byBlueprintTypeID = new Map<number, BlueprintCatalogEntry>();
  const byProductTypeID = new Map<number, BlueprintCatalogEntry>();

  for (const [idStr, blueprint] of Object.entries(blueprints)) {
    const blueprintTypeID = Number(idStr);
    const product = blueprint.products[0];
    const productTypeID = product?.typeID ?? null;
    const productName =
      (productTypeID !== null ? types[String(productTypeID)]?.name : undefined) ?? blueprint.name;
    const entry: BlueprintCatalogEntry = {
      blueprintTypeID,
      blueprint,
      productTypeID,
      productName,
      productNameLower: productName.toLowerCase(),
    };
    entries.push(entry);
    byBlueprintTypeID.set(blueprintTypeID, entry);
    if (productTypeID !== null && !byProductTypeID.has(productTypeID)) {
      byProductTypeID.set(productTypeID, entry);
    }
  }

  return { entries, byBlueprintTypeID, byProductTypeID, typesById: types };
}

export function planTargetForItem(
  catalog: BlueprintCatalog,
  typeId: number
): { blueprintTypeID: number; productTypeID: number } | null {
  const asBlueprint = catalog.byBlueprintTypeID.get(typeId);
  if (asBlueprint?.productTypeID != null) {
    return {
      blueprintTypeID: asBlueprint.blueprintTypeID,
      productTypeID: asBlueprint.productTypeID,
    };
  }
  const asProduct = catalog.byProductTypeID.get(typeId);
  return asProduct ? { blueprintTypeID: asProduct.blueprintTypeID, productTypeID: typeId } : null;
}

export function nameForType(catalog: BlueprintCatalog, typeID: number): string {
  return catalog.typesById[String(typeID)]?.name ?? `#${typeID}`;
}

export function volumeForType(catalog: BlueprintCatalog, typeID: number): number | null {
  const entry = catalog.typesById[String(typeID)];
  const candidate = entry?.packagedVolume ?? entry?.volume;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : null;
}

export function searchByProductName(
  catalog: BlueprintCatalog,
  query: string
): BlueprintCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.entries.filter((e) => e.productNameLower.includes(q));
}

export function buildPlansByMaterialTypeID(
  plans: readonly BuildPlanRecord[],
  catalog: BlueprintCatalog
): Map<number, BuildPlanRecord> {
  const map = new Map<number, BuildPlanRecord>();
  for (const plan of plans) {
    const entry = catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
    if (!entry) continue;
    for (const material of entry.blueprint.materials) {
      if (!map.has(material.typeID)) map.set(material.typeID, plan);
    }
  }
  return map;
}

export interface MaterialUse {
  blueprintTypeID: number;
  productTypeID: number;
  productName: string;
  quantity: number;
  activity: BlueprintType['activity'];
}

const materialUsesByCatalog = new WeakMap<BlueprintCatalog, Map<number, MaterialUse[]>>();
const NO_USES: readonly MaterialUse[] = [];

export function materialUsesFor(catalog: BlueprintCatalog, typeID: number): readonly MaterialUse[] {
  let index = materialUsesByCatalog.get(catalog);
  if (!index) {
    index = new Map();
    for (const entry of catalog.entries) {
      const productTypeID = entry.productTypeID;
      if (productTypeID === null || catalog.byProductTypeID.get(productTypeID) !== entry) continue;
      for (const material of entry.blueprint.materials) {
        let uses = index.get(material.typeID);
        if (!uses) index.set(material.typeID, (uses = []));
        uses.push({
          blueprintTypeID: entry.blueprintTypeID,
          productTypeID,
          productName: entry.productName,
          quantity: material.quantity,
          activity: entry.blueprint.activity,
        });
      }
    }
    for (const uses of index.values()) {
      uses.sort((a, b) => a.productName.localeCompare(b.productName));
    }
    materialUsesByCatalog.set(catalog, index);
  }
  return index.get(typeID) ?? NO_USES;
}

export function toIndustryBlueprint(blueprint: BlueprintType): IndustryBlueprint {
  return {
    name: blueprint.name,
    time: blueprint.time,
    materials: blueprint.materials,
    products: blueprint.products,
    activity: blueprint.activity,
    skills: blueprint.skills,
    maxProductionLimit: blueprint.maxProductionLimit,
    rigScope: blueprint.rigScope,
  };
}
