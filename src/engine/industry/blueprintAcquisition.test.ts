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

/** Material cost doubles per ME point lost, floors at 100 for ME10 — enough spread to make tier choice matter without a real formula. */
function costAtMe(me: number): number | null {
  return 100 + (10 - me) * 20;
}

describe('selectBlueprintTier', () => {
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

  it('picks a cheaper purchasable tier over a worse owned BPO', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 0, te: 0, runs: -1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      // ME0 material cost is 300; a single 1-ISK BPC copy at ME10 (100) beats it.
      materialCostAtMe: costAtMe,
      bpcOffers: [{ me: 10, te: 20, runs: 5, quantity: 1, price: 1 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 10, te: 20, line: { unitPrice: 1, owned: false } });
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
    // Owns 2 runs at ME6, needs 5 — a 3-run shortfall. Only a matching-tier
    // offer (ME6/TE12) can extend that tier; the cheapest one has 2 runs at 10
    // ISK, so covering a 3-run shortfall needs 2 copies (ceil(3/2)) = 20 ISK.
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 2 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100, // flat, so the shortfall math is the only variable
      bpcOffers: [{ me: 6, te: 12, runs: 2, quantity: 1, price: 10 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 6, te: 12, line: { unitPrice: 20, owned: false } });
  });

  it('treats an owned tier with an unmatched shortfall as unusable and falls back to a priceable candidate', () => {
    const owned: OwnedBlueprintCopy[] = [{ me: 6, te: 12, runs: 1 }];
    const result = selectBlueprintTier({
      ownedCopies: owned,
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [], // no ME6 offer to extend the owned tier, and no other offer either
      bpoSellPrice: 30, // ME0 fallback is still priceable
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 30, owned: false } });
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
    expect(result).toEqual({ me: 3, te: 6, line: { unitPrice: 500, owned: false } });
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
    // 5 runs needed, this offer covers 1 run per copy at 5 ISK: 5 copies = 25.
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 25, owned: false } });
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
    // The zero-runs offer is unusable; falls through to the BPO sell price.
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 30, owned: false } });
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
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 30, owned: false } });
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
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 30, owned: false } });
  });

  it("nets a multi-copy listing's whole bundle, not one copy, against the shortfall", () => {
    // One contract lists 3 copies of a 2-run BPC for 10 ISK total (issue
    // #838 spec: "the total is the real ISK that would leave the wallet" —
    // buying this one contract nets 3 x 2 = 6 runs for 10 ISK, covering a
    // 5-run shortfall in a single purchase, not the 3 copies x 10 ISK a
    // per-copy read would charge.
    const result = selectBlueprintTier({
      ownedCopies: [],
      neededRuns: 5,
      materialCostAtMe: () => 100,
      bpcOffers: [{ me: 0, te: 0, runs: 2, quantity: 3, price: 10 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 10, owned: false } });
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

    // Each cost is the tier's total plan cost — material cost at that ME plus
    // whatever covering its shortfall costs (0 for the ME6 tier, which is
    // fully owned; 1 for the ME10 tier, bought outright).
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

    // Branch A needs 5 runs, fully covered by the owned tier.
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

    // Branch B needs the same blueprint type — the tier is now fully claimed,
    // so it must not also see 5 free owned runs.
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
    expect(resolvedB).toEqual({ me: 0, te: 0, line: { unitPrice: 200, owned: false } });
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
