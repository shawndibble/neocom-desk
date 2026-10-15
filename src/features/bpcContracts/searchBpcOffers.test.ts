/**
 * Characterization of BPC Sourcing's search pipeline, pinned to what the panel
 * did inline before it moved here: per-source narrowing, the searched-types
 * rule for LP / Community rows, and the merge precedence.
 */
import { describe, it, expect } from 'vitest';
import {
  communityOfferToSearchRow,
  lpOfferToSearchRow,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import type { CharacterBlueprint, RegionOrder } from '@/esi/endpoints';
import { sortRows } from '@/components/ui/dataTableSort';
import type { SourceToggle } from './bpcSourcingUrl';
import type { BpcSourcingFilter } from './bpcActiveFilters';
import {
  bpcMarketLookup,
  prepareBpcOffers,
  rankBpcOffers,
  searchBpcOffers,
  type BpcFullQuery,
  type BpcSourceData,
} from './searchBpcOffers';

const RIFTER = 691;
const CARACAL = 950;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;
const JITA_44 = 60003760;
const AMARR = 60008494;
const SYS_JITA = 30000142;
const SYS_AMARR = 30002187;

function contract(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    locationId: JITA_44,
    typeId: RIFTER,
    price: 5_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: Date.parse('2099-01-01T00:00:00Z'),
    isMultiType: false,
    ...overrides,
  };
}

function order(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 90,
    is_buy_order: false,
    issued: '2026-09-01T00:00:00Z',
    location_id: JITA_44,
    min_volume: 1,
    order_id: 1,
    price: 12_500_000,
    range: 'region',
    system_id: SYS_JITA,
    type_id: RIFTER,
    volume_remain: 3,
    volume_total: 3,
    ...overrides,
  };
}

function owned(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: 500,
    type_id: RIFTER,
    runs: -1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: 1,
    location_id: JITA_44,
    location_flag: 'Hangar',
    ...overrides,
  };
}

const lp = (typeId: number) =>
  lpOfferToSearchRow({
    corporationId: 1,
    offerId: typeId,
    corpName: 'Corp',
    typeId,
    quantity: 1,
    price: 1_000,
    iskCost: 1_000,
    lpCost: 10,
    lpPriced: true,
  });
const community = (typeId: number) =>
  communityOfferToSearchRow({
    uid: `u${typeId}`,
    memberName: 'Pal',
    typeId,
    me: 10,
    te: 20,
    runs: -1,
    quantity: 1,
    communities: [{ id: 'c1', name: 'C' }],
    stale: false,
    asOf: null,
    locationName: 'Somewhere',
    systemName: 'Jita',
  });

const NAMES = new Map([
  [RIFTER, 'Rifter Blueprint'],
  [CARACAL, 'Caracal Blueprint'],
]);

function data(overrides: Partial<BpcSourceData> = {}): BpcSourceData {
  return {
    contractRows: [],
    originals: [],
    contractLocations: new Map(),
    blueprintNames: NAMES,
    ownedBlueprints: [],
    ownedLocations: new Map(),
    marketBooksByType: new Map(),
    marketLocations: new Map(),
    marketRegionId: THE_FORGE,
    marketHubStationId: JITA_44,
    marketTypeIds: [],
    lpRows: [],
    communityRows: [],
    ...overrides,
  };
}

const NO_FILTER: BpcSourcingFilter = {
  typeQuery: '',
  regionId: null,
  minMe: '',
  minTe: '',
  minRuns: '',
  maxPrice: '',
  hideAuctions: false,
  hidePlex: false,
};

function query(
  overrides: Partial<Omit<BpcFullQuery, 'filter'>> & { filter?: Partial<BpcSourcingFilter> } = {}
): BpcFullQuery {
  const { filter, ...rest } = overrides;
  return {
    filter: { ...NO_FILTER, ...filter },
    selectedTypeId: null,
    sources: new Set<SourceToggle>(['contract', 'owned']),
    spaceKinds: null,
    allowedSystems: null,
    ...rest,
  };
}

const ALL_SOURCES = new Set<SourceToggle>([
  'contract',
  'owned',
  'market',
  'contractBpo',
  'lp',
  'community',
]);

const sourcesOf = (rows: readonly BpcSearchRow[]) => rows.map((r) => r.source);

