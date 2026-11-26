import { describe, it, expect } from 'vitest';
import {
  claimBlueprintTier,
  pooledOwnedCopies,
  resolveTierOption,
  selectBlueprintTier,
  tierOptions,
} from '@/engine/industry/blueprintAcquisition';
import type {
  OwnedBlueprintCopy,
  OwnedBlueprintPool,
} from '@/engine/industry/blueprintAcquisition';

function costAtMe(me: number): number | null {
  return 100 + (10 - me) * 20;
}

describe('selectBlueprintTier', () => {
  describe('copy-only blueprints (issue #6394)', () => {
    const base = {
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [],
      bpoSellPrice: null,
      assumedMeForUnowned: 5,
      copyOnly: true,
    } as const;

    it('flags the line and quotes ME 0 instead of the assumed ME when no copy is owned or offered', () => {
      expect(selectBlueprintTier(base)).toEqual({
        me: 0,
        te: 0,
        line: { unitPrice: null, owned: false },
        copyOnly: true,
      });
    });

    it('never assumes an original: a hub BPO price and original offers are ignored', () => {
      const result = selectBlueprintTier({
        ...base,
        bpoSellPrice: 500_000,
        bpcOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 400_000 }],
        extraOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 300_000 }],
        lastResortOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 200_000 }],
        communityOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 0 }],
      });
      expect(result.copyOnly).toBe(true);
      expect(result.line).toEqual({ unitPrice: null, owned: false });
    });

    it('an offered copy still prices the line and carries no flag', () => {
      const result = selectBlueprintTier({
        ...base,
        bpcOffers: [{ me: 0, te: 0, runs: 10, quantity: 1, price: 1_000 }],
      });
      expect(result.copyOnly).toBeUndefined();
      expect(result.line).toEqual({ unitPrice: 1_000, owned: false });
    });

    it('an owned copy covering the runs carries no flag', () => {
      const result = selectBlueprintTier({
        ...base,
        ownedCopies: [{ me: 0, te: 0, runs: 10 }],
      });
      expect(result.copyOnly).toBeUndefined();
      expect(result.line).toEqual({ unitPrice: 0, owned: true });
    });

    it('an ordinary blueprint with the same inputs still assumes an original', () => {
      const result = selectBlueprintTier({ ...base, copyOnly: false, assumedMeForUnowned: 5 });
      expect(result).toEqual({ me: 5, te: 0, line: { unitPrice: null, owned: false } });
    });
  });

  it('resolves to the assumed ME with an unpriceable line when nothing is owned and nothing can be bought', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: null, owned: false } });
  });

  it('an owned BPO wins and suppresses the line when it truly is the cheapest tier', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 10, te: 20, runs: -1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 0, te: 0, runs: 1, quantity: 1, price: 1_000_000 }],
      bpoSellPrice: 500_000,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 10, te: 20, line: null });
  });

  it('marks the line invented when an invention tier wins (issue #3990)', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 12,
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 2, te: 4, runs: 10, quantity: 1, price: 900_000 }],
      bpoSellPrice: null,
      extraOffers: [{ me: 3, te: 2, runs: 12, quantity: 1, price: 800_000, invented: true }],
      assumedMeForUnowned: 0,
    });
    expect(result).toMatchObject({
      me: 3,
      te: 2,
      line: { unitPrice: 800_000, owned: false, invented: true },
    });
  });

  it('picks a cheaper purchasable tier over a worse owned BPO', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 0, te: 0, runs: -1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 10,
      te: 20,
      line: { unitPrice: 1, owned: false },
      purchasedRuns: 5,
    });
  });

  it('nets an owned BPC against its own tier and shows the free/owned line when it fully covers the need', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 10 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [],
      bpoSellPrice: 999_999,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 6, te: 12, line: { unitPrice: 0, owned: true } });
  });

  it('buys whole copies to cover a shortfall at an owned BPC tier, never a fractional price', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 2 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 6, te: 12, runs: 2, quantity: 1, price: 10 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 6,
      te: 12,
      line: { unitPrice: 10, quantity: 2, owned: false },
      purchasedRuns: 4,
    });
  });

  it('treats an owned tier with an unmatched shortfall as unusable and falls back to a priceable candidate', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('an offer selling an original via contract (runs -1) fully covers any shortfall as one copy', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 50,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 3, te: 6, runs: -1, quantity: 1, price: 500 }],
      bpoSellPrice: 10_000,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 3,
      te: 6,
      line: { unitPrice: 500, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('ignores a candidate tier whose material cost is itself unpriceable', () => {
    const result = selectBlueprintTier({
      ownedCopies: [{ me: 10, te: 20, runs: -1 }],
      neededRuns: 5,
      materialCostAtMe: (me) => (me === 10 ? null : 100),
      bpcOffers: [{ me: 0, te: 0, runs: 1, quantity: 1, price: 5 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 5, quantity: 5, owned: false },
      purchasedRuns: 5,
    });
  });

  it('discards a malformed offer with zero runs rather than dividing by it', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: 0, quantity: 1, price: 1 }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('discards a malformed offer with negative runs (anything but the -1 original sentinel)', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: -3, quantity: 1, price: 1 }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('discards a malformed offer with zero or negative quantity', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: 5, quantity: 0, price: 1 }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it("discards a multi-type offer — its price is the whole contract's, not this blueprint's (issue #1076)", () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: 5, quantity: 1, price: 1, isMultiType: true }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('a multi-type offer cannot extend an owned tier either, not just the new-tier candidate', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 6, te: 12, runs: 2, quantity: 1, price: 1, isMultiType: true }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('discards a zero-price offer — a barter contract, not a genuinely free blueprint (issue #1080)', () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 10, te: 18, runs: 5, quantity: 1, price: 0 }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('a zero-price offer cannot extend an owned tier either, not just the new-tier candidate', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 6, te: 12, runs: 2, quantity: 1, price: 0 }],
      bpoSellPrice: 30,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 30, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it("nets a multi-copy listing's whole bundle, not one copy, against the shortfall", () => {
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: 2, quantity: 3, price: 10 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 10, owned: false },
      purchasedRuns: 6,
    });
  });
});

