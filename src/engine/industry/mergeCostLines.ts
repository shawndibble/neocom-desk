/**
 * How two occurrences of one material combine into a single priced line.
 *
 * One rule, in one place, because there are two callers that must not drift:
 * `features/industry/subBuildPlan.ts` merges a plan's own resolved tree by
 * typeID, and `engine/industry/groupRollup.ts` merges those merges across a
 * Build Group's members. Both had the rule written out field by field, which
 * is one rule and two chances to get it wrong.
 *
 * Three of the fields need saying out loud:
 *
 * - **Quantities sum as their jobs rounded them.** EVE rounds material use
 *   once per job, so two jobs each wanting 4.5 units cost 5 + 5, not 9. A
 *   merged quantity must never be re-derived from a combined run count.
 * - **The first real unit price wins.** A price belongs to the type, not to
 *   where it was consumed, and `null` only ever means "this occurrence is
 *   being built" — so a built occurrence must not blank the price of a row
 *   that is also bought outright.
 * - **`unpriced` is sticky.** One occurrence with no price makes the merged
 *   line's cost an understatement, so the flag survives being merged with
 *   occurrences that priced fine.
 */

import type { MaterialCostLine } from './types';

/**
 * Written out field by field rather than spread, so a new member of
 * `MaterialCostLine` is a type error here — somewhere the merge rule for it
 * has to be decided — rather than a field that silently stops being carried.
 */
export function mergeCostLines(
  existing: MaterialCostLine,
  line: MaterialCostLine
): MaterialCostLine {
  return {
    typeID: existing.typeID,
    baseQuantity: existing.baseQuantity + line.baseQuantity,
    quantity: existing.quantity + line.quantity,
    ownedQuantity: existing.ownedQuantity + line.ownedQuantity,
    remainingQuantity: existing.remainingQuantity + line.remainingQuantity,
    unitPrice: existing.unitPrice ?? line.unitPrice,
    lineCost: existing.lineCost + line.lineCost,
    unpriced: existing.unpriced || line.unpriced,
  };
}
