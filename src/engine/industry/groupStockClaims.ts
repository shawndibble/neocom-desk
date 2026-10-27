/**
 * Group stock claims (issue #3992): what the other members of a plan's Build
 * Group have already claimed of the hangar stock its "Use assets" offer would
 * draw on.
 *
 * A member's set Have is a claim. A plan's offer takes away the claims of the
 * members ahead of it in group member order (`compareGroupMembers`) — the
 * first member keeps what it set, so a later claim never shrinks an earlier
 * member's offer. Display-only: nothing here rewrites any member's Have, and
 * the Group Owned Overlay (decision 20260909-212724) is a separate ledger this
 * never reads.
 *
 * Two scopes overlap on a material when stock the plan's scope sees is also
 * in the sibling's scope — measured on the stock itself
 * (`filterStockByScope` twice), so hangar divisions and containers are
 * handled by the same rule that narrows a plan's own offer. A sibling's claim
 * counts against the plan only up to that shared stock: it can't have taken
 * units its own scope never saw.
 */

import { filterStockByScope, type DetectedOwnedStockMap, type OwnedStockScope } from './ownedStock';

/** A group member as the claim rule reads it — a slice of `BuildPlanRecord`. */
export interface GroupClaimMember {
  id: string;
  name: string;
  ownedStockScope?: OwnedStockScope;
  materialSourcing?: Readonly<Record<number, { ownedQuantity?: number }>>;
}

/** Units of a material one sibling's Have takes from the plan's own scoped stock. */
export interface SiblingClaim {
  planId: string;
  name: string;
  quantity: number;
}

export interface GroupStockClaims {
  /** Claims from overlapping members ahead of this plan, in member order. */
  ahead: SiblingClaim[];
  /** The plan's scoped stock less `ahead`, never below 0 — what its offer may use. */
  free: number;
  /**
   * How far this plan's Have plus every overlapping sibling's claim runs past
   * its scoped stock; 0 when within it, or when the plan claims nothing.
   */
  overClaim: number;
}

/**
 * Group member order: by plan id, which is the order the group page lists
 * its members in (Dexie's `characterId` index returns them by primary key).
 * Members carry no order of their own.
 */
export function compareGroupMembers(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function claimed(member: GroupClaimMember, typeID: number): number {
  return member.materialSourcing?.[typeID]?.ownedQuantity ?? 0;
}

/**
 * The claims on each material, for `plan` among `members` (the plan itself
 * may be in the list; it is skipped). Answers `null` for a material no
 * overlapping sibling claims, where the offer behaves exactly as a standalone
 * plan's.
 */
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
    // A Have past the scoped stock may be typed for stock elsewhere; only
    // what it takes from this scope can collide with a sibling.
    const ownClaim = Math.min(claimed(plan, typeID), scoped);
    return {
      ahead,
      free: Math.max(0, scoped - aheadTotal),
      overClaim: ownClaim > 0 ? Math.max(0, ownClaim + siblingTotal - scoped) : 0,
    };
  };
}