describe('searchBpcOffers merge order', () => {
  const full = data({
    contractRows: [contract()],
    originals: [contract({ contractId: 2, runs: -1 })],
    ownedBlueprints: [owned()],
    marketBooksByType: new Map([[RIFTER, { regionId: THE_FORGE, sell: [order()] }]]),
    marketTypeIds: [RIFTER],
    lpRows: [lp(RIFTER)],
    communityRows: [community(RIFTER)],
  });

  it('orders owned, community, LP, then market and contracts', () => {
    const { displayRows } = searchBpcOffers(full, query({ sources: ALL_SOURCES }));
    expect(sourcesOf(displayRows)).toEqual([
      'owned',
      'community',
      'lp',
      'market',
      'contract',
      'contract',
    ]);
    // The contract BPO (runs -1) comes before the copy.
    expect(displayRows[4].runs).toBe(-1);
    expect(displayRows[5].runs).toBe(5);
  });

  it('is the tiebreak under any column sort: the pilot sorts first, this order breaks ties', () => {
    const { displayRows } = searchBpcOffers(full, query({ sources: ALL_SOURCES }));
    // ME 10 on the owned, community and both contract rows, ME 0 on LP and
    // market: descending puts the ME 10 rows first and, within each group,
    // keeps source order.
    const byMe = sortRows(displayRows, { sortValue: (row) => row.me }, 'desc');
    expect(sourcesOf(byMe)).toEqual(['owned', 'community', 'contract', 'contract', 'lp', 'market']);
  });

  it('lists only the toggled-on sources', () => {
    const { displayRows } = searchBpcOffers(
      full,
      query({ sources: new Set<SourceToggle>(['lp', 'contract']) })
    );
    expect(sourcesOf(displayRows)).toEqual(['lp', 'contract']);
  });

  it('is empty with no source toggled', () => {
    expect(searchBpcOffers(full, query({ sources: new Set() })).displayRows).toEqual([]);
  });
});

describe('searchBpcOffers narrowing', () => {
  it('drops contract rows by the numeric filters', () => {
    const rows = [
      contract({ contractId: 1, me: 10 }),
      contract({ contractId: 2, me: 2 }),
      contract({ contractId: 3, me: 10, price: 99_000_000 }),
    ];
    const { filteredRows } = searchBpcOffers(
      data({ contractRows: rows }),
      query({ filter: { minMe: '5', maxPrice: '10m' } })
    );
    expect(filteredRows.map((r) => r.contractId)).toEqual([1]);
  });

  it('narrows contract copies and originals by Space and Jump Range, dropping unplaced rows', () => {
    const contractLocations = new Map([
      [JITA_44, { name: 'Jita', space: 'highsec' as const, systemId: SYS_JITA }],
      [AMARR, { name: 'Amarr', space: 'highsec' as const, systemId: SYS_AMARR }],
    ]);
    const base = data({
      contractRows: [
        contract({ contractId: 1, locationId: JITA_44 }),
        contract({ contractId: 2, locationId: AMARR }),
        contract({ contractId: 3, locationId: 1 }),
      ],
      originals: [
        contract({ contractId: 4, runs: -1, locationId: JITA_44 }),
        contract({ contractId: 5, runs: -1, locationId: AMARR }),
      ],
      contractLocations,
    });
    const jumped = searchBpcOffers(
      base,
      query({
        sources: new Set<SourceToggle>(['contract', 'contractBpo']),
        allowedSystems: new Set([SYS_JITA]),
      })
    );
    expect(
      jumped.displayRows.map((r) => (r.source === 'contract' ? r.contract.contractId : 0))
    ).toEqual([4, 1]);

    const lowsec = searchBpcOffers(base, query({ spaceKinds: new Set(['lowsec']) }));
    expect(lowsec.displayRows).toEqual([]);
  });

  it('ignores the Region filter for LP and Community rows without a region, filters owned by theirs', () => {
    const result = searchBpcOffers(
      data({
        ownedBlueprints: [owned()],
        ownedLocations: new Map([
          [JITA_44, { name: 'Jita', regionId: THE_FORGE, space: 'highsec', systemId: SYS_JITA }],
        ]),
      }),
      query({ filter: { regionId: DOMAIN } })
    );
    expect(result.displayRows).toEqual([]);
  });

  it('an owned blueprint carries its resolved location', () => {
    const { displayRows } = searchBpcOffers(
      data({
        ownedBlueprints: [owned()],
        ownedLocations: new Map([
          [JITA_44, { name: 'Jita IV', regionId: THE_FORGE, space: 'highsec', systemId: SYS_JITA }],
        ]),
      }),
      query()
    );
    expect(displayRows[0]).toMatchObject({
      source: 'owned',
      locationName: 'Jita IV',
      systemId: SYS_JITA,
    });
  });

  it('builds market rows only once the market region is known', () => {
    const d = data({
      marketBooksByType: new Map([[RIFTER, { regionId: THE_FORGE, sell: [order()] }]]),
      marketTypeIds: [RIFTER],
    });
    const q = query({ sources: new Set<SourceToggle>(['market']) });
    expect(searchBpcOffers(d, q).displayRows).toHaveLength(1);
    expect(searchBpcOffers({ ...d, marketRegionId: null }, q).displayRows).toEqual([]);
  });

  it('marks the hub station on a market row', () => {
    const { displayRows } = searchBpcOffers(
      data({
        marketBooksByType: new Map([
          [RIFTER, { regionId: THE_FORGE, sell: [order({ location_id: 5 })] }],
        ]),
        marketTypeIds: [RIFTER],
      }),
      query({ sources: new Set<SourceToggle>(['market']) })
    );
    expect(displayRows[0]).toMatchObject({ source: 'market', atHub: false });
  });
});

