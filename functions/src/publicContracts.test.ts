import { describe, it, expect } from 'vitest';
import {
  parseContractsCsv,
  parseContractItemsCsv,
  filterAndCompactBpcContracts,
  eligibleContractFrom,
  compactBpcItemRow,
  sortBpcRows,
  chunkRows,
  chunkDocId,
  DEFAULT_CHUNK_SIZE,
  compactContractItemRow,
  filterAndCompactPublicContractItems,
  sortContractItemRows,
  PUBLIC_BPC_CONTRACTS_COLLECTION,
  PUBLIC_CONTRACT_ITEMS_CHUNK_SIZE,
  PUBLIC_CONTRACT_ITEMS_COLLECTION,
} from './publicContracts.js';

// Column order and sample values verified against a live EVE Ref
// public-contracts-latest.v2.tar.bz2 pull (2026-09-08) — see ADR 0013.
const CONTRACTS_HEADER =
  'collateral,contract_id,date_expired,date_issued,days_to_complete,end_location_id,issuer_corporation_id,issuer_id,price,reward,start_location_id,title,type,volume,http_last_modified,region_id,station_id,system_id,constellation_id,for_corporation,buyout';

const ITEMS_HEADER =
  'is_blueprint_copy,is_included,item_id,material_efficiency,quantity,record_id,runs,time_efficiency,type_id,http_last_modified,contract_id';

function contractsCsv(rows: string[]): string {
  return [CONTRACTS_HEADER, ...rows].join('\n');
}

function itemsCsv(rows: string[]): string {
  return [ITEMS_HEADER, ...rows].join('\n');
}

const NOW = Date.parse('2026-09-08T18:00:00Z');
const FUTURE = '2026-09-09T18:00:00Z';
const PAST = '2026-09-01T00:00:00Z';