describe('tierOptions', () => {
  it('lists every owned tier plus the cheapest purchasable one, each with its own cost', () => {
    const owned: OwnedBlueprintCopy[] = [
      { me: 0, te: 0, runs: -1 },
      { me: 6, te: 12, runs: 10 },
    ];
    const options = tierOptions({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ me: 0, te: 0, ownedRuns: Infinity, cost: 300 }),
        expect.objectContaining({ me: 6, te: 12, ownedRuns: 10, cost: 180 }),
        expect.objectContaining({ me: 10, te: 20, ownedRuns: 0, cost: 101 }),
      ])
    );
    expect(options).toHaveLength(3);
  });

  it('picking the cheapest option and resolving it matches selectBlueprintTier', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 0, te: 0, runs: -1 }];
    const inputs = {
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    };
    const options = tierOptions(inputs);
    const cheapest = options.reduce((best, o) =>
      o.cost !== null && (best.cost === null || o.cost < best.cost) ? o : best
    );
    expect(resolveTierOption(cheapest, inputs.neededRuns)).toEqual(selectBlueprintTier(inputs));
  });

  it('lets a pilot resolve a deliberately worse owned tier, not just the cheapest', () => {
    const owned: OwnedBlueprintCopy[] = [
      { me: 0, te: 0, runs: -1 },
      { me: 6, te: 12, runs: 10 },
    ];
    const options = tierOptions({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: costAtMe,
      bpcOffers: [],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    const worseTier = options.find((o) => o.me === 6 && o.te === 12);
    expect(worseTier).toBeDefined();
    expect(resolveTierOption(worseTier!, 5)).toEqual({
      me: 6,
      te: 12,
      line: { unitPrice: 0, owned: true },
    });
  });

  it('returns an empty list when nothing is owned and nothing can be bought', () => {
    expect(
      tierOptions({
        ownedCopies: [],
        neededRuns: 5,
        materialCostAtMe: costAtMe,
        bpcOffers: [],
        bpoSellPrice: null,
        assumedMeForUnowned: 0,
      })
    ).toEqual([]);
  });
});

