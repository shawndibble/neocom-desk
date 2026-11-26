import type {
  EffectiveMaterial,
  HubPrices,
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';

function usable(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function materialCostLine(
  material: EffectiveMaterial,
  hubPrices: HubPrices,
  sourcing?: MaterialSourcing
): MaterialCostLine {
  const owned = Math.min(Math.floor(usable(sourcing?.ownedQuantity) ?? 0), material.quantity);
  const remainingQuantity = material.quantity - owned;
  const unitPrice = usable(sourcing?.overridePrice) ?? usable(hubPrices[material.typeID]) ?? null;
  return {
    ...material,
    ownedQuantity: owned,
    remainingQuantity,
    unitPrice,
    lineCost: unitPrice === null ? 0 : remainingQuantity * unitPrice,
    unpriced: remainingQuantity > 0 && unitPrice === null,
  };
}

export function materialCostLines(
  materials: readonly EffectiveMaterial[],
  hubPrices: HubPrices,
  sourcing?: MaterialSourcingMap
): MaterialCostLine[] {
  return materials.map((material) =>
    materialCostLine(material, hubPrices, sourcing?.[material.typeID])
  );
}

export function normalizeMaterialSourcingMap(
  sourcing: MaterialSourcingMap | undefined
): MaterialSourcingMap | undefined {
  if (sourcing === undefined) return undefined;
  const normalized: MaterialSourcingMap = {};
  let kept = false;
  for (const [key, entry] of Object.entries(sourcing)) {
    const typeID = Number(key);
    const ownedQuantity = usable(entry?.ownedQuantity);
    const overridePrice = usable(entry?.overridePrice);
    const acquisitionTierOverride = entry?.acquisitionTierOverride;
    if (
      !Number.isFinite(typeID) ||
      (ownedQuantity === undefined &&
        overridePrice === undefined &&
        acquisitionTierOverride === undefined)
    ) {
      continue;
    }
    normalized[typeID] = {
      ...(ownedQuantity !== undefined ? { ownedQuantity } : {}),
      ...(overridePrice !== undefined ? { overridePrice } : {}),
      ...(acquisitionTierOverride !== undefined ? { acquisitionTierOverride } : {}),
    };
    kept = true;
  }
  return kept ? normalized : undefined;
}
