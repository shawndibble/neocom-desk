import { describe, expect, it } from 'vitest';
import type { BpcContractRow, BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { BPC_SEARCH_COLUMN_IDS } from './bpcSearchColumns';
import { bpcSourcingCsvColumns, type BpcSourcingCsvContext } from './bpcSourcingCsv';

const t = (k: string) => k;

const EXPIRES = Date.UTC(2026, 9, 1, 0, 0, 0);

function contract(patch: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    typeId: 1000,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 10,
    quantity: 1,
    dateExpired: EXPIRES,
    isMultiType: false,
    ...patch,
  };
}

function contractRow(patch: Partial<BpcContractRow> = {}): BpcSearchRow {
  const c = contract(patch);
  return {
    source: 'contract',
    typeId: c.typeId,
    me: c.me,
    te: c.te,
    runs: c.runs,
    quantity: c.quantity,
    contract: c,
    locationName: 'Jita IV - Moon 4',
    space: 'highsec',
    systemId: 30000142,
  };
}

const ownedRow: BpcSearchRow = {
  source: 'owned',
  typeId: 1000,
  me: 10,
  te: 20,
  runs: -1,
  quantity: 1,
  itemId: 99,
  locationName: null,
  regionId: null,
  space: null,
  systemId: null,
};

const marketRow: BpcSearchRow = {
  source: 'market',
  typeId: 1000,
  me: 0,
  te: 0,
  runs: -1,
  quantity: 3,
  orderId: 7,
  price: 40_000_000,
  regionId: 10000002,
  locationId: 60003760,
  atHub: true,
  locationName: 'Jita IV - Moon 4',
  space: 'highsec',
  systemId: 30000142,
};

const context: BpcSourcingCsvContext = {
  nameFor: (typeId) => `Blueprint ${typeId}`,
  regionName: (regionId) => (regionId === 10000002 ? 'The Forge' : `#${regionId}`),
  jumpsFor: (row) => (row.systemId === null ? null : 3),
};

function valuesOf(row: BpcSearchRow) {
  const columns = bpcSourcingCsvColumns(t, context, BPC_SEARCH_COLUMN_IDS);
  return Object.fromEntries(columns.map((c) => [c.header, c.value(row)]));
}

describe('bpcSourcingCsvColumns', () => {
  it('exports the item plus only the visible columns, in table order', () => {
    const columns = bpcSourcingCsvColumns(t, context, ['price', 'location', 'me']);
    expect(columns.map((c) => c.header)).toEqual([
      'bpcContracts.itemColumn',
      'bpcContracts.locationColumn',
      'bpcContracts.meColumn',
      'bpcContracts.priceColumn',
    ]);
  });

  it('exports a contract row raw: price, ISK/run, jumps, UTC expiry', () => {
    expect(valuesOf(contractRow())).toEqual({
      'bpcContracts.itemColumn': 'Blueprint 1000',
      'bpcContracts.sourceColumn': 'bpcContracts.sourceContractSingular',
      'bpcContracts.locationColumn': 'Jita IV - Moon 4',
      'bpcContracts.jumpsColumn': 3,
      'bpcContracts.meColumn': 10,
      'bpcContracts.teColumn': 20,
      'bpcContracts.runsColumn': 10,
      'bpcContracts.qtyColumn': 1,
      'bpcContracts.iskPerRunColumn': 500_000,
      'bpcContracts.priceColumn': 5_000_000,
      'bpcContracts.regionColumn': 'The Forge',
      'bpcContracts.spaceColumn': 'common.spaceOption.highsec',
      'bpcContracts.expiresColumn': '2026-10-01T00:00:00.000Z',
    });
  });

  it("prices an auction at its buyout, and leaves a PLEX barter's ISK price blank", () => {
    expect(
      valuesOf(contractRow({ isAuction: true, price: 1, buyout: 9_000_000 }))[
        'bpcContracts.priceColumn'
      ]
    ).toBe(9_000_000);
    expect(
      valuesOf(contractRow({ price: 0, requestedPlex: 500 }))['bpcContracts.priceColumn']
    ).toBeNull();
  });

  it('leaves a multi-type contract ISK/run blank — the price is for the whole contract', () => {
    expect(valuesOf(contractRow({ isMultiType: true }))['bpcContracts.iskPerRunColumn']).toBeNull();
  });

  it('exports an owned BPO with blank runs, price, jumps, region and expiry', () => {
    const values = valuesOf(ownedRow);
    expect(values['bpcContracts.sourceColumn']).toBe('bpcContracts.sourceOwned');
    expect(values['bpcContracts.runsColumn']).toBeNull();
    expect(values['bpcContracts.priceColumn']).toBeNull();
    expect(values['bpcContracts.iskPerRunColumn']).toBeNull();
    expect(values['bpcContracts.jumpsColumn']).toBeNull();
    expect(values['bpcContracts.locationColumn']).toBeNull();
    expect(values['bpcContracts.regionColumn']).toBeNull();
    expect(values['bpcContracts.spaceColumn']).toBeNull();
    expect(values['bpcContracts.expiresColumn']).toBeNull();
  });

  it('exports a market BPO at its order price', () => {
    const values = valuesOf(marketRow);
    expect(values['bpcContracts.sourceColumn']).toBe('bpcContracts.sourceMarketSingular');
    expect(values['bpcContracts.priceColumn']).toBe(40_000_000);
    expect(values['bpcContracts.regionColumn']).toBe('The Forge');
  });
});
