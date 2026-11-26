import type { BuildResult, MaterialCostLine } from '@/engine/industry/types';
import { materialTableRows, shoppingListMaterials, type MaterialTableRow } from './subBuildPlan';

export interface FlattenedBuildResult {
  shopping: MaterialCostLine[];
  table: MaterialTableRow[];
}

const flattenedByResult = new WeakMap<BuildResult, FlattenedBuildResult>();

export function flattenBuildResult(result: BuildResult): FlattenedBuildResult {
  const cached = flattenedByResult.get(result);
  if (cached) return cached;
  const flattened: FlattenedBuildResult = {
    shopping: shoppingListMaterials(result.materials),
    table: materialTableRows(result.materials),
  };
  flattenedByResult.set(result, flattened);
  return flattened;
}
