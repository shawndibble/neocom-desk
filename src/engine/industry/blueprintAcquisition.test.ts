import { describe, it, expect } from 'vitest';
import { selectBlueprintTier } from '@/engine/industry/blueprintAcquisition';
import type { OwnedBlueprintCopy } from '@/engine/industry/blueprintAcquisition';

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
      bpcOffers: [{ me: 0, te: 0, runs: 1, price: 1_000_000 }],
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
      bpcOffers: [{ me: 10, te: 20, runs: 5, price: 1 }],
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
      bpcOffers: [{ me: 6, te: 12, runs: 2, price: 10 }],
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
      bpcOffers: [{ me: 3, te: 6, runs: -1, price: 500 }],
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
      bpcOffers: [{ me: 0, te: 0, runs: 1, price: 5 }],
      bpoSellPrice: null,
      assumedMeForUnowned: 0,
    });
    // 5 runs needed, this offer covers 1 run per copy at 5 ISK: 5 copies = 25.
    expect(result).toEqual({ me: 0, te: 0, line: { unitPrice: 25, owned: false } });
  });
});
