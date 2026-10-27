/**
 * Caches the two flattenings a Build Group rollup needs off one resolved
 * `BuildResult` (issue #626): `useComparedBuildResults` settles each member
 * independently, so `result` gets a fresh identity per settle, and without
 * this every already-settled member was re-flattened on each one. A
 * 25-member fit did ~650 material-tree walks to do 25 members' work.
 *
 * Keyed on the `BuildResult` object itself, not a plan id: a result is
 * replaced wholesale when its plan is repriced, so a cache entry is valid
 * exactly as long as the object it hangs off, and dies with it.
 */
import type { BuildResult, MaterialCostLine } from '@/engine/industry/types';
import { materialTableRows, shoppingListMaterials, type MaterialTableRow } from './subBuildPlan';

export interface FlattenedBuildResult {
  shopping: MaterialCostLine[];
  /** `subBuilds` intact — a caller that needs to know which rows are built reads it here. */
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
