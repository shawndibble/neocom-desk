import { describe, expect, it } from 'vitest';
import type { DetectedOwnedStockMap, OwnedStockScope } from './ownedStock';
import { compareGroupMembers, groupStockClaims, type GroupClaimMember } from './groupStockClaims';

const TRITANIUM = 34;
const PYERITE = 35;
const JITA = 60003760;
const AMARR = 60008494;

/** 10,000 Tritanium: 6,000 in Jita, 4,000 in Amarr. 500 Pyerite in Jita. */
const STOCK: DetectedOwnedStockMap = new Map([
  [
    TRITANIUM,
    {
      quantity: 10_000,
      placements: [
        { characterId: 1, locationId: JITA, locationType: 'station', quantity: 6_000 },
        { characterId: 1, locationId: AMARR, locationType: 'station', quantity: 4_000 },
      ],
    },
  ],
  [
    PYERITE,
    {
      quantity: 500,
      placements: [{ characterId: 1, locationId: JITA, locationType: 'station', quantity: 500 }],
    },
  ],
]);

function only(locationId: number): OwnedStockScope {
  return {
    mode: 'selected',
    locations: [{ characterId: 1, locationId, locationType: 'station' }],
  };
}

function member(
  id: string,
  owned: Record<number, number> = {},
  ownedStockScope?: OwnedStockScope
): GroupClaimMember {
  const materialSourcing: Record<number, { ownedQuantity: number }> = {};
  for (const [typeID, ownedQuantity] of Object.entries(owned)) {
    materialSourcing[Number(typeID)] = { ownedQuantity };
  }
  return { id, name: `Plan ${id}`, materialSourcing, ownedStockScope };
}

describe('groupStockClaims', () => {
  it('takes a claim made ahead of this plan out of what its offer may use', () => {
    const a = member('a', { [TRITANIUM]: 6_000 });
    const b = member('b');
    const claims = groupStockClaims(b, [a, b], STOCK)(TRITANIUM);
    expect(claims).toEqual({
      ahead: [{ planId: 'a', name: 'Plan a', quantity: 6_000 }],
      free: 4_000,
      overClaim: 0,
    });
  });

  it('answers null when no sibling claims the material, so the offer is unchanged', () => {
    const a = member('a', { [PYERITE]: 100 });
    const b = member('b');
    expect(groupStockClaims(b, [a, b], STOCK)(TRITANIUM)).toBeNull();
  });

  it('answers null for a plan with no siblings', () => {
    const a = member('a', { [TRITANIUM]: 6_000 });
    expect(groupStockClaims(a, [a], STOCK)(TRITANIUM)).toBeNull();
  });

  it('leaves the first member its own claim: a later claim never shrinks an earlier offer', () => {
    const a = member('a');
    const b = member('b', { [TRITANIUM]: 6_000 });
    const claims = groupStockClaims(a, [a, b], STOCK)(TRITANIUM);
    expect(claims?.ahead).toEqual([]);
    expect(claims?.free).toBe(10_000);
  });

  it('orders members by id, whatever order they are passed in', () => {
    const a = member('a', { [TRITANIUM]: 6_000 });
    const b = member('b', { [TRITANIUM]: 3_000 });
    const c = member('c');
    const claims = groupStockClaims(c, [c, b, a], STOCK)(TRITANIUM);
    expect(claims?.ahead.map((claim) => claim.planId)).toEqual(['a', 'b']);
    expect(claims?.free).toBe(1_000);
  });

  it('never offers less than nothing when the claims ahead exceed the stock', () => {
    const a = member('a', { [TRITANIUM]: 8_000 });
    const b = member('b', { [TRITANIUM]: 8_000 });
    const c = member('c');
    expect(groupStockClaims(c, [a, b, c], STOCK)(TRITANIUM)?.free).toBe(0);
  });

  it('ignores a sibling whose scope shares no stock with this plan', () => {
    const a = member('a', { [TRITANIUM]: 4_000 }, only(AMARR));
    const b = member('b', {}, only(JITA));
    expect(groupStockClaims(b, [a, b], STOCK)(TRITANIUM)).toBeNull();
  });

  it('counts a partly overlapping claim only up to the stock both scopes see', () => {
    // A sees everything and claims 9,000; B sees only Jita's 6,000. At most
    // 6,000 of A's claim can be stock B would draw on.
    const a = member('a', { [TRITANIUM]: 9_000 });
    const b = member('b', {}, only(JITA));
    expect(groupStockClaims(b, [a, b], STOCK)(TRITANIUM)).toEqual({
      ahead: [{ planId: 'a', name: 'Plan a', quantity: 6_000 }],
      free: 0,
      overClaim: 0,
    });
  });

  it('flags group claims beyond the stock on every claiming member', () => {
    const a = member('a', { [TRITANIUM]: 6_000 });
    const b = member('b', { [TRITANIUM]: 6_000 });
    expect(groupStockClaims(a, [a, b], STOCK)(TRITANIUM)?.overClaim).toBe(2_000);
    expect(groupStockClaims(b, [a, b], STOCK)(TRITANIUM)?.overClaim).toBe(2_000);
  });

  it("counts only the part of this plan's Have its scoped stock could cover", () => {
    // B typed 5,000 against Jita's 500 Pyerite; A claims 100 of it. Only 500
    // of B's Have can collide with A, so the group is 100 over, not 4,600.
    const a = member('a', { [PYERITE]: 100 });
    const b = member('b', { [PYERITE]: 5_000 });
    expect(groupStockClaims(b, [a, b], STOCK)(PYERITE)?.overClaim).toBe(100);
  });

  it('does not flag a member that claims nothing itself', () => {
    const a = member('a', { [TRITANIUM]: 6_000 });
    const b = member('b', { [TRITANIUM]: 6_000 });
    const c = member('c');
    expect(groupStockClaims(c, [a, b, c], STOCK)(TRITANIUM)?.overClaim).toBe(0);
  });

  it('treats a stored 0 as no claim', () => {
    const a = member('a', { [TRITANIUM]: 0 });
    const b = member('b');
    expect(groupStockClaims(b, [a, b], STOCK)(TRITANIUM)).toBeNull();
  });
});

describe('compareGroupMembers', () => {
  it('sorts by plan id, the order the group page lists members in', () => {
    const ids = ['c', 'a', 'b'].map((id) => member(id)).sort(compareGroupMembers);
    expect(ids.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});