describe('searchBpcOffers searched-types rule', () => {
  const d = data({
    lpRows: [lp(RIFTER), lp(CARACAL)],
    communityRows: [community(RIFTER), community(CARACAL)],
    marketTypeIds: [RIFTER],
  });
  const sources = new Set<SourceToggle>(['lp', 'community']);

  it('shows every LP and Community row with no query', () => {
    expect(searchBpcOffers(d, query({ sources })).displayRows).toHaveLength(4);
  });

  it('confines them to the looked-up types for a typed query', () => {
    const { displayRows } = searchBpcOffers(d, query({ sources, filter: { typeQuery: 'rifter' } }));
    expect(displayRows.map((r) => r.typeId)).toEqual([RIFTER, RIFTER]);
  });

  it('confines them to the looked-up types for a picked blueprint', () => {
    const { displayRows } = searchBpcOffers(d, query({ sources, selectedTypeId: RIFTER }));
    expect(displayRows.map((r) => r.typeId)).toEqual([RIFTER, RIFTER]);
  });

  it('shows none when the query looked nothing up', () => {
    const { displayRows } = searchBpcOffers(
      { ...d, marketTypeIds: [] },
      query({ sources, filter: { typeQuery: 'zzz' } })
    );
    expect(displayRows).toEqual([]);
  });
});

describe('searchBpcOffers type search, suggestions and summary', () => {
  const d = data({
    contractRows: [
      contract({ contractId: 1, typeId: RIFTER, price: 3_000_000 }),
      contract({ contractId: 2, typeId: RIFTER, price: 2_000_000, me: 8 }),
      contract({ contractId: 3, typeId: CARACAL, price: 9_000_000 }),
    ],
  });

  it('matches a typed name against listed blueprints', () => {
    const { displayRows, suggestions } = searchBpcOffers(
      d,
      query({ filter: { typeQuery: 'rifter' } })
    );
    expect(displayRows.map((r) => r.typeId)).toEqual([RIFTER, RIFTER]);
    expect(suggestions).toEqual([
      { typeId: RIFTER, name: 'Rifter Blueprint', offerCount: 2, bestMe: 10, bestTe: 20 },
    ]);
  });

  it('counts suggestions under the non-type filters', () => {
    const { suggestions } = searchBpcOffers(
      d,
      query({ filter: { typeQuery: 'rifter', minMe: '9' } })
    );
    expect(suggestions.map((s) => s.offerCount)).toEqual([1]);
  });

  it('suggests a blueprint only a Community Member holds, and finds its row', () => {
    const only = data({ communityRows: [community(CARACAL)] });
    const result = searchBpcOffers(
      only,
      query({ sources: ALL_SOURCES, filter: { typeQuery: 'caracal' } })
    );
    expect(result.suggestions.map((s) => s.typeId)).toEqual([CARACAL]);
    expect(sourcesOf(result.displayRows)).toEqual(['community']);
  });

  it('suggests a blueprint only the pilot owns, but not once Owned is off', () => {
    const only = data({ ownedBlueprints: [owned({ type_id: CARACAL })] });
    const typed = { filter: { typeQuery: 'caracal' } };
    expect(
      searchBpcOffers(only, query({ sources: ALL_SOURCES, ...typed })).suggestions.map(
        (s) => s.typeId
      )
    ).toEqual([CARACAL]);
    expect(
      searchBpcOffers(only, query({ sources: new Set<SourceToggle>(['contract']), ...typed }))
        .suggestions
    ).toEqual([]);
  });

  it('offers no suggestions once a blueprint is picked or with no text', () => {
    expect(searchBpcOffers(d, query({ selectedTypeId: RIFTER })).suggestions).toEqual([]);
    expect(searchBpcOffers(d, query()).suggestions).toEqual([]);
  });

  it('summarises only the picked blueprint, under the filters', () => {
    expect(searchBpcOffers(d, query()).summary).toBeNull();
    const picked = searchBpcOffers(d, query({ selectedTypeId: RIFTER }));
    expect(picked.filteredRows.map((r) => r.contractId)).toEqual([1, 2]);
    expect(picked.summary?.cheapest).toBe(2_000_000);
    const narrowed = searchBpcOffers(d, query({ selectedTypeId: RIFTER, filter: { minMe: '9' } }));
    expect(narrowed.summary?.cheapest).toBe(3_000_000);
  });

  it('lets an owned blueprint be found by name only while Owned is on', () => {
    const withOwned = data({ ownedBlueprints: [owned({ type_id: CARACAL })] });
    const q = { filter: { typeQuery: 'caracal' } };
    expect(searchBpcOffers(withOwned, query(q)).displayRows).toHaveLength(1);
    expect(
      searchBpcOffers(withOwned, query({ ...q, sources: new Set<SourceToggle>(['contract']) }))
        .displayRows
    ).toEqual([]);
  });
});

