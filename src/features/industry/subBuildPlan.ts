/**
 * Turns a Build Plan's resolved materials — `buildVsBuy`'s own output, already
 * recursive (src/engine/industry/materialResolution) — into what the UI
 * needs: the materials table's indented rows, and the flat leaf list that is
 * actually left to shop for.
 *
 * There is deliberately no second computation of cost here. Before this
 * (docs/context/decisions/20260904-235527, since superseded), a plan's
 * Results panel priced the plan as written while this module separately
 * expanded one level of `buildHere` for the materials table alone — two
 * numbers, one of them stale the moment a player toggled a build. Now
 * `buildVsBuy` itself resolves every `buildHere` choice, at whatever depth,
 * into `result.materials[].subBuild`; this module only walks that tree.
 */

import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import {
  resolvedSubBuildFeeTotal,
  resolvedSubBuildSeconds,
} from '@/engine/industry/materialResolution';
import type { MaterialCostLine } from '@/engine/industry/types';

/** One row of the materials table: a resolved material plus how deep it sits in the build tree. */
export interface MaterialTableRow extends ResolvedMaterial {
  /** 0 for one of the plan's own materials; N for a recipe input N builds deep. */
  depth: number;
}

/**
 * Depth-first, each material immediately followed by its own recipe inputs
 * when it is being built, before its next sibling — a player who just chose
 * to build a component wants its inputs right under it, not scrolled past
 * every other row on the plan to find them, and the same is true one level
 * further down, however many levels a plan goes.
 */
export function materialTableRows(
  materials: readonly ResolvedMaterial[],
  depth = 0
): MaterialTableRow[] {
  const rows: MaterialTableRow[] = [];
  for (const material of materials) {
    rows.push({ ...material, depth });
    if (material.subBuild) rows.push(...materialTableRows(material.subBuild.inputs, depth + 1));
  }
  return rows;
}

/**
 * What the plan still has to acquire on the open market: every leaf of the
 * resolved tree that is not itself being built, merged by type — three
 * branches that each need the same mineral are one line to order, not three.
 * A built material never appears here itself; what it consumes does, however
 * far down that reaches.
 */
export function shoppingListMaterials(materials: readonly ResolvedMaterial[]): MaterialCostLine[] {
  const merged = new Map<number, MaterialCostLine>();

  const visit = (list: readonly ResolvedMaterial[]) => {
    for (const material of list) {
      if (material.subBuild) {
        visit(material.subBuild.inputs);
        continue;
      }
      const existing = merged.get(material.typeID);
      merged.set(
        material.typeID,
        existing
          ? {
              ...existing,
              baseQuantity: existing.baseQuantity + material.baseQuantity,
              quantity: existing.quantity + material.quantity,
              ownedQuantity: existing.ownedQuantity + material.ownedQuantity,
              remainingQuantity: existing.remainingQuantity + material.remainingQuantity,
              lineCost: existing.lineCost + material.lineCost,
              unpriced: existing.unpriced || material.unpriced,
            }
          : { ...material }
      );
    }
  };
  visit(materials);
  return [...merged.values()];
}

/** Every sub-job's own installation fee, added up across the whole resolved tree. */
export const subBuildFeeTotal = resolvedSubBuildFeeTotal;

/** Wall-clock every sub-job in the tree adds before the main run can even be installed. */
export const subBuildSeconds = resolvedSubBuildSeconds;

/** Whether any material on the plan is being built rather than bought. */
export function hasSubBuilds(materials: readonly ResolvedMaterial[]): boolean {
  return materials.some((material) => material.subBuild !== undefined);
}
