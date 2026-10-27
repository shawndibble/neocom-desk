import { describe, expect, it } from 'vitest';
import type { PublicContractOfferRow } from './contractOffers';
import {
  bundleShareOfValue,
  contractFlagFor,
  splitFlagged,
  type ContractFlagContext,
} from './contractFlags';

function row(overrides: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 2048,
    price: 6_200_000,
    lineCount: 1,
    isAuction: false,
    quantity: 1,
    dateExpired: 0,
    ...overrides,
  };
}

const ctx = (over: Partial<ContractFlagContext> = {}): ContractFlagContext => ({
  hubSell: 412_000,
  threshold: 10,
  ...over,
});

describe('contractFlagFor', () => {
  it('flags an item asking the threshold times the hub sell for every unit', () => {
    expect(contractFlagFor(row(), ctx())).toEqual({
      kind: 'overpriced',
      multiple: 6_200_000 / 412_000,
      hubSell: 412_000,
      quantity: 1,
    });
  });

  it('flags at exactly the threshold and not below it', () => {
    expect(contractFlagFor(row({ price: 4_120_000 }), ctx())).not.toBeNull();
    expect(contractFlagFor(row({ price: 4_119_999 }), ctx())).toBeNull();
  });

  it('prices every unit the contract carries', () => {
    expect(contractFlagFor(row({ price: 4_350_000, quantity: 10 }), ctx())).toBeNull();
    expect(contractFlagFor(row({ price: 41_200_000, quantity: 10 }), ctx())).not.toBeNull();
  });

  it('follows the pilot threshold', () => {
    expect(contractFlagFor(row({ price: 2_100_000 }), ctx({ threshold: 5 }))).not.toBeNull();
    expect(contractFlagFor(row({ price: 2_100_000 }), ctx({ threshold: 10 }))).toBeNull();
  });

  it('never flags a contract with other lines: its price pays for all of them', () => {
    expect(contractFlagFor(row({ lineCount: 9 }), ctx())).toBeNull();
  });

  it('says nothing when the line count is unknown, as on a snapshot from before the field', () => {
    expect(contractFlagFor(row({ lineCount: undefined }), ctx())).toBeNull();
  });

  it('says nothing about a contract with several stacks: its one price pays for all of them', () => {
    expect(contractFlagFor(row({ lineCount: 2 }), ctx())).toBeNull();
  });

  it('says nothing about a contract that also asks for items: its price is not the whole ask', () => {
    expect(contractFlagFor(row({ requestsItems: true }), ctx())).toBeNull();
  });

  it('says nothing while the hub price is missing or zero', () => {
    expect(contractFlagFor(row(), ctx({ hubSell: null }))).toBeNull();
    expect(contractFlagFor(row(), ctx({ hubSell: 0 }))).toBeNull();
  });

  it('never flags a barter or an unpriced PLEX ask', () => {
    expect(contractFlagFor(row({ price: 0 }), ctx())).toBeNull();
    expect(contractFlagFor(row({ requestedPlex: 100 }), ctx())).toBeNull();
  });

  it('judges an auction on its buyout, and not at all without one', () => {
    expect(
      contractFlagFor(row({ isAuction: true, price: 1, buyout: 6_200_000 }), ctx())
    ).not.toBeNull();
    expect(contractFlagFor(row({ isAuction: true, price: 6_200_000 }), ctx())).toBeNull();
  });

  describe('blueprint copies', () => {
    const copy = (price: number) => row({ isBlueprintCopy: true, me: 2, te: 4, runs: 5, price });

    it('flags a copy asking more than the original sells for', () => {
      expect(contractFlagFor(copy(9_400_000), ctx({ hubSell: 6_800_000 }))).toEqual({
        kind: 'copy-above-original',
        original: 6_800_000,
        asking: 9_400_000,
        runs: 5,
      });
    });

    it('leaves a copy at or under the original alone, whatever the multiple', () => {
      expect(contractFlagFor(copy(6_800_000), ctx({ hubSell: 6_800_000 }))).toBeNull();
      expect(contractFlagFor(copy(520_000), ctx({ hubSell: 6_800_000, threshold: 5 }))).toBeNull();
    });

    it('does not flag an original blueprint as a copy', () => {
      const original = row({ me: 0, te: 0, price: 6_450_000, typeId: 2049 });
      expect(contractFlagFor(original, ctx({ hubSell: 6_800_000 }))).toBeNull();
    });

    it('says nothing without an original price', () => {
      expect(contractFlagFor(copy(9_400_000), ctx({ hubSell: null }))).toBeNull();
    });
  });
});

describe('splitFlagged', () => {
  const rows = [
    row({ contractId: 1 }),
    row({ contractId: 2, price: 400_000 }),
    row({ contractId: 3 }),
  ];
  const flagOf = (r: PublicContractOfferRow) => contractFlagFor(r, ctx());

  it('keeps the unflagged rows and sets the flagged ones aside, in order', () => {
    const { kept, hidden } = splitFlagged(rows, flagOf);
    expect(kept.map((r) => r.contractId)).toEqual([2]);
    expect(hidden.map((r) => r.contractId)).toEqual([1, 3]);
  });
});

describe('bundleShareOfValue', () => {
  it('is the searched lines share of the contract value at the hub', () => {
    expect(bundleShareOfValue({ mine: 412_000, rest: 46_200_000, unpricedLines: 0 })).toBeCloseTo(
      0.0088,
      4
    );
  });

  it('stays silent when any line is unpriced, since the share would be a guess', () => {
    expect(bundleShareOfValue({ mine: 412_000, rest: 46_200_000, unpricedLines: 1 })).toBeNull();
  });

  it('stays silent when nothing is priced', () => {
    expect(bundleShareOfValue({ mine: 0, rest: 0, unpricedLines: 0 })).toBeNull();
  });
});