describe('searchBpcOffers BPO sources', () => {
  it('picks the cheaper of a market and a contract original for each type in the results', () => {
    const result = searchBpcOffers(
      data({
        contractRows: [contract()],
        originals: [contract({ contractId: 9, runs: -1, price: 40_000_000 })],
        marketBooksByType: new Map([[RIFTER, { regionId: THE_FORGE, sell: [order()] }]]),
        marketTypeIds: [RIFTER],
      }),
      query()
    );
    expect(result.bpoSourcesByType.get(RIFTER)?.market?.price).toBe(12_500_000);
    expect(result.bpoSourcesByType.get(RIFTER)?.contract?.price).toBe(40_000_000);
    expect(result.bpoByType.get(RIFTER)?.price).toBe(12_500_000);
  });

  it('scopes contract originals to the Region filter but ignores Space for them', () => {
    const result = searchBpcOffers(
      data({
        contractRows: [contract()],
        originals: [contract({ contractId: 9, runs: -1, regionId: DOMAIN })],
      }),
      query({ filter: { regionId: THE_FORGE }, spaceKinds: new Set(['lowsec']) })
    );
    expect(result.bpoByType.has(RIFTER)).toBe(false);
  });
});

describe('two-stage search', () => {
  const d = data({
    contractRows: [contract(), contract({ contractId: 2, typeId: CARACAL })],
    marketTypeIds: [RIFTER, CARACAL],
  });

  it('one prepared stage serves every type query and matches searchBpcOffers', () => {
    // `prepareBpcOffers` takes no typeQuery, so typing never reruns it.
    const prepared = prepareBpcOffers(d, query());
    for (const typeQuery of ['', 'rif', 'cara']) {
      const q = query({ filter: { typeQuery } });
      expect(rankBpcOffers(prepared, d, q)).toEqual(searchBpcOffers(d, q));
    }
    expect(prepared.typeOptions.map((o) => o.typeId).sort((a, b) => a - b)).toEqual([
      RIFTER,
      CARACAL,
    ]);
  });
});

describe('bpcMarketLookup', () => {
  const options = [
    { typeId: RIFTER, name: 'Rifter Blueprint' },
    { typeId: CARACAL, name: 'Caracal Blueprint' },
  ];

  it('is the picked blueprint alone', () => {
    expect(bpcMarketLookup(CARACAL, 'rifter', options)).toEqual({
      typeIds: [CARACAL],
      capped: false,
    });
  });

  it('is nothing for an empty query', () => {
    expect(bpcMarketLookup(null, '  ', options)).toEqual({ typeIds: [], capped: false });
  });

  it('is the closest typed matches, capped at ten', () => {
    expect(bpcMarketLookup(null, 'rifter', options).typeIds).toEqual([RIFTER]);
    const many = Array.from({ length: 12 }, (_, i) => ({
      typeId: 1000 + i,
      name: `Widget ${i} Blueprint`,
    }));
    const lookup = bpcMarketLookup(null, 'widget', many);
    expect(lookup.typeIds).toHaveLength(10);
    expect(lookup.capped).toBe(true);
  });
});
