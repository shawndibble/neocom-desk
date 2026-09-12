import { describe, it, expect } from 'vitest';
import {
  parseContractsCsv,
  parseContractItemsCsv,
  eligibleContractFrom,
  chunkRows,
  chunkDocId,
  compactContractOfferRow,
  filterAndCompactPublicContractOffers,
  sortContractOfferRows,
  PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE,
  type PublicContractOfferRow,
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

// The per-row seams the streaming sync drives directly, pinned in isolation;
// `filterAndCompactPublicContractOffers` below covers the composed join they
// add up to.
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

describe('compactContractOfferRow', () => {
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

  it('keeps a plain item line, not only a blueprint', () => {
    expect(compactContractOfferRow(notBlueprint, parent)).toEqual({
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
    const row = compactContractOfferRow(notBlueprint, parent);
    expect(row).not.toHaveProperty('me');
    expect(row).not.toHaveProperty('te');
    expect(row).not.toHaveProperty('runs');
    expect(row).not.toHaveProperty('isBlueprintCopy');
  });

  it('flags a blueprint copy and carries its ME/TE/runs', () => {
    expect(compactContractOfferRow(bpc, parent)).toEqual({
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

  it('keeps a blueprint original unflagged and runless, but keeps its research', () => {
    // A BPO carries is_blueprint_copy=false and runs=-1. The flag is about
    // copy-ness so it stays off, and -1 runs is not a number any search
    // should be offered — but a researched BPO's ME/TE is real information a
    // buyer pays for, so it is not thrown away with the -1.
    const row = compactContractOfferRow(blueprintOriginal, parent);
    expect(row).not.toHaveProperty('isBlueprintCopy');
    expect(row).not.toHaveProperty('runs');
    expect(row).toMatchObject({ typeId: 32858, me: 10, te: 20 });
  });

  it('carries the parent buyout through when there is one', () => {
    expect(compactContractOfferRow(bpc, { ...parent, buyout: 9000000 })?.buyout).toBe(9000000);
  });

  it('rejects an item the issuer wants rather than offers', () => {
    expect(compactContractOfferRow(requested, parent)).toBeNull();
  });
});

describe('filterAndCompactPublicContractOffers', () => {
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
    filterAndCompactPublicContractOffers(
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
    expect(filterAndCompactPublicContractOffers([], [], NOW)).toEqual([]);
  });

  it('sorts deterministically by contract then type, independent of input order', () => {
    const backwards = filterAndCompactPublicContractOffers(
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

describe('sortContractOfferRows', () => {
  const row = (fields: Partial<PublicContractOfferRow>) =>
    fields as NonNullable<ReturnType<typeof compactContractOfferRow>>;

  it('orders by contract then type, in place, independent of input order', () => {
    const rows = [
      row({ contractId: 2, typeId: 10 }),
      row({ contractId: 1, typeId: 99 }),
      row({ contractId: 1, typeId: 5 }),
    ];

    expect(sortContractOfferRows(rows)).toBe(rows);
    expect(rows.map((r) => `${r.contractId}:${r.typeId}`)).toEqual(['1:5', '1:99', '2:10']);
  });

  it('breaks a same-contract, same-type tie rather than leaving CSV order to decide', () => {
    // One contract listing the same type twice is routine once every item
    // type is in scope — two ore stacks, or two copies of one blueprint at
    // different ME. Without a tie-break, EVE Ref re-emitting those two lines
    // in the other order rewrites the chunk doc with identical data.
    const rows = [
      row({ contractId: 1, typeId: 34, quantity: 500 }),
      row({ contractId: 1, typeId: 34, quantity: 100 }),
      row({ contractId: 1, typeId: 32858, quantity: 1, me: 10, te: 20, runs: 3 }),
      row({ contractId: 1, typeId: 32858, quantity: 1, me: 2, te: 4, runs: 3 }),
    ];

    expect(
      sortContractOfferRows([...rows].reverse()).map((r) => [r.typeId, r.quantity, r.me])
    ).toEqual(sortContractOfferRows(rows).map((r) => [r.typeId, r.quantity, r.me]));
    expect(rows.map((r) => `${r.typeId}/${r.quantity}/${r.me ?? '-'}`)).toEqual([
      '34/100/-',
      '34/500/-',
      '32858/1/2',
      '32858/1/10',
    ]);
  });
});

describe('public contract offers snapshot sizing', () => {
  it('chunks coarsely enough to leave room in the free tier write budget', () => {
    // The 20,000 writes/day free tier is the project's budget, not this job's:
    // dispatchProjections runs 288x/day beside it. The row count is #906's
    // estimate, to be re-grounded once the sync's logged `rowCount` says what
    // the live volume is; what this pins meanwhile is that the chunk size is
    // not quietly shrunk back toward the 2,000 the retired blueprint-only
    // snapshot used, which would spend ~8.9k writes/day here on its own. A
    // larger chunk trades write count for doc size; the next test is what
    // holds the doc size honest.
    const ESTIMATED_ROWS = 370_000;
    const RUNS_PER_DAY = 48;
    const writesPerDay =
      Math.ceil(ESTIMATED_ROWS / PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE) * RUNS_PER_DAY;
    expect(writesPerDay).toBeLessThan(7_000);
  });

  it('keeps a chunk of nothing but worst-case rows clear of the 1MiB document limit', () => {
    // Measured off a real row rather than asserted against a byte constant:
    // the point of this guard is to fail when a later row-shape change grows
    // the row — #908 adding a contract title is the obvious one — and a
    // hardcoded average would sail straight past that. Firestore's own
    // accounting isn't JSON, but it tracks closely enough to trip well before
    // a live `set()` does.
    const widest = compactContractOfferRow(
      parseContractItemsCsv(
        itemsCsv([
          'true,true,1053870035543,10,2100000000,5283227785,300,20,32858,2026-09-01T11:31:43Z,234920481',
        ])
      )[0],
      {
        contractId: 2349204819,
        regionId: 10000043,
        locationId: 1043607688037,
        price: 999999999999.99,
        buyout: 999999999999.99,
        isAuction: true,
        dateExpired: Date.parse(FUTURE),
      }
    );

    // Every optional field populated, or it isn't the worst case.
    expect(widest).toMatchObject({ buyout: expect.any(Number), isBlueprintCopy: true, runs: 300 });
    expect(
      PUBLIC_CONTRACT_OFFERS_CHUNK_SIZE * Buffer.byteLength(JSON.stringify(widest))
    ).toBeLessThan(1024 * 1024);
  });
});
