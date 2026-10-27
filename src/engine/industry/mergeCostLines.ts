/**
 * How two occurrences of one material combine into a single priced line.
 *
 * One rule, in one place, because its callers must not drift:
 * `features/industry/subBuildPlan.ts` merges a plan's own resolved tree by
 * typeID, `engine/industry/groupRollup.ts` merges those merges across a
 * Build Group's members, and `engine/industry/ownedStockSale.ts` merges the
 * owned stock a tree claims into one stack per type. The first two had the
 * rule written out field by field, which is one rule and two chances to get
 * it wrong.
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
 * - **The Blueprint Acquisition marker survives.** `acquisitionTier` is what
 *   keeps a blueprint row out of the multibuy text and off the owned-stock
 *   offer, so a merged blueprint row must still carry it.
 */

import type { AcquisitionTier, MaterialCostLine } from './types';

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
    ...((existing.acquisitionTier ?? line.acquisitionTier)
      ? { acquisitionTier: mergedTier(existing.acquisitionTier, line.acquisitionTier) }
      : {}),
  };
}

/**
 * Two rows of one blueprint at the same ME/TE tier need their runs added: the
 * first row already carries the Character's real owned runs (later nodes only
 * see what is left over), so owned and per-copy runs stay the first's and only
 * the needed runs sum. Tiers that differ drop the pooling.
 */
function mergedTier(
  existing: AcquisitionTier | undefined,
  line: AcquisitionTier | undefined
): AcquisitionTier | undefined {
  if (!existing || !line) return existing ?? line;
  if (existing.me !== line.me || existing.te !== line.te) {
    // Two tiers behind one summed row: no single set of runs describes it, so
    // it keeps what its nodes reported and a group leaves it unpooled.
    return {
      me: existing.me,
      te: existing.te,
      ...(existing.community ? { community: existing.community } : {}),
      ...(existing.invented ? { invented: existing.invented } : {}),
    };
  }
  if (!existing.pool || !line.pool) return existing;
  return {
    ...existing,
    pool: { ...existing.pool, neededRuns: existing.pool.neededRuns + line.pool.neededRuns },
  };
}
