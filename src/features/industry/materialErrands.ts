import type { MaterialSourcingMap } from '@/engine/industry/types';
import { materialRowState } from './materialRow';
import type { MaterialTableRow } from './subBuildPlan';

export type MaterialErrand = 'toBuy' | 'building' | 'blueprint' | 'have';

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

export function groupMaterialsByErrand(
  rows: readonly MaterialTableRow[],
  held?: ReadonlyMap<number, MaterialErrand>
): MaterialErrandGroups {
  const groups: MaterialErrandGroups = { toBuy: [], building: [], blueprint: [], have: [] };
  for (const row of rows) groups[held?.get(row.typeID) ?? materialErrand(row)].push(row);
  return groups;
}

export interface ErrandSubtotal {
  total: number;
  unpricedCount: number;
}

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
