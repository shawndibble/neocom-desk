import type { GroupStockClaims } from './groupStockClaims';
import { suggestedOwnedQuantity } from './ownedStock';

export interface OwnedStockOfferRow {
  typeID: number;
  quantity: number;
  acquisitionTier?: { me: number; te: number };
}

export type OwnedQuantityFor = (typeID: number) => number | undefined;

export type ScopedQuantityFor = (typeID: number) => number;

export function offerableStock(
  typeID: number,
  groupClaimsFor: ((typeID: number) => GroupStockClaims | null) | undefined,
  scopedQuantityFor: ScopedQuantityFor | undefined
): number {
  return groupClaimsFor?.(typeID)?.free ?? scopedQuantityFor?.(typeID) ?? 0;
}

export interface OwnedStockChange {
  typeID: number;
  from: number | undefined;
  to: number | undefined;
}

export type OwnedStockWrite = OwnedStockChange & { to: number };

export function ownedStockOffer(
  row: OwnedStockOfferRow,
  scopedQuantity: number,
  owned: number | undefined
): number | null {
  if (row.acquisitionTier !== undefined) return null;
  const offer = suggestedOwnedQuantity(scopedQuantity, row.quantity);
  return offer > 0 && offer !== owned ? offer : null;
}

export function takeEveryOffer(
  rows: readonly OwnedStockOfferRow[],
  ownedFor: OwnedQuantityFor,
  scopedQuantityFor: ScopedQuantityFor
): OwnedStockWrite[] {
  const changes: OwnedStockWrite[] = [];
  for (const row of rows) {
    const from = ownedFor(row.typeID);
    const to = ownedStockOffer(row, scopedQuantityFor(row.typeID), from);
    if (to !== null) changes.push({ typeID: row.typeID, from, to });
  }
  return changes;
}

export function clearEveryOwned(
  rows: readonly { typeID: number }[],
  ownedFor: OwnedQuantityFor
): OwnedStockWrite[] {
  const changes: OwnedStockWrite[] = [];
  for (const { typeID } of rows) {
    const from = ownedFor(typeID);
    if (from !== undefined && from !== 0) changes.push({ typeID, from, to: 0 });
  }
  return changes;
}

export function undoOwnedStockChanges(changes: readonly OwnedStockChange[]): OwnedStockChange[] {
  return changes.map(({ typeID, from, to }) => ({ typeID, from: to, to: from }));
}