describe('pooledOwnedCopies / claimBlueprintTier (issue #860)', () => {
  it('seeds the pool from the raw owned copies on first use', () => {
    const pool: OwnedBlueprintPool = new Map();
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 5 }];
    expect(pooledOwnedCopies(owned, pool)).toEqual([{ me: 6, te: 12, runs: 5 }]);
  });

  it('a second branch sees the reduced remainder after an earlier branch claimed runs at that tier', () => {
    const pool: OwnedBlueprintPool = new Map();
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 5 }];

    const copiesForA = pooledOwnedCopies(owned, pool);
    const resolvedA = selectBlueprintTier({
      ownedCopies: copiesForA,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(resolvedA).toEqual({ me: 6, te: 12, line: { unitPrice: 0, owned: true } });
    claimBlueprintTier(pool, resolvedA, 5);

    const copiesForB = pooledOwnedCopies(owned, pool);
    expect(copiesForB).toEqual([{ me: 6, te: 12, runs: 0 }]);
    const resolvedB = selectBlueprintTier({
      ownedCopies: copiesForB,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [],
      bpoSellPrice: 200,
      assumedMeForUnowned: 0,
    });
    expect(resolvedB).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 200, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('never decrements a BPO (infinite-runs) tier — one original covers every branch', () => {
    const pool: OwnedBlueprintPool = new Map();
    const owned: OwnedBlueprintCopy[] = [{ me: 10, te: 20, runs: -1 }];

    const copiesForA = pooledOwnedCopies(owned, pool);
    const resolvedA = selectBlueprintTier({
      ownedCopies: copiesForA,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    claimBlueprintTier(pool, resolvedA, 5);

    const copiesForB = pooledOwnedCopies(owned, pool);
    expect(copiesForB).toEqual([{ me: 10, te: 20, runs: -1 }]);
  });

  it('leaves an untouched tier unaffected when only a sibling tier is claimed', () => {
    const pool: OwnedBlueprintPool = new Map();
    const owned: OwnedBlueprintCopy[] = [
      { me: 6, te: 12, runs: 3 },
      { me: 8, te: 16, runs: 4 },
    ];
    const copies = pooledOwnedCopies(owned, pool);
    claimBlueprintTier(pool, { me: 6, te: 12, line: { unitPrice: 0, owned: true } }, 3);

    const afterClaim = pooledOwnedCopies(copies, pool);
    expect(afterClaim).toEqual(
      expect.arrayContaining([
        { me: 6, te: 12, runs: 0 },
        { me: 8, te: 16, runs: 4 },
      ])
    );
  });

  it('is a no-op when claiming against a tier the pool never seeded (an unmatched override)', () => {
    const pool: OwnedBlueprintPool = new Map();
    pooledOwnedCopies([{ me: 6, te: 12, runs: 5 }], pool);
    claimBlueprintTier(pool, { me: 10, te: 20, line: { unitPrice: null, owned: false } }, 5);
    expect(pooledOwnedCopies([{ me: 6, te: 12, runs: 5 }], pool)).toEqual([
      { me: 6, te: 12, runs: 5 },
    ]);
  });
});

describe('selectBlueprintTier coverage (issue #1775)', () => {
  const base = {
    materialCostAtMe: costAtMe,
    bpcOffers: [],
    bpoSellPrice: null,
    assumedMeForUnowned: 0,
  };

  it('reports the covered runs when an owned BPC falls short and nothing extends it', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 6, te: 12, runs: 10 }],
      neededRuns: 20,
    });
    expect(result.line).toEqual({ unitPrice: null, owned: false });
    expect(result.coverage).toEqual({ coveredRuns: 10, neededRuns: 20 });
  });

  it('reports no shortfall when a matching BPC Sourcing offer extends the tier', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 6, te: 12, runs: 10 }],
      neededRuns: 20,
      bpcOffers: [{ me: 6, te: 12, runs: 10, quantity: 1, price: 1_000_000 }],
    });
    expect(result.coverage).toBeUndefined();
  });

  it('reports no shortfall when a BPO can be bought instead', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 6, te: 12, runs: 10 }],
      neededRuns: 20,
      bpoSellPrice: 500_000,
    });
    expect(result.coverage).toBeUndefined();
  });

  it('reports no shortfall for an owned BPO, a fully covering BPC, or nothing owned', () => {
    const needed = { ...base, neededRuns: 20 };
    expect(
      selectBlueprintTier({ ...needed, ownedCopies: [{ me: 6, te: 12, runs: -1 }] }).coverage
    ).toBeUndefined();
    expect(
      selectBlueprintTier({ ...needed, ownedCopies: [{ me: 6, te: 12, runs: 20 }] }).coverage
    ).toBeUndefined();
    expect(selectBlueprintTier({ ...needed, ownedCopies: [] }).coverage).toBeUndefined();
  });
});

