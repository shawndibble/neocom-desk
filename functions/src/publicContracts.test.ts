import { describe, it, expect } from 'vitest';
import {
  parseContractsCsv,
  parseContractItemsCsv,
  eligibleContractFrom,
  compactContractOfferRow,
  accumulateRequestedSide,
  applyRequestedSide,
  applyTypeCounts,
  emptyRequestedSide,
  requestedSideByContract,
  filterAndCompactPublicContractOffers,
  sortContractOfferRows,
  buildContractOfferIndex,
  courierContractFrom,
  isOutstandingCourierContract,
  filterAndCompactPublicCourierContracts,
  sortCourierContractRows,
  type PublicContractOfferRow,
  type PublicCourierContractRow,
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

describe('requestedSideByContract', () => {
  const eligibleContracts = new Map([
    [
      '1',
      {
        contractId: 1,
        regionId: 10000002,
        locationId: 60003760,
        price: 0,
        isAuction: false,
        dateExpired: Date.parse(FUTURE),
      },
    ],
  ]);

  it('sums the PLEX quantity a contract asks for, from its requested (not offered) lines', () => {
    const items = parseContractItemsCsv(
      itemsCsv([
        // offered: a blueprint copy, not PLEX — never counted
        'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
        // requested: 1000 PLEX
        '"",false,2,,1000,1002,,,44992,2026-09-01T11:31:43Z,1',
        // requested: another 500 PLEX on the same contract
        '"",false,3,,500,1003,,,44992,2026-09-01T11:31:43Z,1',
      ])
    );
    expect(requestedSideByContract(items, eligibleContracts)).toEqual({
      plex: new Map([['1', 1500]]),
      items: new Set(),
    });
  });

  it('names a contract whose requested side holds any non-PLEX item', () => {
    const items = parseContractItemsCsv(
      itemsCsv([
        'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
        '"",false,2,,1000,1002,,,44992,2026-09-01T11:31:43Z,1',
        '"",false,3,,1,1003,,,35,2026-09-01T11:31:43Z,1',
      ])
    );
    expect(requestedSideByContract(items, eligibleContracts)).toEqual({
      plex: new Map([['1', 1000]]),
      items: new Set(['1']),
    });
  });

  it('never counts an offered line, PLEX or not', () => {
    const items = parseContractItemsCsv(
      itemsCsv([
        '"",true,1,,1,1001,,,35,2026-09-01T11:31:43Z,1',
        '"",true,2,,10,1002,,,44992,2026-09-01T11:31:43Z,1',
      ])
    );
    expect(requestedSideByContract(items, eligibleContracts)).toEqual(emptyRequestedSide());
  });

  it('ignores requested lines on a contract that is not eligible', () => {
    const items = parseContractItemsCsv(
      itemsCsv([
        '"",false,2,,1000,1002,,,44992,2026-09-01T11:31:43Z,999',
        '"",false,3,,1,1003,,,35,2026-09-01T11:31:43Z,999',
      ])
    );
    expect(requestedSideByContract(items, eligibleContracts)).toEqual(emptyRequestedSide());
  });

  it('folds line by line to the same answer whichever line comes first', () => {
    // `syncPublicContractOffers` folds contract_items.csv one line at a time as
    // it streams past; the CSV gives no guarantee a contract's offered line
    // comes before its requested ones.
    const items = parseContractItemsCsv(
      itemsCsv([
        '"",false,2,,1000,1002,,,44992,2026-09-01T11:31:43Z,1',
        '"",false,3,,1,1003,,,35,2026-09-01T11:31:43Z,1',
        'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
      ])
    );
    const side = emptyRequestedSide();
    for (const item of [...items].reverse()) {
      accumulateRequestedSide(item, eligibleContracts, side);
    }
    expect(side).toEqual({ plex: new Map([['1', 1000]]), items: new Set(['1']) });
  });
});

describe('applyRequestedSide', () => {
  const base = {
    regionId: 10000002,
    locationId: 60003760,
    price: 1,
    isAuction: false,
    quantity: 1,
    dateExpired: Date.parse(FUTURE),
  };
  const rows = (): PublicContractOfferRow[] => [
    { ...base, contractId: 1, typeId: 34 },
    { ...base, contractId: 1, typeId: 35 },
    { ...base, contractId: 2, typeId: 34 },
  ];

  it('stamps both flags onto every offer row of the contracts named', () => {
    const patched = rows();
    applyRequestedSide(patched, { plex: new Map([['1', 1000]]), items: new Set(['1']) });
    expect(patched.filter((r) => r.contractId === 1)).toEqual([
      expect.objectContaining({ typeId: 34, requestedPlex: 1000, requestsItems: true }),
      expect.objectContaining({ typeId: 35, requestedPlex: 1000, requestsItems: true }),
    ]);
  });

  it('leaves both fields absent, not zero or false, on any other contract', () => {
    const patched = rows();
    applyRequestedSide(patched, { plex: new Map([['1', 1000]]), items: new Set(['1']) });
    expect(patched[2]).not.toHaveProperty('requestedPlex');
    expect(patched[2]).not.toHaveProperty('requestsItems');
  });
});

describe('applyTypeCounts', () => {
  const base = {
    regionId: 10000002,
    locationId: 60003760,
    price: 1,
    isAuction: false,
    quantity: 1,
    dateExpired: Date.parse(FUTURE),
  };

  it('stamps every row with how many distinct for-sale types its contract carries', () => {
    const rows: PublicContractOfferRow[] = [
      { ...base, contractId: 1, typeId: 34 },
      { ...base, contractId: 1, typeId: 35 },
      { ...base, contractId: 1, typeId: 36 },
      { ...base, contractId: 2, typeId: 34 },
    ];
    applyTypeCounts(rows);
    expect(rows.map((r) => [r.contractId, r.typeId, r.typeCount])).toEqual([
      [1, 34, 3],
      [1, 35, 3],
      [1, 36, 3],
      [2, 34, 1],
    ]);
  });

  it('counts a type listed twice once: two stacks of one ore are not a bundle', () => {
    const rows: PublicContractOfferRow[] = [
      { ...base, contractId: 1, typeId: 34 },
      { ...base, contractId: 1, typeId: 34, quantity: 5 },
    ];
    applyTypeCounts(rows);
    expect(rows.map((r) => r.typeCount)).toEqual([1, 1]);
  });

  it('writes the count even when it is one, so a reader can tell single from unknown', () => {
    const rows: PublicContractOfferRow[] = [{ ...base, contractId: 7, typeId: 34 }];
    applyTypeCounts(rows);
    expect(rows[0]).toHaveProperty('typeCount', 1);
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
      '2:17738',
      '1:32858',
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

  it('carries a contract-wide requested-PLEX total onto every offer row of that contract', () => {
    const plexItems = itemsCsv([
      // offered: the blueprint copy from the mixed bundle above
      'true,true,1,10,1,1001,3,18,32858,2026-09-01T11:31:43Z,1',
      // requested: 1000 PLEX in return, on the same contract
      '"",false,9,,1000,1009,,,44992,2026-09-01T11:31:43Z,1',
    ]);
    const plexRows = filterAndCompactPublicContractOffers(
      parseContractsCsv(contracts),
      parseContractItemsCsv(plexItems),
      NOW
    );
    expect(plexRows).toHaveLength(1);
    expect(plexRows[0]).toMatchObject({ contractId: 1, typeId: 32858, requestedPlex: 1000 });
  });

  it('flags every offer row of a contract that asks for items in return', () => {
    expect(rows().filter((r) => r.contractId === 1)).toEqual([
      expect.objectContaining({ typeId: 34, requestsItems: true }),
      expect.objectContaining({ typeId: 32858, requestsItems: true }),
    ]);
    expect(rows().find((r) => r.contractId === 2)).not.toHaveProperty('requestsItems');
  });

  it('keeps requestedPlex and no requestsItems on a contract asking only for PLEX', () => {
    const plexOnly = filterAndCompactPublicContractOffers(
      parseContractsCsv(contracts),
      parseContractItemsCsv(
        itemsCsv([
          '"",true,2,,250,1002,,,34,2026-09-01T11:31:43Z,1',
          '"",false,9,,1000,1009,,,44992,2026-09-01T11:31:43Z,1',
        ])
      ),
      NOW
    );
    expect(plexOnly).toHaveLength(1);
    expect(plexOnly[0].requestedPlex).toBe(1000);
    expect(plexOnly[0]).not.toHaveProperty('requestsItems');
  });

  it('carries both flags when a contract asks for PLEX and an item', () => {
    const both = filterAndCompactPublicContractOffers(
      parseContractsCsv(contracts),
      parseContractItemsCsv(
        itemsCsv([
          '"",true,2,,250,1002,,,34,2026-09-01T11:31:43Z,1',
          '"",false,9,,1000,1009,,,44992,2026-09-01T11:31:43Z,1',
          '"",false,10,,5,1010,,,35,2026-09-01T11:31:43Z,1',
        ])
      ),
      NOW
    );
    expect(both[0]).toMatchObject({ requestedPlex: 1000, requestsItems: true });
  });

  it('sorts deterministically by type then contract, independent of input order', () => {
    const backwards = filterAndCompactPublicContractOffers(
      parseContractsCsv(contracts).reverse(),
      parseContractItemsCsv(items).reverse(),
      NOW
    );
    expect(backwards.map((r) => `${r.contractId}:${r.typeId}`)).toEqual([
      '1:34',
      '2:17738',
      '1:32858',
    ]);
  });
});

describe('sortContractOfferRows', () => {
  const row = (fields: Partial<PublicContractOfferRow>) =>
    fields as NonNullable<ReturnType<typeof compactContractOfferRow>>;

  it('orders by type then contract, in place, independent of input order', () => {
    const rows = [
      row({ contractId: 2, typeId: 10 }),
      row({ contractId: 1, typeId: 99 }),
      row({ contractId: 1, typeId: 5 }),
    ];

    expect(sortContractOfferRows(rows)).toBe(rows);
    expect(rows.map((r) => `${r.contractId}:${r.typeId}`)).toEqual(['1:5', '2:10', '1:99']);
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

describe('buildContractOfferIndex', () => {
  const offer = (fields: Partial<PublicContractOfferRow>) =>
    ({
      price: 100,
      isAuction: false,
      quantity: 1,
      regionId: 10000002,
      ...fields,
    }) as PublicContractOfferRow;

  it('says how many offers and the cheapest for each type, in any row order', () => {
    const rows = [
      offer({ typeId: 34, price: 50 }),
      offer({ typeId: 34, price: 20 }),
      offer({ typeId: 35, price: 70 }),
      offer({ typeId: 36, price: 10 }),
      offer({ typeId: 34, price: 15 }),
    ];

    const index = buildContractOfferIndex(rows);

    expect(index.types).toEqual({
      '34': [3, 15],
      '35': [1, 70],
      '36': [1, 10],
    });
  });

  it('prices an auction at its buyout, as the client does, not at its starting bid', () => {
    const index = buildContractOfferIndex([
      offer({ typeId: 34, price: 1, isAuction: true, buyout: 2_000_000 }),
    ]);
    expect(index.types['34']).toEqual([1, 2_000_000]);
  });

  it('falls back to the starting bid for an auction with no buyout', () => {
    const index = buildContractOfferIndex([offer({ typeId: 34, price: 7, isAuction: true })]);
    expect(index.types['34']).toEqual([1, 7]);
  });

  it('leaves cheapest null for a type with only unpriced (zero-price) offers', () => {
    const index = buildContractOfferIndex([offer({ typeId: 34, price: 0 })]);
    expect(index.types['34']).toEqual([1, null]);
  });

  it('skips a PLEX-asking offer when finding the cheapest, but still counts it', () => {
    const index = buildContractOfferIndex([
      offer({ typeId: 34, price: 5, requestedPlex: 10 }),
      offer({ typeId: 34, price: 90 }),
    ]);
    expect(index.types['34']).toEqual([2, 90]);
  });

  it('lists each region once, sorted', () => {
    const index = buildContractOfferIndex([
      offer({ typeId: 1, regionId: 10000043 }),
      offer({ typeId: 2, regionId: 10000002 }),
      offer({ typeId: 3, regionId: 10000043 }),
    ]);
    expect(index.regionIds).toEqual([10000002, 10000043]);
  });
});

// Courier contracts (issue #909) publish their own row shape to their own
// snapshot, off this same single archive pass. The `eligibleContractFrom`
// tests above are what pin the other half: a courier contract is still no
// part of the offers snapshot.
describe('courierContractFrom', () => {
  const [
    courier,
    noDestination,
    blankOptionals,
    loan,
    lapsedCourier,
    noReward,
    noVolume,
    realZeros,
  ] = parseContractsCsv(
    contractsCsv([
      `5000000.0,10,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Jita to Amarr",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,11,${FUTURE},2026-08-11T18:10:34Z,7,,98745702,2120819548,,1200000.0,60003760,"Nowhere",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `,12,${FUTURE},2026-08-11T18:10:34Z,,60008494,98745702,2120819548,,1200000.0,60003760,"No collateral stated",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,13,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Lend me ISK",loan,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,14,${PAST},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Lapsed haul",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,15,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,,60003760,"Unpaid",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,16,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Empty hold",courier,,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `0.0,17,${FUTURE},2026-08-11T18:10:34Z,0,60008494,98745702,2120819548,,0.0,60003760,"Favour run",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    ])
  );

  it('narrows a courier contract to the haul it describes', () => {
    expect(courierContractFrom(courier, NOW)).toEqual({
      contractId: 10,
      regionId: 10000002,
      originLocationId: 60003760,
      destinationLocationId: 60008494,
      reward: 1200000,
      volume: 12500,
      collateral: 5000000,
      daysToComplete: 7,
      dateExpired: Date.parse(FUTURE),
    });
  });

  it('rejects a contract type that is not a haul', () => {
    // Matched on `courier` by equality rather than taken as the complement of
    // the offers snapshot's type set: `loan` is neither searchable by item nor
    // a haul, and the complement would have published it as one.
    expect(courierContractFrom(loan, NOW)).toBeNull();
    expect(courierContractFrom(courier, NOW)).not.toBeNull();
  });

  it('rejects a courier contract that lapsed between the scrape and this run', () => {
    expect(courierContractFrom(lapsedCourier, NOW)).toBeNull();
  });

  it('rejects a haul missing an endpoint, a reward or a volume', () => {
    // `Number('')` is 0, not NaN, so an absent column converted
    // unconditionally would publish a delivery to station 0, a free haul, or
    // an empty hold — each indistinguishable from a real value, and none of
    // them a job anyone can take or rank.
    expect(courierContractFrom(noDestination, NOW)).toBeNull();
    expect(courierContractFrom(noReward, NOW)).toBeNull();
    expect(courierContractFrom(noVolume, NOW)).toBeNull();
  });

  it('omits an unstated collateral or deadline rather than writing zeros', () => {
    const row = courierContractFrom(blankOptionals, NOW);
    expect(row).not.toHaveProperty('collateral');
    expect(row).not.toHaveProperty('daysToComplete');
  });

  it('keeps a real zero collateral, reward or deadline as the value it is', () => {
    // A favour run genuinely posts no collateral and pays nothing, and that
    // is not the same fact as the column being blank.
    expect(courierContractFrom(realZeros, NOW)).toMatchObject({
      collateral: 0,
      reward: 0,
      daysToComplete: 0,
    });
  });
});

describe('isOutstandingCourierContract', () => {
  const [courier, incomplete, loan, lapsed] = parseContractsCsv(
    contractsCsv([
      `5000000.0,30,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Jita to Amarr",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,31,${FUTURE},2026-08-11T18:10:34Z,7,,98745702,2120819548,,1200000.0,60003760,"Nowhere",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,32,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Lend me ISK",loan,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
      `5000000.0,33,${PAST},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Lapsed haul",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    ])
  );

  it('counts an outstanding courier contract, and nothing else', () => {
    expect(isOutstandingCourierContract(courier, NOW)).toBe(true);
    expect(isOutstandingCourierContract(loan, NOW)).toBe(false);
    expect(isOutstandingCourierContract(lapsed, NOW)).toBe(false);
  });

  it('still counts a courier contract that courierContractFrom goes on to drop', () => {
    // The whole point of the two sharing this gate: the sync logs this count
    // beside the rows it kept, so a required column going blank shows up as a
    // gap between them. Contract type and expiry must not be able to open that
    // gap themselves, or the gap says nothing.
    expect(isOutstandingCourierContract(incomplete, NOW)).toBe(true);
    expect(courierContractFrom(incomplete, NOW)).toBeNull();
  });
});

describe('filterAndCompactPublicCourierContracts', () => {
  const contracts = contractsCsv([
    // item_exchange: belongs to the offers snapshot, not this one
    `0.0,1,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,5000000.0,0.0,60003760,"Mixed bundle",item_exchange,10.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    // auction: likewise
    `0.0,2,${FUTURE},2026-08-11T18:10:34Z,0,,98745702,2120819548,1000000.0,0.0,60008494,"Auctioned ship",auction,10.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,9000000.0`,
    `5000000.0,20,${FUTURE},2026-08-11T18:10:34Z,7,60008494,98745702,2120819548,,1200000.0,60003760,"Jita to Amarr",courier,12500.0,2026-09-08T18:08:11Z,10000002,60003760,30000142,20000020,false,`,
    `1000000.0,21,${FUTURE},2026-08-11T18:10:34Z,3,60003760,98745702,2120819548,,300000.0,60008494,"Amarr to Jita",courier,5000.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,`,
    // lapsed courier: excluded
    `1000000.0,22,${PAST},2026-08-11T18:10:34Z,3,60003760,98745702,2120819548,,300000.0,60008494,"Lapsed",courier,5000.0,2026-09-08T18:08:11Z,10000043,60008494,30002187,20000322,false,`,
  ]);

  const rows = () => filterAndCompactPublicCourierContracts(parseContractsCsv(contracts), NOW);

  it('keeps only outstanding courier contracts, one row each', () => {
    expect(rows().map((r) => r.contractId)).toEqual([20, 21]);
  });

  it('carries the route, reward, collateral and volume through', () => {
    expect(rows()[0]).toMatchObject({
      regionId: 10000002,
      originLocationId: 60003760,
      destinationLocationId: 60008494,
      reward: 1200000,
      collateral: 5000000,
      volume: 12500,
      daysToComplete: 7,
    });
  });

  it('is empty given no rows', () => {
    expect(filterAndCompactPublicCourierContracts([], NOW)).toEqual([]);
  });

  it('sorts deterministically, independent of input order', () => {
    const backwards = filterAndCompactPublicCourierContracts(
      parseContractsCsv(contracts).reverse(),
      NOW
    );
    expect(backwards.map((r) => r.contractId)).toEqual([20, 21]);
  });
});

describe('sortCourierContractRows', () => {
  it('orders by contract id, in place, independent of input order', () => {
    // One row per contract, so the contract id alone is a total order here —
    // unlike the offers rows, where one contract lists many item lines.
    const rows = [
      { contractId: 3 },
      { contractId: 1 },
      { contractId: 2 },
    ] as PublicCourierContractRow[];

    expect(sortCourierContractRows(rows)).toBe(rows);
    expect(rows.map((r) => r.contractId)).toEqual([1, 2, 3]);
  });
});
