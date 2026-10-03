/**
 * Which errand a Build Plan materials row is: the section of the Materials
 * panel it is listed under. The panel reads as a shopping list first — what is
 * left to buy, then what is being built, the blueprint itself, and last what
 * is already covered — rather than one flat table where those four had to be
 * told apart by a glyph in a reserved slot beside the name.
 *
 * Precedence is fixed, first match wins:
 *
 * 1. A Blueprint Acquisition row is the blueprint, owned or not.
 * 2. A material being built here is Building, whatever is owned of it.
 * 3. Nothing left to get (fully owned, or a zero quantity) is Already have.
 * 4. Everything else — partly owned and unpriced rows included — is To buy.
 */

import type { MaterialSourcingMap } from '@/engine/industry/types';
import { materialRowState } from './materialRow';
import type { MaterialTableRow } from './subBuildPlan';

export type MaterialErrand = 'toBuy' | 'building' | 'blueprint' | 'have';

/** Display order of the sections. */
export const MATERIAL_ERRANDS: readonly MaterialErrand[] = [
  'toBuy',
  'building',
  'blueprint',
  'have',
];

export function materialErrand(row: MaterialTableRow): MaterialErrand {
  if (row.acquisitionTier) return 'blueprint';
  if (row.subBuilds.length > 0) return 'building';
  if (row.remainingQuantity <= 0) return 'have';
  return 'toBuy';
}

export type MaterialErrandGroups = Record<MaterialErrand, MaterialTableRow[]>;

/**
 * Splits rows into the four sections, keeping the caller's order within each.
 *
 * `held` pins a row to the section it was in, by typeID — for a row the player
 * is still editing. A Have commit lands on blur, and moving the row there and
 * then would unmount the very field focus is tabbing into; the caller holds
 * it until focus leaves the row.
 */
export function groupMaterialsByErrand(
  rows: readonly MaterialTableRow[],
  held?: ReadonlyMap<number, MaterialErrand>
): MaterialErrandGroups {
  const groups: MaterialErrandGroups = { toBuy: [], building: [], blueprint: [], have: [] };
  for (const row of rows) groups[held?.get(row.typeID) ?? materialErrand(row)].push(row);
  return groups;
}

export interface ErrandSubtotal {
  /** Sum of the line totals that are known. */
  total: number;
  /** Rows with a remainder and no price to put on it — left out of `total`. */
  unpricedCount: number;
}

/** What a section still costs, priced exactly as each row's own Total cell is. */
export function errandSubtotal(
  rows: readonly MaterialTableRow[],
  sourcing: MaterialSourcingMap | undefined,
  pricesReady: boolean
): ErrandSubtotal {
  let total = 0;
  let unpricedCount = 0;
  for (const row of rows) {
    const { lineCost } = materialRowState(row, sourcing, pricesReady);
    if (lineCost === null) unpricedCount += 1;
    else total += lineCost;
  }
  return { total, unpricedCount };
}