describe('claimBlueprintTier — purchases join the pool (a blueprint is bought once per plan)', () => {
  it('a bought BPO covers every later node for free', () => {
    const pool: OwnedBlueprintPool = new Map();
    pooledOwnedCopies([], pool);
    claimBlueprintTier(
      pool,
      { me: 0, te: 0, line: { unitPrice: 200, owned: false }, purchasedRuns: Infinity },
      5
    );
    expect(pooledOwnedCopies([], pool)).toEqual([{ me: 0, te: 0, runs: -1 }]);
  });

  it('a bought BPC leaves its unused runs for the next node', () => {
    const pool: OwnedBlueprintPool = new Map();
    pooledOwnedCopies([], pool);
    claimBlueprintTier(
      pool,
      { me: 10, te: 20, line: { unitPrice: 100, owned: false }, purchasedRuns: 10 },
      3
    );
    expect(pooledOwnedCopies([], pool)).toEqual([{ me: 10, te: 20, runs: 7 }]);
  });

  it('tops up an owned tier with the runs bought to extend it', () => {
    const pool: OwnedBlueprintPool = new Map();
    pooledOwnedCopies([{ me: 6, te: 12, runs: 2 }], pool);
    claimBlueprintTier(
      pool,
      { me: 6, te: 12, line: { unitPrice: 20, owned: false }, purchasedRuns: 4 },
      5
    );
    expect(pooledOwnedCopies([], pool)).toEqual([{ me: 6, te: 12, runs: 1 }]);
  });
});

describe('selectBlueprintTier — every purchasable source competes on total cost', () => {
  const base = {
    ownedCopies: [] as OwnedBlueprintCopy[],
    neededRuns: 5,
    materialCostAtMe: costAtMe,
    bpcOffers: [],
    bpoSellPrice: null,
    assumedMeForUnowned: 0,
  };

  it('prices from an extra offer (an original, a market order, an LP redemption) when no hub copy is listed', () => {
    const result = selectBlueprintTier({
      ...base,
      extraOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 2_000 }],
    });
    expect(result).toEqual({
      me: 0,
      te: 0,
      line: { unitPrice: 2_000, owned: false },
      purchasedRuns: Infinity,
    });
  });

  it('prices each tier by the offer that covers the need cheapest, not the lowest sticker price', () => {
    const result = selectBlueprintTier({
      ...base,
      bpcOffers: [{ me: 0, te: 0, runs: 1, quantity: 1, price: 1_000 }],
      extraOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 3_000 }],
    });
    expect(result.line).toEqual({ unitPrice: 3_000, owned: false });
  });

  it('still lets a pricier higher-ME tier win when it makes the whole build cheaper', () => {
    const result = selectBlueprintTier({
      ...base,
      extraOffers: [
        { me: 0, te: 0, runs: -1, quantity: 1, price: 10 },
        { me: 10, te: 20, runs: 5, quantity: 1, price: 150 },
      ],
    });
    expect(result).toMatchObject({ me: 10, te: 20, line: { unitPrice: 150, owned: false } });
  });

  it('weighs the hub BPO sell price alongside listed copies rather than only when none are listed', () => {
    const result = selectBlueprintTier({
      ...base,
      bpcOffers: [{ me: 0, te: 0, runs: 1, quantity: 1, price: 100 }],
      bpoSellPrice: 200,
    });
    expect(result.line).toEqual({ unitPrice: 200, owned: false });
  });

  it('an owned copy that covers the need still resolves to free', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 0, te: 0, runs: -1 }],
      extraOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 1 }],
    });
    expect(result).toEqual({ me: 0, te: 0, line: null });
  });

  it('falls back to last-resort offers only when nothing else prices the blueprint', () => {
    const lastResortOffers = [{ me: 2, te: 4, runs: -1, quantity: 1, price: 9_000 }];
    expect(selectBlueprintTier({ ...base, lastResortOffers }).line).toEqual({
      unitPrice: 9_000,
      owned: false,
    });
    expect(
      selectBlueprintTier({
        ...base,
        bpoSellPrice: 50_000,
        lastResortOffers,
      }).line
    ).toEqual({ unitPrice: 50_000, owned: false });
  });

  it('drops a malformed extra offer the same way it drops a bad listing', () => {
    const result = selectBlueprintTier({
      ...base,
      extraOffers: [{ me: 0, te: 0, runs: 0, quantity: 1, price: 5 }],
    });
    expect(result.line).toEqual({ unitPrice: null, owned: false });
  });

  it.each([
    { runsPerCopy: 500, needed: 1000, copies: 2 },
    { runsPerCopy: 500, needed: 1001, copies: 3 },
    { runsPerCopy: 1, needed: 20, copies: 20 },
    { runsPerCopy: 500, needed: 20, copies: 1 },
  ])(
    'needs $copies copies of a $runsPerCopy-run blueprint for $needed runs',
    ({ runsPerCopy, needed, copies }) => {
      const result = selectBlueprintTier({
        ...base,
        neededRuns: needed,
        bpcOffers: [{ me: 0, te: 0, runs: runsPerCopy, quantity: 1, price: 100 }],
      });
      expect(result.line?.unitPrice).toBe(100);
      expect(result.line?.quantity ?? 1).toBe(copies);
    }
  );

  it('prices a genuinely free extra offer at 0 — an LP redemption with no ISK side at LP Value 0', () => {
    const result = selectBlueprintTier({
      ...base,
      extraOffers: [{ me: 0, te: 0, runs: 1, quantity: 1, price: 0 }],
    });
    expect(result.line).toMatchObject({ unitPrice: 0, owned: false });
  });

  it('still never prices a zero-ISK contract listing', () => {
    const result = selectBlueprintTier({
      ...base,
      bpcOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 0 }],
      lastResortOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 0 }],
    });
    expect(result.line).toEqual({ unitPrice: null, owned: false });
  });
});

