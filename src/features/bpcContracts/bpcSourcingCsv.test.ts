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
  securityFor: (row) => (row.systemId === null ? null : 0.9),
  bpoBadgeFor: (row) =>
    row.typeId === 1000 && row.runs !== -1
      ? { price: 9_000_000, locationName: 'Amarr VIII', regionName: 'Domain', mayBeCheaper: true }
      : null,
};

const lpRow: BpcSearchRow = {
  source: 'lp',
  typeId: 1000,
  me: 0,
  te: 0,
  runs: null,
  quantity: 1,
  corporationId: 5,
  offerId: 6,
  corpName: 'Some Corp',
  price: 3_000_000,
  iskCost: 1_000_000,
  lpCost: 2000,
  lpPriced: true,
  regionId: null,
  locationName: null,
  space: null,
  systemId: 30000142,
  stationName: 'Jita IV - Moon 4',
};

function valuesOf(row: BpcSearchRow) {
  const columns = bpcSourcingCsvColumns(t, context);
  return Object.fromEntries(columns.map((c) => [c.header, c.value(row)]));
}

describe('bpcSourcingCsvColumns', () => {
  it('exports every column, however the column picker is set', () => {
    const headers = bpcSourcingCsvColumns(t, context).map((c) => c.header);
    for (const id of BPC_SEARCH_COLUMN_IDS) {
      expect(headers).toContain(`bpcContracts.${id}Column`);
    }
    expect(headers).toContain('bpcContracts.auctionKindColumn');
    expect(headers).toContain('bpcContracts.securityColumn');
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
      'bpcContracts.auctionKindColumn': null,
      'bpcContracts.plexAskColumn': null,
      'bpcContracts.wholeContractColumn': 'common.exportFlagNo',
      'bpcContracts.lpIskColumn': null,
      'bpcContracts.lpCostColumn': null,
      'bpcContracts.stationColumn': null,
      'bpcContracts.securityColumn': 0.9,
      'bpcContracts.atTradeHubColumn': null,
      'bpcContracts.bpoTooColumn': 'common.exportFlagYes',
      'bpcContracts.bpoPriceColumn': 9_000_000,
      'bpcContracts.bpoLocationColumn': 'Amarr VIII',
      'bpcContracts.bpoRegionColumn': 'Domain',
      'bpcContracts.bpoMayBeCheaperColumn': 'common.exportFlagYes',
      'bpcContracts.ownedColumn': 'common.exportFlagNo',
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

  it('names an auction as buyout or starting bid, and exports the PLEX ask and whole-contract flag', () => {
    const kind = (patch: Partial<BpcContractRow>) =>
      valuesOf(contractRow(patch))['bpcContracts.auctionKindColumn'];
    expect(kind({ isAuction: true, buyout: 9 })).toBe('contractSearch.buyoutShort');
    expect(kind({ isAuction: true })).toBe('contractSearch.startingBidShort');
    const barter = valuesOf(contractRow({ price: 0, requestedPlex: 500, isMultiType: true }));
    expect(barter['bpcContracts.plexAskColumn']).toBe(500);
    expect(barter['bpcContracts.wholeContractColumn']).toBe('common.exportFlagYes');
  });

  it('exports an LP offer ISK, LP cost and station, and flags owned and trade-hub rows', () => {
    const lp = valuesOf(lpRow);
    expect(lp['bpcContracts.lpIskColumn']).toBe(1_000_000);
    expect(lp['bpcContracts.lpCostColumn']).toBe(2000);
    expect(lp['bpcContracts.stationColumn']).toBe('Jita IV - Moon 4');
    expect(lp['bpcContracts.securityColumn']).toBe(0.9);
    expect(valuesOf(marketRow)['bpcContracts.atTradeHubColumn']).toBe('common.exportFlagYes');
    expect(valuesOf(ownedRow)['bpcContracts.ownedColumn']).toBe('common.exportFlagYes');
    expect(valuesOf(ownedRow)['bpcContracts.bpoTooColumn']).toBe('common.exportFlagNo');
  });
});
