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
    ]);
  });

  it('writes numbers raw, names as text and the expiry as a UTC date', () => {
    const csv = toCsv([offer()], contractSearchCsvColumns(t, lookups));
    expect(csv.split('\r\n')[1]).toBe(
      '"Damage Control II",3,1500000,,"Jita",4,"The Forge",2026-09-30 12:00:00'
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
    expect(csv.split('\r\n')[1]).toBe('"Damage Control II",3,,,,,"The Forge",2026-09-30 12:00:00');
  });

  it('counts a PLEX ask into Price at the PLEX price, and lists the PLEX raw beside it', () => {
    const [, , price, plex] = contractSearchCsvColumns(t, lookups);
    const row = offer({ price: 1_000_000, requestedPlex: 10 });
    expect(price.value(row)).toBe(51_000_000);
    expect(plex.value(row)).toBe(10);
    const [, , unknownPrice] = contractSearchCsvColumns(t, { ...lookups, plexPrice: null });
    expect(unknownPrice.value(row)).toBeNull();
  });
});