describe('parseContractsCsv / parseContractItemsCsv', () => {
  it('parses a quoted title containing commas without shifting later columns', () => {
    const rows = parseContractsCsv(
      contractsCsv([
        `0.0,234920481,${FUTURE},2026-08-11T18:10:34Z,0,60005668,98745702,2120819548,500000.0,0.0,60005668,"Rigs, 10/20, max ME",item_exchange,100.0,2026-09-08T18:08:11Z,10000043,60005668,30002197,20000323,true,`,
      ])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Rigs, 10/20, max ME');
    expect(rows[0].type).toBe('item_exchange');
    expect(rows[0].region_id).toBe('10000043');
  });

  it('parses contract items, leaving is_blueprint_copy blank for non-blueprint rows', () => {
    const rows = parseContractItemsCsv(
      itemsCsv([
        '"",true,1053870035543,,1,5283227393,,,47789,2026-09-01T11:31:53Z,234920432',
        'true,true,1043607688037,10,1,5283227785,1,20,32858,2026-09-01T11:31:43Z,234920481',
      ])
    );
    expect(rows[0].is_blueprint_copy).toBe('');
    expect(rows[1].is_blueprint_copy).toBe('true');
    expect(rows[1].material_efficiency).toBe('10');
  });
});

describe('filterAndCompactBpcContracts', () => {
  const contracts = contractsCsv([
    // eligible: item_exchange, not yet expired
    `0.0,1,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"BPC bundle",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    // eligible: auction, with a buyout
    `0.0,2,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,1000000.0,0.0,60008494,"Auctioned BPC",auction,10.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,9000000.0`,
    // ineligible type: courier carries no priced item to search
    `0.0,3,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,,0.0,60003760,"Courier run",courier,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    // already expired by the time this job runs
    `0.0,4,${PAST},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Lapsed",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
  ]);

  const items = itemsCsv([
    // BPC, included, on the eligible item_exchange contract 1
    'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
    // a second BPC on the same contract (bundle)
    'true,true,2,4,1,1002,5,10,32880,2026-09-01T11:31:43Z,1',
    // BPC, included, on the eligible auction contract 2
    'true,true,3,0,1,1003,1,0,20185,2026-09-01T11:31:43Z,2',
    // BPC, but is_included=false (requested from the buyer, not for sale) — excluded
    'true,false,4,10,1,1004,1,10,32858,2026-09-01T11:31:43Z,1',
    // not a blueprint at all — excluded
    '"",true,5,,1,1005,,,47789,2026-09-01T11:31:43Z,1',
    // a BPC on the courier contract (ineligible contract type) — excluded
    'true,true,6,10,1,1006,1,10,32858,2026-09-01T11:31:43Z,3',
    // a BPC on the lapsed contract — excluded
    'true,true,7,10,1,1007,1,10,32858,2026-09-01T11:31:43Z,4',
    // a BPC whose contract_id matches nothing in contracts.csv — excluded
    'true,true,8,10,1,1008,1,10,32858,2026-09-01T11:31:43Z,999',
  ]);

  it('joins BPC item rows to their eligible, unexpired parent contract', () => {
    const rows = filterAndCompactBpcContracts(
      parseContractsCsv(contracts),
      parseContractItemsCsv(items),
      NOW
    );

    expect(rows.map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:32858',
      '1:32880',
      '2:20185',
    ]);
  });

  it('carries region, location, price, ME/TE/runs and the auction flag through', () => {
    const [row] = filterAndCompactBpcContracts(
      parseContractsCsv(contracts),
      parseContractItemsCsv(items),
      NOW
    );

    expect(row).toMatchObject({
      contractId: 1,
      regionId: 10000002,
      locationId: 60003760,
      typeId: 32858,
      price: 5000000,
      isAuction: false,
      me: 10,
      te: 18,
      runs: 3,
      quantity: 1,
    });
    expect(row.buyout).toBeUndefined();
    expect(row.dateExpired).toBe(Date.parse(FUTURE));
  });

  it('carries buyout only when the contract has one', () => {
    const rows = filterAndCompactBpcContracts(
      parseContractsCsv(contracts),
      parseContractItemsCsv(items),
      NOW
    );
    const auctionRow = rows.find((r) => r.contractId === 2);
    expect(auctionRow?.isAuction).toBe(true);
    expect(auctionRow?.buyout).toBe(9000000);
  });

  it('excludes a BPC item requested from the buyer rather than offered for sale', () => {
    const rows = filterAndCompactBpcContracts(
      parseContractsCsv(contracts),
      parseContractItemsCsv(items),
      NOW
    );
    expect(
      rows.some((r) => r.typeId === 32858 && r.quantity === 1 && r.me === 10 && r.te === 10)
    ).toBe(false);
  });

  it('is empty given no rows', () => {
    expect(filterAndCompactBpcContracts([], [], NOW)).toEqual([]);
  });

  it('sorts deterministically by contract then type, independent of input order', () => {
    const shuffledItems = itemsCsv([
      'true,true,3,0,1,1003,1,0,20185,2026-09-01T11:31:43Z,2',
      'true,true,2,4,1,1002,5,10,32880,2026-09-01T11:31:43Z,1',
      'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
    ]);
    const rows = filterAndCompactBpcContracts(
      parseContractsCsv(contracts),
      parseContractItemsCsv(shuffledItems),
      NOW
    );
    expect(rows.map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:32858',
      '1:32880',
      '2:20185',
    ]);
  });
});

// The per-row seams the streaming sync drives directly. They are what
// `filterAndCompactBpcContracts` is built from, so the suite above still
// covers the whole join; these pin the pieces in isolation.
describe('eligibleContractFrom', () => {
  const [itemExchange, auction, courier, lapsed] = parseContractsCsv(
    contractsCsv([
      `0.0,1,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"BPC bundle",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `0.0,2,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,1000000.0,0.0,60008494,"Auctioned BPC",auction,10.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,9000000.0`,
      `0.0,3,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,,0.0,60003760,"Courier run",courier,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `0.0,4,${PAST},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Lapsed",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    ])
  );

  it('narrows a searchable contract to the fields the join needs', () => {
    expect(eligibleContractFrom(itemExchange, NOW)).toEqual({
      contractId: 1,
      regionId: 10000002,
      locationId: 60003760,
      price: 5000000,
      isAuction: false,
      dateExpired: Date.parse(FUTURE),
    });
  });

  it('keeps buyout only when the contract carries one', () => {
    expect(eligibleContractFrom(auction, NOW)?.buyout).toBe(9000000);
    expect(eligibleContractFrom(itemExchange, NOW)?.buyout).toBeUndefined();
  });

  it('rejects a contract type that carries no priced item to search', () => {
    expect(eligibleContractFrom(courier, NOW)).toBeNull();
  });

  it('rejects a contract that lapsed between the scrape and this run', () => {
    expect(eligibleContractFrom(lapsed, NOW)).toBeNull();
  });

  it('rejects an unparsable expiry rather than admitting a NaN row', () => {
    const [broken] = parseContractsCsv(
      contractsCsv([
        `0.0,5,not-a-date,2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Broken",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      ])
    );
    expect(eligibleContractFrom(broken, NOW)).toBeNull();
  });
});

describe('compactBpcItemRow', () => {
  const parent = {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    price: 5000000,
    isAuction: false,
    dateExpired: Date.parse(FUTURE),
  };

  const [bpc, requested, notBlueprint] = parseContractItemsCsv(
    itemsCsv([
      'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
      'true,false,4,10,1,1004,1,10,32858,2026-09-01T11:31:43Z,1',
      '"",true,5,,1,1005,,,47789,2026-09-01T11:31:43Z,1',
    ])
  );

  it('joins a for-sale BPC to its parent contract', () => {
    expect(compactBpcItemRow(bpc, parent)).toEqual({
      contractId: 1,
      regionId: 10000002,
      locationId: 60003760,
      typeId: 32858,
      price: 5000000,
      isAuction: false,
      me: 10,
      te: 18,
      runs: 3,
      quantity: 1,
      dateExpired: Date.parse(FUTURE),
    });
  });

  it('carries the parent buyout through when there is one', () => {
    expect(compactBpcItemRow(bpc, { ...parent, buyout: 9000000 })?.buyout).toBe(9000000);
  });

  it('rejects a BPC the issuer wants rather than offers', () => {
    expect(compactBpcItemRow(requested, parent)).toBeNull();
  });

  it('rejects an item that is not a blueprint copy', () => {
    expect(compactBpcItemRow(notBlueprint, parent)).toBeNull();
  });
});

describe('sortBpcRows', () => {
  it('orders by contract then type, in place, independent of input order', () => {
    const row = (contractId: number, typeId: number) =>
      ({ contractId, typeId }) as ReturnType<typeof compactBpcItemRow> & object;
    const rows = [row(2, 20185), row(1, 32880), row(1, 32858)];
    expect(sortBpcRows(rows as never).map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:32858',
      '1:32880',
      '2:20185',
    ]);
  });
});

describe('chunkRows', () => {
  it('splits rows into fixed-size chunks, in order', () => {
    const rows = Array.from({ length: 5 }, (_, i) => i);
    expect(chunkRows(rows, 2)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('returns one empty result for no rows', () => {
    expect(chunkRows([], 2)).toEqual([]);
  });

  it('returns a single chunk when rows fit within one chunk size', () => {
    expect(chunkRows([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('defaults to DEFAULT_CHUNK_SIZE', () => {
    const rows = Array.from({ length: DEFAULT_CHUNK_SIZE + 1 }, (_, i) => i);
    expect(chunkRows(rows)).toHaveLength(2);
  });

  it('rejects a non-positive chunk size', () => {
    expect(() => chunkRows([1], 0)).toThrow();
  });
});

describe('chunkDocId', () => {
  it('zero-pads so lexicographic and numeric chunk order agree', () => {
    expect(chunkDocId(0)).toBe('chunk-0000');
    expect(chunkDocId(12)).toBe('chunk-0012');
    expect(chunkDocId(0) < chunkDocId(12)).toBe(true);
  });
});

describe('compactContractItemRow', () => {
  const parent = {
    contractId: 1,
    regionId: 10000002,
    locationId: 60003760,
    price: 5000000,
    isAuction: false,
    dateExpired: Date.parse(FUTURE),
  };

  const [bpc, requested, notBlueprint, blueprintOriginal] = parseContractItemsCsv(
    itemsCsv([
      'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
      'true,false,4,10,1,1004,1,10,32858,2026-09-01T11:31:43Z,1',
      '"",true,5,,250,1005,,,34,2026-09-01T11:31:43Z,1',
      'false,true,6,10,1,1006,-1,20,32858,2026-09-01T11:31:43Z,1',
    ])
  );

  it('keeps a plain item line, which the blueprint-only join drops', () => {
    expect(compactBpcItemRow(notBlueprint, parent)).toBeNull();
    expect(compactContractItemRow(notBlueprint, parent)).toEqual({
      contractId: 1,
      regionId: 10000002,
      locationId: 60003760,
      typeId: 34,
      price: 5000000,
      isAuction: false,
      quantity: 250,
      dateExpired: Date.parse(FUTURE),
    });
  });

  it('omits ME/TE/runs on a non-blueprint line rather than writing zeros', () => {
    // Number('') is 0, not NaN: writing these unconditionally would put
    // `me: 0, te: 0, runs: 0` on every ore stack in New Eden, both inflating
    // the chunk docs and making an "ME 0" search match all of them.
    const row = compactContractItemRow(notBlueprint, parent);
    expect(row).not.toHaveProperty('me');
    expect(row).not.toHaveProperty('te');
    expect(row).not.toHaveProperty('runs');
    expect(row).not.toHaveProperty('isBlueprintCopy');
  });

  it('flags a blueprint copy and carries its ME/TE/runs', () => {
    expect(compactContractItemRow(bpc, parent)).toEqual({
      contractId: 1,
      regionId: 10000002,
      locationId: 60003760,
      typeId: 32858,
      price: 5000000,
      isAuction: false,
      isBlueprintCopy: true,
      me: 10,
      te: 18,
      runs: 3,
      quantity: 1,
      dateExpired: Date.parse(FUTURE),
    });
  });

  it('treats a blueprint original as a plain item: no copy flag, no runs', () => {
    // A BPO carries is_blueprint_copy=false and runs=-1; the flag is about
    // copy-ness, and -1 runs is not a number any search should be offered.
    const row = compactContractItemRow(blueprintOriginal, parent);
    expect(row).not.toHaveProperty('isBlueprintCopy');
    expect(row).not.toHaveProperty('runs');
    expect(row?.typeId).toBe(32858);
  });

  it('carries the parent buyout through when there is one', () => {
    expect(compactContractItemRow(bpc, { ...parent, buyout: 9000000 })?.buyout).toBe(9000000);
  });

  it('rejects an item the issuer wants rather than offers', () => {
    expect(compactContractItemRow(requested, parent)).toBeNull();
  });
});

describe('filterAndCompactPublicContractItems', () => {
  const contracts = contractsCsv([
    // eligible: item_exchange, not yet expired
    `0.0,1,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Mixed bundle",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    // eligible: auction, with a buyout
    `0.0,2,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,1000000.0,0.0,60008494,"Auctioned ship",auction,10.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,9000000.0`,
    // ineligible type: courier moves nothing a buyer browses by type (issue #909)
    `0.0,3,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,,0.0,60003760,"Courier run",courier,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    // already expired by the time this job runs
    `0.0,4,${PAST},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Lapsed",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
  ]);

  const items = itemsCsv([
    // a BPC and a plain item on the same eligible item_exchange contract
    'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
    '"",true,2,,250,1002,,,34,2026-09-01T11:31:43Z,1',
    // a plain item (a ship hull) on the eligible auction contract
    '"",true,3,,1,1003,,,17738,2026-09-01T11:31:43Z,2',
    // requested from the buyer rather than offered — excluded
    '"",false,4,,100,1004,,,35,2026-09-01T11:31:43Z,1',
    // on the courier contract (ineligible contract type) — excluded
    '"",true,5,,1,1005,,,34,2026-09-01T11:31:43Z,3',
    // on the lapsed contract — excluded
    '"",true,6,,1,1006,,,34,2026-09-01T11:31:43Z,4',
    // contract_id matches nothing in contracts.csv — excluded
    '"",true,7,,1,1007,,,34,2026-09-01T11:31:43Z,999',
  ]);

  const rows = () =>
    filterAndCompactPublicContractItems(
      parseContractsCsv(contracts),
      parseContractItemsCsv(items),
      NOW
    );

  it('joins every item type on an eligible contract, not just blueprint copies', () => {
    expect(rows().map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:34',
      '1:32858',
      '2:17738',
    ]);
  });

  it('keeps the blueprint-copy detail the BPC-only snapshot carried', () => {
    expect(rows().find((r) => r.typeId === 32858)).toMatchObject({
      isBlueprintCopy: true,
      me: 10,
      te: 18,
      runs: 3,
    });
  });

  it('carries region, location, price, quantity and the auction flag through', () => {
    expect(rows().find((r) => r.contractId === 2)).toMatchObject({
      regionId: 10000043,
      locationId: 60008494,
      typeId: 17738,
      price: 1000000,
      buyout: 9000000,
      isAuction: true,
      quantity: 1,
    });
  });

  it('is empty given no rows', () => {
    expect(filterAndCompactPublicContractItems([], [], NOW)).toEqual([]);
  });

  it('sorts deterministically by contract then type, independent of input order', () => {
    const backwards = filterAndCompactPublicContractItems(
      parseContractsCsv(contracts).reverse(),
      parseContractItemsCsv(items).reverse(),
      NOW
    );
    expect(backwards.map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:34',
      '1:32858',
      '2:17738',
    ]);
  });
});

describe('sortContractItemRows', () => {
  it('orders by contract then type, in place, independent of input order', () => {
    const row = (contractId: number, typeId: number) =>
      ({ contractId, typeId }) as NonNullable<ReturnType<typeof compactContractItemRow>>;
    const rows = [row(2, 10), row(1, 99), row(1, 5)];

    expect(sortContractItemRows(rows)).toBe(rows);
    expect(rows.map((r) => `${r.contractId}:${r.typeId}`)).toEqual(['1:5', '1:99', '2:10']);
  });
});

describe('public contract items snapshot sizing', () => {
  it('writes to a collection separate from the blueprint-only one', () => {
    expect(PUBLIC_CONTRACT_ITEMS_COLLECTION).not.toBe(PUBLIC_BPC_CONTRACTS_COLLECTION);
  });

  it('chunks larger than the blueprint-only snapshot, but well under the 1MiB doc limit', () => {
    // The generalized snapshot holds ~3x the rows, so reusing the 2000-row
    // chunk would triple the per-sync write count against a shared 20k/day
    // free-tier budget. A larger chunk trades write count for doc size, and
    // the ceiling is Firestore's 1MiB: at the blueprint snapshot's measured
    // ~185 bytes/row, even an all-blueprint chunk stays near half of it.
    expect(PUBLIC_CONTRACT_ITEMS_CHUNK_SIZE).toBeGreaterThan(DEFAULT_CHUNK_SIZE);
    expect(PUBLIC_CONTRACT_ITEMS_CHUNK_SIZE * 185).toBeLessThan(0.6 * 1024 * 1024);
  });
});
