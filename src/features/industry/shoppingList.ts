/**
 * The plan's materials as EVE's multibuy text: one `name<TAB>quantity` line per
 * material still to be acquired, ready to paste straight into the in-game
 * multibuy window and ordered in one go.
 *
 * Deliberately not the CSV export's shape (`materialsCsv.ts`). That one is a
 * priced record of the whole table — five columns, every row, a make-or-buy
 * verdict — read by a spreadsheet. This one is read by the game, so it carries
 * only what the game parses:
 *
 * - Quantities are raw digits. Every other quantity in this feature goes
 *   through `toLocaleString`/`maskNumber`, and a grouped "1,234,567" is not a
 *   number multibuy accepts.
 * - The separator is a tab, not a space: item names contain spaces ("Nanite
 *   Repair Paste"), so a space leaves no unambiguous split point.
 * - No header row and no price column — either one makes the paste fail.
 *
 * The quantity is `remainingQuantity`, which the engine has already sized to
 * every run of the plan, reduced by ME, and netted against the units the plan
 * records as owned. That is exactly "what I need, less what I already have",
 * so there is no arithmetic to redo here. A row with nothing remaining is
 * dropped rather than listed as 0.
 *
 * A material the table advises building is still listed. The verdict is advice
 * about how to spend, not a statement about what this shopping trip needs, and
 * a player who takes it buys that item's inputs from a build plan of its own.
 * Nothing is lost by including it either: `makeOrBuy` is one level deep, so
 * the sub-inputs that would replace the row do not exist on this plan.
 */

import type { MaterialCostLine } from '@/engine/industry/types';

export function shoppingListText(
  materials: readonly MaterialCostLine[],
  nameFor: (typeID: number) => string
): string {
  return materials
    .filter((material) => material.remainingQuantity > 0)
    .map((material) => `${nameFor(material.typeID)}\t${material.remainingQuantity}`)
    .join('\n');
}

/**
 * Whether there is anything to copy. The copy control gates on this rather than
 * on the materials list being non-empty: a plan whose every material is already
 * owned has rows to show but nothing to order, and a button that copies an
 * empty string is worse than one that is plainly unavailable.
 */
export function hasShoppingList(materials: readonly MaterialCostLine[]): boolean {
  return materials.some((material) => material.remainingQuantity > 0);
}
