import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { contractSearchCsvColumns, type ContractSearchCsvLookups } from './contractSearchCsv';

const t = (k: string) => k;

const lookups: ContractSearchCsvLookups = {
  typeName: (typeId) => (typeId === 2048 ? 'Damage Control II' : `#${typeId}`),
  regionName: (regionId) => (regionId === 10000002 ? 'The Forge' : `#${regionId}`),
  systemName: (row) => (row.locationId === 60003760 ? 'Jita' : null),
  jumps: (row) => (row.locationId === 60003760 ? 4 : null),
  plexPrice: 5_000_000,
  security: (row) => (row.locationId === 60003760 ? 0.95 : null),
  flagFor: (row) =>
    row.contractId === 9
      ? { kind: 'overpriced', multiple: 25, hubSell: 100, quantity: 3 }
      : row.contractId === 8
        ? { kind: 'copy-above-original', original: 100, asking: 250 }
        : null,
};

function offer(overrides: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 2048,
    price: 1_500_000,
    isAuction: false,
    quantity: 3,
    dateExpired: Date.UTC(2026, 8, 30, 12, 0, 0),
    ...overrides,
  };
}

describe('contractSearchCsvColumns', () => {
  it("uses the items table's headers, in table order", () => {
    expect(contractSearchCsvColumns(t, lookups).map((c) => c.header)).toEqual([
      'contractSearch.itemColumn',
      'contractSearch.qtyColumn',
      'contractSearch.priceColumn',
      'contractSearch.plexColumn',
      'contractSearch.systemColumn',
      'contractSearch.itemsJumpsColumn',
      'contractSearch.regionColumn',
      'contractSearch.expiresColumn',
      'contracts.typeAuction',
      'market.securityColumn',
      'contractSearch.priceFlagColumn',
      'contractSearch.priceFlagMultipleColumn',
      'contractSearch.priceFlagReferenceColumn',
    ]);
  });

  it('writes numbers raw, names as text and the expiry as a UTC date', () => {
    const csv = toCsv([offer()], contractSearchCsvColumns(t, lookups));
    expect(csv.split('\r\n')[1]).toBe(
      '"Damage Control II",3,1500000,,"Jita",4,"The Forge",2026-09-30 12:00:00,,0.95,,,'
    );
  });

  it("prices an auction at its buyout, the table's asking price", () => {
    const [, , price] = contractSearchCsvColumns(t, lookups);
    expect(price.value(offer({ isAuction: true, price: 100, buyout: 900 }))).toBe(900);
  });

  it('leaves an unpriced (barter) offer, an unplaced system and unknown jumps blank', () => {
    const csv = toCsv(
      [offer({ price: 0, locationId: 1_000_000_000_000 })],
      contractSearchCsvColumns(t, lookups)
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Damage Control II",3,,,,,"The Forge",2026-09-30 12:00:00,,,,,'
    );
  });

  it('counts a PLEX ask into Price at the PLEX price, and lists the PLEX raw beside it', () => {
    const [, , price, plex] = contractSearchCsvColumns(t, lookups);
    const row = offer({ price: 1_000_000, requestedPlex: 10 });
    expect(price.value(row)).toBe(51_000_000);
    expect(plex.value(row)).toBe(10);
    const [, , unknownPrice] = contractSearchCsvColumns(t, { ...lookups, plexPrice: null });
    expect(unknownPrice.value(row)).toBeNull();
  });

  it('names an auction as buyout or starting bid, blank for a plain sale', () => {
    const kind = contractSearchCsvColumns(t, lookups).find(
      (c) => c.header === 'contracts.typeAuction'
    )!;
    expect(kind.value(offer())).toBeNull();
    expect(kind.value(offer({ isAuction: true, buyout: 900 }))).toBe('contractSearch.buyoutShort');
    expect(kind.value(offer({ isAuction: true }))).toBe('contractSearch.startingBidShort');
  });

  it('exports the price flag and the multiple behind it, blank when unflagged', () => {
    const columns = contractSearchCsvColumns(t, lookups);
    const flag = columns.find((c) => c.header === 'contractSearch.priceFlagColumn')!;
    const multiple = columns.find((c) => c.header === 'contractSearch.priceFlagMultipleColumn')!;
    expect(flag.value(offer({ contractId: 9 }))).toBe('contractSearch.flag.overpricedLabel');
    expect(multiple.value(offer({ contractId: 9 }))).toBe(25);
    expect(flag.value(offer({ contractId: 8 }))).toBe('contractSearch.flag.copyLabel');
    expect(multiple.value(offer({ contractId: 8 }))).toBe(2.5);
    const reference = columns.find((c) => c.header === 'contractSearch.priceFlagReferenceColumn')!;
    expect(reference.value(offer({ contractId: 9 }))).toBe(300);
    expect(reference.value(offer({ contractId: 8 }))).toBe(100);
    expect(flag.value(offer())).toBeNull();
    expect(multiple.value(offer())).toBeNull();
  });
});
