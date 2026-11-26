import { filterStockByScope, type DetectedOwnedStockMap, type OwnedStockScope } from './ownedStock';

export interface GroupClaimMember {
  id: string;
  name: string;
  ownedStockScope?: OwnedStockScope;
  materialSourcing?: Readonly<Record<number, { ownedQuantity?: number }>>;
}

export interface SiblingClaim {
  planId: string;
  name: string;
  quantity: number;
}

export interface GroupStockClaims {
  ahead: SiblingClaim[];
  free: number;
  overClaim: number;
}

export function compareGroupMembers(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function claimed(member: GroupClaimMember, typeID: number): number {
  return member.materialSourcing?.[typeID]?.ownedQuantity ?? 0;
}

export function groupStockClaims(
  plan: GroupClaimMember,
  members: readonly GroupClaimMember[],
  stock: DetectedOwnedStockMap
): (typeID: number) => GroupStockClaims | null {
  const scopedStock = filterStockByScope(stock, plan.ownedStockScope);
  const siblings = members
    .filter((m) => m.id !== plan.id)
    .sort(compareGroupMembers)
    .map((sibling) => ({
      sibling,
      isAhead: compareGroupMembers(sibling, plan) < 0,
      shared: filterStockByScope(scopedStock, sibling.ownedStockScope),
    }));

  return (typeID) => {
    const ahead: SiblingClaim[] = [];
    let aheadTotal = 0;
    let siblingTotal = 0;
    for (const { sibling, isAhead, shared } of siblings) {
      const quantity = Math.min(claimed(sibling, typeID), shared.get(typeID)?.quantity ?? 0);
      if (quantity <= 0) continue;
      siblingTotal += quantity;
      if (isAhead) {
        ahead.push({ planId: sibling.id, name: sibling.name, quantity });
        aheadTotal += quantity;
      }
    }
    if (siblingTotal === 0) return null;
    const scoped = scopedStock.get(typeID)?.quantity ?? 0;
    const ownClaim = Math.min(claimed(plan, typeID), scoped);
    return {
      ahead,
      free: Math.max(0, scoped - aheadTotal),
      overClaim: ownClaim > 0 ? Math.max(0, ownClaim + siblingTotal - scoped) : 0,
    };
  };
}
