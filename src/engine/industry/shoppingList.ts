import type { MaterialCostLine } from '@/engine/industry/types';

type ShoppingMaterial = MaterialCostLine & { acquisitionTier?: unknown };

function isMultibuyable(material: ShoppingMaterial): boolean {
  return material.remainingQuantity > 0 && material.acquisitionTier === undefined;
}

export function shoppingListText(
  materials: readonly ShoppingMaterial[],
  nameFor: (typeID: number) => string
): string {
  return materials
    .filter(isMultibuyable)
    .map((material) => `${nameFor(material.typeID)}\t${material.remainingQuantity}`)
    .join('\n');
}

export function hasShoppingList(materials: readonly ShoppingMaterial[]): boolean {
  return materials.some(isMultibuyable);
}

export function blueprintsLeftOutCount(materials: readonly ShoppingMaterial[]): number {
  return materials.filter(
    (material) => material.remainingQuantity > 0 && material.acquisitionTier !== undefined
  ).length;
}