describe('Community Offers (issue #3603)', () => {
  const base = {
    neededRuns: 5,
    materialCostAtMe: costAtMe,
    bpcOffers: [],
    bpoSellPrice: null,
    assumedMeForUnowned: 0,
  };
  const shared = { memberName: 'Alice', stale: false };

  it('a shared BPO covers the need at 0 ISK and names the Member', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      communityOffers: [{ me: 10, te: 20, runs: -1, quantity: 1, price: 0, community: shared }],
    });
    expect(result).toMatchObject({
      me: 10,
      te: 20,
      line: { unitPrice: 0, owned: false, community: shared },
    });
  });

  it('beats a priced contract offer at the same tier', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1_000 }],
      communityOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 0, community: shared }],
    });
    expect(result.line).toEqual({ unitPrice: 0, owned: false, community: shared });
  });

  it('an owned BPO at the same tier wins over a Community Offer', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 10, te: 20, runs: -1 }],
      communityOffers: [{ me: 10, te: 20, runs: -1, quantity: 1, price: 0, community: shared }],
    });
    expect(result).toEqual({ me: 10, te: 20, line: null });
  });

  it('a stale flag rides along', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      communityOffers: [
        {
          me: 5,
          te: 10,
          runs: -1,
          quantity: 1,
          price: 0,
          community: { memberName: 'Bob', stale: true },
        },
      ],
    });
    expect(result.line).toMatchObject({ community: { memberName: 'Bob', stale: true } });
  });

  it('tops up a short owned copy at its tier for free, naming the Member', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [{ me: 10, te: 20, runs: 2 }],
      communityOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 0, community: shared }],
    });
    expect(result.line).toMatchObject({ unitPrice: 0, community: shared });
  });

  it('a priced offer at a better ME still wins when its materials save more', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1 }],
      communityOffers: [{ me: 0, te: 0, runs: -1, quantity: 1, price: 0, community: shared }],
    });
    expect(result.me).toBe(10);
    expect(result.line).toEqual({ unitPrice: 1, owned: false });
  });

  it('ignores a malformed Community Offer', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      communityOffers: [{ me: 10, te: 20, runs: 0, quantity: 1, price: 0, community: shared }],
    });
    expect(result.line).toEqual({ unitPrice: null, owned: false });
  });

  it('a shared BPO beats a shared BPC at the same tier', () => {
    const result = selectBlueprintTier({
      ...base,
      ownedCopies: [],
      communityOffers: [
        {
          me: 10,
          te: 20,
          runs: 5,
          quantity: 1,
          price: 0,
          community: { memberName: 'Copy', stale: false },
        },
        { me: 10, te: 20, runs: -1, quantity: 1, price: 0, community: shared },
      ],
    });
    expect(result.line).toMatchObject({ community: shared });
    expect(result.purchasedRuns).toBe(Infinity);
  });
});
